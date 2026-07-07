// Content script orchestration: read settings, scan the page (viewport first),
// annotate detected references, watch for dynamic content, and react to live
// settings changes. All heavy lifting lives in the tested modules below.

import { findReferences, setLanguage, setCanon } from 'scripture-guide';
import { mergeSettings, siteEnabled } from '../shared/settings.js';
import { collectCandidates, isCandidate } from './detect.js';
import { annotateTextNode, removeAllAnnotations } from './annotate.js';
import { createQueue } from './scheduler.js';
import { createObserver } from './observer.js';

(async function main() {
  if (window.__sgActive) return; // guard against double-injection
  window.__sgActive = true;

  let settings = mergeSettings(await chrome.storage.sync.get());
  if (!siteEnabled(location.hostname, settings)) {
    window.__sgActive = false;
    return;
  }

  applyParserConfig(settings);
  document.documentElement.dataset.sgStyle = settings.appearance.linkStyle;
  if (settings.appearance.useKreonFont) injectKreonFont();

  const processed = new WeakSet();

  const detectOptions = () => ({
    language: settings.language,
    contextAware: settings.detection.contextAware,
    enableImpliedBooks: settings.detection.impliedBooks,
    abbreviations: settings.detection.abbreviations,
    chapterOnly: settings.detection.chapterOnly,
    wholeBooks: settings.detection.wholeBooks
  });

  const processNode = (node) => {
    if (!node.isConnected || processed.has(node)) return;
    processed.add(node);
    let matches;
    try {
      matches = findReferences(node.nodeValue, detectOptions());
    } catch (e) {
      return;
    }
    if (matches && matches.length) annotateTextNode(node, matches, processed);
  };

  const queue = createQueue(processNode);

  // Initial scan: process visible nodes first for perceived speed.
  const candidates = collectCandidates(document.body, processed);
  const inView = [];
  const rest = [];
  for (const n of candidates) {
    const el = n.parentElement;
    const r = el && el.getBoundingClientRect();
    if (r && r.bottom > 0 && r.top < window.innerHeight) inView.push(n);
    else rest.push(n);
  }
  queue.push(rest);
  queue.pushFront(inView);

  // Dynamic content: re-scan changed/added text nodes.
  const observer = createObserver(document.body, (nodes) => {
    const fresh = [];
    for (const n of nodes) {
      processed.delete(n); // changed/new text deserves a fresh look
      if (isCandidate(n, processed)) fresh.push(n);
    }
    queue.push(fresh);
  });

  // One delegated click handler for popup-mode navigation.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.sg_autolink');
    if (!a || settings.click.action !== 'popup') return;
    e.preventDefault();
    openCenteredPopup(a.href, settings.click.popupWidth, settings.click.popupHeight);
  }, true);

  // React to settings changes without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get().then((stored) => {
      settings = mergeSettings(stored);
      document.documentElement.dataset.sgStyle = settings.appearance.linkStyle;
      applyParserConfig(settings);
      if (!siteEnabled(location.hostname, settings)) {
        queue.stop();
        observer.disconnect();
        removeAllAnnotations(document);
        window.__sgActive = false;
      }
    });
  });
})();

function applyParserConfig(settings) {
  try {
    setLanguage(settings.language);
    setCanon(settings.canon);
  } catch (e) { /* parser defaults are fine if this throws */ }
}

function injectKreonFont() {
  try {
    const url = chrome.runtime.getURL('fonts/kreon-latin.woff2');
    const style = document.createElement('style');
    style.id = 'sg-kreon-font';
    // Relative url() in content-script CSS resolves against the page, so the
    // @font-face must be injected with the extension-resolved absolute URL.
    style.textContent =
      "@font-face{font-family:'Kreon';src:url('" + url + "') format('woff2');" +
      'font-weight:300 700;font-display:swap;}';
    (document.head || document.documentElement).appendChild(style);
  } catch (e) { /* font is cosmetic; ignore failures */ }
}

function openCenteredPopup(url, width, height) {
  const w = width || 1000;
  const h = height || 750;
  const dualLeft = window.screenLeft !== undefined ? window.screenLeft : 0;
  const dualTop = window.screenTop !== undefined ? window.screenTop : 0;
  const left = Math.max(0, (screen.width - w) / 2 + dualLeft);
  const top = Math.max(0, (screen.height - h) / 2 + dualTop);
  window.open(url, 'ScriptureGuide',
    'scrollbars=yes,width=' + w + ',height=' + h + ',top=' + top + ',left=' + left);
}
