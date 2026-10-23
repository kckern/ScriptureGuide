import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allowReason } from './allow.mjs';

describe('allowReason', () => {
  const allow = {
    'html /': 'home page cleanups',
    'html re:^/wp-': 'scanner probes',
    '* re:\\.php$': 'retired PHP files',
    'meta re:[': 'an invalid pattern is ignored',
  };
  test('an exact "<format> <path>" key', () => {
    expect(allowReason(allow, 'html', '/')).toBe('home page cleanups');
    expect(allowReason(allow, 'api', '/')).toBeUndefined();
  });
  test('a "<format> re:<regex>" key matches the path', () => {
    expect(allowReason(allow, 'html', '/wp-login')).toBe('scanner probes');
    expect(allowReason(allow, 'html', '/blog/wp-login')).toBeUndefined();
    expect(allowReason(allow, 'api', '/wp-login')).toBeUndefined();
  });
  test('format "*" matches every format', () => {
    expect(allowReason(allow, 'raw', '/zup.php')).toBe('retired PHP files');
    expect(allowReason(allow, 'html', '/index.php')).toBe('retired PHP files');
  });
  test('an exact key wins over a pattern', () => {
    expect(allowReason({ ...allow, 'html /wp-x': 'exact' }, 'html', '/wp-x')).toBe('exact');
  });
  test('an invalid pattern never matches', () => {
    expect(allowReason(allow, 'meta', '/[')).toBeUndefined();
  });
  test('a "<format> live:<regex>" key matches the live body, never the path', () => {
    const a = { 'markdown live:<b>Fatal error</b>': 'live is a PHP fatal error' };
    expect(allowReason(a, 'markdown', '/x', '<br />\n<b>Fatal error</b>: Uncaught')).toBe('live is a PHP fatal error');
    expect(allowReason(a, 'markdown', '/x', '# John 3:16')).toBeUndefined();
    expect(allowReason(a, 'markdown', '/Fatal error')).toBeUndefined();
    expect(allowReason(a, 'xml', '/x', '<b>Fatal error</b>')).toBeUndefined();
  });
  test('a "<format> re:<regex> && live:<regex>" key needs both the path and the live body', () => {
    const a = { 'html re:^/[a-z]+-[a-z]+\\d$ && live:<title>Genesis 1': 'both' };
    expect(allowReason(a, 'html', '/abc-def1', '<title>Genesis 1–50')).toBe('both');
    expect(allowReason(a, 'html', '/abc-def1', '<title>Exodus 1')).toBeUndefined();
    expect(allowReason(a, 'html', '/gen.1', '<title>Genesis 1')).toBeUndefined();
    expect(allowReason(a, 'html', '/abc-def1')).toBeUndefined();
  });
});

describe('allowReason: a "<format> check:<name>" key', () => {
  const a = { '* check:staleSectionHeading': 'live heads the passage with the section before it' };
  const head = (id, last, text) => `<h3 class="heading" heading_verse_id="${id}" last_verse_id="${last}" ver="NIV" verse_count="${last - id}">\n  "${text}"`;
  const verse = '<p class="prose">\n  <span class="verse v_9" verse_id="9">\n    "§A psalm."';
  const live = `STATUS 200\n${head(5, 8, 'Psalm 1')}\n<p class="ellipses" heading_verse_id="5" last_verse_id="8">\n  "..."\n${verse}`;
  const node = `STATUS 200\n${head(9, 12, 'Psalm 2')}\n${verse}`;
  const raw = { text: '§A psalm.¶▼Why', headings: { heading: 'Psalm 2', last: 12 } };
  test('allows a request when the named check passes on the compared responses', () => {
    expect(allowReason(a, 'html', '/niv/ps.2', '', { live, node, raw })).toBe('live heads the passage with the section before it');
    expect(allowReason(a, 'api', '/niv/ps.2', '', { live, node, raw })).toBe('live heads the passage with the section before it');
  });
  test('not when it fails, or without the responses', () => {
    expect(allowReason(a, 'html', '/niv/ps.2', '', { live, node: node.replace('A psalm', 'Other'), raw })).toBeUndefined();
    expect(allowReason(a, 'html', '/niv/ps.2', '', { live, node })).toBeUndefined();
    expect(allowReason(a, 'html', '/niv/ps.2', '')).toBeUndefined();
  });
  test('an unknown check never matches', () => {
    expect(allowReason({ 'html check:nope': 'x' }, 'html', '/', '', { live, node, raw })).toBeUndefined();
  });
});

describe('allowReason: check:singleHeadingDrop', () => {
  const a = { 'passage check:singleHeadingDrop': 'single_heading drops verses' };
  const span = id => `  <span class="verse v_${id}" verse_id="${id}">\n    "v${id}"`;
  const node = `STATUS 200\n<p class="prose">\n${span(1)}\n<p class="prose">\n${span(2)}\n<p class="prose">\n${span(3)}`;
  const live = `STATUS 200\n<p class="prose">\n${span(1)}\n<p class="prose">\n${span(3)}`;
  test('allows a passage whose live response dropped a later section\'s first verse', () => {
    expect(allowReason(a, 'passage', '/passage?x', '', { live, node, dropRaw: { 2: { text: '§¶v2' } } })).toBe('single_heading drops verses');
    expect(allowReason(a, 'passage', '/passage?x', '', { live, node, dropRaw: { 2: { text: '¶v2' } } })).toBeUndefined();
  });
  test('only for that format', () => {
    expect(allowReason(a, 'html', '/x', '', { live, node, dropRaw: { 2: { text: '§¶v2' } } })).toBeUndefined();
  });
});

describe('allow.json: junk pieces after a leading cross-book range', () => {
  const allow = JSON.parse(readFileSync(new URL('./allow.json', import.meta.url), 'utf8'));
  const junk = (h3) => `<div class='passage ver_'>\n\t\t\t<h3>\n\t\t\t${h3}\n\t\t\t</h3>\n\t\t\t<p>\n\t\t\t<span class='verse'>No scripture verses found.</span>`;
  const reason = (path, live) => allowReason(allow, 'html', path, live);
  test('allowed where live shows getBook\'s junk heading', () => {
    expect(reason('/acts.28.31-rom.1.1;16.1', junk(' 16:1'))).toMatch(/cross-book/);
    expect(reason('/gen.50.26-ex.1.2;3.4', junk('3: 3:4'))).toMatch(/cross-book/);
  });
  test('not where live has no junk heading', () => {
    expect(reason('/acts.28.31-rom.1.1;16.1', junk('Romans 16:1'))).toBeUndefined();
    expect(reason('/acts.28.31-rom.1.1;16.1', '<title>Acts 28:31–Romans 1:1')).toBeUndefined();
  });
  test('not for a range within one book', () => {
    expect(reason('/gen.1.1-gen.2.3;4', junk(' 4'))).toBeUndefined();
    expect(reason('/gen.1.1-gen.2.3;4.1', junk(' 4:1'))).toBeUndefined();
  });
});

describe('allow.json: latex of junk pieces after a leading cross-book range', () => {
  const allow = JSON.parse(readFileSync(new URL('./allow.json', import.meta.url), 'utf8'));
  test('allowed where live\'s latex is empty', () => {
    expect(allowReason(allow, 'latex', '/acts.28.31-rom.1.1;16.1', '')).toMatch(/latex/);
  });
  test('not where live printed text, nor for a same-book range', () => {
    expect(allowReason(allow, 'latex', '/acts.28.31-rom.1.1;16.1', '\\begin{scripturechapter}')).toBeUndefined();
    expect(allowReason(allow, 'latex', '/gen.1.1-gen.2.3;4', '')).toBeUndefined();
  });
});

