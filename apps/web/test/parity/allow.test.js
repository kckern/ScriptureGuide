import { describe, test, expect } from 'vitest';
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
