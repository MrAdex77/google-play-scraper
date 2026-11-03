export interface FlagNarrowed<Flag extends string, Options, Off, On> {
  (options: Options & Record<Flag, true>): Promise<On>;
  (options: Options & Partial<Record<Flag, false>>): Promise<Off>;
  (options: Options): Promise<Off | On>;
}

export function narrowByFlag<Flag extends string, Options, Off, On>(
  method: (options: Options) => Promise<Off | On>,
): FlagNarrowed<Flag, Options, Off, On> {
  function narrowed(options: Options & Record<Flag, true>): Promise<On>;
  function narrowed(options: Options & Partial<Record<Flag, false>>): Promise<Off>;
  function narrowed(options: Options): Promise<Off | On>;
  function narrowed(options: Options): Promise<Off | On> {
    return method(options);
  }
  return narrowed;
}
