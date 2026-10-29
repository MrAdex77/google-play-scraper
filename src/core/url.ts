export function parseUrl(input: string, base?: string): URL | undefined {
  try {
    return new URL(input, base);
  } catch {
    return undefined;
  }
}
