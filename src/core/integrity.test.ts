import { describe, expect, it } from 'vitest';
import { ParseError } from './errors.js';
import { parseOptionalSection, type IntegrityEvent } from './integrity.js';

describe('parseOptionalSection', () => {
  it('returns a parsed section without emitting an event', () => {
    const events: IntegrityEvent[] = [];

    const result = parseOptionalSection(
      'search',
      () => 'parsed',
      (event) => {
        events.push(event);
      },
    );

    expect(result).toBe('parsed');
    expect(events).toEqual([]);
  });

  it('emits a parse event and returns undefined for a parse failure', () => {
    const events: IntegrityEvent[] = [];
    const error = new ParseError('malformed exact match');

    const result = parseOptionalSection<string>(
      'search',
      () => {
        throw error;
      },
      (event) => {
        events.push(event);
      },
    );

    expect(result).toBeUndefined();
    expect(events).toEqual([{ context: 'search', reason: 'optional-section-parse', error }]);
  });

  it('propagates non parse failures without emitting an event', () => {
    const events: IntegrityEvent[] = [];

    expect(() => {
      parseOptionalSection(
        'search',
        () => {
          throw new Error('consumer bug');
        },
        (event) => {
          events.push(event);
        },
      );
    }).toThrow('consumer bug');
    expect(events).toEqual([]);
  });
});
