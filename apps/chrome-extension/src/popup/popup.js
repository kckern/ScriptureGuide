// Popup: quick per-site and global enable toggles + a link to full settings.
import { mergeSettings, siteEnabled } from '../shared/settings.js';
import { setSiteEnabled } from '../shared/site-toggle.js';

async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return tab && tab.url ? new URL(tab.url).hostname : null;
  } catch (e) {
    return null;
  }
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
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  init();
}
