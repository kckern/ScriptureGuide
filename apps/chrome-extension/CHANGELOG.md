# scripture-guide-chrome-extension

## 2.1.0

### Minor Changes

- 5377bbb: Pages no longer freeze while references are detected. Text is parsed in chunks of at most 2 KB in the background service worker, with a fallback to the page thread. A page that is still too heavy switches to simpler detection, then pauses, with a "‖" badge and a Resume button in the popup, and the site starts lighter on later visits for a week. Text far down the page is parsed as it nears the screen, and text that keeps changing is re-parsed at most every 3 seconds. The `sg` address-bar keyword now searches scripture.guide when the text is not a reference, and Enter opens in the current tab (Alt+Enter for a new one).

### Patch Changes

- c3f9263: Rebuild on scripture-guide 1.0.98, picking up the 1.0.94-1.0.98 detection fixes (fewer prose false positives, implied chapter:verse binding).
- 06aabc2: Build scripture.guide links with `toSlug` from scripture-guide instead of a local copy.
- Updated dependencies [06aabc2]
- Updated dependencies [0dad274]
- Updated dependencies [39be84c]
- Updated dependencies [0dc442a]
- Updated dependencies [21a4fa3]
  - scripture-guide@1.1.0
