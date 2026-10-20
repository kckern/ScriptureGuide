import { findReferences, lookupReference } from '../../src/scriptures.mjs';

describe('findReferences (basic)', () => {
    test('single reference with correct offsets', () => {
        const text = 'Please read John 3:16 tonight.';
        const results = findReferences(text, { contextAware: false });
        expect(results).toHaveLength(1);
        const m = results[0];
        expect(text.slice(m.start, m.end)).toBe('John 3:16');
        expect(m.text).toBe('John 3:16');
        expect(m.verse_ids).toEqual([26137]);
    });

    test('multiple references, sorted by position', () => {
        const text = 'Compare Genesis 1:1 with John 3:16 and also Alma 32:21 for insight.';
        const results = findReferences(text, { contextAware: false });
        expect(results.length).toBeGreaterThanOrEqual(2);
        const texts = results.map(m => text.slice(m.start, m.end));
        expect(texts.join(' ')).toContain('Genesis 1:1');
        const starts = results.map(m => m.start);
        expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    });

    test('every result slice equals its text field', () => {
        const text = 'See Matthew 5:3-12 and John 3:16. Later, 1 Nephi 3:7 is quoted.';
        for (const m of findReferences(text, { contextAware: false })) {
            expect(text.slice(m.start, m.end)).toBe(m.text);
            expect(m.verse_ids.length).toBeGreaterThan(0);
        }
    });

    test('no references returns empty array', () => {
        expect(findReferences('Nothing to see here in 2026.', { contextAware: false })).toEqual([]);
        expect(findReferences('', { contextAware: false })).toEqual([]);
    });

    test('ref is canonical and resolvable back to the same verse_ids', () => {
        const [m] = findReferences('Read John 3:16 now.', { contextAware: false });
        expect(m.ref).toBe('John 3:16');
        expect(lookupReference(m.ref).verse_ids).toEqual(m.verse_ids);
    });
});

describe('findReferences (context-aware)', () => {
    test('resolves an implied verse ("v. 16") from nearby book context', () => {
        const text = 'In John 3, Jesus explains (v. 16) that God loved the world.';
        const results = findReferences(text); // contextAware defaults true
        const implied = results.find(m => m.verse_ids.includes(26137) && /^v/.test(m.text));
        expect(implied).toBeDefined();
        expect(text.slice(implied.start, implied.end)).toBe(implied.text);
        expect(implied.ref).toMatch(/John 3:16/);
    });

    test('offset/text contract holds for every context-aware result', () => {
        const text = 'A phrase (Jn 10:17-18; see 2 Nephi 2:8) recurs. Compare Alma 32:21 and Ether 12:33.';
        const results = findReferences(text);
        expect(results.length).toBeGreaterThan(0);
        for (const m of results) {
            expect(text.slice(m.start, m.end)).toBe(m.text);
            expect(m.verse_ids.length).toBeGreaterThan(0);
            expect(lookupReference(m.ref).verse_ids).toEqual(m.verse_ids);
        }
    });

    test('grouped "; see" citation merges into one record spanning both refs', () => {
        const text = 'A phrase (Jn 10:17-18; see 2 Nephi 2:8) recurs.';
        const results = findReferences(text);
        const grouped = results.find(m => m.text.includes('Jn 10:17-18') && m.text.includes('2 Nephi 2:8'));
        expect(grouped).toBeDefined();
        expect(text.slice(grouped.start, grouped.end)).toBe(grouped.text);
    });
});
