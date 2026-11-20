import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import router from '../../src/app/routes/index.js';
import scriptureController from '../../src/app/controllers/ScriptureController.js';
import { buildInfo } from '../../src/app/buildInfo.js';

const app = express().use(router);
const KEYS = ['SG_COMMIT', 'SG_BUILD_NUMBER', 'SG_RUN_ID', 'SG_BUILT_AT', 'SG_IMAGE_DIGEST'];
const SHA = '0123456789abcdef0123456789abcdef01234567';
const DIGEST = `sha256:${'a1'.repeat(32)}`;
const version = path => JSON.parse(readFileSync(new URL(`../../../../${path}/package.json`, import.meta.url), 'utf8')).version;

let saved;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('buildInfo', () => {
  it('reports everything CI and the deploy set', () => {
    Object.assign(process.env, {
      SG_COMMIT: SHA, SG_BUILD_NUMBER: '128', SG_RUN_ID: '987654321',
      SG_BUILT_AT: '2026-11-20T18:04:11Z', SG_IMAGE_DIGEST: DIGEST,
    });
    expect(buildInfo()).toMatchObject({
      commit: SHA,
      commitUrl: `https://github.com/kckern/ScriptureGuide/commit/${SHA}`,
      build: 128,
      runUrl: 'https://github.com/kckern/ScriptureGuide/actions/runs/987654321',
      builtAt: '2026-11-20T18:04:11Z',
      image: `ghcr.io/kckern/scripture-guide@${DIGEST}`,
      imageUrl: 'https://github.com/kckern/ScriptureGuide/pkgs/container/scripture-guide',
      node: process.version,
    });
  });

  it('falls back to dev and nulls when nothing is set', () => {
    const info = buildInfo();
    expect(info).toMatchObject({ commit: 'dev', commitUrl: null, build: null, runUrl: null, builtAt: null, image: null });
    expect(new Date(info.startedAt).toISOString()).toBe(info.startedAt);
  });

  it('links no commit page for the Dockerfile default', () => {
    process.env.SG_COMMIT = 'dev';
    expect(buildInfo()).toMatchObject({ commit: 'dev', commitUrl: null });
  });

  it('treats empty build args as unset', () => {
    Object.assign(process.env, { SG_BUILD_NUMBER: '', SG_RUN_ID: '', SG_BUILT_AT: '' });
    expect(buildInfo()).toMatchObject({ build: null, runUrl: null, builtAt: null });
  });

  it.each(['sha256:abc', `sha512:${'a1'.repeat(32)}`, `${DIGEST}0`, `sha256:${'G1'.repeat(32)}`, 'latest'])(
    'ignores the digest %s', digest => {
      process.env.SG_IMAGE_DIGEST = digest;
      expect(buildInfo().image).toBeNull();
    });

  it('reports the versions in the three package.json files', () => {
    expect(buildInfo().versions).toEqual({
      web: version('apps/web'),
      'scripture-guide': version('packages/scripture-guide'),
      'chrome-extension': version('apps/chrome-extension'),
    });
  });
});

describe('GET /build-info', () => {
  it('serves JSON that no cache keeps', async () => {
    process.env.SG_COMMIT = SHA;
    process.env.SG_BUILD_NUMBER = '7';
    const res = await request(app).get('/build-info');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ commit: SHA, build: 7, image: null });
  });

  it('is not looked up as a scripture reference', async () => {
    const show = vi.spyOn(scriptureController, 'show').mockImplementation(async (req, res) => res.status(299).end());
    const res = await request(app).get('/build-info');
    expect(show).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
