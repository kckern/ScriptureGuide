// The passage HTML of the scripture page, for the api format's "output". The page's own presenter
// renders it (whatever HtmlPresenter passes to its view), and the inner HTML of the
// <div class="passage ver_X"> is cut out, so api output follows html page parity.
import scriptureLookupService from '../../services/ScriptureLookupService.js';
import HtmlPresenter from '../presenters/HtmlPresenter.js';

const presenter = new HtmlPresenter();

// Inner HTML of the first <div class="passage ver_{version}">, balancing nested divs.
export function passageInner(html, version) {
  const open = new RegExp(`<div\\s+class=["']passage ver_${version.replace(/[^\w*]/g, '\\$&')}["'][^>]*>`);
  const m = open.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 1;
  let t;
  while ((t = tag.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return null;
}

// Render the page for one result the way the html format would, capturing the output.
function renderPage(req, res, result) {
  return new Promise((resolve, reject) => {
    const capture = {
      locals: res?.locals || {},
      statusCode: 200,
      status() { return capture; },
      set() { return capture; },
      type() { return capture; },
      send: body => resolve(String(body)),
      render(view, locals = {}, cb) {
        req.app.render(view, { ...capture.locals, ...locals }, (err, html) => {
          if (cb) return cb(err, html);
          return err ? reject(err) : resolve(html);
        });
      },
    };
    Promise.resolve()
      .then(() => presenter.present(result, req, capture))
      .catch(reject);
  });
}

export async function passageHtml(req, res, reference, version) {
  const config = { ...(req.config || {}), version };
  const result = await scriptureLookupService.lookup(reference, config);
  const page = await renderPage(req, res, result);
  return passageInner(page, version) ?? '';
}
