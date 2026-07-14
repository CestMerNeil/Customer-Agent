#!/usr/bin/env node
/* global console, process, URL */
// Derives sanitized acceptance evidence from the app's real agent_audit trail,
// so release acceptance is machine-gathered from actual usage of the RC build
// instead of hand-written operator recollection. The operator still reviews and
// commits the output — the git commit is the signature.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  buildDefaultAcceptanceSkeleton,
  validateAcceptanceRecord,
} from "../packages/core/dist/index.js";

/** Resolves the database package's existing sql.js dependency. */
const require = createRequire(new URL("../packages/db/package.json", import.meta.url));

if (isMainModule()) {
  await main(process.argv.slice(2));
}

/** Generates reviewable acceptance candidates from one local audit database.
 *
 * @param argv - Command-line arguments after the script path.
 * @returns A promise that resolves after the candidate file is written.
 */
async function main(argv) {
  const args = parseArgs(argv);
  const commitSha = requireArg(args, "commit");
  const platform = args.platform ?? `${process.platform}-${process.arch}`;
  const outFile = requireArg(args, "out");
  const shopA = requireArg(args, "shop-a");
  const shopB = requireArg(args, "shop-b");
  const sinceIso = resolveSince(args.since);
  const dbPath = resolveDbPath(args.db);

  if (!dbPath) {
    const checked = defaultDbCandidates().map((candidate) => `  - ${candidate}`).join("\n");
    console.error(`找不到应用数据库。已检查：\n${checked}\n请先运行应用，或用 --db 指定 customer-agent.sqlite 路径。`);
    process.exit(2);
  }

  const audits = await loadAuditRecords(dbPath, sinceIso);
  const shopAliasById = new Map([[shopA, "shop-a"], [shopB, "shop-b"]]);
  const statsByAlias = aggregate(audits, shopAliasById);
  const acceptedAt = new Date().toISOString();
  const skeleton = buildDefaultAcceptanceSkeleton({
    commitSha,
    platform,
    ...(args.version ? { version: args.version } : {}),
    ...(args.tag ? { tag: args.tag } : {}),
    acceptedAt,
  });
  const records = skeleton.map((record) =>
    deriveRecord(record, statsByAlias.get(record.shopAlias), statsByAlias, sinceIso, acceptedAt) ?? record,
  );
  const invalid = records.flatMap((record, index) =>
    validateAcceptanceRecord(record).errors.map((error) => `records[${index}].${error}`),
  );
  if (invalid.length > 0) {
    console.error("生成的证据未通过校验：");
    for (const error of invalid) console.error(`  ${error}`);
    process.exit(1);
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  report(records, statsByAlias, sinceIso, outFile);
}

/** Adds factual machine observations without granting operator approval.
 *
 * @param record - Blocked acceptance skeleton record to enrich.
 * @param stats - Aggregated audit facts for the record's shop alias.
 * @param statsByAlias - Aggregated facts for both release shop aliases.
 * @param since - Inclusive audit-window start timestamp.
 * @param at - Evidence generation timestamp.
 * @returns An enriched blocked record, or null when no relevant fact exists.
 */
export function deriveRecord(record, stats, statsByAlias, since, at) {
  if (!stats) {
    return null;
  }
  const window = `窗口 ${since} 起`;
  const observed = (evidenceSummary) => ({
    ...record,
    outcome: "blocked",
    actor: "generated",
    acceptedAt: at,
    evidenceSummary,
    blockers: ["operator-review-required"],
    notes: "Machine-derived from real agent_audit records. An operator must verify the full capability before changing outcome and actor.",
  });
  switch (record.capability) {
    case "auditable-agent-workflow":
      return stats.groundedAgentWorkflows > 0
        ? observed(`Grounded customer-service workflows completed on ${record.shopAlias}: ${stats.groundedAgentWorkflows}; no-knowledge paths observed: ${stats.noKnowledgePaths} (${window}).`)
        : null;
    case "pdd-real-merchant-operations":
      return stats.pddSendsOk > 0
        ? observed(`Governed PDD text sends completed on ${record.shopAlias}: ${stats.pddSendsOk}; tools exercised: ${stats.toolsUsed.join(", ") || "none"} (${window}).`)
        : null;
    case "knowledge-product-governance":
      return stats.knowledgeToolOk > 0
        ? observed(`Governed knowledge produced scoped citations on ${record.shopAlias}: ${stats.knowledgeToolOk} successful knowledge tool results (${window}).`)
        : null;
    case "message-queue-concurrency":
      return stats.distinctMessages >= 5
        ? observed(`Audit contains ${stats.distinctMessages} distinct real messages on ${record.shopAlias}; operator concurrency and retry review is still required (${window}).`)
        : null;
    case "multi-shop-operations": {
      const bothActive = ["shop-a", "shop-b"].every((alias) => (statsByAlias.get(alias)?.pddSendsOk ?? 0) > 0);
      return bothActive
        ? observed(`Both aliased shops completed governed PDD text sends in the same window; ${record.shopAlias} contributed ${stats.pddSendsOk}. Operator isolation review is still required (${window}).`)
        : null;
    }
    default:
      return null;
  }
}

/** Loads persisted audit payloads newer than an inclusive timestamp.
 *
 * @param file - SQLite database file produced by the desktop application.
 * @param since - Inclusive ISO timestamp for the evidence window.
 * @returns Parsed Agent audit records.
 */
async function loadAuditRecords(file, since) {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(await readFile(file)));
  try {
    const result = db.exec("SELECT payload FROM agent_audit WHERE created_at >= ? ORDER BY created_at ASC, rowid ASC", [since]);
    const rows = result[0]?.values ?? [];
    return rows.map(([payload]) => JSON.parse(String(payload)));
  } finally {
    db.close();
  }
}

/** Aggregates sanitized counts for only the two explicitly mapped shops.
 *
 * @param records - Persisted Agent audit records.
 * @param aliasById - Real shop ID to release alias mapping.
 * @returns Audit facts keyed by safe shop alias.
 */
export function aggregate(records, aliasById) {
  const stats = new Map();
  for (const audit of records) {
    const alias = aliasById.get(audit.shopId);
    if (!alias) {
      continue;
    }
    const entry = stats.get(alias) ?? {
      byType: { model: 0, tool_call: 0, tool_result: 0, final: 0, loop_limit: 0, pdd_send_success: 0 },
      pddSendsOk: 0,
      knowledgeToolOk: 0,
      toolsUsed: [],
      distinctMessages: 0,
      messageIds: new Set(),
      messageEvents: new Map(),
      groundedAgentWorkflows: 0,
      noKnowledgePaths: 0,
    };
    entry.byType[audit.eventType] = (entry.byType[audit.eventType] ?? 0) + 1;
    entry.messageIds.add(audit.messageId);
    const messageEvents = entry.messageEvents.get(audit.messageId) ?? [];
    messageEvents.push(audit);
    entry.messageEvents.set(audit.messageId, messageEvents);
    if (audit.eventType === "pdd_send_success" && audit.ok === true) {
      entry.pddSendsOk += 1;
    }
    if (audit.eventType === "tool_result" && audit.ok !== false && audit.toolName) {
      if (!entry.toolsUsed.includes(audit.toolName)) {
        entry.toolsUsed.push(audit.toolName);
      }
      if (audit.toolName.includes("knowledge") && Array.isArray(audit.citations) && audit.citations.length > 0) {
        entry.knowledgeToolOk += 1;
      }
    }
    entry.distinctMessages = entry.messageIds.size;
    stats.set(alias, entry);
  }
  for (const entry of stats.values()) {
    for (const events of entry.messageEvents.values()) {
      const result = analyzeCustomerServiceWorkflow(events);
      entry.groundedAgentWorkflows += result.grounded ? 1 : 0;
      entry.noKnowledgePaths += result.noKnowledge ? 1 : 0;
    }
    delete entry.messageEvents;
  }
  return stats;
}

/** Checks one message for ordered, release-auditable customer-service paths. */
function analyzeCustomerServiceWorkflow(events) {
  let groundedStage = 0;
  let noKnowledgeStage = 0;
  let detailCitations = new Set();
  let grounded = false;
  let noKnowledge = false;

  for (const audit of [...events].sort(compareAuditOrder)) {
    if (audit.eventType === "tool_call" && audit.toolName === "list_customer_service_knowledge") {
      groundedStage = 1;
      noKnowledgeStage = 1;
      detailCitations = new Set();
      continue;
    }
    if (audit.eventType === "tool_result" && audit.toolName === "list_customer_service_knowledge") {
      if (groundedStage === 1 && audit.ok === true) groundedStage = 2;
      if (noKnowledgeStage === 1 && audit.ok === true) noKnowledgeStage = 2;
      continue;
    }
    if (audit.eventType === "tool_call" && audit.toolName === "get_customer_service_knowledge") {
      if (groundedStage === 2) groundedStage = 3;
      noKnowledgeStage = -1;
      continue;
    }
    if (audit.eventType === "tool_result" && audit.toolName === "get_customer_service_knowledge") {
      if (groundedStage === 3 && audit.ok === true) {
        detailCitations = citationKeys(audit.citations);
        groundedStage = detailCitations.size > 0 ? 4 : 2;
      }
      continue;
    }
    if (audit.eventType === "final") {
      const finalCitations = citationKeys(audit.citations);
      if (groundedStage === 4 && audit.ok === true && [...detailCitations].some((key) => finalCitations.has(key))) {
        groundedStage = 5;
      }
      if (noKnowledgeStage === 2 && audit.ok === true && finalCitations.size === 0) {
        noKnowledgeStage = 3;
      }
      continue;
    }
    if (audit.eventType === "pdd_send_success" && audit.ok === true) {
      grounded ||= groundedStage === 5;
      noKnowledge ||= noKnowledgeStage === 3;
    }
  }
  return { grounded, noKnowledge };
}

/** Keeps input order unless persisted timestamps are available. */
function compareAuditOrder(left, right) {
  if (!left.createdAt || !right.createdAt) return 0;
  return String(left.createdAt).localeCompare(String(right.createdAt));
}

/** Produces stable citation identities without treating score changes as different evidence. */
function citationKeys(citations) {
  return new Set((Array.isArray(citations) ? citations : [])
    .filter((citation) => citation?.documentId)
    .map((citation) => `${citation.documentId}\u0000${citation.chunkId ?? ""}`));
}

/** Prints a safe summary without exposing real shop IDs or audit payloads.
 *
 * @param records - Generated acceptance candidate records.
 * @param stats - Audit facts keyed by safe shop alias.
 * @param since - Inclusive evidence-window start timestamp.
 * @param out - Output JSON path.
 * @returns Nothing.
 */
function report(records, stats, since, out) {
  const observed = records.filter((record) => record.blockers?.includes("operator-review-required"));
  const blocked = records.filter((record) => record.outcome !== "pass");
  console.log(`审计窗口：${since} 起；店铺活动：${[...stats.entries()].map(([alias, s]) => `${alias}=${s.distinctMessages} 条消息`).join("，") || "无"}`);
  console.log(`自动汇总 ${observed.length} 条候选证据；${blocked.length} 条仍需 operator 审核 → ${out}`);
  const pending = [...new Set(blocked.map((record) => `${record.capability} (${record.shopAlias})`))];
  if (pending.length > 0) {
    console.log("待人工验收/补充证据：");
    for (const item of pending) console.log(`  - ${item}`);
  }
}

/** Resolves an ISO timestamp or relative day window into an ISO timestamp.
 *
 * @param value - ISO timestamp, relative value such as 7d, or undefined.
 * @returns Inclusive ISO start timestamp.
 */
function resolveSince(value) {
  if (!value) {
    return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  }
  const daysMatch = /^(\d+)d$/.exec(value);
  if (daysMatch) {
    return new Date(Date.now() - Number(daysMatch[1]) * 24 * 3600 * 1000).toISOString();
  }
  if (Number.isNaN(Date.parse(value))) {
    console.error(`--since 无法解析：${value}（支持 ISO 时间或 "7d" 形式）`);
    process.exit(2);
  }
  return new Date(value).toISOString();
}

/** Lists known desktop database locations without reading their contents.
 *
 * @param platform - Node platform identifier.
 * @param home - User home directory.
 * @param environment - Process environment containing optional APPDATA.
 * @returns Candidate database paths in preferred order.
 */
export function defaultDbCandidates(platform = process.platform, home = os.homedir(), environment = process.env) {
  const baseDir = platform === "darwin"
    ? path.join(home, "Library/Application Support")
    : platform === "win32"
      ? environment.APPDATA ?? path.join(home, "AppData/Roaming")
      : path.join(home, ".config");
  return ["@customer-agent/desktop", "拼多多 AI 客服助手", "@customer-agent", "Customer-Agent"]
    .map((appName) => path.join(baseDir, appName, "data", "customer-agent.sqlite"));
}

/** Resolves an explicit database path or the first existing known location.
 *
 * @param explicitPath - Optional operator-supplied SQLite path.
 * @returns Existing database path, or undefined when none exists.
 */
function resolveDbPath(explicitPath) {
  if (explicitPath) {
    return existsSync(explicitPath) ? explicitPath : undefined;
  }
  return defaultDbCandidates().find((candidate) => existsSync(candidate));
}

/** Parses long-form command-line arguments into a string map.
 *
 * @param values - Command-line values beginning after the script path.
 * @returns Parsed flag names and values.
 */
function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item?.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

/** Returns one required argument or exits with usage guidance.
 *
 * @param parsed - Parsed command-line argument map.
 * @param key - Required argument name without leading dashes.
 * @returns Required non-empty value.
 */
function requireArg(parsed, key) {
  const value = parsed[key];
  if (!value) {
    console.error(`缺少 --${key}。用法：node scripts/acceptance-from-audit.mjs --commit <sha> --shop-a <真实shopId> --shop-b <真实shopId> --out <输出文件> [--since 7d] [--db <sqlite路径>] [--platform darwin-arm64] [--version x.y.z] [--tag vx.y.z]`);
    process.exit(2);
  }
  return value;
}

/** Reports whether this module is the directly executed CLI entry point.
 *
 * @returns True only for direct Node execution.
 */
function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}
