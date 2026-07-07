// Content script orchestration: read settings, scan the page (viewport first),
// annotate detected references, watch for dynamic content, and react to live
// settings changes. All heavy lifting lives in the tested modules below.

import { findReferences, setLanguage, setCanon } from 'scripture-guide';
import { mergeSettings, siteEnabled } from '../shared/settings.js';
import { collectCandidates, isCandidate } from './detect.js';
import { annotateTextNode, removeAllAnnotations } from './annotate.js';
import { collectAnchorGroups, annotateAnchor, removeAllReflinks, MARK } from './footnotes.js';
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

  // A run of back-to-back reference anchors ("D&C 28:7; D&C 64:5") gets one 🔗
  // after the last anchor, linking to all of them together.
  const processGroup = (group) => {
    const anchors = group.filter((a) => a.isConnected && !a.hasAttribute(MARK));
    if (!anchors.length) return;
    const combined = [];
    for (const anchor of anchors) {
      let matches = null;
      try { matches = findReferences(anchor.textContent, detectOptions()); } catch (e) { /* skip */ }
      anchor.setAttribute(MARK, 'true');
      if (matches && matches.length) combined.push(...matches);
    }
    if (combined.length) annotateAnchor(anchors[anchors.length - 1], combined);
  };

  const queue = createQueue((item) => {
    if (Array.isArray(item)) processGroup(item); // anchor run
    else processNode(item);                      // text node
  });

  // Scan the whole page progressively via the idle scheduler (visible content
  // first for perceived speed; no waiting on scroll). The idle queue yields
  // between slices so it never janks the page. Reusable so the context-menu
  // "Scan page" and dynamic content can re-run it; the `processed` WeakSet and
  // MARK attribute make it skip anything already handled.
  const scan = () => {
    const candidates = collectCandidates(document.body, processed);
    const inView = [];
    const rest = [];
    for (const n of candidates) {
      const el = n.parentElement;
      const r = el && el.getBoundingClientRect();
      (r && r.bottom > 0 && r.top < window.innerHeight ? inView : rest).push(n);
    }
    queue.push(rest);
    queue.pushFront(inView);
    if (settings.appearance.footnoteLinks) queue.push(collectAnchorGroups(document.body));
  };
  scan();

  // Manual re-scan trigger (context menu) for lazy / infinite-scroll content.
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'sg-rescan') scan();
    });
  }

  // Dynamic content: re-scan changed/added text nodes.
  const observer = createObserver(document.body, (nodes) => {
    const fresh = [];
    for (const n of nodes) {
      processed.delete(n); // changed/new text deserves a fresh look
      if (isCandidate(n, processed)) fresh.push(n);
    }
    queue.push(fresh);
    if (settings.appearance.footnoteLinks) {
      // Newly added subtrees may contain reference anchors too. Dedupe hosts
      // (a mutation can report many text nodes under one parent) and resolve
      // the enclosing <a> when the added node IS inside an anchor.
      const hosts = new Set();
      for (const n of nodes) {
        const host = (n.parentElement && n.parentElement.closest('a')) || n.parentElement;
        if (host) hosts.add(host);
      }
      const groups = [];
      for (const host of hosts) for (const g of collectAnchorGroups(host)) groups.push(g);
      if (groups.length) queue.push(groups);
    }
  });

  // One delegated click handler: popup-mode for our own links (badges + 🔗).
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.sg_autolink, a.sg_reflink');
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
        removeAllReflinks(document);
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
