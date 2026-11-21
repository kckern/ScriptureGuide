import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { execFileSync } from 'child_process';
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
});
