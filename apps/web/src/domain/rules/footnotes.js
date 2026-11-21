// Footnote markers in verse and heading text: "｢2771｣" is note 2771 of scripture_footnotes (the
// study editions SEBOM and KRSEB, and headings of other editions that share their note ids). The
// page shows each as the ✱ span PHP's scriptures::renderFootNotes printed, which public/js/main.js
// turns into a tooltip (data) and, for a reference or facsimile note, a click (type, extra).

const MARKER = /(\s*)｢(\d+)｣/gu;
// A version attribute (version="SEBOM") or a marker, in document order
const SCAN = /\bversion=["']([^"']*)["']|(\s*)｢(\d+)｣/gu;

const b64 = s => Buffer.from(String(s ?? ''), 'utf8').toString('base64');

// The part of a page the markers are replaced in: after <body when there is one, so the <head>
// (titles, link-preview descriptions in attributes) is never touched
function bodyStart(html) {
  const i = html.search(/<body\b/i);
  return i === -1 ? 0 : i;
}

// The note ids of the markers in the body, in order, once each
export function noteIdsIn(html) {
  const body = String(html).slice(bodyStart(String(html)));
  const ids = [];
  for (const m of body.matchAll(MARKER)) {
    const id = Number(m[2]);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

// The span for one note: rows of scripture_footnotes for that note id, the version's own first
function noteSpan(id, rows) {
  const note = rows[0];
  const type = String(note.type ?? '').trim();
  const extra = String(note.data ?? '').trim();
  const attrs = extra ? `type='${type}' extra='${b64(extra)}'` : '';
  const cls = extra && type ? `fn ${type}` : 'fn';
  return `<span data='${b64(String(note.html ?? '').trim())}' ${attrs} note_id='${id}' class='${cls}'>&#10033;</span>`;
}

// The html with each marker replaced by its note's span. A marker takes the note of the version
// it sits in (the nearest version="…" before it); a version without that note uses another
// version's, as PHP's lookup by note id alone did. A marker with no note is dropped. rows: the
// scripture_footnotes rows for the page's note ids.
export function footnotesHtml(html, rows) {
  html = String(html);
  if (!html.includes('｢')) return html;
  const byId = new Map();
  for (const r of rows ?? []) {
    const id = Number(r.note_id);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(r);
  }
  const start = bodyStart(html);
  let version = null;
  const body = html.slice(start).replace(SCAN, (all, ver, space, idText, offset, whole) => {
    if (ver !== undefined) {
      version = ver;
      return all;
    }
    const id = Number(idText);
    const notes = byId.get(id) ?? [];
    // Dropped: its leading space goes too when a space follows, or the text would show two
    if (!notes.length) return space && /\s/.test(whole[offset + all.length] ?? '') ? '' : space;
    const own = notes.filter(n => n.version === version);
    return noteSpan(id, own.length ? own : notes) + space;
  });
  return html.slice(0, start) + body;
}
