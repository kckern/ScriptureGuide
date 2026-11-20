---
"scripture-guide-chrome-extension": minor
---

Pages no longer freeze while references are detected. Text is parsed in chunks of at most 2 KB in the background service worker, with a fallback to the page thread. A page that is still too heavy switches to simpler detection, then pauses, with a "‖" badge and a Resume button in the popup, and the site starts lighter on later visits for a week. Text far down the page is parsed as it nears the screen, and text that keeps changing is re-parsed at most every 3 seconds. The `sg` address-bar keyword now searches scripture.guide when the text is not a reference, and Enter opens in the current tab (Alt+Enter for a new one).
