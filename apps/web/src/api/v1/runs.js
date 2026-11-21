// Inline marks of one piece of stored verse text as runs: [{ text }, { text, mark }]. The marks
// are the ones the site renders (VerseSerializer.formatHtml):
//   ｟…｠ smallcaps, {…} small, 〔…〕 em, 「…」 strong, 《…》 sup, ~~…~~ strike, ⦅…⦆ sans
// Rules:
//   - ｢n｣ note marks are removed; noteFor(n) is called at each (notes.js, returns null for now)
//   - "|" and "||" (manuscript line ends) and "\" read as a space, as in flattenText
//   - nesting: the outer mark wins and the inner mark symbols are dropped ("{｟You｠}" is small);
//     the same mark inside itself closes at its own pair
//   - a mark with no closing symbol is plain text, symbols and all
//   - whitespace is collapsed, also across runs; neighbouring runs with one mark merge; empty
//     runs are dropped. The ends are not trimmed: the block builder does that per piece.
// The text must have no block markers left (¶ § / _ ▼ …; blocks.js takes those out first).
import { noteFor } from './notes.js';

const BRACKETS = Object.freeze({
  '｟': ['｠', 'smallcaps'],
  '{': ['}', 'small'],
  '〔': ['〕', 'em'],
  '「': ['」', 'strong'],
  '《': ['》', 'sup'],
  '⦅': ['⦆', 'sans'],
});
const MARK_SYMBOLS = /~~|[｟｠{}〔〕「」《》⦅⦆]/gu;

// Index of the closing symbol for the mark opened at i, or -1
function closeOf(s, i) {
  if (s.startsWith('~~', i)) return s.indexOf('~~', i + 2);
  const open = s[i];
  const [close] = BRACKETS[open];
  let depth = 0;
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && depth-- === 0) return j;
  }
  return -1;
}

function tidy(raw) {
  const out = [];
  for (const run of raw) {
    let text = run.text.replace(/\s+/g, ' ');
    const prev = out[out.length - 1];
    if (prev && prev.text.endsWith(' ') && text.startsWith(' ')) text = text.slice(1);
    if (!text) continue;
    if (prev && prev.mark === run.mark) prev.text += text;
    else out.push(run.mark ? { text, mark: run.mark } : { text });
  }
  return out;
}

export function toRuns(text) {
  const s = String(text ?? '')
    .replace(/｢(\d+)｣/gu, (_m, n) => {
      // A note would be added here once noteFor returns one; while it returns null, nothing is
      noteFor(Number(n));
      return '';
    })
    .replace(/[|\\]+/g, ' ');
  const raw = [];
  let plain = '';
  let i = 0;
  while (i < s.length) {
    const strike = s.startsWith('~~', i);
    if (strike || BRACKETS[s[i]]) {
      const end = closeOf(s, i);
      if (end >= 0) {
        const width = strike ? 2 : 1;
        if (plain) raw.push({ text: plain });
        plain = '';
        raw.push({ text: s.slice(i + width, end).replace(MARK_SYMBOLS, ''), mark: strike ? 'strike' : BRACKETS[s[i]][1] });
        i = end + width;
        continue;
      }
    }
    plain += s[i];
    i++;
  }
  if (plain) raw.push({ text: plain });
  return tidy(raw);
}

// The runs' text joined
export function runsText(runs) {
  return runs.map(r => r.text).join('');
}
