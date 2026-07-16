export interface CoverageCounts {
  filled: number;
  total: number;
  ratio: number;
}

function isFilled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function fieldCoverage(
  items: readonly Record<string, unknown>[],
  field: string,
): CoverageCounts {
  const total = items.length;
  const filled = items.filter((item) => isFilled(item[field])).length;
  const ratio = total === 0 ? 0 : filled / total;
  return { filled, total, ratio };
}

export function coverageReport(
  items: readonly Record<string, unknown>[],
  fields: readonly string[],
): Record<string, CoverageCounts> {
  return Object.fromEntries(fields.map((field) => [field, fieldCoverage(items, field)]));
}
