# Scripture Guide Chrome Extension — Rewrite Design

**Date:** 2026-07-06
**Status:** Approved
**Decision summary:** Clean rewrite. On by default with per-site controls. Popup-window click behavior (as today). Position-based detection API added to `scripture-guide` (ScriptureGuideUtils).

## Background: audit findings (July 2026)

The repo was migrated to Manifest V3 in July 2025, but that work sat uncommitted for a
year and the bundled parser is ~80 patch releases behind `scripture-guide`. The content
script (`linker.js`) is the core problem:

1. Rewrites `parentEl.innerHTML` to inject links — destroys event listeners, breaks
   React/Vue/hydrated pages. Its `innerHTML.replace(originalText, …)` fails on
   HTML-escaped text, falling back to running detection over raw HTML, which can match
   inside attributes and corrupt markup.
2. A `setInterval` walks the entire DOM every 2 seconds forever, plus a
   MutationObserver (`characterData: true`, whole body) retriggered by its own
   mutations — the source of page hangs.
3. Throughput: batches of 3 text nodes per 10 ms tick (~30 s+ for a 10k-node page).
4. Destructively unwraps existing `<a>` links to bible sites into plain text.
5. `DEBUG_MODE = true` hardcoded — console spam on every page.
6. Forced Kreon font + badge styling injected everywhere; no off switch; no config
   surface at all (language hardcoded `'en'`, no canon selection).
7. `background.js`: placeholder omnibox suggestions; context menus created at service
   worker top level (duplicate-ID errors on every SW wake).
8. No automated tests; `dist/` committed to git.

Nothing in `linker.js` is worth salvaging. Icons, branding, manifest skeleton, and the
omnibox concept are kept.

## Architecture

```
src/
  content/
    detect.js        # walks DOM, finds text nodes, calls findReferences()
    annotate.js      # splits text nodes, inserts <a> elements (no innerHTML, ever)
    observer.js      # debounced MutationObserver for dynamic content
    style.css        # injected via manifest css:, scoped to .sg_autolink
    index.js         # entry: reads settings, orchestrates
  background/
    index.js         # service worker: omnibox, context menus (onInstalled)
  popup/             # toolbar popup: site toggle + global toggle + gear
  options/           # native-feeling settings page
  shared/
    settings.js      # chrome.storage.sync schema + defaults
manifest.json
webpack.config.js    # 4 entries: content, background, popup, options
test/                # jest + jsdom; existing test/*.html pages become fixtures
```

**Architectural rules:**

- The parser runs on plain text only. `findReferences(textNode.nodeValue)` returns
  `[{ref, verse_ids, start, end}]`; `annotate.js` splits the text node at those offsets
  and inserts real `<a class="sg_autolink">` elements via `replaceChild` with a
  DocumentFragment. Never touch `innerHTML`.
- No page mutation outside detected references. Skip-lists mean *don't process*, never
  *modify*. The link-unwrapping behavior is removed entirely.
- CSS ships via the manifest `css:` field, scoped to `.sg_autolink`; font via
  `web_accessible_resources`. No JS style/font injection dance.

## Scanning engine

**Initial scan.** One `TreeWalker` over `document.body` rejecting text nodes inside
`script`, `style`, `noscript`, `textarea`, `code`, `pre`, `[contenteditable]`,
existing `a`, and `.sg_autolink`. Pre-filter before parsing: skip nodes shorter than
~6 chars or containing no digit (every real reference contains a digit).

**Scheduling.** Queue drained with `requestIdleCallback` (process until
`timeRemaining() < 2ms`, then yield), fallback `setTimeout(0)` chunks capped ~10 ms.
Viewport-visible nodes first (one `getBoundingClientRect` partition). Hard budget
(~50k nodes / 5 s cumulative) with a single log line on pathological pages.
**No `setInterval`.**

**Processed-state tracking:** `WeakSet` of text nodes — no attributes on the page, GC
handles removed nodes.

**Dynamic content.** One `MutationObserver` (`childList` + `characterData`, subtree):

- ignores self-mutations (WeakSet + "is annotating" flag),
- debounces 250 ms and accumulates nodes across callbacks (the old code dropped
  earlier batches on debounce),
- feeds the same idle-scheduled queue.

## Configuration

**Options page styled like Chrome's native settings** (`chrome://settings` look):
Material-ish toggles/dropdowns, system font stack, dark mode via
`prefers-color-scheme`. Vanilla HTML/CSS/JS. Opened via popup gear or right-click →
Options.

**Panels:**

1. **Sites** — mode radio: *Run on all sites except…* (blacklist) / *Only run on…*
   (whitelist); editable hostname lists with wildcard support (`*.reddit.com`). The
   popup's per-site toggle writes into the active list.
2. **Scripture settings** — Canon dropdown (LDS / Protestant Bible / RLDS / Hindu /
   Buddhist / Islamic); Language dropdown (12 languages).
3. **Detection** — toggles: context-aware refs ("v. 16"), implied books, abbreviations
   (`Mt 5:3`), chapter-only (`Genesis 2`), whole-book mentions (`Genesis`).
4. **Appearance** — link style (badge / subtle underline / plain), Kreon font on/off.
5. **Behavior** — click action (popup window / new tab), popup window size.

**Schema** (`chrome.storage.sync`):

```js
{ enabled, siteMode: 'blacklist'|'whitelist', blacklist: [], whitelist: [],
  canon, language,
  detection: { contextAware, impliedBooks, abbreviations, chapterOnly, wholeBooks },
  appearance: { linkStyle, useKreonFont },
  click: { action: 'popup'|'tab', popupWidth, popupHeight } }
```

Settings sync across profiles; content script reacts live to `storage.onChanged`
(site toggle adds/removes annotations without reload).

## Utils prerequisite (scripture-guide 1.0.89)

In ScriptureGuideUtils:

- New `findReferences(text, options)` export returning
  `[{ref, verse_ids, start, end}]`. The detection internals already compute offsets —
  this is exposure, not new logic.
- New detection option flags: `abbreviations`, `chapterOnly`, `wholeBooks`
  (default `true`, matching current behavior), alongside existing `contextAware` /
  `enableImpliedBooks`.
- Jest tests for both; npm publish.

## Build, background, permissions

- Webpack 5, 4 entries; `scripture-guide@^1.0.89`; `dist/` gitignored; `deploy.sh`
  produces the CWS zip; extension version **3.0.0**.
- Context menus created in `chrome.runtime.onInstalled`.
- Omnibox: run `lookupReference` in the service worker; suggestions show the
  normalized reference as you type.
- Permissions: `storage` + `contextMenus` + host permissions for the content script.
  Drop `scripting` and `activeTab` ("Highlight References" menu is redundant with
  always-on; "Lookup selection" stays).

## Testing

- jest + jsdom unit tests for detect/annotate/observer using existing `test/*.html`
  pages as fixtures (reddit-test, hebrews-test, missed-refs are good regression cases).
- Manual smoke checklist before release: Reddit, Gmail, a React SPA, a very large
  static page.

## Phases

1. **Housekeeping** — commit the year-old dirty tree as a checkpoint, tag
   `v2.0.0-legacy`, gitignore `dist/`.
2. **Utils 1.0.89** — `findReferences` + option flags, publish.
3. **Core rewrite** — content script + manifest + background. Shippable with defaults.
4. **Config UI** — popup + options page + storage wiring.
5. **Release** — tests green, package, CWS submission.
