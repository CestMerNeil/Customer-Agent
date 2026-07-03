export type DependencyId = "pdd" | "llm" | "product_sync";
export type CircuitState = "closed" | "open" | "half_open";

export interface DependencyPolicy {
  id: DependencyId;
  maxRequestsPerWindow: number;
  windowMs: number;
  failureThreshold: number;
  cooldownMs: number;
}

export interface DependencySnapshot {
  id: DependencyId;
  circuitState: CircuitState;
  consecutiveFailures: number;
  windowStartedAt: number;
  requestsInWindow: number;
  openedAt?: number;
  retryAt?: number;
  lastError?: string;
}

export type DependencyDecision =
  | { ok: true; circuitState: CircuitState }
  | { ok: false; reason: "rate_limited" | "circuit_open"; retryAt: number; circuitState: CircuitState };

interface MutableDependencyState extends DependencySnapshot {
  policy: DependencyPolicy;
}

export function createDefaultDependencyPolicies(): DependencyPolicy[] {
  return [
    { id: "pdd", maxRequestsPerWindow: 30, windowMs: 1_000, failureThreshold: 5, cooldownMs: 30_000 },
    { id: "llm", maxRequestsPerWindow: 4, windowMs: 1_000, failureThreshold: 3, cooldownMs: 20_000 },
    { id: "product_sync", maxRequestsPerWindow: 2, windowMs: 1_000, failureThreshold: 5, cooldownMs: 60_000 },
  ];
}

export class DependencyGovernor {
  private readonly states = new Map<DependencyId, MutableDependencyState>();

  constructor(policies: DependencyPolicy[] = createDefaultDependencyPolicies()) {
    for (const policy of policies) {
      this.states.set(policy.id, {
        id: policy.id,
        policy,
        circuitState: "closed",
        consecutiveFailures: 0,
        windowStartedAt: 0,
        requestsInWindow: 0,
      });
    }
  }

  beforeRequest(id: DependencyId, now = Date.now()): DependencyDecision {
    const state = this.requireState(id);
    this.refreshCircuitState(state, now);
    if (state.circuitState === "open") {
      return {
        ok: false,
        reason: "circuit_open",
        retryAt: state.retryAt ?? now + state.policy.cooldownMs,
        circuitState: state.circuitState,
      };
    }

    this.refreshRateWindow(state, now);
    if (state.requestsInWindow >= state.policy.maxRequestsPerWindow) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAt: state.windowStartedAt + state.policy.windowMs,
        circuitState: state.circuitState,
      };
    }

    state.requestsInWindow += 1;
    return { ok: true, circuitState: state.circuitState };
  }

  recordSuccess(id: DependencyId, now = Date.now()): DependencySnapshot {
    const state = this.requireState(id);
    state.circuitState = "closed";
    state.consecutiveFailures = 0;
    delete state.openedAt;
    delete state.retryAt;
    delete state.lastError;
    this.refreshRateWindow(state, now);
    return this.snapshot(id);
  }

  recordFailure(id: DependencyId, now = Date.now(), error?: string): DependencySnapshot {
    const state = this.requireState(id);
    state.consecutiveFailures += 1;
    if (error) {
      state.lastError = sanitizeDependencyError(error);
    }
    if (state.consecutiveFailures >= state.policy.failureThreshold) {
      state.circuitState = "open";
      state.openedAt = now;
      state.retryAt = now + state.policy.cooldownMs;
    }
    return this.snapshot(id);
  }

  reset(id: DependencyId): DependencySnapshot {
    const state = this.requireState(id);
    state.circuitState = "closed";
    state.consecutiveFailures = 0;
    state.windowStartedAt = 0;
    state.requestsInWindow = 0;
    delete state.openedAt;
    delete state.retryAt;
    delete state.lastError;
    return this.snapshot(id);
  }

  snapshot(id: DependencyId): DependencySnapshot {
    const state = this.requireState(id);
    return {
      id: state.id,
      circuitState: state.circuitState,
      consecutiveFailures: state.consecutiveFailures,
      windowStartedAt: state.windowStartedAt,
      requestsInWindow: state.requestsInWindow,
      ...(state.openedAt === undefined ? {} : { openedAt: state.openedAt }),
      ...(state.retryAt === undefined ? {} : { retryAt: state.retryAt }),
      ...(state.lastError === undefined ? {} : { lastError: state.lastError }),
    };
  }

  snapshots(): DependencySnapshot[] {
    return [...this.states.keys()].map((id) => this.snapshot(id));
  }

  private refreshCircuitState(state: MutableDependencyState, now: number): void {
    if (state.circuitState === "open" && state.retryAt !== undefined && now >= state.retryAt) {
      state.circuitState = "half_open";
    }
  }

  private refreshRateWindow(state: MutableDependencyState, now: number): void {
    if (now - state.windowStartedAt >= state.policy.windowMs) {
      state.windowStartedAt = now;
      state.requestsInWindow = 0;
    }
  }

  private requireState(id: DependencyId): MutableDependencyState {
    const state = this.states.get(id);
    if (!state) {
      throw new Error(`Unknown dependency: ${id}`);
    }
    return state;
  }
}

function sanitizeDependencyError(error: string): string {
  return error.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 300);
}
