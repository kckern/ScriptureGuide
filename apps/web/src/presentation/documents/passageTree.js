import HtmlPresenter from '../presenters/HtmlPresenter.js';
import { parseHtml, find, classes, hasClass } from './htmlTree.js';

// The markdown and xml formats are built from the same passage markup as the HTML page
// (the PHP data structure: h2/h3 headings, p/blockquote blocks, verse spans), so they follow
// whatever the HTML presenter renders.

const htmlPresenter = new HtmlPresenter();

// Render the HTML page for the result into a string, without sending it.
export function renderPage(result, req, res, presenter = htmlPresenter) {
  return new Promise((resolve, reject) => {
    const capture = Object.create(res);
    capture.render = (view, locals = {}, cb) => {
      res.app.render(view, { ...res.locals, ...locals }, (err, str) => {
        if (cb) return cb(err, str);
        return err ? reject(err) : resolve(str);
      });
    };
    capture.send = body => resolve(String(body ?? ''));
    capture.status = () => capture;
    capture.set = () => capture;
    try {
      const r = presenter.present(result, req, capture);
      if (r && typeof r.catch === 'function') r.catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

const isNav = n => typeof n !== 'string' && (hasClass(n, 'chapterNav') || n.el === 'script' || n.el === 'style');

function strip(node) {
  if (typeof node === 'string') return node;
  return { ...node, content: node.content.filter(c => !isNav(c)).map(strip) };
}

// Sections → passages → content nodes, from a page or fragment.
// [{ passages: [{ version, content }] }]
export function passageSections(html) {
  const root = parseHtml(html);
  const scope = find(root, n => hasClass(n, 'scriptures')) || find(root, n => n.attr?.id === 'container') || root;
  const sectionNodes = scope.content.filter(n => typeof n !== 'string' && hasClass(n, 'section'));
  const sections = (sectionNodes.length ? sectionNodes : [scope]).map(section => {
    const passageNodes = section.content.filter(n => typeof n !== 'string' && hasClass(n, 'passage'));
    const passages = (passageNodes.length ? passageNodes : [section])
      .map(p => ({
        version: (classes(p).find(c => c.startsWith('ver_')) || '').slice(4),
        content: p.content.filter(c => !isNav(c)).map(strip),
        wrapped: p !== section,
      }))
      .filter(p => !p.wrapped || p.version)
      .filter(p => p.content.some(c => typeof c !== 'string' || c.trim()));
    return { passages };
  });
  return sections.filter(s => s.passages.length);
}

export default passageSections;
