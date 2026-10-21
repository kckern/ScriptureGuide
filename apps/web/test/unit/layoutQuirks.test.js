import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';

const VIEWS = fileURLToPath(new URL('../../src/presentation/views', import.meta.url));

// Live sends no doctype and its CSS depends on quirks mode; see the comment in layouts/main.ejs.
test('the layout sends no doctype, so browsers use quirks mode as on live', async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', VIEWS);
  app.get('/page', (req, res) => res.render('layouts/main', { body: '<div id="container"></div>', config: {} }));
  const res = await request(app).get('/page');
  expect(res.status).toBe(200);
  expect(res.text).not.toMatch(/<!doctype/i);
  expect(res.text.trimStart()).toMatch(/^<html/);
});
