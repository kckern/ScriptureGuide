// Compute updated site lists when the popup toggles the current host on/off.
// Returns { blacklist, whitelist } to store. Removing a host strips any pattern
// (including a wildcard) that matches it from the active list.

import { hostMatches } from './settings.js';

export function setSiteEnabled(settings, host, enable) {
  const strip = (list) => (list || []).filter((p) => !hostMatches(host, p));
  let { blacklist, whitelist } = settings;

  if (settings.siteMode === 'whitelist') {
    whitelist = enable ? [...strip(whitelist), host] : strip(whitelist);
  } else {
    blacklist = enable ? strip(blacklist) : [...strip(blacklist), host];
  }
  return { blacklist, whitelist };
}
