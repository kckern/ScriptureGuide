// Minimal HTML parser for the app's own generated markup, producing the element tree shape the
// PHP code worked with: a node is a string (text, entities decoded) or { el, attr, content: [] }.
// It handles comments, doctype, void elements, raw-text elements and unbalanced closing tags;
// it is not a general-purpose HTML5 parser.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(src) {
  const attr = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) attr[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attr;
}

export function parseHtml(html) {
  const root = { el: '#root', attr: {}, content: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const text = s => { if (s) top().content.push(decodeEntities(s)); };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { text(html.slice(i)); break; }
    text(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const close = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(html.slice(lt, lt + 200));
    if (close) {
      const name = close[1].toLowerCase();
      const idx = stack.map(n => n.el).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
      i = lt + close[0].length;
      continue;
    }
    const open = /^<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/.exec(html.slice(lt));
    if (!open) { text('<'); i = lt + 1; continue; }
    const node = { el: open[1].toLowerCase(), attr: parseAttrs(open[2]), content: [] };
    top().content.push(node);
    i = lt + open[0].length;
    if (RAW.has(node.el)) {
      const end = html.toLowerCase().indexOf(`</${node.el}`, i);
      const stop = end < 0 ? html.length : end;
      if (stop > i) node.content.push(html.slice(i, stop));
      i = end < 0 ? html.length : html.indexOf('>', end) + 1;
      continue;
    }
    if (!VOID.has(node.el) && !open[3]) stack.push(node);
  }
  return root;
}

export const classes = node => String(node?.attr?.class ?? '').split(/\s+/).filter(Boolean);
export const hasClass = (node, c) => classes(node).includes(c);

// Depth-first search for the first element matching the predicate.
export function find(node, pred) {
  if (!node || typeof node === 'string') return null;
  if (pred(node)) return node;
  for (const c of node.content) {
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
}

export default parseHtml;
