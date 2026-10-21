import { test, expect, vi, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import routes from '../../src/app/routes/index.js';
import subdomainMiddleware from '../../src/app/middleware/subdomain.js';
import scriptureLookupService from '../../src/services/ScriptureLookupService.js';
import { Verse } from '../../src/domain/entities/Verse.js';
import { Reference } from '../../src/domain/entities/Reference.js';
import { ScriptureResult } from '../../src/domain/entities/ScriptureResult.js';

const VIEWS = fileURLToPath(new URL('../../src/presentation/views', import.meta.url));

// The scripture route as app.js mounts it, with the lookup stubbed (no database).
function app() {
  const a = express();
  a.set('view engine', 'ejs');
  a.set('views', VIEWS);
  a.use(subdomainMiddleware);
  a.use('/', routes);
  return a;
}

afterEach(() => vi.restoreAllMocks());

// Live sends no doctype and its CSS depends on quirks mode (layouts/main.ejs).
test('a scripture page, through the route, starts with <html and has no doctype', async () => {
  vi.spyOn(scriptureLookupService, 'lookup').mockImplementation(async () => new ScriptureResult({
    reference: new Reference({ query: 'John 3:16', normalized: 'John 3:16', verseIds: [26137] }),
    verses: [new Verse({ id: 26137, verseNum: 16, chapter: 3, text: 'For God so loved the world.', version: 'KJV' })],
    headings: [{ verse_id: 26137, type: 'heading', text: '', last_verse_id: 26137, synthetic: true }],
    config: { version: 'KJV', _bookTitle: 'John' },
  }));
  const res = await request(app()).get('/john.3.16').set('Host', 'scripture.guide');
  expect(res.status).toBe(200);
  expect(res.text).toContain('For God so loved the world.');
  expect(res.text).not.toMatch(/<!doctype/i);
  expect(res.text.trimStart()).toMatch(/^<html/);
});
