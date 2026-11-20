---
name: ship-npm
description: Use when publishing the scripture-guide npm package, or when the npm job in release.yml fails or is skipped.
---

# Ship the npm package

A push that contains a changeset for `scripture-guide` publishes it to npm with trusted publishing (GitHub OIDC, no token). The website and extension get a patch bump too, because they depend on it, so the extension is uploaded and submitted to the Chrome Web Store as well (see ship-extension).

## Setup
The repo variable `NPM_PUBLISH` is `true` (since 2026-11-20). Publishing also needs the Trusted Publisher on npmjs.com (scripture-guide → Settings → Trusted Publisher → GitHub Actions: org `kckern`, repo `ScriptureGuide`, workflow `release.yml`, environment blank). Only KC can change it. To publish the version already committed in `packages/scripture-guide/package.json` without a new changeset: `gh workflow run release.yml -f npm=true`, then `npm view scripture-guide version`.

## Release
1. Write `.changeset/<slug>.md`:
   ---
   "scripture-guide": patch
   ---
   What changed, for someone who installs the package.
   Patch for fixes, minor for new exports or options. Ask KC before a major.
2. Commit and push to master. Watch the `npm` job in release.yml.
3. `npm view scripture-guide version` shows the new version, and the npm page shows a provenance badge. `git pull`.

## If the npm job fails
- E403 "OIDC permission denied for this action": the Trusted Publisher entry exists but a field doesn't match (repo `ScriptureGuide`, workflow filename `release.yml`, environment empty). Only KC can fix it.
- E404 on PUT: npmjs.com doesn't trust the workflow. The Trusted Publisher entry above is missing or wrong. Only KC can fix it.
- Job skipped: `NPM_PUBLISH` isn't `true` (`gh variable list`), or the push had no `scripture-guide` changeset.
- To publish a version that's already committed (after a failed publish, for example): `gh workflow run release.yml -f npm=true`. It also redeploys the website from master.
