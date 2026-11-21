import { describe, test, expect } from 'vitest';
import { highlightOffsets } from '../../../src/api/v1/text.js';
import { highlight } from '../../../src/services/SearchService.js';

describe('highlightOffsets', () => {
  test('offsets into the unmarked text', () => {
    const text = 'For God so loved the world';
    const offsets = highlightOffsets(highlight(text, 'loved world'));
    expect(offsets.map(([a, b]) => text.slice(a, b))).toEqual(['loved', 'world']);
  });
  test('no marks', () => {
    expect(highlightOffsets('plain text')).toEqual([]);
  });
  test('an unclosed mark gives no offset and stops', () => {
    expect(highlightOffsets("a <span class='searchterm'>b")).toEqual([]);
    expect(highlightOffsets("so loved the <span class='searchterm'>world")).toEqual([]);
  });
});
