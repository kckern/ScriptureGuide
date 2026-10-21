import { describe, test, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../../src/app/routes/index.js';
import scriptureController from '../../src/app/controllers/ScriptureController.js';

const app = express().use(router);

// The route params each path reaches the controller with
async function paramsFor(path) {
  let seen;
  const spy = vi.spyOn(scriptureController, 'show').mockImplementation(async (req, res) => {
    seen = { ...req.params };
    res.end();
  });
  await request(app).get(path);
  spy.mockRestore();
  return seen;
}

describe('version-prefixed route', () => {
  afterEach(() => vi.restoreAllMocks());
  test('the version is the first segment only', async () => {
    expect(await paramsFor('/kjv/john.3.16')).toMatchObject({ version: 'kjv', reference: 'john.3.16' });
    expect(await paramsFor('/latest/meta-data/iam')).toMatchObject({ version: 'latest', reference: 'meta-data/iam' });
    expect(await paramsFor('/site/wp-json/')).toMatchObject({ version: 'site', reference: 'wp-json/' });
    expect(await paramsFor('/kjv/a/b~c')).toMatchObject({ version: 'kjv', reference: 'a/b~c' });
  });
});
