export type PathSegment = number | string;
export type Path = readonly PathSegment[];

function isIndexable(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function step(value: unknown, segment: PathSegment): unknown {
  if (typeof segment === 'number') {
    if (!isIndexable(value)) {
      return undefined;
    }
    const index = segment < 0 ? value.length + segment : segment;
    return value[index];
  }
  if (isRecord(value)) {
    return value[segment];
  }
  return undefined;
}

export function getPath(value: unknown, path: Path): unknown {
  let current = value;
  for (const segment of path) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = step(current, segment);
  }
  return current;
}
