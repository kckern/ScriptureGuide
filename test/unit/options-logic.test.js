import { getPath, setPath, parseHostList } from '../../src/shared/paths.js';
import { setSiteEnabled } from '../../src/shared/site-toggle.js';
import { mergeSettings, siteEnabled } from '../../src/shared/settings.js';

describe('paths', () => {
  test('getPath reads nested values', () => {
    const s = mergeSettings({});
    expect(getPath(s, 'detection.contextAware')).toBe(true);
    expect(getPath(s, 'click.popupWidth')).toBe(1000);
    expect(getPath(s, 'nope.missing')).toBeUndefined();
  });
  test('setPath writes nested values and creates missing objects', () => {
    const o = {};
    setPath(o, 'detection.abbreviations', false);
    expect(o.detection.abbreviations).toBe(false);
  });
  test('parseHostList trims, lowercases, dedupes, drops blanks', () => {
    expect(parseHostList('  Reddit.com \n\nreddit.com\nEXAMPLE.com\n'))
      .toEqual(['reddit.com', 'example.com']);
  });
});

describe('setSiteEnabled', () => {
  test('blacklist mode: disabling adds host, enabling removes it', () => {
    let s = mergeSettings({ blacklist: [] });
    let next = setSiteEnabled(s, 'example.com', false);
    expect(next.blacklist).toContain('example.com');
    s = mergeSettings({ blacklist: ['example.com'] });
    next = setSiteEnabled(s, 'example.com', true);
    expect(next.blacklist).not.toContain('example.com');
  });
  test('enabling a host strips a matching wildcard entry', () => {
    const s = mergeSettings({ blacklist: ['*.google.com'] });
    const next = setSiteEnabled(s, 'mail.google.com', true);
    expect(next.blacklist).not.toContain('*.google.com');
    expect(siteEnabled('mail.google.com', mergeSettings({ blacklist: next.blacklist }))).toBe(true);
  });
  test('whitelist mode: enabling adds host, disabling removes it', () => {
    let s = mergeSettings({ siteMode: 'whitelist', whitelist: [] });
    let next = setSiteEnabled(s, 'example.com', true);
    expect(next.whitelist).toContain('example.com');
    s = mergeSettings({ siteMode: 'whitelist', whitelist: ['example.com'] });
    next = setSiteEnabled(s, 'example.com', false);
    expect(next.whitelist).not.toContain('example.com');
  });
});


describe('nested-change persistence semantics', () => {
  test('writing the whole top-level key preserves sibling nested settings', () => {
    // chrome.storage.sync.set replaces top-level values wholesale, so a change
    // to one detection flag must persist the ENTIRE detection object.
    const settings = mergeSettings({});
    setPath(settings, 'detection.contextAware', false);
    const topKey = 'detection.contextAware'.split('.')[0];
    const patch = { [topKey]: settings[topKey] };
    expect(patch.detection.contextAware).toBe(false);
    expect(patch.detection.abbreviations).toBe(true);
    expect(patch.detection.impliedBooks).toBe(true);
    // round-trips through mergeSettings without losing siblings
    const reread = mergeSettings(patch);
    expect(reread.detection.contextAware).toBe(false);
    expect(reread.detection.abbreviations).toBe(true);
  });
});
