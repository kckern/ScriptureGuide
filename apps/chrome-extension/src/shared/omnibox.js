// The "sg" address-bar keyword: a reference opens the passage, anything else searches
// scripture.guide. Pure apart from the tabs API passed in, so it is unit-testable.

import { lookupReference, toSlug } from 'scripture-guide';

export const SG_BASE = 'https://scripture.guide/';

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// { url, description } for the typed text, or null when there is nothing to do.
export function omniboxTarget(text) {
  const query = String(text || '').trim();
  if (!query) return null;
  let found = null;
  try { found = lookupReference(query); } catch (e) { /* not a reference */ }
  if (found && found.verse_ids && found.verse_ids.length) {
    return {
      url: SG_BASE + toSlug(found.ref),
      description: 'Open <match>' + escapeXml(found.ref) + '</match> on scripture.guide'
    };
  }
  return {
    url: SG_BASE + 'search/' + encodeURIComponent(query),
    description: 'Search scripture.guide for <match>' + escapeXml(query) + '</match>'
  };
}

// Open a URL the way Chrome asks: Enter replaces the current tab, Alt+Enter opens a new one.
export function openTarget(url, disposition, tabs) {
  if (disposition === 'newForegroundTab') tabs.create({ url });
  else if (disposition === 'newBackgroundTab') tabs.create({ url, active: false });
  else tabs.update({ url });
}
