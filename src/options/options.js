// Options page: bind every [data-path] control to the nested settings object
// in chrome.storage.sync, saving on change. One generic binder handles
// checkboxes, radios, selects, numbers, and hostname textareas.
import { mergeSettings } from '../shared/settings.js';
import { getPath, setPath, parseHostList } from '../shared/paths.js';

function readControl(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'radio') return el.value;
  if (el.type === 'number') return Number(el.value);
  if (el.tagName === 'TEXTAREA') return parseHostList(el.value);
  return el.value;
}

function writeControl(el, value) {
  if (el.type === 'checkbox') el.checked = !!value;
  else if (el.type === 'radio') el.checked = el.value === String(value);
  else if (el.tagName === 'TEXTAREA') el.value = (value || []).join('\n');
  else el.value = value;
}

function reflectSiteMode(mode) {
  const bl = document.getElementById('blacklist-row');
  const wl = document.getElementById('whitelist-row');
  if (bl) bl.style.display = mode === 'whitelist' ? 'none' : '';
  if (wl) wl.style.display = mode === 'whitelist' ? '' : 'none';
}

function flashSaved() {
  const el = document.getElementById('saved');
  if (!el) return;
  el.hidden = false;
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => { el.hidden = true; }, 1200);
}

async function init() {
  const settings = mergeSettings(await chrome.storage.sync.get());
  const controls = [...document.querySelectorAll('[data-path]')];

  for (const el of controls) {
    writeControl(el, getPath(settings, el.dataset.path));
    el.addEventListener('change', async () => {
      // Radios: only the checked one reports its value.
      if (el.type === 'radio' && !el.checked) return;
      const path = el.dataset.path;
      setPath(settings, path, readControl(el));
      // Persist the whole top-level key so nested siblings aren't dropped
      // (chrome.storage.sync.set replaces top-level values wholesale).
      const topKey = path.split('.')[0];
      await chrome.storage.sync.set({ [topKey]: settings[topKey] });
      if (path === 'siteMode') reflectSiteMode(settings.siteMode);
      flashSaved();
    });
  }

  reflectSiteMode(settings.siteMode);
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
