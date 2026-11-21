import { describe, test, expect } from 'vitest';
import { clientIp } from '../../../src/app/clientIp.js';

const req = (ip, headers = {}) => ({ ip, headers });

describe('clientIp', () => {
  test('CF-Connecting-IP is used when the last untrusted hop is private (tunnel traffic)', () => {
    expect(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(req('172.18.0.4', { 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(req('::ffff:10.0.0.5', { 'cf-connecting-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });
  test('a public hop (CloudFront today, or a direct hit) ignores the header', () => {
    expect(clientIp(req('18.68.1.2', { 'cf-connecting-ip': '203.0.113.9' }))).toBe('18.68.1.2');
  });
  test('a malformed header is ignored', () => {
    expect(clientIp(req('127.0.0.1', { 'cf-connecting-ip': 'nope' }))).toBe('127.0.0.1');
    expect(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' }))).toBe('127.0.0.1');
  });
  test('no header, or no ip', () => {
    expect(clientIp(req('203.0.113.9'))).toBe('203.0.113.9');
    expect(clientIp(req(undefined))).toBeNull();
  });
});
