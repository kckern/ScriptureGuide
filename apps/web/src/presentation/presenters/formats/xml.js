import { renderPage, passageSections } from '../../documents/passageTree.js';
import { renderXml } from '../../documents/xmlDocument.js';

// xml.scripture.guide: the passage as XML (text/xml). Broken on the PHP site;
// see documents/xmlDocument.js for the format.
export class XmlPresenter {
  async present(result, req, res) {
    const page = await renderPage(result, req, res);
    res.set('Content-Type', 'text/xml; charset=utf-8');
    res.send(renderXml(passageSections(page)));
  }
}

export default new XmlPresenter();
