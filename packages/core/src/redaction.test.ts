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
    expect(redactSensitiveText("Authorization: Basic dGVzdA==")).not.toContain("dGVzdA==");
  });

  it("redacts provider errors that echo bare API keys or bearer tokens", () => {
    const message = "Incorrect API key provided: sk-live-1234567890; upstream said Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";
    const redacted = redactSensitiveText(message);

    expect(redacted).not.toContain("sk-live-1234567890");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).toContain("[REDACTED]");
    expect(containsSensitiveText(message)).toBe(true);
  });

  it("redacts quoted and nested JSON fields without retaining raw buyer payloads", () => {
    const sensitiveValue = ["private", "test", "value"].join("-");
    const result = scanSensitiveText(JSON.stringify({
      headers: { authorization: `Bearer ${sensitiveValue}` },
      credentials: { cookies: sensitiveValue, api_key: sensitiveValue },
      buyer: { phone: "13800138000", email: "buyer@example.com" },
      raw_payload: { message: sensitiveValue, nested: [{ password: sensitiveValue }] },
    }));

    expect(result.redacted).not.toContain(sensitiveValue);
    expect(result.redacted).not.toContain("13800138000");
    expect(result.redacted).not.toContain("buyer@example.com");
    expect(result.redacted).toContain("[REDACTED]");
    expect(result.redacted).toContain("[REDACTED_PRIVATE_DATA]");
    expect(result.issues.map((issue) => issue.category)).toEqual(expect.arrayContaining(["secret", "private-buyer-data"]));
    expect(() => JSON.parse(result.redacted)).not.toThrow();
  });

  it("redacts quoted fields embedded in non-JSON log lines", () => {
    const sensitiveValue = ["fragment", "test", "value"].join("-");
    const redacted = redactSensitiveText(`request "cookie": "${sensitiveValue}", "buyer_contact": "${sensitiveValue}"`);

    expect(redacted).not.toContain(sensitiveValue);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).toContain("[REDACTED_PRIVATE_DATA]");
  });

  it("redacts complete Cookie headers without leaking replacement syntax", () => {
    const sensitiveValue = ["session", "test", "value"].join("-");
    const redacted = redactSensitiveText(`Cookie: session=${sensitiveValue}; api_uid=${sensitiveValue}-second\nstatus=ok`);

    expect(redacted).toBe("Cookie: [REDACTED]\nstatus=ok");
    expect(redacted).not.toContain(sensitiveValue);
    expect(redacted).not.toContain("$1");
  });
});
