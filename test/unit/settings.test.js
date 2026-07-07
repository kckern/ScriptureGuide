import { DEFAULTS, mergeSettings, siteEnabled, hostMatches } from '../../src/shared/settings.js';

describe('mergeSettings', () => {
  test('returns defaults when given nothing', () => {
    expect(mergeSettings()).toEqual(DEFAULTS);
    expect(mergeSettings({})).toEqual(DEFAULTS);
  });
  test('deep-merges nested objects without dropping sibling keys', () => {
    const s = mergeSettings({ detection: { contextAware: false } });
    expect(s.detection.contextAware).toBe(false);
    expect(s.detection.impliedBooks).toBe(true);
    expect(s.appearance.linkStyle).toBe('badge');
  });
  test('overrides top-level scalars and arrays wholesale', () => {
    const s = mergeSettings({ enabled: false, blacklist: ['a.com'] });
    expect(s.enabled).toBe(false);
    expect(s.blacklist).toEqual(['a.com']);
  });
  test('does not mutate DEFAULTS', () => {
    const before = JSON.stringify(DEFAULTS);
    mergeSettings({ detection: { contextAware: false }, blacklist: ['x'] });
    expect(JSON.stringify(DEFAULTS)).toBe(before);
  });
});

describe('hostMatches', () => {
  test('exact hostname', () => {
    expect(hostMatches('reddit.com', 'reddit.com')).toBe(true);
    expect(hostMatches('reddit.com', 'example.com')).toBe(false);
  });
  test('wildcard matches base and subdomains only', () => {
    expect(hostMatches('reddit.com', '*.reddit.com')).toBe(true);
    expect(hostMatches('old.reddit.com', '*.reddit.com')).toBe(true);
    expect(hostMatches('notreddit.com', '*.reddit.com')).toBe(false);
    expect(hostMatches('reddit.com.evil.com', '*.reddit.com')).toBe(false);
  });
});

describe('siteEnabled', () => {
  test('global kill switch wins', () => {
    expect(siteEnabled('example.com', mergeSettings({ enabled: false }))).toBe(false);
  });
  test('blacklist mode: seeded defaults are off, others on', () => {
    expect(siteEnabled('scripture.guide', mergeSettings({}))).toBe(false);
    expect(siteEnabled('news.ycombinator.com', mergeSettings({}))).toBe(true);
  });
  test('blacklist wildcard entry blocks subdomains', () => {
    expect(siteEnabled('mail.google.com', mergeSettings({}))).toBe(false);
  });
  test('whitelist mode: only listed hosts enabled', () => {
    const wl = mergeSettings({ siteMode: 'whitelist', whitelist: ['example.com', '*.reddit.com'] });
    expect(siteEnabled('example.com', wl)).toBe(true);
    expect(siteEnabled('old.reddit.com', wl)).toBe(true);
    expect(siteEnabled('other.com', wl)).toBe(false);
  });
});
