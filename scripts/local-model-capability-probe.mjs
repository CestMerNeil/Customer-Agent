#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runLocalModelCapabilityProbe } from "../packages/inference/dist/index.js";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  usage();
  process.exit(0);
}

const baseUrl = args["base-url"] ?? process.env.CUSTOMER_AGENT_LLM_BASE_URL ?? "http://127.0.0.1:8000/v1";
const model = args.model ?? process.env.CUSTOMER_AGENT_LLM_MODEL;
const apiKey = args["api-key"] ?? process.env.CUSTOMER_AGENT_LLM_API_KEY;
const imagePath = args.image ?? process.env.CUSTOMER_AGENT_VISION_IMAGE;

if (!model) {
  console.error("Missing model. Set CUSTOMER_AGENT_LLM_MODEL or pass --model <model-id>.");
  usage();
  process.exit(2);
}

const imageDataUrl = imagePath ? await readImageAsDataUrl(imagePath) : undefined;
const config = {
  baseUrl,
  model,
  ...(apiKey ? { apiKey } : {}),
  ...(imageDataUrl ? { visionImageDataUrl: imageDataUrl } : {}),
};
const result = await runLocalModelCapabilityProbe(config);

await writeJson(args.out, result);

if (result.overall === "pass") {
  process.exit(0);
}
if (result.overall === "blocked") {
  process.exit(3);
}
process.exit(1);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (item === "--") {
      continue;
    }
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

async function readImageAsDataUrl(filePath) {
  const content = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/png";
  return `data:${mime};base64,${content.toString("base64")}`;
}

async function writeJson(outPath, payload) {
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (!outPath) {
    process.stdout.write(json);
    return;
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, json);
}

function usage() {
  console.error(`Usage:
  pnpm local-model:probe -- --model <model-id> [--base-url http://127.0.0.1:8000/v1] [--image /path/to/product.png] [--out <file>]

Environment:
  CUSTOMER_AGENT_LLM_BASE_URL   OpenAI-compatible endpoint, default http://127.0.0.1:8000/v1
  CUSTOMER_AGENT_LLM_MODEL      Required model id
  CUSTOMER_AGENT_LLM_API_KEY    Optional API key
  CUSTOMER_AGENT_VISION_IMAGE   Optional image path for multimodal probe

Exit codes:
  0 pass, 1 fail, 2 usage error, 3 blocked
`);
}
