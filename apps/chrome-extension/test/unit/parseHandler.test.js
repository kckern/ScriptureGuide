import { parseChunks } from '../../src/background/parse.js';

describe('parseChunks (background worker)', () => {
  test('returns matches per chunk with offsets inside each chunk', () => {
    const { results } = parseChunks({ chunks: ['Read John 3:16 now.', 'Nothing here.', 'See Alma 32:21.'], options: { language: 'en', canon: 'lds', contextAware: true } });
    expect(results).toHaveLength(3);
    expect(results[0].map((m) => 'Read John 3:16 now.'.slice(m.start, m.end))).toEqual(['John 3:16']);
    expect(results[1]).toEqual([]);
    expect(results[2][0].ref).toBe('Alma 32:21');
  });
  test('a chunk that throws gives an empty result, not a failed batch', () => {
    const { results } = parseChunks({ chunks: [null, 'John 3:16'], options: {} });
    expect(results[0]).toEqual([]);
    expect(results[1]).toHaveLength(1);
  });
});
