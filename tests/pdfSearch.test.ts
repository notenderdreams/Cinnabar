import { describe, expect, test } from 'bun:test';
import { findPageMatches } from '../src/lib/pdf/search';

describe('PDF search destinations', () => {
  test('finds words stored as individual letters without inserting spaces', () => {
    const items = Array.from('software engineering', str => ({ str }));
    const [match] = findPageMatches(items, 'software', 2);
    expect(match).toBeDefined();
    expect(match.start).toEqual({ itemIndex: 0, offset: 0 });
    expect(match.end).toEqual({ itemIndex: 7, offset: 1 });
  });

  test('finds phrases across text runs and line endings', () => {
    const items = [{ str: 'soft' }, { str: 'ware', hasEOL: true }, { str: 'engineering' }];
    const [match] = findPageMatches(items, 'software engineering', 4);
    expect(match).toBeDefined();
    expect(match.start).toEqual({ itemIndex: 0, offset: 0 });
    expect(match.end).toEqual({ itemIndex: 2, offset: 11 });
  });

  test('retains line endings on empty text items', () => {
    const [match] = findPageMatches([
      { str: 'software' }, { str: '', hasEOL: true }, { str: 'engineering' },
    ], 'software engineering', 1);
    expect(match.start).toEqual({ itemIndex: 0, offset: 0 });
    expect(match.end).toEqual({ itemIndex: 2, offset: 11 });
  });

  test('distinguishes repeated occurrences on the same page', () => {
    const matches = findPageMatches([{ str: 'needle then needle' }], 'needle', 3);
    expect(matches.map(match => ({ page: match.pageNumber, start: match.start, end: match.end }))).toEqual([
      { page: 3, start: { itemIndex: 0, offset: 0 }, end: { itemIndex: 0, offset: 6 } },
      { page: 3, start: { itemIndex: 0, offset: 12 }, end: { itemIndex: 0, offset: 18 } },
    ]);
  });

  test('preserves text-layer indices across empty items and marked content', () => {
    const matches = findPageMatches([
      { type: 'beginMarkedContent' },
      { str: '' },
      { str: 'Before target', hasEOL: true },
      { type: 'endMarkedContent' },
      { str: '' },
      { str: 'phrase after' },
    ], 'target phrase', 2);
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toEqual({ itemIndex: 1, offset: 7 });
    expect(matches[0].end).toEqual({ itemIndex: 3, offset: 6 });
  });

  test('trims queries and matches case-insensitively without losing text offsets', () => {
    const [match] = findPageMatches([{ str: 'Before NEEDLE after' }], ' needle ', 1);
    expect(match.start.offset).toBe(7);
    expect(match.end.offset).toBe(13);
    expect(match.snippet).toBe('Before NEEDLE after');
  });

  test('empty and absent queries have no destinations', () => {
    expect(findPageMatches([{ str: 'some text' }], '   ', 1)).toEqual([]);
    expect(findPageMatches([{ str: 'some text' }], 'missing', 1)).toEqual([]);
  });
});
