export function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

export function parseIntentRule(line: string, index: number) {
  const scoped = /^shop:([^:]+):(.+)$/u.exec(line);
  const source = scoped?.[2] ?? line;
  const [labelPart, patternsPart] = line.split(/[:：]/u);
  const [scopedLabelPart, scopedPatternsPart] = source.split(/[:：]/u);
  const labelSource = scoped ? scopedLabelPart : labelPart;
  const patternsSource = scoped ? scopedPatternsPart : patternsPart;
  const label = (patternsSource ? labelSource : `规则 ${index + 1}`)?.trim() || `规则 ${index + 1}`;
  const patterns = (patternsSource ?? labelSource ?? "").split("|").map((item) => item.trim()).filter(Boolean);
  return { id: `intent-${index + 1}`, label, patterns, ...(scoped?.[1] ? { shopId: scoped[1] } : {}) };
}
