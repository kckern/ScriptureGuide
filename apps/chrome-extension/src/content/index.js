// Content script orchestration: read settings, scan the page (what is on or near the screen
// first, the rest as it scrolls into view), parse text in the background service worker,
// annotate detected references, and watch for dynamic content.
//
// The page must never freeze. Text is parsed in chunks of at most ~2 KB, off the page thread
// by default. A governor (governor.js) falls back to page-thread parsing, then to simpler
// detection, then pauses scanning when a page is too heavy. Sites that had to pause start the
// next visit lighter (hostMemory.js).

import { findReferences, setLanguage, setCanon } from 'scripture-guide';
import { mergeSettings, siteEnabled } from '../shared/settings.js';
import { startState, rememberVisit, STORAGE_KEY } from '../shared/hostMemory.js';
import { collectCandidates, isCandidate } from './detect.js';
import { removeAllAnnotations } from './annotate.js';
import { collectAnchorGroups, annotateAnchor, removeAllReflinks, isWholeReference, takeOverAnchor, MARK } from './footnotes.js';
import { createQueue } from './scheduler.js';
import { createObserver } from './observer.js';
import { chunkText } from './chunker.js';
import { applyResult } from './apply.js';
import { createGovernor } from './governor.js';
import { createDispatcher } from './dispatcher.js';

const MAX_NODE_CHARS = 200000;   // a text node this long is a data dump, not prose: skip it
const CHANGED_TEXT_DELAY_MS = 3000; // text that keeps changing is re-parsed at most this often

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
  if (settings.appearance.useScriptureFont) injectScriptureFont();

  const host = location.hostname;
  const startedIn = startState(await readHostState(host), Date.now());
  const reportState = () => {
    try {
      chrome.runtime.sendMessage({ type: 'sg-state', state: governor.state }).catch(() => {});
    } catch (e) { /* extension reloaded */ }
  };
  const governor = createGovernor({
    initial: startedIn,
    onChange: (state, reason) => {
      console.info('[Scripture Guide] ' + state + ': ' + reason);
      reportState();
      if (state === 'paused') {
        queue.stop();
        writeHostState(host, rememberVisit(startedIn, 'paused', Date.now()));
      }
    }
  });
  if (startedIn !== 'normal') {
    console.info('[Scripture Guide] ' + startedIn + ': remembered for ' + host);
    reportState();
  }

  const processed = new WeakSet();

  const detectOptions = () => ({
    language: settings.language,
    canon: settings.canon,
    contextAware: settings.detection.contextAware,
    enableImpliedBooks: settings.detection.impliedBooks,
    abbreviations: settings.detection.abbreviations,
    chapterOnly: settings.detection.chapterOnly,
    wholeBooks: settings.detection.wholeBooks
  });

  const dispatcher = createDispatcher({
    send: (msg) => chrome.runtime.sendMessage(msg),
    parseLocal: (text, options) => findReferences(text, options),
    governor,
    idle: (cb) => (typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => cb(), { timeout: 1000 })
      : setTimeout(cb, 0)),
    options: detectOptions
  });

  // A text node: chunk it and hand it to the dispatcher. When the result comes back, the
  // node is annotated unless the page changed it meanwhile, in which case it is parsed again.
  const processNode = (node) => {
    if (!governor.canParse || !node.isConnected || processed.has(node)) return;
    processed.add(node);
    const text = node.nodeValue;
    if (!text || text.length > MAX_NODE_CHARS) return;
    const chunks = chunkText(text);
    dispatcher.submit({
      chunks: chunks.map((c) => c.text),
      onResult: (results) => {
        if (!applyResult(node, text, chunks, results, processed)) {
          processed.delete(node);
          if (isCandidate(node, processed)) queue.push([node]);
        }
      }
    });
  };

  // Links the page already has. A link whose whole text is one reference (jw.org's
  // "Acts 4:12") becomes our badge, with a small icon after it keeping the site's own link.
  // References in other links (footnotes with extra words) get one 🔗 after the last link of
  // a back-to-back run ("D&C 28:7; D&C 64:5"). Link text is at most 60 characters, so it is
  // parsed on the page thread, and the time counts toward the budget.
  const processGroup = (group) => {
    if (!governor.canParse) return;
    const anchors = group.filter((a) => a.isConnected && !a.hasAttribute(MARK));
    if (!anchors.length) return;
    const combined = [];
    let lastKept = null;
    const options = { ...detectOptions(), contextAware: governor.contextAware && settings.detection.contextAware };
    const start = performance.now();
    for (const anchor of anchors) {
      let matches = null;
      try { matches = findReferences(anchor.textContent, options); } catch (e) { /* skip */ }
      anchor.setAttribute(MARK, 'true');
      if (!matches || !matches.length) continue;
      if (matches.length === 1 && isWholeReference(anchor.textContent, matches[0])) {
        takeOverAnchor(anchor, matches[0]);
      } else {
        combined.push(...matches);
        lastKept = anchor;
      }
    }
    governor.recordLocal(performance.now() - start);
    if (combined.length && lastKept) annotateAnchor(lastKept, combined);
  };

  const queue = createQueue((item) => {
    if (Array.isArray(item)) processGroup(item); // anchor run
    else processNode(item);                      // text node
  });

  // Text far from the screen waits until it is about to scroll into view.
  const offscreen = new Map(); // element -> its waiting text nodes
  const lazy = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      const ready = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        lazy.unobserve(entry.target);
        ready.push(...(offscreen.get(entry.target) || []));
        offscreen.delete(entry.target);
      }
      if (ready.length) queue.pushFront(ready);
    }, { rootMargin: '100% 0px' })
    : null;

  const scan = () => {
    if (!governor.canParse) return;
    const candidates = collectCandidates(document.body, processed);
    const near = [];
    const top = -window.innerHeight;
    const bottom = window.innerHeight * 2;
    for (const n of candidates) {
      const el = n.parentElement;
      const r = el && el.getBoundingClientRect();
      if (!lazy || (r && r.bottom > top && r.top < bottom)) {
        near.push(n);
      } else {
        if (!offscreen.has(el)) { offscreen.set(el, []); lazy.observe(el); }
        offscreen.get(el).push(n);
      }
    }
    queue.pushFront(near);
    if (settings.appearance.footnoteLinks) queue.push(collectAnchorGroups(document.body));
  };
  if (governor.canParse) scan();

  const resume = () => {
    governor.resume();
    queue.restart();
    scan();
  };

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;
      if (msg.type === 'sg-rescan') {
        if (governor.canParse) scan(); else resume();
      } else if (msg.type === 'sg-resume') {
        resume();
        sendResponse({ state: governor.state });
      } else if (msg.type === 'sg-get-state') {
        sendResponse({ state: governor.state });
      }
    });
  }

  // Dynamic content. New text is parsed right away; text that changed (tickers, streaming
  // chat) waits CHANGED_TEXT_DELAY_MS and is parsed once however often it changed meanwhile.
  // Nodes we created while annotating are already in `processed` and stay skipped.
  const changedNodes = new Set();
  let changedTimer = null;
  const flushChanged = () => {
    changedTimer = null;
    const fresh = [];
    for (const n of changedNodes) {
      processed.delete(n);
      if (isCandidate(n, processed)) fresh.push(n);
    }
    changedNodes.clear();
    queue.push(fresh);
  };

  const observer = createObserver(document.body, (nodes, changed) => {
    if (!governor.canParse) return;
    const fresh = [];
    for (const n of nodes) {
      if (changed && changed.has(n)) {
        changedNodes.add(n);
        continue;
      }
      if (isCandidate(n, processed)) fresh.push(n);
    }
    if (changedNodes.size && !changedTimer) changedTimer = setTimeout(flushChanged, CHANGED_TEXT_DELAY_MS);
    queue.push(fresh);
    if (settings.appearance.footnoteLinks) {
      // Newly added subtrees may contain reference anchors too. Dedupe hosts
      // (a mutation can report many text nodes under one parent) and resolve
      // the enclosing <a> when the added node IS inside an anchor.
      const hosts = new Set();
      for (const n of nodes) {
        const hostEl = (n.parentElement && n.parentElement.closest('a')) || n.parentElement;
        if (hostEl) hosts.add(hostEl);
      }
      const groups = [];
      for (const hostEl of hosts) for (const g of collectAnchorGroups(hostEl)) groups.push(g);
      if (groups.length) queue.push(groups);
    }
  });

  // One delegated click handler: popup-mode for our own links (badges + 🔗).
  document.addEventListener('click', (e) => {
    const inline = e.target && e.target.closest && e.target.closest('span.sg_inlink');
    if (inline) {
      // Inside a site's own link: keep that link from navigating, open ours instead.
      e.preventDefault();
      e.stopPropagation();
      const url = inline.getAttribute('data-href');
      if (settings.click.action === 'popup') openCenteredPopup(url, settings.click.popupWidth, settings.click.popupHeight);
      else window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
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
        if (lazy) lazy.disconnect();
        clearTimeout(changedTimer);
        removeAllAnnotations(document);
        removeAllReflinks(document);
        window.__sgActive = false;
      }
    });
  });
})();

async function readHostState(host) {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return (stored[STORAGE_KEY] || {})[host];
  } catch (e) {
    return undefined;
  }
}

async function writeHostState(host, record) {
  if (!record) return;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const all = stored[STORAGE_KEY] || {};
    const now = Date.now();
    for (const [h, r] of Object.entries(all)) if (!r || r.until <= now) delete all[h]; // drop expired
    all[host] = record;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  } catch (e) { /* memory is best-effort */ }
}

function applyParserConfig(settings) {
  try {
    setLanguage(settings.language);
    setCanon(settings.canon);
  } catch (e) { /* parser defaults are fine if this throws */ }
}

// Goudy Scripture, the scripture.guide text font (fonts/OFL.txt), under a family name a page
// is unlikely to use; content.css sets badges in it.
function injectScriptureFont() {
  try {
    const url = chrome.runtime.getURL('fonts/GoudyScripture.woff2');
    const style = document.createElement('style');
    style.id = 'sg-scripture-font';
    // Relative url() in content-script CSS resolves against the page, so the
    // @font-face must be injected with the extension-resolved absolute URL.
    // The outlines are already bold; the full weight range stops browsers thickening them.
    style.textContent =
      "@font-face{font-family:'SG Goudy Scripture';src:url('" + url + "') format('woff2');" +
      'font-weight:400 1000;font-style:normal;font-display:swap;}';
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
