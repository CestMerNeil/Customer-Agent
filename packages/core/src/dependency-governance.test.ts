import { describe, expect, it } from "vitest";
import {
  DependencyGovernor,
  createDefaultDependencyPolicies,
} from "./dependency-governance.js";

describe("dependency governance", () => {
  it("defines rate-limit and circuit-breaker policies for release-blocking dependencies", () => {
    expect(createDefaultDependencyPolicies().map((policy) => policy.id)).toEqual([
      "pdd",
      "llm",
      "product_sync",
    ]);
  });

  it("rate limits requests inside a fixed window", () => {
    const governor = new DependencyGovernor([
      {
        id: "llm",
        maxRequestsPerWindow: 2,
        windowMs: 1_000,
        failureThreshold: 3,
        cooldownMs: 5_000,
      },
    ]);

    expect(governor.beforeRequest("llm", 0)).toMatchObject({ ok: true });
    expect(governor.beforeRequest("llm", 100)).toMatchObject({ ok: true });
    expect(governor.beforeRequest("llm", 200)).toMatchObject({
      ok: false,
      reason: "rate_limited",
      retryAt: 1_000,
    });
    expect(governor.beforeRequest("llm", 1_000)).toMatchObject({ ok: true });
  });

  it("opens, half-opens, and closes a circuit breaker deterministically", () => {
    const governor = new DependencyGovernor([
      {
        id: "pdd",
        maxRequestsPerWindow: 10,
        windowMs: 1_000,
        failureThreshold: 2,
        cooldownMs: 5_000,
      },
    ]);

    governor.recordFailure("pdd", 100, "network");
    governor.recordFailure("pdd", 200, "network");
    expect(governor.beforeRequest("pdd", 300)).toMatchObject({
      ok: false,
      reason: "circuit_open",
      retryAt: 5_200,
    });

    expect(governor.beforeRequest("pdd", 5_200)).toMatchObject({
      ok: true,
      circuitState: "half_open",
    });
    governor.recordSuccess("pdd", 5_250);
    expect(governor.snapshot("pdd")).toMatchObject({
      id: "pdd",
      circuitState: "closed",
      consecutiveFailures: 0,
    });
    expect(governor.snapshot("pdd").lastError).toBeUndefined();
  });

  it("resets a dependency circuit after configuration changes", () => {
    const governor = new DependencyGovernor([
      {
        id: "llm",
        maxRequestsPerWindow: 10,
        windowMs: 1_000,
        failureThreshold: 2,
        cooldownMs: 5_000,
      },
    ]);

    governor.recordFailure("llm", 100, "old endpoint failed");
    governor.recordFailure("llm", 200, "old endpoint failed");
    expect(governor.beforeRequest("llm", 300)).toMatchObject({ ok: false, reason: "circuit_open" });

    governor.reset("llm");

    expect(governor.beforeRequest("llm", 300)).toMatchObject({ ok: true, circuitState: "closed" });
    expect(governor.snapshot("llm")).toMatchObject({
      circuitState: "closed",
      consecutiveFailures: 0,
      requestsInWindow: 1,
    });
    expect(governor.snapshot("llm").lastError).toBeUndefined();
  });
});
