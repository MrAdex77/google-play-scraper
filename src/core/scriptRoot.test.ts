import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { ParseError } from './errors.js';
import type { IntegrityEvent } from './integrity.js';
import { resolveScriptRoot, type ScriptRootSpec } from './scriptRoot.js';
import type { ScriptData } from './scriptData.js';
import { defaulted, optional, required } from './spec.js';

const rootSchema = z.object({ title: z.string() });

function rootSpec(overrides: Partial<ScriptRootSpec> = {}): ScriptRootSpec {
  return {
    rpcId: 'rpcDetails',
    paths: [['ds:5']],
    schema: rootSchema,
    missing: required(),
    ...overrides,
  };
}

function scriptData(
  blocks: Record<string, unknown>,
  serviceRequests: Record<string, string>,
): ScriptData {
  return { blocks, serviceRequests };
}

describe('resolveScriptRoot', () => {
  it('uses exactly one validating routed candidate without an event', () => {
    const events: IntegrityEvent[] = [];
    const valid = { title: 'Details' };
    const data = scriptData(
      { 'ds:5': valid, 'ds:9': { comments: [] } },
      { 'ds:5': 'rpcDetails', 'ds:9': 'rpcDetails' },
    );

    expect(
      resolveScriptRoot(data, rootSpec(), 'app details', (event) => events.push(event)),
    ).toEqual({ root: valid });
    expect(events).toEqual([]);
  });

  it('rejects multiple validating routed candidates as ambiguous', () => {
    const data = scriptData(
      { 'ds:5': { title: 'Primary' }, 'ds:9': { title: 'Duplicate' } },
      { 'ds:9': 'rpcDetails', 'ds:5': 'rpcDetails' },
    );

    expect(() => resolveScriptRoot(data, rootSpec(), 'app details')).toThrow(
      'app details: rpc rpcDetails is ambiguous across ds:9, ds:5',
    );
  });

  it('uses a validating absolute fallback and emits one event', () => {
    const events: IntegrityEvent[] = [];
    const fallback = { title: 'Fallback' };
    const data = scriptData(
      { 'ds:5': fallback, 'ds:8': { clusters: [] }, 'ds:9': { comments: [] } },
      { 'ds:8': 'rpcDetails', 'ds:9': 'rpcDetails' },
    );

    expect(
      resolveScriptRoot(data, rootSpec(), 'app details', (event) => events.push(event)),
    ).toEqual({ root: fallback });
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('rpc-anchor-fallback');
    expect(events[0]?.error.message).toContain('rpcDetails');
    expect(events[0]?.error.message).toContain('ds:5');
  });

  it('lets a throwing integrity callback surface to the consumer', () => {
    const data = scriptData({ 'ds:5': { title: 'Fallback' } }, {});

    expect(() =>
      resolveScriptRoot(data, rootSpec(), 'app details', () => {
        throw new Error('consumer handler bug');
      }),
    ).toThrow('consumer handler bug');
  });

  it('rejects a present malformed absolute fallback', () => {
    const data = scriptData({ 'ds:5': { title: 5 } }, {});

    expect(() => resolveScriptRoot(data, rootSpec(), 'app details')).toThrow(ParseError);
    expect(() => resolveScriptRoot(data, rootSpec(), 'app details')).toThrow(
      'app details fallback ds:5: title',
    );
  });

  it('applies a fresh default when every declared key is absent', () => {
    const spec = rootSpec({
      rpcId: undefined,
      paths: [['ds:8'], ['ds:9']],
      schema: z.array(z.string()),
      missing: defaulted(() => []),
    });
    const data = scriptData({}, {});

    const first = resolveScriptRoot(data, spec, 'app comments');
    const second = resolveScriptRoot(data, spec, 'app comments');

    expect(first).toEqual({ root: [] });
    expect(second).toEqual({ root: [] });
    expect(first.root).not.toBe(second.root);
  });

  it('returns undefined for an absent optional root', () => {
    const spec = rootSpec({ rpcId: undefined, missing: optional() });

    expect(resolveScriptRoot(scriptData({}, {}), spec, 'optional section')).toEqual({
      root: undefined,
    });
  });

  it('rejects an absent required root with its context', () => {
    expect(() => resolveScriptRoot(scriptData({}, {}), rootSpec(), 'search root')).toThrow(
      'search root: required script root missing',
    );
  });

  it('rejects a malformed routed candidate instead of applying a default', () => {
    const spec = rootSpec({
      paths: [],
      schema: z.array(z.string()),
      missing: defaulted(() => []),
    });
    const data = scriptData({ 'ds:7': [5] }, { 'ds:7': 'rpcDetails' });

    expect(() => resolveScriptRoot(data, spec, 'similar details')).toThrow(
      'similar details routed ds:7: 0',
    );
  });
});
