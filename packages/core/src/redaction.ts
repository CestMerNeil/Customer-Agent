/** Describes one sensitive-data shape found during a text scan. */
export interface RedactionIssue {
  category: "secret" | "private-buyer-data";
  pattern: string;
}

/** Contains sanitized text and the sensitive-data shapes that were found. */
export interface RedactionScanResult {
  redacted: string;
  issues: RedactionIssue[];
}

/** Field and value patterns used for non-JSON logs and configuration fragments. */
const redactionPatterns: Array<{ category: RedactionIssue["category"]; name: string; pattern: RegExp; replacement: string }> = [
  { category: "secret", name: "openai-key-signature", pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/g, replacement: "[REDACTED]" },
  { category: "secret", name: "bearer-token", pattern: /\bbearer\s+(?!\$\{\{|\$[A-Za-z_])[A-Za-z0-9._~+/-]{8,}={0,2}/gi, replacement: "Bearer [REDACTED]" },
  { category: "secret", name: "cookie-field", pattern: /(["']?(?:cookie|cookies)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]+)/gi, replacement: "$1[REDACTED]" },
  { category: "secret", name: "token-field", pattern: /(["']?(?:[A-Za-z0-9_ -]*token|access_token|refresh_token)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{\{[^}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED]" },
  { category: "secret", name: "api-key-field", pattern: /(["']?api[-_ ]?key["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{\{[^}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED]" },
  { category: "secret", name: "authorization-field", pattern: /(["']?authorization["']?\s*[:=]\s*)(?:bearer\s+(?:\$\{\{[^}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*|[^,\s;}\]]+)|basic\s+[^,\s;}\]]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{\{[^}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED]" },
  { category: "secret", name: "password-field", pattern: /(["']?(?:password|passwd|pwd)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED]" },
  { category: "secret", name: "anti-content-field", pattern: /(["']?anti[-_ ]?content["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED]" },
  { category: "private-buyer-data", name: "buyer-contact-field", pattern: /(["']?(?:buyer[-_ ]?(?:phone|mobile|email|contact)|phone|mobile|email|shipping[-_ ]?address)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED_PRIVATE_DATA]" },
  { category: "private-buyer-data", name: "raw-private-payload", pattern: /(["']?(?:raw(?:[-_ ]?(?:buyer|payload))?|private[-_ ]?buyer)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\{|\[)[^\r\n]*|[^,\s;}\]]+)/gi, replacement: "$1[REDACTED_PRIVATE_DATA]" },
  { category: "private-buyer-data", name: "cn-mobile-phone", pattern: /\b1[3-9]\d{9}\b/g, replacement: "[REDACTED_PHONE]" },
  { category: "private-buyer-data", name: "email-address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
];

/** Prose references that indicate unsanitized buyer payload evidence. */
const rawPayloadPattern = /\b(raw[-_ ]+payload|raw[-_ ]+buyer|buyer[-_ ]+contact|private[-_ ]+buyer)\b/i;

/**
 * Redacts secrets and private buyer data from arbitrary text.
 *
 * @param value Text to sanitize.
 * @returns Sanitized text.
 */
export function redactSensitiveText(value: string): string {
  return scanSensitiveText(value).redacted;
}

/**
 * Scans and redacts secrets and private buyer data.
 *
 * @param value Text or serialized JSON to inspect.
 * @returns Sanitized text and deduplicated issue descriptors.
 */
export function scanSensitiveText(value: string): RedactionScanResult {
  const issues: RedactionIssue[] = [];
  let redacted = redactStructuredJson(value, issues) ?? value;
  for (const item of redactionPatterns) {
    const hasSecret = Array.from(redacted.matchAll(item.pattern)).some((match) => !isSafePlaceholder(match[0]));
    if (hasSecret) {
      addIssue(issues, item.category, item.name);
    }
    item.pattern.lastIndex = 0;
    redacted = redacted.replace(item.pattern, (match, prefix: string | undefined) => (
      isSafePlaceholder(match) ? match : item.replacement.replace("$1", prefix ?? "")
    ));
  }
  if (rawPayloadPattern.test(value)) {
    addIssue(issues, "private-buyer-data", "raw-private-payload-reference");
  }
  return { redacted, issues };
}

/**
 * Redacts recognized sensitive keys in valid JSON, including nested objects and arrays.
 *
 * @param value Candidate JSON text.
 * @param issues Mutable issue list populated during traversal.
 * @returns Sanitized JSON, or `undefined` when the value is not a JSON object or array.
 */
function redactStructuredJson(value: string, issues: RedactionIssue[]): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const before = issues.length;
    const sanitized = sanitizeStructuredValue(parsed, issues);
    return issues.length === before ? value : JSON.stringify(sanitized);
  } catch {
    return undefined;
  }
}

/**
 * Recursively sanitizes one parsed JSON value.
 *
 * @param value Parsed JSON value.
 * @param issues Mutable issue list populated during traversal.
 * @param key Parent object key, when present.
 * @returns A sanitized JSON-compatible value.
 */
function sanitizeStructuredValue(value: unknown, issues: RedactionIssue[], key?: string): unknown {
  const classification = key ? classifySensitiveKey(key) : undefined;
  if (classification && !isSafePlaceholder(String(value))) {
    addIssue(issues, classification.category, classification.pattern);
    return classification.category === "secret" ? "[REDACTED]" : "[REDACTED_PRIVATE_DATA]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredValue(item, issues));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeStructuredValue(childValue, issues, childKey)]));
  }
  return value;
}

/**
 * Classifies sensitive JSON keys after punctuation-insensitive normalization.
 *
 * @param key Object key to classify.
 * @returns Issue metadata for a sensitive key, otherwise `undefined`.
 */
function classifySensitiveKey(key: string): RedactionIssue | undefined {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["cookie", "cookies", "setcookie", "accesstoken", "refreshtoken", "authorization", "apikey", "password", "passwd", "pwd", "anticontent", "secret", "clientsecret"].includes(normalized) || normalized.endsWith("token") || normalized.endsWith("secret")) {
    return { category: "secret", pattern: "structured-secret-field" };
  }
  if (["raw", "rawpayload", "rawbuyer", "privatebuyer"].includes(normalized)) {
    return { category: "private-buyer-data", pattern: "raw-private-payload" };
  }
  if (["buyercontact", "buyerphone", "buyermobile", "buyeremail", "phone", "mobile", "telephone", "email", "shippingaddress", "receiveraddress", "receiverphone", "receivername", "recipientname"].includes(normalized)) {
    return { category: "private-buyer-data", pattern: "structured-private-buyer-field" };
  }
  return undefined;
}

/**
 * Adds an issue once so multiple redaction passes do not duplicate evidence.
 *
 * @param issues Mutable issue list.
 * @param category Sensitive-data category.
 * @param pattern Stable pattern name.
 */
function addIssue(issues: RedactionIssue[], category: RedactionIssue["category"], pattern: string): void {
  if (!issues.some((issue) => issue.category === category && issue.pattern === pattern)) {
    issues.push({ category, pattern });
  }
}

/**
 * Identifies environment references and values that are already redacted.
 *
 * @param value Candidate assignment or field value.
 * @returns Whether the trailing value is a safe placeholder.
 */
function isSafePlaceholder(value: string): boolean {
  return /(?:\[REDACTED(?:_[A-Z]+)*\]|(?:bearer\s+)?(?:\$\{\{[^}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*))["']?\s*$/iu.test(value);
}

/**
 * Returns whether text contains a recognized secret or private buyer-data shape.
 *
 * @param value Text to inspect.
 * @returns Whether any sensitive-data shape was found.
 */
export function containsSensitiveText(value: string): boolean {
  return scanSensitiveText(value).issues.length > 0;
}
