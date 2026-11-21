import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { execFileSync, execFile } from 'child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicStatic } from '../../src/app/middleware/static.js';

// scripture.guide/SKILL.md: agents are pointed at this URL to learn the API and set up /scripture.
describe('/SKILL.md', () => {
  const app = express().use(publicStatic());
  const get = () => request(app).get('/SKILL.md').set('User-Agent', 'agent');

  test('is served as Markdown', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
  });

  test('starts with skill frontmatter named scripture', async () => {
    const { text } = await get();
    const front = text.match(/^---\n([\s\S]*?)\n---\n/);
    expect(front).not.toBeNull();
    expect(front[1]).toMatch(/^name: scripture$/m);
    expect(front[1]).toMatch(/^description: .{40,}$/m);
  });

  test('defines the key protocol', async () => {
    const { text } = await get();
    expect(text).toContain('SCRIPTURE_GUIDE_API_KEY');
    expect(text).toContain('Authorization: Bearer');
  });

  test('uses "version", not "translation", for the API terms', async () => {
    const { text } = await get();
    expect(text).not.toMatch(/unknown_translation|"translations"|\/translations\b/);
  });

  test('the reference CLI is valid Python', async () => {
    const { text } = await get();
    const code = text.match(/<!-- reference-cli -->\n```python\n([\s\S]*?)\n```/);
    expect(code).not.toBeNull();
    execFileSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: code[1] });
  });

  test('documents rate limits: rate_limited, the RateLimit headers, keys raising the limit', async () => {
    const { text } = await get();
    expect(text).toMatch(/^\| `rate_limited` \| 429 \| .*Retry-After/m);
    expect(text).toContain('RateLimit-Policy');
    expect(text).toMatch(/`RateLimit`/);
    expect(text).toMatch(/only on answers that are not cached/i);
    expect(text).toMatch(/key[^.]*raises?[^.]*limit/i);
  });

  describe('the reference CLI on a 429', () => {
    async function run(answers) {
      const { text } = await get();
      const code = text.match(/<!-- reference-cli -->\n```python\n([\s\S]*?)\n```/)[1];
      const file = path.join(mkdtempSync(path.join(tmpdir(), 'skill-cli-')), 'scripture');
      writeFileSync(file, code);
      const seen = [];
      const stub = express().get('*', (req, res) => {
        seen.push(Date.now());
        const [status, retryAfter] = answers[Math.min(seen.length - 1, answers.length - 1)];
        if (status === 429) {
          return res.status(429).set('Retry-After', retryAfter).json({ api: 'v1', error: { code: 'rate_limited', message: 'Too many requests. Slow down, or use an API key.' } });
        }
        res.json({ api: 'v1', versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }] });
      });
      const server = await new Promise(resolve => { const s = stub.listen(0, '127.0.0.1', () => resolve(s)); });
      try {
        const result = await new Promise(resolve => {
          execFile('python3', [file, 'versions'], { env: { ...process.env, SCRIPTURE_GUIDE_BASE: `http://127.0.0.1:${server.address().port}` } },
            (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
        });
        return { ...result, seen };
      } finally {
        server.close();
      }
    }

    test('waits Retry-After and retries once', async () => {
      const r = await run([[429, '1'], [200]]);
      expect(r.code).toBe(0);
      expect(r.seen).toHaveLength(2);
      expect(r.seen[1] - r.seen[0]).toBeGreaterThanOrEqual(900);
      expect(r.stdout).toMatch(/^NRSV/);
    });

    test('a second 429 exits 1 with the message', async () => {
      const r = await run([[429, '0'], [429, '0']]);
      expect(r.code).toBe(1);
      expect(r.seen).toHaveLength(2);
      expect(r.stderr).toBe('scripture: Too many requests. Slow down, or use an API key.\n');
    });
  });
});
