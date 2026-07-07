# Scripture Guide Extension Rewrite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken `linker.js` content script with a DOM-safe, performant, configurable Chrome extension (v3.0.0), backed by a new position-based `findReferences()` API in the `scripture-guide` npm package (v1.0.89).

**Architecture:** Two repos. Phase 1 adds `findReferences(text, options) → [{ref, verse_ids, start, end, text}]` to ScriptureGuideUtils by refactoring the existing detection pipelines (both already compute `[start, end]` offsets internally before flattening to a string). Phase 2 rebuilds the extension: a TreeWalker + idle-scheduled queue finds candidate text nodes, `findReferences` runs on plain `nodeValue` text, and annotation splits text nodes with `replaceChild` + DocumentFragment — `innerHTML` is never touched. A WeakSet tracks processed nodes (this alone terminates the MutationObserver feedback loop). Settings live in `chrome.storage.sync` with popup + native-feeling options page.

**Tech Stack:** Vanilla JS (ESM), webpack 5 + babel, jest + jsdom, Chrome MV3, `scripture-guide` npm package.

**Design doc:** `docs/plans/2026-07-06-extension-rewrite-design.md`

**Workspaces:**
- Phase 1 (Utils): create worktree `/Users/kckern/Documents/GitHub/ScriptureGuideUtils/.worktrees/find-references`, branch `feature/find-references`, **off committed master** — the Utils main working tree has unrelated uncommitted cross-canon work; do not touch it.
- Phase 2 (Extension): existing worktree `/Users/kckern/Documents/GitHub/ScriptureGuideChromeExtention/.worktrees/rewrite`, branch `rewrite/v3`.

**Known facts (verified during audit — trust these):**
- `src/scriptdetect.mjs:153` `processReferenceDetection` computes `mergedIndeces` (`[start,end]` pairs into `content`) before building its string output.
- `src/scriptdetectcontext.mjs:15` `detectReferencesWithContext` computes `mergedIndices` tuples `[start, end, originalText, verseIds]`.
- `detectReferences` options today: `language`, `contextAware` (default true), `contextScope`, `maxContextDistance`, `enableImpliedBooks`, `enableVerseAbbrev`.
- Bare book names ("Genesis" with no number) are **not** detected today — the chapter pattern requires digits. So `wholeBooks` defaults **false** (new opt-in capability), while `abbreviations`/`chapterOnly` default **true** (current behavior).
- Utils tests: jest via `npm run test:jest`, test files live under `test/<area>/*.test.js`.
- The npm package bundles all canon data inline (no fs at runtime) — safe to import in a MV3 service worker.
- Extension repo: `linker.js` at HEAD has a syntax error (unbalanced brace, line 501). It is deleted in this plan; never try to build it.

---

## Phase 1 — scripture-guide 1.0.89 (ScriptureGuideUtils repo)

### Task 1: Utils worktree + baseline

**Step 1:** Create worktree and install:
```bash
cd /Users/kckern/Documents/GitHub/ScriptureGuideUtils
git worktree add .worktrees/find-references -b feature/find-references master
cd .worktrees/find-references && npm install && npm run build
```
**Step 2:** Run baseline: `npm run test:jest 2>&1 | tail -5`. Expected: all suites pass. If any fail on clean master, STOP and report — do not proceed on a broken baseline.

### Task 2: `collectReferences` (basic, non-context path)

**Files:**
- Test: `test/detect/find-references.test.js` (create)
- Modify: `src/scriptdetect.mjs`

**Step 1: Write failing tests**

```javascript
import { findReferences } from '../../src/scriptures.mjs';

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
    const text = 'Compare Genesis 1:1 with John 3:16 and Alma 32:21.';
    const results = findReferences(text, { contextAware: false });
    expect(results.length).toBe(3);
    expect(results.map(m => text.slice(m.start, m.end)))
      .toEqual(['Genesis 1:1', 'John 3:16', 'Alma 32:21']);
    expect(results[0].start).toBeLessThan(results[1].start);
  });

  test('no references returns empty array', () => {
    expect(findReferences('Nothing to see here in 2026.', { contextAware: false })).toEqual([]);
    expect(findReferences('', { contextAware: false })).toEqual([]);
  });

  test('does not mutate detectReferences behavior (regression)', () => {
    // detectReferences must produce identical output before/after the refactor —
    // covered by the existing test suite staying green.
  });
});
```

**Step 2:** `npm run test:jest -- test/detect/find-references.test.js` → FAIL (`findReferences` is not exported).

**Step 3: Implement.** In `src/scriptdetect.mjs`, extract the shared pipeline. Add:

```javascript
const collectReferences = (content, books, lang_extra, lookupReference) => {
    try {
        lang_extra = lang_extra || {};
        const matches = findMatches(content, books, lang_extra);
        const matchIndeces = findMatchIndexes(content, matches, lookupReference, lang_extra);
        if (!matchIndeces) return [];
        const gapsBetweenIndeces = calculateGaps(matchIndeces);
        const gapStrings = gapsBetweenIndeces.map(([start, end]) => content.substring(start, end).trim());
        const joiners = lang_extra.joiners || ["^[;, &]*(and|c\\.*f\\.*|&|cited\\s+at|see\\s+also|compare|cf|see)*\\s*$"];
        const gapThatMayBeMerged = gapsBetweenIndeces.map((_, i) =>
            joiners.some(joiner => (new RegExp(joiner, "ig")).test(gapStrings[i])));
        const mergedIndeces = mergeAdjacentMatches(matchIndeces, gapThatMayBeMerged);
        return mergedIndeces.map(([start, end]) => {
            const text = content.substring(start, end);
            const { query, verse_ids } = lookupReference(text);
            return { start, end, text, ref: query, verse_ids: verse_ids || [] };
        });
    } catch (e) {
        return [];
    }
};
```

Refactor `processReferenceDetection` to consume it (behavior-identical string output):

```javascript
const processReferenceDetection = (content, books, lang_extra, lookupReference, callback) => {
    const found = collectReferences(content, books, lang_extra, lookupReference);
    if (!found.length) return content;
    const indices = found.map(({ start, end }) => [start, end]);
    const negativeSpace = calculateNegativeSpace(indices, content.length);
    const cutItems = found.map(({ ref, verse_ids }) => callback(ref, verse_ids));
    const negativeItems = negativeSpace.map(([s, e]) => content.substring(s, e));
    return buildFinalOutput(cutItems, negativeItems, indices[0][0] === 0);
};
```

Export `collectReferences` from the module. Then in `src/scriptures.mjs` add a public `findReferences` (basic path only for now — context path comes in Task 3). Mirror `detectReferences`'s option/language plumbing exactly (same defaults object), but return the collected array, filtered to `verse_ids.length > 0`:

```javascript
const findReferences = (content, options = null) => {
    if (typeof options === 'string' || options === null) options = { language: options };
    const finalOptions = { language: null, contextAware: true, contextScope: 'sentence',
        maxContextDistance: 500, enableImpliedBooks: true, enableVerseAbbrev: true, ...options };
    const effectiveLanguage = getEffectiveLanguage(finalOptions.language);
    const config = getLanguageConfig(effectiveLanguage);
    const src = config.raw_regex.books.map(i => i[0]);
    const dst = [...new Set(config.raw_regex.books.map(i => i[1]))];
    const books = [...dst, ...src];
    const lookup = (query) => lookupReference(query, effectiveLanguage);
    const found = finalOptions.contextAware
        ? collectReferencesWithContext(content, books, config.lang_extra, lookup, finalOptions)  // Task 3
        : collectReferences(content, books, config.lang_extra, lookup);
    return found.filter(m => m.verse_ids.length > 0);
};
```

Until Task 3 exists, have the `contextAware` branch fall through to `collectReferences` so tests pass. Add to the export block: `findReferences`, plus aliases `findReferences as find`, `findReferences as findRefs`.

**Step 4:** Run the new test file → PASS. Run the **full** suite → all green (proves the `processReferenceDetection` refactor is behavior-identical).

**Step 5:** Commit: `feat: add findReferences position-based detection (basic path)`

### Task 3: `collectReferencesWithContext` (context-aware path)

**Files:**
- Test: append to `test/detect/find-references.test.js`
- Modify: `src/scriptdetectcontext.mjs`, `src/scriptures.mjs`

**Step 1: Failing tests**

```javascript
describe('findReferences (context-aware)', () => {
  test('explicit + implied verse resolves with correct span', () => {
    const text = 'In John 3, Jesus explains (v. 16) that God loved the world.';
    const results = findReferences(text);
    const implied = results.find(m => m.verse_ids.includes(26137) && m.text.startsWith('v'));
    expect(implied).toBeDefined();
    expect(text.slice(implied.start, implied.end)).toBe(implied.text);
    expect(implied.ref).toMatch(/John 3:16/);
  });

  test('context-aware default matches detectReferences match count', () => {
    const text = 'See Matthew 5:3-12 and John 3:16.';
    const results = findReferences(text);
    expect(results.map(m => m.text)).toEqual(['Matthew 5:3-12', 'John 3:16']);
  });
});
```

**Step 2:** Run → FAIL (implied ref missing, since Task 2 falls through to basic path).

**Step 3: Implement.** In `src/scriptdetectcontext.mjs`, extract steps 1–5 of `detectReferencesWithContext` (everything up to and including `mergeAdjacentMatches`) into:

```javascript
export const collectReferencesWithContext = (content, books, lang_extra, lookupReference, options) => {
    try {
        // identical steps 1-5 as detectReferencesWithContext, ending with mergedIndices
        // (tuples of [start, end, originalText, verseIds]); for implied matches also
        // retain the resolved reference string (thread it through as a 5th tuple slot
        // or a parallel map keyed by start offset)
        return mergedIndices.map(([start, end, originalText, verseIds, resolvedRef]) => ({
            start, end,
            text: content.substring(start, end),
            ref: resolvedRef || lookupReference(originalText).ref || originalText,
            verse_ids: verseIds || []
        }));
    } catch (e) {
        return collectReferences(content, books, lang_extra, lookupReference);
    }
};
```

Then refactor `detectReferencesWithContext` to build its string output from `collectReferencesWithContext` results (same `calculateNegativeSpace`/`buildFinalOutput` pattern as Task 2), keeping the callback contract `(originalText, verseIds)` — pass `m.text` (not `m.ref`) as the first callback arg to preserve existing display behavior. Wire the real call into `findReferences` in `scriptures.mjs`.

**Important:** `mergeAdjacentMatches` merges tuples — verify what it does with slots 3+ (read `src/scriptlib.mjs` before writing this). If merged tuples lose `originalText`/`verseIds`, re-derive: `text = content.substring(start,end)`, `verse_ids = lookupReference(text).verse_ids`, falling back to the pre-merge tuples' concatenated ids when the merged-text lookup returns empty.

**Step 4:** New tests PASS; full suite green (context detectReferences output unchanged).

**Step 5:** Commit: `feat: context-aware collectReferencesWithContext; findReferences complete`

### Task 4: Detection option flags (`abbreviations`, `chapterOnly`)

**Files:**
- Test: `test/detect/detection-flags.test.js` (create)
- Modify: `src/scriptures.mjs`

**Step 1: Failing tests**

```javascript
import { findReferences, detectReferences } from '../../src/scriptures.mjs';

describe('detection option flags', () => {
  test('chapterOnly: false drops chapter-only refs, keeps versed refs', () => {
    const text = 'Read Genesis 2 and then John 3:16.';
    const texts = findReferences(text, { contextAware: false, chapterOnly: false }).map(m => m.text);
    expect(texts).toEqual(['John 3:16']);
    // default true keeps both
    expect(findReferences(text, { contextAware: false }).length).toBe(2);
  });

  test('abbreviations: false drops abbreviated book names', () => {
    const text = 'Mt 5:3 differs from Matthew 5:4.';
    const texts = findReferences(text, { contextAware: false, abbreviations: false }).map(m => m.text);
    expect(texts).toEqual(['Matthew 5:4']);
    expect(findReferences(text, { contextAware: false }).length).toBe(2);
  });

  test('flags also apply to detectReferences string output', () => {
    const out = detectReferences('Read Genesis 2 today.', null, { contextAware: false, chapterOnly: false });
    expect(out).toBe('Read Genesis 2 today.');
  });
});
```

**Step 2:** Run → FAIL.

**Step 3: Implement** a pure post-filter in `src/scriptures.mjs`:

```javascript
const applyDetectionFlags = (found, finalOptions, effectiveLanguage) => {
    let out = found;
    if (finalOptions.chapterOnly === false) {
        out = out.filter(m => /[:.]\s*\d/.test(m.text) || /[:]\d/.test(m.ref || ''));
    }
    if (finalOptions.abbreviations === false) {
        out = out.filter(m => {
            const canonical = lookupReference(m.text, effectiveLanguage).ref || '';
            const canonicalBook = canonical.replace(/[\s]*[\d:,\-–—;.]+$/g, '').trim();
            return canonicalBook && m.text.toLowerCase().includes(canonicalBook.toLowerCase());
        });
    }
    return out;
};
```

Defaults `abbreviations: true, chapterOnly: true` join the options object in both `findReferences` and `detectReferences`. For `detectReferences`, filtering positional results and rebuilding the string is the clean route: implement `detectReferences` flag support by routing it through `findReferences` results **only when a flag is non-default** (otherwise leave the existing paths untouched to minimize regression surface): rebuild output with the same negative-space/`buildFinalOutput` helpers.

**Step 4:** Tests PASS; full suite green. **Step 5:** Commit: `feat: abbreviations/chapterOnly detection flags`

### Task 5 (OPTIONAL — skip if time-boxed; extension defaults it off): `wholeBooks` flag

Bare book-name matching ("Genesis" alone), default **false**. Post-pass in `findReferences` when `wholeBooks: true`: for each canonical book name in the active config, regex-scan `content` for `\b<name>\b` occurrences not inside an existing match span; `lookupReference(name)` for ids; append `{start, end, text, ref, verse_ids}`; re-sort. Tests: `'The book of Genesis is first.'` yields 1 match with `wholeBooks: true`, 0 by default; overlap case `'Genesis 1:1'` yields exactly one match (no double-count). Commit: `feat: opt-in wholeBooks detection flag`.

### Task 6: README, version, publish

**Step 1:** Document `findReferences` + new flags in `README.md` (mirror the `detectReferences` section style).
**Step 2:** `npm run build && npm run test:jest` — all green.
**Step 3:** Merge to master (from the main checkout, after confirming the user's dirty cross-canon work is unaffected: `git -C /Users/kckern/Documents/GitHub/ScriptureGuideUtils merge feature/find-references` — if the dirty files conflict, STOP and ask the user).
**Step 4:** `npm version patch` (→ 1.0.89), `npm publish`, push with tags. If `npm publish` fails on auth, tell the user to run `! npm login` and retry.

---

## Phase 2 — Extension rewrite (worktree `.worktrees/rewrite`, branch `rewrite/v3`)

### Task 7: Scaffolding — delete old code, new build skeleton

**Files:**
- Delete: `linker.js`, `background.js`, `test.html`, `font_test.html`
- Create: `src/` tree per design, `jest.config.js`, `.babelrc` update
- Modify: `webpack.config.js`, `manifest.json`, `package.json`

**Step 1:** `git rm linker.js background.js test.html font_test.html`
**Step 2:** Dev-link the parser (until 1.0.89 is published):
```bash
npm install /Users/kckern/Documents/GitHub/ScriptureGuideUtils/.worktrees/find-references
npm install -D jest jest-environment-jsdom babel-jest
```
**Step 3:** New `webpack.config.js` — four entries, copy static assets:

```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    content: './src/content/index.js',
    background: './src/background/index.js',
    popup: './src/popup/popup.js',
    options: './src/options/options.js'
  },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js', clean: true },
  module: { rules: [{ test: /\.js$/, exclude: /node_modules/,
    use: { loader: 'babel-loader', options: { presets: ['@babel/preset-env'] } } }] },
  plugins: [new CopyPlugin({ patterns: [
    { from: 'manifest.json' },
    { from: 'icons/*.png', to: 'icons/[name][ext]' },
    { from: 'fonts', to: 'fonts' },
    { from: 'src/content/content.css', to: 'content.css' },
    { from: 'src/popup/popup.html', to: 'popup.html' },
    { from: 'src/popup/popup.css', to: 'popup.css' },
    { from: 'src/options/options.html', to: 'options.html' },
    { from: 'src/options/options.css', to: 'options.css' }
  ]})]
};
```

**Step 4:** New `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Scripture Guide",
  "description": "Detects scripture references on any page and links them to scripture.guide",
  "version": "3.0.0",
  "background": { "service_worker": "background.js" },
  "omnibox": { "keyword": "sg" },
  "icons": { "16": "icons/icon_16.png", "32": "icons/icon_32.png", "48": "icons/icon_48.png", "128": "icons/icon_128.png" },
  "action": { "default_icon": "icons/icon_128.png", "default_popup": "popup.html" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "content_scripts": [{ "matches": ["*://*/*"], "js": ["content.js"], "css": ["content.css"], "run_at": "document_idle" }],
  "permissions": ["storage", "contextMenus"],
  "web_accessible_resources": [{ "resources": ["fonts/*"], "matches": ["*://*/*"] }]
}
```

Note: no `host_permissions`, no `scripting`, no `activeTab` — content-script `matches` grants what we need. Old per-site `exclude_matches` move to the default blacklist in settings (Task 8).

**Step 5:** `jest.config.js`:

```javascript
module.exports = {
  testEnvironment: 'jsdom',
  transformIgnorePatterns: ['node_modules/(?!scripture-guide)'],
  testMatch: ['**/test/**/*.test.js']
};
```

Add `"test": "jest"` to package.json scripts. Create empty dirs `src/{content,background,popup,options,shared}` with placeholder `index.js` files so webpack compiles: `npx webpack` → builds (background/popup/options can be one-line stubs for now).

**Step 6:** Commit: `chore: scaffolding for v3 rewrite — 4-entry webpack, MV3 manifest, jest`

### Task 8: `shared/settings.js`

**Files:** Create `src/shared/settings.js`, `test/unit/settings.test.js`

**Step 1: Failing tests**

```javascript
import { DEFAULTS, mergeSettings, siteEnabled, hostMatches } from '../../src/shared/settings.js';

describe('settings', () => {
  test('mergeSettings deep-merges stored over defaults', () => {
    const s = mergeSettings({ detection: { contextAware: false } });
    expect(s.detection.contextAware).toBe(false);
    expect(s.detection.impliedBooks).toBe(true);
    expect(s.appearance.linkStyle).toBe('badge');
  });
  test('hostMatches supports exact and wildcard', () => {
    expect(hostMatches('reddit.com', 'reddit.com')).toBe(true);
    expect(hostMatches('old.reddit.com', '*.reddit.com')).toBe(true);
    expect(hostMatches('reddit.com', '*.reddit.com')).toBe(true);
    expect(hostMatches('notreddit.com', '*.reddit.com')).toBe(false);
  });
  test('siteEnabled honors global toggle, blacklist and whitelist modes', () => {
    expect(siteEnabled('example.com', mergeSettings({ enabled: false }))).toBe(false);
    expect(siteEnabled('scripture.guide', mergeSettings({}))).toBe(false); // seeded default blacklist
    expect(siteEnabled('example.com', mergeSettings({}))).toBe(true);
    const wl = mergeSettings({ siteMode: 'whitelist', whitelist: ['example.com'] });
    expect(siteEnabled('example.com', wl)).toBe(true);
    expect(siteEnabled('other.com', wl)).toBe(false);
  });
});
```

**Step 2:** FAIL. **Step 3: Implement:**

```javascript
export const DEFAULTS = {
  enabled: true,
  siteMode: 'blacklist',
  blacklist: ['scripture.guide', '*.scripture.guide', 'scriptures.info', '*.scriptures.info',
    'isaiahexplained.com', '*.isaiahexplained.com', '*.bookofmormon.online',
    '*.churchofjesuschrist.org', '*.google.com', '*.bing.com', 'kckern.info', '*.kckern.info'],
  whitelist: [],
  canon: 'lds',
  language: 'en',
  detection: { contextAware: true, impliedBooks: true, abbreviations: true, chapterOnly: true, wholeBooks: false },
  appearance: { linkStyle: 'badge', useKreonFont: true },
  click: { action: 'popup', popupWidth: 1000, popupHeight: 750 }
};

export function mergeSettings(stored = {}) {
  const out = structuredClone(DEFAULTS);
  for (const [k, v] of Object.entries(stored)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = { ...out[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function hostMatches(hostname, pattern) {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return hostname === base || hostname.endsWith('.' + base);
  }
  return hostname === pattern;
}

export function siteEnabled(hostname, settings) {
  if (!settings.enabled) return false;
  const inList = list => list.some(p => hostMatches(hostname, p));
  return settings.siteMode === 'whitelist'
    ? inList(settings.whitelist)
    : !inList(settings.blacklist);
}
```

**Step 4:** PASS. **Step 5:** Commit: `feat: settings schema, deep merge, site allow/deny logic`

### Task 9: `shared/slug.js` (scripture.guide URL builder)

**Files:** Create `src/shared/slug.js`, `test/unit/slug.test.js`

**Step 1: Failing tests** — preserve the legacy URL scheme:

```javascript
import { refToSlug } from '../../src/shared/slug.js';
test('slug format matches scripture.guide URL scheme', () => {
  expect(refToSlug('John 3:16')).toBe('john.3.16');
  expect(refToSlug('1 Nephi 3:7-10')).toBe('1.nephi.3.7-10');
  expect(refToSlug('Matthew 5:3–12')).toBe('matthew.5.3-12');   // en-dash normalized
  expect(refToSlug('Exodus 5:1; Leviticus 6:2')).toBe('exodus.5.1;leviticus.6.2');
});
```

**Step 2:** FAIL. **Step 3:**

```javascript
export function refToSlug(ref) {
  return ref.trim().toLowerCase()
    .replace(/[־᠆‐‒–—―﹣－‑]+/gu, '-')
    .replace(/[\s:]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/;\./g, ';')
    .replace(/,\./g, ',');
}
```

**Step 4:** PASS (adjust expectations only if the *legacy* linker output disagrees — the scheme must match what scripture.guide accepts today). **Step 5:** Commit.

### Task 10: `content/detect.js` — candidate collection

**Files:** Create `src/content/detect.js`, `test/unit/detect.test.js`

**Step 1: Failing tests**

```javascript
import { collectCandidates } from '../../src/content/detect.js';

function body(html) { document.body.innerHTML = html; return document.body; }

describe('collectCandidates', () => {
  test('finds plain text nodes with digits', () => {
    const nodes = collectCandidates(body('<p>Read John 3:16 now</p>'), new WeakSet());
    expect(nodes.map(n => n.nodeValue)).toEqual(['Read John 3:16 now']);
  });
  test('skips script/style/code/pre/a/textarea/contenteditable and .sg_autolink', () => {
    const html = `<script>x = 'John 3:16'</script><code>John 3:16</code><pre>John 3:16</pre>
      <a href="/x">John 3:16</a><div contenteditable="">John 3:16</div>
      <span class="sg_autolink">John 3:16</span><textarea>John 3:16</textarea>`;
    expect(collectCandidates(body(html), new WeakSet())).toEqual([]);
  });
  test('skips digit-free and tiny nodes', () => {
    expect(collectCandidates(body('<p>no digits here at all</p><p>3:16</p><p>ab1</p>'), new WeakSet())
      .map(n => n.nodeValue)).toEqual([]);   // '3:16' is 4 chars < 6? -> adjust: use '<p>hi</p>'
  });
  test('skips already-processed nodes', () => {
    const b = body('<p>Read John 3:16 now</p>');
    const seen = new WeakSet();
    seen.add(b.querySelector('p').firstChild);
    expect(collectCandidates(b, seen)).toEqual([]);
  });
});
```

(Fix the third test during implementation: minimum length is 6 and requires a digit — pick fixtures accordingly, e.g. `'no digits in this text'` skipped, `'a1'` skipped, `'John 3:16'` at 9 chars accepted.)

**Step 2:** FAIL. **Step 3:**

```javascript
const SKIP_SELECTOR = 'script,style,noscript,textarea,code,pre,a,svg,select,button,input,' +
  '[contenteditable]:not([contenteditable="false"]),.sg_autolink';

export function collectCandidates(root, processed) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = node.nodeValue;
      if (!t || t.length < 6 || !/\d/.test(t)) return NodeFilter.FILTER_REJECT;
      if (processed.has(node)) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || p.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const out = [];
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}

export function isCandidate(node, processed) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const t = node.nodeValue;
  if (!t || t.length < 6 || !/\d/.test(t)) return false;
  if (processed.has(node)) return false;
  const p = node.parentElement;
  return !!p && !p.closest(SKIP_SELECTOR);
}
```

**Step 4:** PASS. **Step 5:** Commit: `feat: DOM-safe candidate text-node collection`

### Task 11: `content/annotate.js` — text-node splitting (the heart of the rewrite)

**Files:** Create `src/content/annotate.js`, `test/unit/annotate.test.js`

**Step 1: Failing tests**

```javascript
import { annotateTextNode, removeAllAnnotations } from '../../src/content/annotate.js';

describe('annotateTextNode', () => {
  test('wraps match in <a>, preserves surrounding text and sibling nodes', () => {
    document.body.innerHTML = '<p><b>Bold</b>Read John 3:16 now<i>Italic</i></p>';
    const p = document.querySelector('p');
    const textNode = p.childNodes[1];
    const created = annotateTextNode(textNode,
      [{ start: 5, end: 14, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }],
      new WeakSet());
    expect(p.textContent).toBe('BoldRead John 3:16 nowItalic');
    const a = p.querySelector('a.sg_autolink');
    expect(a.textContent).toBe('John 3:16');
    expect(a.href).toBe('https://scripture.guide/john.3.16');
    expect(p.querySelector('b')).not.toBeNull();   // siblings untouched
    expect(created.links).toHaveLength(1);
  });

  test('handles multiple + adjacent matches and marks created text nodes processed', () => {
    document.body.innerHTML = '<p>Gen 1:1 and John 3:16</p>';
    const tn = document.querySelector('p').firstChild;
    const processed = new WeakSet();
    annotateTextNode(tn, [
      { start: 0, end: 7, text: 'Gen 1:1', ref: 'Genesis 1:1', verse_ids: [1] },
      { start: 12, end: 21, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }
    ], processed);
    const p = document.querySelector('p');
    expect(p.querySelectorAll('a.sg_autolink')).toHaveLength(2);
    expect(p.textContent).toBe('Gen 1:1 and John 3:16');
    for (const n of p.childNodes) if (n.nodeType === 3) expect(processed.has(n)).toBe(true);
  });

  test('text with HTML-special characters survives verbatim (the old innerHTML bug)', () => {
    document.body.innerHTML = '<p></p>';
    const tn = document.createTextNode('Q&A <not html> about John 3:16 & more');
    document.querySelector('p').appendChild(tn);
    annotateTextNode(tn, [{ start: 21, end: 30, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }], new WeakSet());
    expect(document.querySelector('p').textContent).toBe('Q&A <not html> about John 3:16 & more');
  });

  test('event listeners on ancestors survive annotation', () => {
    document.body.innerHTML = '<div id="app"><p>John 3:16</p></div>';
    let clicks = 0;
    document.getElementById('app').addEventListener('click', () => clicks++);
    annotateTextNode(document.querySelector('p').firstChild,
      [{ start: 0, end: 9, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }], new WeakSet());
    document.querySelector('a.sg_autolink').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toBe(1);
  });

  test('removeAllAnnotations restores plain text', () => {
    document.body.innerHTML = '<p>Read John 3:16 now</p>';
    const tn = document.querySelector('p').firstChild;
    annotateTextNode(tn, [{ start: 5, end: 14, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }], new WeakSet());
    removeAllAnnotations(document);
    expect(document.querySelector('p').textContent).toBe('Read John 3:16 now');
    expect(document.querySelector('a.sg_autolink')).toBeNull();
  });
});
```

**Step 2:** FAIL. **Step 3:**

```javascript
import { refToSlug } from '../shared/slug.js';

export function annotateTextNode(textNode, matches, processed) {
  const parent = textNode.parentNode;
  if (!parent || !matches.length) return { links: [] };
  const doc = textNode.ownerDocument;
  const text = textNode.nodeValue;
  const frag = doc.createDocumentFragment();
  const links = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor || m.end > text.length) continue;   // overlap/bounds guard
    if (m.start > cursor) {
      const before = doc.createTextNode(text.slice(cursor, m.start));
      processed.add(before);
      frag.appendChild(before);
    }
    const a = doc.createElement('a');
    a.className = 'sg_autolink';
    a.textContent = text.slice(m.start, m.end);
    a.href = 'https://scripture.guide/' + refToSlug(m.ref || a.textContent);
    a.target = '_blank';
    a.rel = 'noopener';
    frag.appendChild(a);
    links.push(a);
    cursor = m.end;
  }
  if (cursor < text.length) {
    const after = doc.createTextNode(text.slice(cursor));
    processed.add(after);
    frag.appendChild(after);
  }
  parent.replaceChild(frag, textNode);
  return { links };
}

export function removeAllAnnotations(root) {
  for (const a of [...root.querySelectorAll('a.sg_autolink')]) {
    const parent = a.parentNode;
    a.replaceWith(a.ownerDocument.createTextNode(a.textContent));
    parent.normalize();
  }
}
```

**Step 4:** PASS. **Step 5:** Commit: `feat: text-node splitting annotation — no innerHTML`

### Task 12: `content/scheduler.js` — idle-time queue

**Files:** Create `src/content/scheduler.js`, `test/unit/scheduler.test.js`

**Step 1: Failing tests** (jsdom has no `requestIdleCallback` — the fallback path is what's tested; use jest fake timers):

```javascript
import { createQueue } from '../../src/content/scheduler.js';

describe('createQueue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('drains asynchronously in chunks, front-pushed items first', () => {
    const seen = [];
    const q = createQueue(x => seen.push(x));
    q.push([1, 2, 3]);
    q.pushFront([0]);
    expect(seen).toEqual([]);          // nothing synchronous
    jest.runAllTimers();
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  test('hard node budget stops processing', () => {
    const seen = [];
    const q = createQueue(x => seen.push(x), { maxNodes: 2 });
    q.push([1, 2, 3, 4]);
    jest.runAllTimers();
    expect(seen).toEqual([1, 2]);
    q.push([5]);
    jest.runAllTimers();
    expect(seen).toEqual([1, 2]);      // stopped stays stopped
  });

  test('stop() clears the queue', () => {
    const seen = [];
    const q = createQueue(x => seen.push(x));
    q.push([1, 2]);
    q.stop();
    jest.runAllTimers();
    expect(seen).toEqual([]);
  });
});
```

**Step 2:** FAIL. **Step 3:**

```javascript
export function createQueue(processFn, { chunkBudgetMs = 8, maxNodes = 50000 } = {}) {
  const queue = [];
  let scheduled = false, processedCount = 0, stopped = false;

  const scheduleTick = typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 1000 })
    : (cb) => setTimeout(() => cb(null), 0);

  function pump(deadline) {
    scheduled = false;
    const start = Date.now();
    while (queue.length && !stopped) {
      const outOfTime = deadline && typeof deadline.timeRemaining === 'function'
        ? deadline.timeRemaining() < 2
        : (Date.now() - start) > chunkBudgetMs;
      if (outOfTime) break;
      processFn(queue.shift());
      if (++processedCount >= maxNodes) {
        stopped = true;
        queue.length = 0;
        console.info('[Scripture Guide] scan budget reached; stopping');
        return;
      }
    }
    if (queue.length && !stopped) schedule();
  }
  function schedule() { if (!scheduled) { scheduled = true; scheduleTick(pump); } }

  return {
    push(items) { if (!stopped) { queue.push(...items); schedule(); } },
    pushFront(items) { if (!stopped) { queue.unshift(...items); schedule(); } },
    stop() { stopped = true; queue.length = 0; },
    get size() { return queue.length; }
  };
}
```

Note for the budget test: with fake timers `Date.now()` doesn't advance, so the whole queue drains in one pump — the `maxNodes` check still fires mid-pump, which is exactly what the test asserts.

**Step 4:** PASS. **Step 5:** Commit: `feat: idle-scheduled processing queue with hard budget`

### Task 13: `content/observer.js` — dynamic content

**Files:** Create `src/content/observer.js`, `test/unit/observer.test.js`

**Step 1: Failing tests** (jsdom supports MutationObserver; use real timers + small debounce):

```javascript
import { createObserver } from '../../src/content/observer.js';

const flush = (ms) => new Promise(r => setTimeout(r, ms));

describe('createObserver', () => {
  test('reports text nodes of newly added elements, debounced and accumulated', async () => {
    document.body.innerHTML = '';
    const batches = [];
    const obs = createObserver(document.body, nodes => batches.push(nodes), { debounceMs: 20 });
    const p1 = document.createElement('p'); p1.textContent = 'John 3:16';
    document.body.appendChild(p1);
    await flush(5);                                   // within debounce window
    const p2 = document.createElement('p'); p2.textContent = 'Alma 32:21';
    document.body.appendChild(p2);
    await flush(50);
    expect(batches).toHaveLength(1);                  // one debounced batch
    expect(batches[0].map(n => n.nodeValue).sort()).toEqual(['Alma 32:21', 'John 3:16']);
    obs.disconnect();
  });

  test('ignores our own sg_autolink insertions', async () => {
    document.body.innerHTML = '<p></p>';
    const batches = [];
    const obs = createObserver(document.body, nodes => batches.push(nodes), { debounceMs: 20 });
    const a = document.createElement('a');
    a.className = 'sg_autolink'; a.textContent = 'John 3:16';
    document.querySelector('p').appendChild(a);
    await flush(50);
    expect(batches).toHaveLength(0);
    obs.disconnect();
  });

  test('characterData change re-reports the node', async () => {
    document.body.innerHTML = '<p>plain text 123456</p>';
    const tn = document.querySelector('p').firstChild;
    const batches = [];
    const obs = createObserver(document.body, nodes => batches.push(nodes), { debounceMs: 20 });
    tn.nodeValue = 'now reads John 3:16';
    await flush(50);
    expect(batches[0]).toContain(tn);
    obs.disconnect();
  });
});
```

**Step 2:** FAIL. **Step 3:**

```javascript
export function createObserver(target, onTextNodes, { debounceMs = 250 } = {}) {
  let pending = new Set();
  let timer = null;
  const doc = target.ownerDocument;

  const collectFrom = (el) => {
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) pending.add(t);
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        pending.add(m.target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) pending.add(node);
        else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList && node.classList.contains('sg_autolink')) continue;
          collectFrom(node);
        }
      }
    }
    if (pending.size) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = [...pending];
        pending = new Set();
        onTextNodes(batch);
      }, debounceMs);
    }
  });

  observer.observe(target, { childList: true, subtree: true, characterData: true });
  return { disconnect() { clearTimeout(timer); observer.disconnect(); } };
}
```

The feedback loop is broken by *candidacy*, not by pausing: our inserted `<a>` elements fail `collectCandidates`' skip-selector, and our inserted text segments are in the `processed` WeakSet (index.js re-checks `isCandidate` on every observer-reported node). For `characterData` mutations, index.js will `processed.delete(node)` before the check, since changed text deserves a rescan.

**Step 4:** PASS. **Step 5:** Commit: `feat: debounced accumulating mutation observer`

### Task 14: `content/index.js` + `content.css` — orchestration

**Files:** Create `src/content/index.js`, `src/content/content.css`. No unit test (thin glue over tested modules); verified by build + Task 17 smoke.

**Step 1: `content.css`** — all selectors scoped under `.sg_autolink` and keyed off a root attribute (no page-wide styling):

```css
:root[data-sg-style="badge"] a.sg_autolink,
:root[data-sg-style="badge"] a.sg_autolink:visited {
  font-family: 'Kreon', Georgia, serif;
  color: #000 !important;
  text-decoration: none !important;
  border: 1px dotted #552B1B !important;
  border-radius: 4px;
  padding: 0 .4em;
  background-color: #f2e5d9 !important;
}
:root[data-sg-style="badge"] a.sg_autolink:hover {
  border-bottom-style: solid !important;
  color: #552B1B !important;
}
:root[data-sg-style="subtle"] a.sg_autolink,
:root[data-sg-style="subtle"] a.sg_autolink:visited {
  color: inherit !important;
  text-decoration: none !important;
  border-bottom: 1px dotted #552B1B !important;
}
:root[data-sg-style="subtle"] a.sg_autolink:hover { border-bottom-style: solid !important; }
/* 'plain' style: no rules — links inherit page styling */
```

**Step 2: `src/content/index.js`:**

```javascript
import { findReferences, setLanguage, setCanon } from 'scripture-guide';
import { mergeSettings, siteEnabled } from '../shared/settings.js';
import { collectCandidates, isCandidate } from './detect.js';
import { annotateTextNode, removeAllAnnotations } from './annotate.js';
import { createQueue } from './scheduler.js';
import { createObserver } from './observer.js';

(async function main() {
  if (window.__sgActive) return;   // idempotence guard
  window.__sgActive = true;

  let settings = mergeSettings(await chrome.storage.sync.get());
  if (!siteEnabled(location.hostname, settings)) return;

  setLanguage(settings.language);
  setCanon(settings.canon);
  document.documentElement.dataset.sgStyle = settings.appearance.linkStyle;
  if (settings.appearance.useKreonFont) injectFont();

  const processed = new WeakSet();

  const detectOptions = () => ({
    contextAware: settings.detection.contextAware,
    enableImpliedBooks: settings.detection.impliedBooks,
    abbreviations: settings.detection.abbreviations,
    chapterOnly: settings.detection.chapterOnly,
    wholeBooks: settings.detection.wholeBooks,
    language: settings.language
  });

  const queue = createQueue((node) => {
    if (!node.isConnected || processed.has(node)) return;
    processed.add(node);
    let matches;
    try { matches = findReferences(node.nodeValue, detectOptions()); }
    catch (e) { return; }
    if (matches && matches.length) annotateTextNode(node, matches, processed);
  });

  // Initial scan: viewport first
  const candidates = collectCandidates(document.body, processed);
  const inView = [], rest = [];
  for (const n of candidates) {
    const r = n.parentElement.getBoundingClientRect();
    (r.bottom > 0 && r.top < innerHeight ? inView : rest).push(n);
  }
  queue.push(rest);
  queue.pushFront(inView);

  // Dynamic content
  const observer = createObserver(document.body, (nodes) => {
    const fresh = [];
    for (const n of nodes) {
      processed.delete(n);                       // changed/new text deserves a rescan
      if (isCandidate(n, processed)) fresh.push(n);
    }
    if (fresh.length) queue.push(fresh);
  });

  // Click behavior (delegated; one listener total)
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.sg_autolink');
    if (!a || settings.click.action !== 'popup') return;
    e.preventDefault();
    openCenteredPopup(a.href, settings.click.popupWidth, settings.click.popupHeight);
  }, true);

  // Live settings
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get().then((stored) => {
      settings = mergeSettings(stored);
      document.documentElement.dataset.sgStyle = settings.appearance.linkStyle;
      if (!siteEnabled(location.hostname, settings)) {
        queue.stop();
        observer.disconnect();
        removeAllAnnotations(document);
        window.__sgActive = false;
      }
    });
  });
})();

function injectFont() {
  const url = chrome.runtime.getURL('fonts/kreon-latin.woff2');
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: 'Kreon'; src: url('${url}') format('woff2'); font-weight: 300 700; font-display: swap; }`;
  document.head.appendChild(style);
}

function openCenteredPopup(url, width, height) {
  const left = (screen.width - width) / 2 + (window.screenLeft || 0);
  const top = (screen.height - height) / 2 + (window.screenTop || 0);
  window.open(url, 'ScriptureGuide',
    `scrollbars=yes,width=${width},height=${height},top=${Math.max(0, top)},left=${Math.max(0, left)}`);
}
```

(Font must be injected via JS because relative `url()` in content-script CSS resolves against the *page*, not the extension.)

**Step 3:** `npx webpack` → clean build. Open `test/reddit-test.html` and `test/hebrews-test.html` via `dist` loaded unpacked (see Task 17 checklist) — references linked, styles applied.
**Step 4:** Commit: `feat: content orchestration — viewport-first scan, live settings, popup clicks`

### Task 15: `background/index.js`

**Files:** Create `src/background/index.js`; delete stub.

**Step 1:** Implement (no unit test — pure chrome-API glue; verified in smoke):

```javascript
import { lookupReference } from 'scripture-guide';
import { refToSlug } from '../shared/slug.js';

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lookup-selection',
    title: 'Look up "%s" in Scripture Guide',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'lookup-selection' && info.selectionText) {
    chrome.tabs.create({ url: 'https://scripture.guide/' + refToSlug(info.selectionText) });
  }
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  try {
    const { ref, verse_ids } = lookupReference(text);
    if (verse_ids && verse_ids.length) {
      suggest([{ content: text, description: `Open <match>${escapeXml(ref)}</match> on scripture.guide` }]);
    }
  } catch (e) { /* partial input; no suggestion */ }
});

chrome.omnibox.onInputEntered.addListener((text) => {
  chrome.tabs.create({ url: 'https://scripture.guide/' + refToSlug(text) });
});
```

Note: `chrome.action.onClicked` is gone — the action now opens `popup.html` (set in manifest). "Highlight References" context menu is gone (always-on covers it).

**Step 2:** Build; in `chrome://extensions` reload, confirm no service-worker errors, no duplicate-menu errors on browser restart, omnibox `sg john 3.16` suggests "John 3:16".
**Step 3:** Commit: `feat: background worker — real omnibox suggestions, onInstalled menus`

### Task 16: Popup + Options pages

**Files:** Create `src/popup/popup.{html,css,js}`, `src/options/options.{html,css,js}`, `test/unit/options-logic.test.js`

**Step 1:** Popup — current-site toggle, global toggle, random verse, gear:

`popup.html`:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="popup.css"></head>
<body>
  <header><img src="icons/icon_32.png" alt=""><h1>Scripture Guide</h1>
    <button id="gear" title="Settings">⚙</button></header>
  <label class="row"><span id="site-label">Enable on this site</span>
    <input type="checkbox" id="site-toggle" class="switch"></label>
  <label class="row"><span>Enable everywhere</span>
    <input type="checkbox" id="global-toggle" class="switch"></label>
  <a class="row link" href="https://scripture.guide/random" target="_blank">Random verse ↗</a>
  <script src="popup.js"></script>
</body></html>
```

`popup.js`:
```javascript
import { mergeSettings, siteEnabled, hostMatches } from '../shared/settings.js';

async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { return new URL(tab.url).hostname; } catch (e) { return null; }
}

function setSiteEnabled(settings, host, enable) {
  const strip = (list) => list.filter(p => !hostMatches(host, p));
  if (settings.siteMode === 'whitelist') {
    settings.whitelist = enable ? [...strip(settings.whitelist), host] : strip(settings.whitelist);
  } else {
    settings.blacklist = enable ? strip(settings.blacklist) : [...strip(settings.blacklist), host];
  }
  return settings;
}

(async function init() {
  const host = await currentHost();
  let settings = mergeSettings(await chrome.storage.sync.get());
  const siteToggle = document.getElementById('site-toggle');
  const globalToggle = document.getElementById('global-toggle');
  globalToggle.checked = settings.enabled;
  if (host) {
    document.getElementById('site-label').textContent = `Enable on ${host}`;
    siteToggle.checked = siteEnabled(host, settings);
  } else siteToggle.disabled = true;

  siteToggle.addEventListener('change', async () => {
    settings = setSiteEnabled(settings, host, siteToggle.checked);
    await chrome.storage.sync.set({ blacklist: settings.blacklist, whitelist: settings.whitelist });
  });
  globalToggle.addEventListener('change', () =>
    chrome.storage.sync.set({ enabled: globalToggle.checked }));
  document.getElementById('gear').addEventListener('click', () => chrome.runtime.openOptionsPage());
})();
```

Export `setSiteEnabled` and unit-test it (needs `popup.html` to load `popup.js` as the webpack bundle — the CopyPlugin copies the html; the bundle name is `popup.js`, matching).

Popup requires `"tabs"`-less URL access: `chrome.tabs.query` returns `url` for the active tab only with a permission. **Add `"activeTab"` back to manifest permissions** for this (it grants the popup access to the current tab's URL without broad host prompts).

**Step 2:** Options page — native `chrome://settings` feel. Single card column, system font, dark mode. Panels and controls exactly as the design doc §Configuration: Sites (mode radio + hostname list editors), Scripture (canon + language selects), Detection (5 toggles), Appearance (link style radio, font toggle), Behavior (click action radio, popup size inputs).

`options.js` pattern — one generic binder, no framework:

```javascript
import { mergeSettings } from '../shared/settings.js';

const $ = (id) => document.getElementById(id);

// path helpers: getPath(settings, 'detection.contextAware'), setPath(...)
export function getPath(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
  return obj;
}
export function parseHostList(textareaValue) {
  return [...new Set(textareaValue.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean))];
}

async function save(mutate) {
  const settings = mutate(mergeSettings(await chrome.storage.sync.get()));
  await chrome.storage.sync.set(settings);
}

(async function init() {
  const settings = mergeSettings(await chrome.storage.sync.get());
  // checkboxes: data-path="detection.contextAware" etc.
  for (const el of document.querySelectorAll('[data-path]')) {
    const path = el.dataset.path;
    const val = getPath(settings, path);
    if (el.type === 'checkbox') el.checked = val;
    else if (el.type === 'radio') el.checked = el.value === String(val);
    else if (el.tagName === 'TEXTAREA') el.value = (val || []).join('\n');
    else el.value = val;
    el.addEventListener('change', () => save(s => {
      const v = el.type === 'checkbox' ? el.checked
        : el.type === 'number' ? Number(el.value)
        : el.tagName === 'TEXTAREA' ? parseHostList(el.value)
        : el.value;
      return setPath(s, path, v);
    }));
  }
})();
```

Unit-test `getPath`/`setPath`/`parseHostList` in `test/unit/options-logic.test.js` (write tests first). Options HTML: every control carries `data-path` matching the settings schema; canon select options: lds/bible/rlds/hindu/buddhist/islam; language select: the 12 codes from the Utils README.

`options.css` core (complete the rest in the same vocabulary):
```css
:root { color-scheme: light dark;
  --bg: #fff; --card: #fff; --text: #202124; --muted: #5f6368;
  --border: #dadce0; --accent: #1a73e8; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #202124; --card: #292a2d; --text: #e8eaed; --muted: #9aa0a6; --border: #3c4043; --accent: #8ab4f8; } }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text);
  max-width: 680px; margin: 0 auto; padding: 24px 16px; font-size: 14px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 16px; overflow: hidden; }
.card h2 { font-size: 15px; font-weight: 500; padding: 14px 20px; margin: 0;
  border-bottom: 1px solid var(--border); }
.row { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; gap: 16px; }
.row + .row { border-top: 1px solid var(--border); }
.row .hint { color: var(--muted); font-size: 12px; }
```

**Step 3:** Tests pass, build clean, both pages render sanely in light/dark.
**Step 4:** Commit: `feat: popup and native-feel options page`

### Task 17: Release build + smoke test

**Step 1:** Update `deploy.sh` to `npx webpack --mode=production && (cd dist && zip -r ../scripture-guide-extension.zip .)`.
**Step 2:** Full test suite: `npx jest` → all green.
**Step 3:** Manual smoke checklist (load `dist/` unpacked at `chrome://extensions`) — report results per item, don't claim success without doing them:
- [ ] `test/reddit-test.html`, `test/hebrews-test.html`, `test/missing-refs.html`, `test/comprehensive-test.html`: references linked, page text otherwise byte-identical.
- [ ] A React app (e.g. any Next.js site): links appear, page still interactive, zero console errors.
- [ ] A very large page (e.g. a long Wikipedia article): page scrolls instantly during scan; scan completes; CPU settles to zero after (no periodic wake-ups — old code polled forever).
- [ ] An infinite-scroll page: new content gets linked as it loads.
- [ ] Console: zero Scripture Guide log lines in normal operation.
- [ ] Popup site toggle: links disappear live; re-enable requires reload (acceptable) or re-run — verify behavior matches Task 14 wiring.
- [ ] Options: change canon to `bible`, verify "1 Nephi 3:7" no longer links after reload; change link style to subtle; blacklist a site.
- [ ] Omnibox: `sg alma 32.21` suggests and opens. Context menu lookup works.
- [ ] Existing biblehub/biblegateway links on a page are NOT removed (regression vs. old destructive behavior).

**Step 4:** Commit: `chore: release build + deploy script`

### Task 18: Cut over to published parser + finish

**Step 1:** After Phase 1 Task 6 publishes 1.0.89: `npm uninstall scripture-guide && npm install scripture-guide@^1.0.89`; rebuild; re-run jest; spot-check one smoke page.
**Step 2:** Update extension `README.md` (features, settings, dev setup, build).
**Step 3:** Commit, then use superpowers:finishing-a-development-branch to merge `rewrite/v3` → master. Tag `v3.0.0`. Chrome Web Store upload is a user action — hand them the zip path.
