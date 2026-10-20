import { renderPage, passageSections } from '../../documents/passageTree.js';
import { renderMarkdown } from '../../documents/markdownDocument.js';

// markdown.scripture.guide: the passage as Markdown (text/markdown). Broken on the PHP site;
// see documents/markdownDocument.js for the format.
export class MarkdownPresenter {
  async present(result, req, res) {
    const page = await renderPage(result, req, res);
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.send(renderMarkdown(passageSections(page)));
  }
}

export default new MarkdownPresenter();
