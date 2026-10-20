// api.scripture.guide (also json.): inc_api.php. JSON as PHP's
// json_encode(PRETTY_PRINT | NUMERIC_CHECK), CORS open.
//   default        {input, config, output: <scriptures HTML>, meta: [{orig, book, verse_ids, version}]}
//   ?meta_only     {input, config, meta: [{orig, book, verse_ids}]} (+ meta[0].heads with ?heads)
//   ?output_only   the HTML string alone
// "config" is the request's $cfig before lookup: query flags plus versions named in the path, or null.
import { hasFlag } from '../../formatOptions.js';
import { scripturesHtml } from '../../legacy/passages.js';
import { sendPhpJson } from '../../legacy/phpJson.js';
import { metaOnly, blocksFor } from './meta.js';

export class ApiPresenter {
  async present(result, req, res) {
    const lr = req.config.legacy;
    if (lr.ref.includes('~')) return res.status(200).type('text/html').send('');
    sendPhpJson(res, await this.build(result, req, res, lr), { numericCheck: true });
  }

  async build(result, req, res, lr = req.config.legacy) {
    const data = { input: lr.ref, config: lr.config };

    if (hasFlag(req, 'output_only')) {
      return (await scripturesHtml(req, res, blocksFor(lr.ref, result), lr.versions)).html;
    }
    if (hasFlag(req, 'meta_only')) {
      data.meta = await metaOnly(req, result);
      return data;
    }

    const blocks = blocksFor(lr.ref, result);
    const { html, versions } = await scripturesHtml(req, res, blocks, lr.versions);
    data.output = html;
    data.meta = blocks.map((b, i) => ({ ...b, version: versions[i] }));
    return data;
  }
}

export default new ApiPresenter();
