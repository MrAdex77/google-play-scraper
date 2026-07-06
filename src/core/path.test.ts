import { describe, expect, it } from 'vitest';
import { getPath } from './path.js';

describe('getPath', () => {
  it('resolves a nested hit through arrays and objects', () => {
    const value = { app: [{ title: 'Panda' }] };
    expect(getPath(value, ['app', 0, 'title'])).toBe('Panda');
  });

  it('indexes arrays from the end with a negative segment', () => {
    expect(getPath([10, 20, 30], [-1])).toBe(30);
    expect(getPath([10, 20, 30], [-2])).toBe(20);
  });

  it('reads a string key from a plain object', () => {
    expect(getPath({ score: 4.5 }, ['score'])).toBe(4.5);
  });

  it('returns undefined for an out of range index', () => {
    expect(getPath([1, 2], [5])).toBeUndefined();
    expect(getPath([1, 2], [-5])).toBeUndefined();
  });

  it('returns undefined when traversing a non object value', () => {
    expect(getPath(42, [0])).toBeUndefined();
    expect(getPath('text', ['length'])).toBeUndefined();
    expect(getPath([1, 2], ['missing'])).toBeUndefined();
  });

  it('stops at undefined or null encountered mid path', () => {
    expect(getPath({ a: null }, ['a', 'b'])).toBeUndefined();
    expect(getPath({ a: undefined }, ['a', 0])).toBeUndefined();
  });

  it('returns the root when the path is empty', () => {
    const root = { a: 1 };
    expect(getPath(root, [])).toBe(root);
  });
});
