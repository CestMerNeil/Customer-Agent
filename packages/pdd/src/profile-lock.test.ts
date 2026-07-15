import { describe, expect, it } from "vitest";
import { withPddBrowserProfileLock } from "./profile-lock.js";

describe("withPddBrowserProfileLock", () => {
  it("serializes operations that use the same persistent profile", async () => {
    let releaseFirst: () => void = () => {};
    let firstStarted: () => void = () => {};
    const firstReady = new Promise<void>((resolve) => { firstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];

    const first = withPddBrowserProfileLock("profile-a", async () => {
      order.push("first-start");
      firstStarted();
      await firstGate;
      order.push("first-end");
    });
    await firstReady;
    const second = withPddBrowserProfileLock("profile-a", async () => {
      order.push("second-start");
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });
});
