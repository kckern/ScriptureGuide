// Remembers sites that had to be paused, so the next visit starts lighter:
// a pause from normal or local starts the next week of visits in lite; a pause from lite
// (or a visit that started paused) starts them paused. Stored in chrome.storage.local.

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const STORAGE_KEY = 'sgHostStates';

export function startState(record, now) {
  return record && record.until > now ? record.state : 'normal';
}

// The record to store after a visit, or null to leave the stored one as it is.
export function rememberVisit(startedIn, endedIn, now) {
  if (endedIn !== 'paused') return null;
  const state = startedIn === 'lite' || startedIn === 'paused' ? 'paused' : 'lite';
  return { state, until: now + WEEK_MS };
}
