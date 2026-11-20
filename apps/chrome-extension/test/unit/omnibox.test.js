import { omniboxTarget, openTarget } from '../../src/shared/omnibox.js';

describe('omniboxTarget', () => {
  test('a reference opens the passage', () => {
    const t = omniboxTarget('2 ne 2:25');
    expect(t.url).toBe('https://scripture.guide/2.nephi.2.25');
    expect(t.description).toBe('Open <match>2 Nephi 2:25</match> on scripture.guide');
  });
  test('several references open together', () => {
    const t = omniboxTarget('D&C 88:1-17 Matthew 11:28-30');
    expect(t.description).toContain('Doctrine and Covenants 88:1-17; Matthew 11:28-30');
    expect(t.url.startsWith('https://scripture.guide/')).toBe(true);
    expect(t.url).not.toContain('/search/');
  });
  test('anything else searches scripture.guide', () => {
    const t = omniboxTarget('faith hope charity');
    expect(t.url).toBe('https://scripture.guide/search/faith%20hope%20charity');
    expect(t.description).toBe('Search scripture.guide for <match>faith hope charity</match>');
  });
  test('the description escapes markup', () => {
    expect(omniboxTarget('love & <mercy>').description)
      .toBe('Search scripture.guide for <match>love &amp; &lt;mercy&gt;</match>');
  });
  test('blank input has no target', () => {
    expect(omniboxTarget('   ')).toBeNull();
  });
});

describe('openTarget follows the omnibox disposition', () => {
  const tabs = () => ({ update: jest.fn(), create: jest.fn() });
  test('Enter opens in the current tab', () => {
    const t = tabs();
    openTarget('https://scripture.guide/john.3.16', 'currentTab', t);
    expect(t.update).toHaveBeenCalledWith({ url: 'https://scripture.guide/john.3.16' });
    expect(t.create).not.toHaveBeenCalled();
  });
  test('Alt+Enter opens a new foreground tab', () => {
    const t = tabs();
    openTarget('u', 'newForegroundTab', t);
    expect(t.create).toHaveBeenCalledWith({ url: 'u' });
  });
  test('a background tab stays in the background', () => {
    const t = tabs();
    openTarget('u', 'newBackgroundTab', t);
    expect(t.create).toHaveBeenCalledWith({ url: 'u', active: false });
  });
});
