import { findReferences } from '../../src/scriptures.mjs';

const refs = (text, options) => findReferences(text, options).map(r => r.ref);

// An implied reference borrows its book from an earlier explicit citation.
// "v. 16" / "vv. 3, 5" carry a marker that declares the intent, so they may
// reach across prose. A BARE "6:3" is just two numbers -- with no marker, it
// may only bind to a book it is joined to by separator punctuation. Binding it
// on raw character distance turns any number pair in prose into a citation.
describe('implied book context: bare chapter:verse must not cross prose', () => {
    test('does not inherit a book across an intervening non-scripture title', () => {
        const text = 'Job 23:10; Lectures on Faith, 6:3';
        expect(refs(text)).toEqual(['Job 23:10']);
    });

    test('does not inherit a book across a long prose run', () => {
        const text = 'Job 23:10; Teachings of the Prophet Joseph Smith, p. 185; Lectures on Faith, 6:3';
        expect(refs(text)).toEqual(['Job 23:10']);
    });

    test('does not inherit a book when a sentence ends immediately before', () => {
        // The guard is the token immediately before the number, not a scan of the
        // whole gap: a correct parenthetical bind often sits sentences away from
        // its context, so scanning the gap would veto it.
        expect(refs('Alma 32:21. 10:30 a.m.')).toEqual(['Alma 32:21']);
    });

    // Distance is deliberately NOT the discriminator -- correct binds routinely
    // sit further from their context than this false one does. What decides it
    // is the token immediately before the number.
    test('does not inherit a book when a plain word precedes the number', () => {
        const text = `Job 23:10; ${'word '.repeat(40)}6:3`;
        expect(refs(text)).toEqual(['Job 23:10']);
    });

    test('a separator immediately before the number still continues the citation', () => {
        const text = 'Job 23:10; 6:3';
        expect(refs(text).join(' ')).toContain('6:3');
    });

    test('a bare chapter:verse with no preceding book stays unresolved', () => {
        expect(refs('Lectures on Faith, 6:3')).toEqual([]);
    });
});

describe('implied book context: legitimate continuations still resolve', () => {
    test('separator-joined continuation still chains', () => {
        expect(refs('D&C 58:2-4; 136:31').join(' ')).toContain('136:31');
    });

    test('marker-carrying implied verse still reaches across prose', () => {
        const text = 'In John 3, Jesus explains (v. 16) that God loved the world.';
        const implied = findReferences(text).find(m => /^v/.test(m.text));
        expect(implied).toBeDefined();
        expect(implied.ref).toMatch(/John 3:16/);
    });

    test('explicit repeated book references are unaffected', () => {
        expect(refs('Alma 14:11; Alma 34:40–41').join(' ')).toContain('34:40');
    });
});

// The citation line that surfaced this bug, from a lesson manual.
describe('implied book context: real-world manual citation line', () => {
    const LINE = 'Hel. 12:1–6; Alma 17:11; D&C 58:2–4; 136:31; 1 Cor. 10:13; 2 Cor. 8:2; Mosiah 23:21; Hel. 10:36; John 16:33; Job 23:10; Teachings of the Prophet Joseph Smith, p. 185; Ensign, May 1992, pp. 25-27; Lectures on Faith, 6:3; refer in this text to Alma 14:11; Alma 34:40–41';

    test('does not invent "Job 6:3" from the Lectures on Faith citation', () => {
        const all = findReferences(LINE);
        expect(all.map(r => r.ref).join(' | ')).not.toContain('Job 6:3');
        expect(all.some(m => m.text === '6:3')).toBe(false);
    });

    test('every reported span still matches its source text', () => {
        for (const m of findReferences(LINE)) {
            expect(LINE.slice(m.start, m.end)).toBe(m.text);
            expect(m.verse_ids.length).toBeGreaterThan(0);
        }
    });
});
