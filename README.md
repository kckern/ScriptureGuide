# Scripture Guide — Chrome Extension

Detects scripture references on any web page and links them to
[scripture.guide](https://scripture.guide). Version 3 is a ground-up rewrite of
the original content script.

## What it does

- Scans page text and turns references like `John 3:16`, `1 Ne 3:7`,
  `Alma 32:21-23`, and grouped citations (`Isa 45:22; Morm 3:18`) into links.
- Context-aware: resolves implied references such as `(v. 16)` following a
  nearby `John 3`.
- Clicking a link opens the passage on scripture.guide (popup window by
  default, or a new tab).
- Omnibox: type `sg ` in the address bar, then a reference, to jump straight to
  scripture.guide.
- Right-click selected text → "Look up in Scripture Guide".

## Configuration

Open the popup (toolbar icon) for quick per-site and global on/off toggles, or
the gear → **Settings** for the full options page:

- **Sites** — run everywhere except a blocklist, or only on an allowlist
  (hostnames support `*.example.com` wildcards).
- **Scripture** — canon (LDS, Protestant Bible, RLDS, Hindu, Buddhist, Islamic)
  and language (English, Korean).
- **Detection** — toggle context-aware refs, implied books, abbreviations,
  chapter-only refs, and (experimental) whole-book mentions.
- **Appearance** — link style (badge / subtle underline / plain) and the
  bundled Kreon font.
- **Behavior** — click opens a popup window or a new tab, with configurable
  popup size.

Settings sync across your Chrome profiles and take effect without reloading.

## How it works

The content script is DOM-safe: it finds candidate text nodes with a
`TreeWalker` (skipping editable fields, code, existing links, etc.), runs the
[`scripture-guide`](https://github.com/kckern/ScriptureGuideUtils) parser's
`findReferences()` on the plain text, and splits each text node into a
`DocumentFragment`, inserting `<a>` elements around the matched spans. It never
touches `innerHTML`, so page event listeners, framework state, and special
characters are preserved. Work is scheduled with `requestIdleCallback` (with a
hard node budget), and a debounced `MutationObserver` handles dynamic content.

## Architecture

```
src/
  content/    detect · annotate · scheduler · observer · index (orchestration) · content.css
  background/ omnibox + context menu service worker
  popup/      per-site / global toggles
  options/    native-feel settings page
  shared/     settings schema · slug builder · path/site-toggle helpers
```

## Develop

```bash
npm install       # installs deps; scripture-guide is dev-linked during development
npm test          # jest + jsdom unit and integration tests
npm run build     # webpack -> dist/
npm run deploy    # test + build + package dist/ into scripture-guide-extension.zip
```

Load `dist/` unpacked at `chrome://extensions` (Developer mode) to test, or
upload the zip to the Chrome Web Store.

## License

MIT
