import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { narrowByFlag } from './flagNarrowed.ts';

interface ToyOptions {
  term?: string;
  detailed?: boolean;
}

interface Brief {
  id: string;
}

interface Detailed extends Brief {
  description: string;
}

const narrowToy = narrowByFlag<'detailed', ToyOptions, Brief[], Detailed[]>;
const flag = Math.random() < 2;

describe('narrowByFlag', () => {
  it('forwards the options object and returns the promise of the method', () => {
    const outcome = Promise.resolve<Brief[]>([{ id: 'a' }]);
    const method = vi.fn<(options: ToyOptions) => Promise<Brief[] | Detailed[]>>(() => outcome);
    const options = { term: 'panda', detailed: false };

    const narrowed = narrowToy(method);

    expect(narrowed(options)).toBe(outcome);
    expect(method).toHaveBeenCalledTimes(1);
    expect(method.mock.calls[0]?.[0]).toBe(options);
  });

  it('propagates a rejection unchanged', async () => {
    const failure = new Error('boom');
    const narrowed = narrowToy(() => Promise.reject(failure));

    await expect(narrowed({ detailed: true })).rejects.toBe(failure);
  });

  it('selects the result type from the literal flag', () => {
    const narrowed = narrowToy(() => Promise.resolve([]));

    expectTypeOf(() => narrowed({ detailed: true })).returns.resolves.toEqualTypeOf<Detailed[]>();
    expectTypeOf(() => narrowed({ detailed: false })).returns.resolves.toEqualTypeOf<Brief[]>();
    expectTypeOf(() => narrowed({})).returns.resolves.toEqualTypeOf<Brief[]>();
    expectTypeOf(() => narrowed({ detailed: flag })).returns.resolves.toEqualTypeOf<
      Brief[] | Detailed[]
    >();
  });

  it('keeps the general signature last so parameters accept any flag', () => {
    expectTypeOf<Parameters<ReturnType<typeof narrowToy>>>().toEqualTypeOf<[ToyOptions]>();
  });
});
