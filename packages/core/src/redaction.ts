export interface RedactionIssue {
  category: "secret" | "private-buyer-data";
  pattern: string;
}

export interface RedactionScanResult {
  redacted: string;
  issues: RedactionIssue[];
}

const redactionPatterns: Array<{ category: RedactionIssue["category"]; name: string; pattern: RegExp; replacement: string }> = [
  { category: "secret", name: "cookie-field", pattern: /\b(cookie|cookies)\s*[:=]\s*[^,\s;]+/gi, replacement: "$1=[REDACTED]" },
  { category: "secret", name: "token-field", pattern: /\b([A-Za-z0-9_ -]*token|access_token)\s*[:=]\s*[^,\s;]+/gi, replacement: "$1=[REDACTED]" },
  { category: "secret", name: "api-key-field", pattern: /\b(api[-_ ]?key|authorization)\s*[:=]\s*[^,\s;]+/gi, replacement: "$1=[REDACTED]" },
  { category: "secret", name: "password-field", pattern: /\b(password|passwd|pwd)\s*[:=]\s*[^,\s;]+/gi, replacement: "$1=[REDACTED]" },
  { category: "secret", name: "anti-content-field", pattern: /\banti[-_]?content\s*[:=]\s*[^,\s;]+/gi, replacement: "anti-content=[REDACTED]" },
  { category: "private-buyer-data", name: "cn-mobile-phone", pattern: /\b1[3-9]\d{9}\b/g, replacement: "[REDACTED_PHONE]" },
  { category: "private-buyer-data", name: "email-address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
];

const rawPayloadPattern = /\b(raw\s+payload|raw\s+buyer|buyer\s+contact|private\s+buyer)\b/i;

export function redactSensitiveText(value: string): string {
  return scanSensitiveText(value).redacted;
}

export function scanSensitiveText(value: string): RedactionScanResult {
  let redacted = value;
  const issues: RedactionIssue[] = [];
  for (const item of redactionPatterns) {
    if (item.pattern.test(value)) {
      issues.push({ category: item.category, pattern: item.name });
    }
    item.pattern.lastIndex = 0;
    redacted = redacted.replace(item.pattern, item.replacement);
  }
  if (rawPayloadPattern.test(value)) {
    issues.push({ category: "private-buyer-data", pattern: "raw-private-payload-reference" });
  }
  return { redacted, issues };
}

export function containsSensitiveText(value: string): boolean {
  return scanSensitiveText(value).issues.length > 0;
}
