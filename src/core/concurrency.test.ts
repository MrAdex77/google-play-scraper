import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './concurrency.js';

interface Gate {
  promise: Promise<void>;
  open: () => void;
}

const makeGate = (): Gate => {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

const flushMacrotask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('mapWithConcurrency', () => {
  it('keeps input order even when later items resolve first', async () => {
    const gates = { a: makeGate(), b: makeGate(), c: makeGate() };

    const pending = mapWithConcurrency(['a', 'b', 'c'] as const, 3, async (item) => {
      await gates[item].promise;
      return item.toUpperCase();
    });

    gates.c.open();
    gates.b.open();
    gates.a.open();

    await expect(pending).resolves.toEqual(['A', 'B', 'C']);
  });

  it('never exceeds the concurrency limit and reaches it', async () => {
    const items = Array.from({ length: 20 }, (_unused, index) => index);
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(items, 4, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return item;
    });

    expect(peak).toBe(4);
  });

  it('runs everything concurrently when the limit exceeds the item count', async () => {
    const items = [0, 1, 2];
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(items, 10, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return item;
    });

    expect(peak).toBe(3);
  });

  it('runs sequentially at limit one, preserving invocation order', async () => {
    const order: number[] = [];
    let inFlight = 0;
    let peak = 0;

    const result = await mapWithConcurrency([10, 20, 30], 1, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      order.push(item);
      await Promise.resolve();
      inFlight -= 1;
      return item * 2;
    });

    expect(peak).toBe(1);
    expect(order).toEqual([10, 20, 30]);
    expect(result).toEqual([20, 40, 60]);
  });

  it('propagates a rejection without stopping other in-flight workers', async () => {
    const completed: string[] = [];
    const failure = new Error('boom');

    const pending = mapWithConcurrency(['fail', 'b', 'c', 'd'], 2, async (item) => {
      if (item === 'fail') {
        await Promise.resolve();
        throw failure;
      }
      await Promise.resolve();
      completed.push(item);
      return item;
    });

    await expect(pending).rejects.toBe(failure);
    await flushMacrotask();

    expect(completed.sort()).toEqual(['b', 'c', 'd']);
  });
});
