import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';

// robots.txt through the real app. Every query answers with no rows.
vi.mock('../../../src/data/db/connection.js', () => ({ default: { query: async () => [] } }));

const { createApp } = await import('../../../src/app/createApp.js');
const calls = [];
const access = { mode: 'observe', check: async (req, opts) => { calls.push(opts.scope); return { caller: null, tier: null, allowed: true, over: false, refused: false, retryAfter: 0, headers: {} }; } };
const app = createApp({ log: false, access });

// The groups of a robots.txt: [{ agents: [...], rules: [[field, value], ...] }]
function groups(text) {
  const out = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (field.toLowerCase() === 'user-agent') {
      if (!current || current.rules.length) out.push(current = { agents: [], rules: [] });
      current.agents.push(value);
    } else if (current) current.rules.push([field.toLowerCase(), value]);
  }
  return out;
}
const groupFor = (text, agent) => groups(text).find(g => g.agents.includes(agent));

describe('robots.txt', () => {
  test('a plain-text file, not the home page', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'scripture.guide');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).not.toMatch(/<html/i);
  });

  test('content signals: search yes, AI training no', async () => {
    const { text } = await request(app).get('/robots.txt').set('Host', 'scripture.guide');
    expect(text).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=no$/m);
    expect(groupFor(text, '*').rules).toContainEqual(['content-signal', 'search=yes, ai-input=yes, ai-train=no']);
  });

  test('every visitor may crawl; AI training crawlers may not', async () => {
    const { text } = await request(app).get('/robots.txt').set('Host', 'scripture.guide');
    expect(groupFor(text, '*').rules).not.toContainEqual(['disallow', '/']);
    for (const bot of ['GPTBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'meta-externalagent', 'ClaudeBot', 'anthropic-ai']) {
      expect(groupFor(text, bot)?.rules, bot).toContainEqual(['disallow', '/']);
    }
  });

  test('api.scripture.guide answers the same file, and it is not counted', async () => {
    const site = await request(app).get('/robots.txt').set('Host', 'scripture.guide');
    const api = await request(app).get('/robots.txt').set('Host', 'api.scripture.guide');
    expect(api.status).toBe(200);
    expect(api.text).toBe(site.text);
    expect(api.headers['x-api-version']).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
