import type { CustomerAgentBridge } from "../preload/index.cts";

declare global {
  interface Window {
    customerAgent: CustomerAgentBridge;
  }
}
