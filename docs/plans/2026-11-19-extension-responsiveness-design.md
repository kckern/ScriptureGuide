# Chrome extension: no page freezes, and `sg` search

Date: 2026-11-19. Status: approved design, not yet implemented.

## Goal

The extension must never freeze a page. On a page too heavy to scan fully, it scans part of it or stops, and says so. Separately, the `sg` address-bar keyword should search scripture.guide as well as open references.

Freezes seen so far are whole-tab hangs on long pages. No specific site is known, so the test set covers conference talks, scripture citation sites and general long reads.

## Phase 1: fix the parser's slow paths (packages/scripture-guide)

Measured with the extension's default options. Fixes 1-4 together, prototyped on a scratch copy, took a 100 KB article from 4,774 ms to 32 ms and a 50 KB footnote list from 3,756 ms to 798 ms. All package tests passed and output was unchanged on every benchmark input.

1. **Exponential regex in book prefixes** (`src/scriptdetect.mjs:28`, used at 45-55). `(First|I|1|...|II|...)*\s*(books* of)*\s*` backtracks exponentially on runs of "i" (28 letters take 10.5 s) and polynomially on long runs of spaces or digits. Replace it with `(?:(?:First|Second|Third|Fourth|1st|2nd|3rd|4th|III|II|IV|I|[1-4])\s*)?(?:books? of\s*)?`. Check the other languages' `lang_extra.book` prefixes for the same shape.
2. **Failed lookups retry all 11 languages and rebuild the verse index each time** (`src/scriptures.mjs:200`, `loadRefIndex` at `:757`). Key the index cache by config in a `Map`, and have detection's `lookup` (`:942`) pass `noMulti: true`, so a failed match costs one lookup, not eleven.
3. **The same candidate is looked up about three times** (`scriptdetect.mjs:154`, `scriptdetectcontext.mjs:34`, `:118`, `:260`, `:290`). Add a per-call memo around `lookup`.
4. **Quadratic scans in `findMatches`.**
   - `scriptdetect.mjs:93-97` builds a regex per position and scans the rest of the text: use one sticky regex per pattern with `lastIndex`.
   - `:118-125` rescans the full text per match before deduping: dedupe first.
   - `:111-112` and `removeOverlaps` (`scriptlib.mjs:23`) are O(m²): sort once and sweep.

Detection bugs found along the way, fixed in the same phase:

- `gapCanMerge` (`scriptlib.mjs:186`) allows "." in the gap, so "John 3:16. Mosiah 2:17" becomes one link. Stop merging across a sentence end, and cap a merged span's length.
- "at" is a context binding word (`scriptdetectcontext.mjs:219`), so "met at 4:15 pm" near "Alma" links Alma 4:15. Don't bind clock times.

Every fix gets a regression test, and every pathological input becomes a timing test with a generous ceiling (for example, under 50 ms for a 61-character "iii..." string).

## Phase 2: layered scanning in the extension (apps/chrome-extension)

The page thread never runs more than one small parser call at a time. Each layer works on its own.

### Components

Page side (content script):
- **Collector**: walks the DOM as today and returns text nodes, visible ones first.
- **Chunker**: splits a node's text at sentence ends into pieces of at most ~2 KB and records each piece's offset. A node over ~200 KB is skipped.
- **Dispatcher**: batches chunks into messages of up to ~16 KB for the background worker, with the page's options (language, canon, flags). One request is in flight per tab.
- **Applier**: drops a result whose node is detached or whose text changed, and re-queues that node. Otherwise it adds the chunk offset back and calls the existing `annotateTextNode`.

Background (service worker):
- **Parse handler**: runs `findReferences` per chunk, with one parser setup per language and canon. Returns matches and the time each chunk took.

Background parsing is the default. If a batch gets no reply within 2 s or errors, it is parsed on the page thread instead, one chunk per idle slice. After 3 worker failures in a row, the page stops using the worker for that visit.

### Degradation states

Per page, one way during a visit:

| State | Behavior | Moves on when |
|---|---|---|
| Normal | Background parsing, full detection | Worker fails 3 times in a row |
| Local | Page-thread parsing, one chunk per idle slice | Page-thread parsing passes ~200 ms in any 1 s window |
| Lite | Local, with context-aware matching off | Still over budget, or page-thread parsing passes ~2 s in total |
| Paused | Scanning stops; existing links stay | Reader clicks Resume or "Scan page" (resumes in Lite) |

- The existing 50,000-node cap stays.
- **Paused**: the icon badge shows "‖", and the popup says "Paused on this page to keep it responsive" with a Resume button.
- **Lite**: the popup notes "Simplified detection on this page."
- **Memory**: a host that ends a visit in Paused starts in Lite for 7 days, and one that pauses again in Lite starts in Paused. This is stored in `chrome.storage.local`.
- **Logging**: each state change writes one console line, such as `[Scripture Guide] lite: 240 ms in 1 s`.

The thresholds are first guesses, to be tuned against the test pages.

### Mutation handling

- `content/index.js:101` removes every observed node from `processed`, including the text pieces `annotate.js` just created. That parses each annotated node's leftovers a second time. Only re-parse nodes that had a `characterData` change or are new.
- Text that keeps changing (tickers, streaming chat) is re-parsed whole every 250 ms. Re-parse a node at most once per few seconds, and only its changed chunks.

## `sg` address-bar search (background/index.js)

The manifest already registers `sg`, and typing a reference opens the passage. Changes:

- Input that `lookupReference` resolves (one reference or several) opens the passage.
- Any other input opens scripture.guide's full-text search: `https://scripture.guide/search/<encoded words>`.
- Suggestions while typing show the matching action: "Open 2 Nephi 2:25", or "Search scripture.guide for 'faith hope charity'".
- Enter follows Chrome's `disposition`: the current tab by default, a new tab with Alt+Enter.

## Testing

- **Parser:** unit tests for each fix, plus timing tests for every pathological input above.
- **Extension:** jsdom tests for the chunker's offset mapping, the applier's stale-result check, and the state machine's transitions, using fake timers and a fake worker that can be slow or fail.
- **Fixtures:** a saved set of real pages (a conference talk, a dense citation page, a long Wikipedia article, a page with a huge `<pre>` or table). A headless Chrome run with the built extension asserts no long task over 200 ms and records links found against today's build.
- **Omnibox:** unit tests for reference versus search routing and `disposition` handling.

## Release

- Phase 1 ships to scripture.guide through the normal master push, since the site uses the same package. It also bumps the npm package.
- The extension ships through the "Version packages" PR (#15). The release job publishes to the Chrome Web Store as the service account `cws-publisher@book-of-mormon-online.iam.gserviceaccount.com`, signing in with GitHub's OIDC token (no stored key). It needs that account added in the Developer Dashboard and the repo variable `CWS_PUBLISHER_ID`.
- The store currently has 2.0.0 (July 2025), which predates all of this.
