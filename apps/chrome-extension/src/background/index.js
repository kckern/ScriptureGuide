// Background service worker: omnibox lookups, a selection context menu, and the
// toolbar action (which opens the popup, configured in the manifest).

import { toSlug } from 'scripture-guide';
import { omniboxTarget, openTarget, SG_BASE } from '../shared/omnibox.js';
import { parseChunks } from './parse.js';

// Context menu must be (re)created on install/update, not at top level — the
// service worker re-runs on every wake and would otherwise throw duplicate-id.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lookup-selection',
    title: 'Look up "%s" in Scripture Guide',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'scan-references',
    title: 'Scan page for scripture references',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lookup-selection' && info.selectionText) {
    chrome.tabs.create({ url: SG_BASE + toSlug(info.selectionText) });
  } else if (info.menuItemId === 'scan-references' && tab && tab.id != null) {
    // Ask the content script to re-scan (catches lazy/infinite-scroll content).
    chrome.tabs.sendMessage(tab.id, { type: 'sg-rescan' }, () => void chrome.runtime.lastError);
  }
});

// Omnibox ("sg " keyword): a reference opens the passage, anything else searches.
// The default suggestion is what Enter does, so it always describes the action.
const HINT = 'Type a reference, or words to search scripture.guide';
chrome.omnibox.onInputStarted.addListener(() => chrome.omnibox.setDefaultSuggestion({ description: HINT }));
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const target = omniboxTarget(text);
  chrome.omnibox.setDefaultSuggestion({ description: target ? target.description : HINT });
  suggest([]);
});
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const target = omniboxTarget(text);
  if (!target) return;
  openTarget(target.url, disposition, {
    update: (props) => chrome.tabs.update(props),
    create: (props) => chrome.tabs.create(props)
  });
});

// Content scripts send text here to be parsed off the page's main thread, and report their
// scanning state so a paused page shows a badge on the toolbar icon.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'sg-parse') {
    sendResponse(parseChunks(msg));
  } else if (msg.type === 'sg-state' && sender.tab && sender.tab.id != null) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: msg.state === 'paused' ? '‖' : '' });
    if (msg.state === 'paused') chrome.action.setBadgeBackgroundColor({ tabId, color: '#8a6d3b' });
  }
});
