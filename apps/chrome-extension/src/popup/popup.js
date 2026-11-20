// Popup: quick per-site and global enable toggles + a link to full settings.
import { mergeSettings, siteEnabled } from '../shared/settings.js';
import { setSiteEnabled } from '../shared/site-toggle.js';

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function currentHost() {
  const tab = await currentTab();
  try {
    return tab && tab.url ? new URL(tab.url).hostname : null;
  } catch (e) {
    return null;
  }
}

// What the page's scanner is doing, when it is not the normal full scan.
export const STATUS_TEXT = {
  lite: 'Simplified detection on this page.',
  paused: 'Paused on this page to keep it responsive.'
};

function showStatus(state) {
  const box = document.getElementById('page-status');
  const text = STATUS_TEXT[state];
  box.hidden = !text;
  document.getElementById('page-status-text').textContent = text || '';
  document.getElementById('resume').hidden = state !== 'paused';
}

async function initStatus() {
  const tab = await currentTab();
  if (!tab || tab.id == null) return;
  const ask = (type) => chrome.tabs.sendMessage(tab.id, { type }).catch(() => null);
  const reply = await ask('sg-get-state');
  if (reply && reply.state) showStatus(reply.state);
  document.getElementById('resume').addEventListener('click', async () => {
    const after = await ask('sg-resume');
    showStatus(after && after.state ? after.state : 'lite');
  });
}

async function init() {
  const host = await currentHost();
  let settings = mergeSettings(await chrome.storage.sync.get());

  const siteToggle = document.getElementById('site-toggle');
  const globalToggle = document.getElementById('global-toggle');
  const siteLabel = document.getElementById('site-label');

  globalToggle.checked = settings.enabled;

  if (host) {
    siteLabel.textContent = 'Enable on ' + host;
    siteToggle.checked = siteEnabled(host, settings);
    siteToggle.disabled = !settings.enabled;
  } else {
    siteToggle.disabled = true;
  }

  siteToggle.addEventListener('change', async () => {
    const { blacklist, whitelist } = setSiteEnabled(settings, host, siteToggle.checked);
    settings = { ...settings, blacklist, whitelist };
    await chrome.storage.sync.set({ blacklist, whitelist });
  });

  globalToggle.addEventListener('change', async () => {
    settings = { ...settings, enabled: globalToggle.checked };
    await chrome.storage.sync.set({ enabled: globalToggle.checked });
    siteToggle.disabled = !globalToggle.checked || !host;
    if (host) siteToggle.checked = siteEnabled(host, settings);
  });

  document.getElementById('gear').addEventListener('click', () => chrome.runtime.openOptionsPage());
  initStatus();
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  init();
}
