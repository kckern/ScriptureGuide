---
name: ship-web
description: Use when shipping, deploying, checking or rolling back scripture.guide (the website / Docker image) - "push to prod", "is it live", "deploy", "roll back", "prod still shows the old version".
---

# Ship the website

Every push to master deploys. There is no staging step and no manual approval.

## Ship
1. Commit on master and `git push origin master`.
2. `gh run watch $(gh run list --workflow release.yml -L 1 --json databaseId --jq '.[0].databaseId') --exit-status`
3. About 2 minutes after `web-image` finishes, run `curl -s https://scripture.guide/build-info | jq`. `commit` must equal the pushed sha, `build` is the release.yml run number and `image` is the deployed digest. Report the commit, build and image to KC.

A push that carries a changeset (`.changeset/*.md`) gets a follow-up `chore: release …` commit from github-actions[bot]. That release commit is what gets built, so it is the commit `/build-info` shows. `git pull` afterwards.

## If it isn't live
- `test` failed: nothing shipped. Fix the test and push again.
- Run green but `/build-info` shows an older commit: the deploy on bom refused it or rolled it back. `ssh bom 'journalctl -u sg-deploy -n 50 --no-pager'`. A signature failure means the image wasn't built by release.yml on master. "Unhealthy" means the container failed `/health`; the log shows the container's last 60 lines.
- ssh times out: bom's security group lacks the current IP. See memory `bom-ops-access`.
- Old fonts or CSS after a deploy: check the NPM proxy host 1 asset cache is still off.

## Roll back
`gh workflow run rollback.yml -f sha=<good commit>`. It points `:edge` at that commit's signed image (any commit release.yml built on master), and within about a minute `/build-info` shows that commit and digest. The next push to master deploys over it, so fix forward and push. To put master back without a new commit: `gh workflow run release.yml --ref master` (about 3 minutes).
