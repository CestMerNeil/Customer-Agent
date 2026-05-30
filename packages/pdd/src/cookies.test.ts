import { describe, expect, it } from "vitest";
import { buildCookieHeader, cookieListToJar, parseCookieJar } from "./cookies.js";

describe("PDD cookie helpers", () => {
  it("converts Playwright cookies to a serializable cookie jar", () => {
    const jar = cookieListToJar([
      { name: "PDDAccessToken", value: "token-a" },
      { name: "api_uid", value: "uid-a" },
    ]);

    expect(jar).toEqual({ PDDAccessToken: "token-a", api_uid: "uid-a" });
  });

  it("builds cookie header from string or object jars", () => {
    expect(buildCookieHeader({ foo: "bar", baz: "qux" })).toBe("foo=bar; baz=qux");
    expect(buildCookieHeader("{\"foo\":\"bar\"}")).toBe("foo=bar");
  });

  it("returns empty jar for invalid stored values", () => {
    expect(parseCookieJar("not-json")).toEqual({});
  });
});
