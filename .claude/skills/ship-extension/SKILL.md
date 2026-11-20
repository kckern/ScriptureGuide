---
name: ship-extension
description: Use when releasing the Scripture Guide Chrome extension to the Chrome Web Store, checking its review status, or when a store submission was rejected.
---

# Ship the Chrome extension

A push that contains a changeset for `scripture-guide-chrome-extension` uploads a new version and submits it for review. Any changeset for the `scripture-guide` package also bumps the extension, so it uploads and submits to the store too. Google's review usually takes hours.

## Before releasing
1. `npm test -w scripture-guide-chrome-extension && npm run build -w scripture-guide-chrome-extension`
2. Try the build on real pages: load `apps/chrome-extension/dist` unpacked and open a long page (a conference talk) and https://www.jw.org/en/jehovahs-witnesses/faq/are-jehovahs-witnesses-christians/. No "Page Unresponsive", and references (including ones that are already links) become badges.

## Release
1. Write `.changeset/<slug>.md`:
   ---
   "scripture-guide-chrome-extension": patch
   ---
   One line a store user would understand.
   Use minor for new features. Ask KC before a major.
2. Commit and push to master. The `version` job commits `chore: release … extension@x.y.z`. The `extension` job runs `scripts/release/cws.sh`: it cancels a submission that is still pending review, uploads, and submits.
3. Check the `extension` job log ends with `"state": "PENDING_REVIEW"`, then `git pull`.

## Status
`gh workflow run store-status.yml`, then read the run summary: `live=X submitted=STATE (ver) takenDown=false`, for example `live=2.1.0 submitted=PENDING_REVIEW (2.1.1) takenDown=false`. `submitted=none` means nothing is waiting since the last publish. It also runs hourly and fails, which emails KC, if Google rejects the submission or takes the item down.

## Rejections
- INVALID_ITEM_METADATA: the listing (privacy tab, permission justifications) is incomplete. KC fixes it in the Developer Dashboard. The privacy policy URL is https://scripture.guide/privacy-policy.
- A new permission in manifest.json needs a justification in the dashboard before submitting. Tell KC first.
- To retry an upload without a new version: `gh workflow run release.yml -f extension=true`. It also redeploys the website from master.
