import { describe, expect, it } from "vitest";
import { containsSensitiveText, redactSensitiveText, scanSensitiveText } from "./redaction.js";

describe("redaction", () => {
  it("redacts common secret fields without printing the value", () => {
    const redacted = redactSensitiveText("cookie=abc token:secret api_key=sk-live password=pass anti-content=risk");

    expect(redacted).not.toContain("abc");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("sk-live");
    expect(redacted).not.toContain("=pass");
    expect(redacted).not.toContain("risk");
    expect(redacted).toContain("[REDACTED]");
  });

  it("detects private buyer contact shapes", () => {
    const result = scanSensitiveText("buyer phone 13800138000 and email buyer@example.com");

    expect(result.issues).toEqual(expect.arrayContaining([
      { category: "private-buyer-data", pattern: "cn-mobile-phone" },
      { category: "private-buyer-data", pattern: "email-address" },
    ]));
    expect(result.redacted).toContain("[REDACTED_PHONE]");
    expect(result.redacted).toContain("[REDACTED_EMAIL]");
  });

  it("supports boolean checks for release gates", () => {
    expect(containsSensitiveText("plain sanitized evidence")).toBe(false);
    expect(containsSensitiveText("raw buyer payload recorded")).toBe(true);
  });

  it("does not flag GitHub expressions or shell references as leaked secrets", () => {
    const workflow = "GH_TOKEN: ${{ github.token }}\nAuthorization: Bearer $GH_TOKEN";

    expect(containsSensitiveText(workflow)).toBe(false);
    expect(containsSensitiveText("Authorization: Bearer ghp_real_secret")).toBe(true);
  });
});
