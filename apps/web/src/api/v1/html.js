// The HTML fragment for one passage in one version (the "html" option): semantic classes
// and data attributes only, no layout markup.
import { escapeHtml } from '../../domain/rules/legacyText.js';

export function passageHtml(passage, version) {
  const heading = passage.headings?.[version];
  const spans = passage.verses
    .filter(v => v.texts?.[version] != null)
    .map(v => `<span class="verse" data-verse-id="${v.id}" data-chapter="${v.chapter}" data-verse="${v.verse}">${escapeHtml(v.texts[version])}</span>`);
  return `<div class="passage" data-version="${escapeHtml(version)}">` +
    (heading ? `<h3 class="heading">${escapeHtml(heading)}</h3>` : '') +
    `<p>${spans.join(' ')}</p></div>`;
}
