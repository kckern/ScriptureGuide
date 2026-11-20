import { readFileSync } from 'node:fs';

// What is running: /build-info reports all of it, /healthz the web version and commit.
// CI bakes SG_COMMIT, SG_BUILD_NUMBER, SG_RUN_ID and SG_BUILT_AT into the image (release.yml,
// apps/web/Dockerfile); the deploy sets SG_IMAGE_DIGEST. Unset or empty means a local run.

const REPO = 'https://github.com/kckern/ScriptureGuide';
const IMAGE = 'ghcr.io/kckern/scripture-guide';

// Paths resolve the same in the repo and in the image (/repo/apps/web/src/app/).
const versionOf = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).version;
const VERSIONS = Object.freeze({
  web: versionOf('../../package.json'),
  'scripture-guide': versionOf('../../../../packages/scripture-guide/package.json'),
  'chrome-extension': versionOf('../../../chrome-extension/package.json'),
});
export const WEB_VERSION = VERSIONS.web;

const STARTED_AT = new Date().toISOString();

const env = name => process.env[name] || null;

export const commit = () => env('SG_COMMIT') || 'dev';

export function buildInfo() {
  const sha = env('SG_COMMIT');
  const build = Number.parseInt(env('SG_BUILD_NUMBER'), 10);
  const runId = env('SG_RUN_ID');
  const digest = env('SG_IMAGE_DIGEST');
  return {
    commit: commit(),
    // The Dockerfile's default SG_COMMIT is 'dev', which has no commit page.
    commitUrl: /^[0-9a-f]{7,40}$/.test(sha ?? '') ? `${REPO}/commit/${sha}` : null,
    build: Number.isFinite(build) ? build : null,
    runUrl: runId ? `${REPO}/actions/runs/${runId}` : null,
    builtAt: env('SG_BUILT_AT'),
    image: /^sha256:[0-9a-f]{64}$/.test(digest ?? '') ? `${IMAGE}@${digest}` : null,
    versions: { ...VERSIONS },
    node: process.version,
    startedAt: STARTED_AT,
  };
}
