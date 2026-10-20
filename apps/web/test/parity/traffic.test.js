import { describe, test, expect } from 'vitest';
import { parseLine, classify, formatOf, isProbe, shapeOf, sample } from './traffic.mjs';

const line = '[20/Oct/2026:22:41:07 +0000] BYPASS 200 200 - GET http api.scripture.guide "/kjv/john.3.16" [Client 203.0.113.9] [Length 2711] [Gzip -] [Sent-to php] "Mozilla/5.0" "-"';
const withStatus = (columns, path = '/kjv/john.3.16', host = 'scripture.guide') =>
  `[20/Oct/2026:22:41:07 +0000] ${columns} - GET http ${host} "${path}" [Client 203.0.113.9] [Length 2711] [Gzip -] [Sent-to php] "Mozilla/5.0" "-"`;

describe('traffic corpus', () => {
  test('parses method, status, host and path', () => {
    expect(parseLine(line)).toEqual({ method: 'GET', status: 200, host: 'api.scripture.guide', path: '/kjv/john.3.16' });
  });
  test('ignores static files and non-GET', () => {
    expect(parseLine(line.replace('/kjv/john.3.16', '/js/main.js'))).toBeNull();
    expect(parseLine(line.replace(' GET ', ' POST '))).toBeNull();
  });
  test('shape abstracts references so similar requests group together', () => {
    expect(shapeOf('/kjv/john.3.16')).toBe(shapeOf('/niv/gen.1.1'));
    expect(shapeOf('/john.3.16-18')).not.toBe(shapeOf('/john.3.16'));
  });
  test('shape collapses runs of percent-escapes', () => {
    expect(shapeOf('/John%203%3A16')).toBe('/a%9%9');
    expect(shapeOf('/John%203%3A16')).toBe(shapeOf('/Exodus%2020%3A1'));
  });
  test('sample keeps at most n per (format, shape), deterministically', () => {
    const reqs = Array.from({ length: 50 }, (_, i) => ({ format: 'html', path: `/gen.1.${i + 1}` }));
    expect(sample(reqs, 3)).toHaveLength(3);
    expect(sample(reqs, 3)).toEqual(sample(reqs, 3));
  });
  test('sample with maxGroups keeps the groups requested by the most clients', () => {
    const reqs = [
      ...Array.from({ length: 5 }, () => ({ format: 'meta', path: '/ps.23', client: 'a' })),
      { format: 'html', path: '/john.3.16', client: 'a' },
      { format: 'html', path: '/john.3.16', client: 'b' },
    ];
    expect(sample(reqs, 1, 1)).toEqual([{ format: 'html', path: '/john.3.16' }]);
  });
  test('sample picks the paths requested by the most clients, then hits, then path order', () => {
    const reqs = [
      { format: 'html', path: '/gen.1.1', client: 'a' },
      { format: 'html', path: '/gen.1.9', client: 'a' }, { format: 'html', path: '/gen.1.9', client: 'b' },
      { format: 'html', path: '/gen.1.5', client: 'c' }, { format: 'html', path: '/gen.1.5', client: 'c' },
    ];
    expect(sample(reqs, 2).map(r => r.path)).toEqual(['/gen.1.9', '/gen.1.5']);
  });
  test('probes share one shape per format, at most 2 samples', () => {
    const reqs = ['/wp-login.php', '/.env', '/cgi-bin/x', '/wordpress/?p=1'].map(path => ({ format: 'html', path }));
    expect(sample(reqs, 3)).toHaveLength(2);
    expect(sample([...reqs, { format: 'meta', path: '/.git/HEAD' }], 3)).toHaveLength(3);
  });
});

describe('status column (client $status, the number before " - METHOD")', () => {
  test.each([
    ['BYPASS 200 200', 200],
    ['HIT - 200', 200],
    ['- 200 200', 200],
    ['BYPASS 502, 200 200', 200],
  ])('%s is kept', (columns, status) => {
    expect(classify(withStatus(columns)).req?.status).toBe(status);
  });
  test.each([
    ['BYPASS 200 499', 'status 499'],
    ['BYPASS 200 206', 'status 206'],
    ['BYPASS 404 404', 'status 404'],
    ['- - 301', 'proxy 301'],
    ['- - 499', 'status 499'],
  ])('%s is skipped as %s', (columns, reason) => {
    expect(classify(withStatus(columns)).skip).toBe(reason);
  });
  test('captures the client for ranking but parseLine leaves it out', () => {
    expect(classify(line).client).toBe('203.0.113.9');
    expect(parseLine(line)).not.toHaveProperty('client');
  });
});

describe('classify and formatOf', () => {
  test.each([
    ['other host', 'example.com', '/john.3.16', 'other host'],
    ['host flags', 'api.plain.scripture.guide', '/john.3.16', 'host flags'],
    ['www with a format', 'www.plain.scripture.guide', '/john.3.16', 'host flags'],
    ['unknown subdomain', 'wordpress.scripture.guide', '/john.3.16', 'unknown subdomain'],
    ['session ajax', 'scripture.guide', '/settings', 'session ajax'],
    ['cover subdomain', 'cover.scripture.guide', '/john.3.16', 'format cover'],
    ['mp3 shortcut', 'scripture.guide', '/mp3/john.3.16', 'format audio'],
  ])('%s → skip "%s"', (_, host, path, reason) => {
    const c = classify(withStatus('BYPASS 200 200', path, host));
    expect(c.skip ?? formatOf(c.req).skip).toBe(reason);
  });
  test.each([
    ['scripture.guide', '/john.3.16', 'html'],
    ['www.scripture.guide', '/john.3.16', 'html'],
    ['meta.scripture.guide', '/john.3.16', 'meta'],
    ['json.scripture.guide', '/john.3.16', 'api'],
    ['scripture.guide', '/passage?ref=John%203:16', 'passage'],
    ['scripture.guide', '/versionselect?ref=x', 'versionselect'],
    ['scripture.guide', '/vbox?verse_id=1', 'vbox'],
  ])('%s%s → format %s', (host, path, format) => {
    expect(formatOf(classify(withStatus('BYPASS 200 200', path, host)).req)).toEqual({ format });
  });
  test.each([
    '/wp-login.php', '/.env', '/.git/HEAD', '/.well-known/caldav', '/cgi-bin/luci', '/wordpress/?p=1',
    '/phpmyadmin/', '/vendor/phpunit/x', '/admin.asp', '/a.jsp', '/backup.sql', '/config.yml', '/x.bak', '/php.ini', '//ab.php',
  ])('%s is a probe', path => {
    expect(isProbe(path)).toBe(true);
  });
  test.each(['/robots.txt', '/sitemap.xml', '/llms.txt', '/john.3.16', '/kjv/john.3.16', '/d&c.4', '/search/faith', '/1830/moro.10', '/'])('%s is not a probe', path => {
    expect(isProbe(path)).toBe(false);
  });
});
