// Background service worker: omnibox lookups, a selection context menu, and the
// toolbar action (which opens the popup, configured in the manifest).

import { lookupReference } from 'scripture-guide';
import { refToSlug } from '../shared/slug.js';

const SG_BASE = 'https://scripture.guide/';

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Context menu must be (re)created on install/update, not at top level — the
// service worker re-runs on every wake and would otherwise throw duplicate-id.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lookup-selection',
    title: 'Look up "%s" in Scripture Guide',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'lookup-selection' && info.selectionText) {
    chrome.tabs.create({ url: SG_BASE + refToSlug(info.selectionText) });
  }
});

// Omnibox ("sg " keyword): show the normalized reference as a suggestion.
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  try {
    const { ref, verse_ids } = lookupReference(text);
    if (verse_ids && verse_ids.length) {
      suggest([{ content: text, description: 'Open <match>' + escapeXml(ref) + '</match> on scripture.guide' }]);
    }
  } catch (e) {
    /* partial/unrecognized input — no suggestion */
  }
});

chrome.omnibox.onInputEntered.addListener((text) => {
  chrome.tabs.create({ url: SG_BASE + refToSlug(text) });
});
