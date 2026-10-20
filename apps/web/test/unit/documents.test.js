import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/presentation/documents/htmlTree.js';
import { passageSections, renderPage } from '../../src/presentation/documents/passageTree.js';
import { renderXml, elementName, inlineMarks } from '../../src/presentation/documents/xmlDocument.js';
import { renderMarkdown, flattenText } from '../../src/presentation/documents/markdownDocument.js';

// Markup in the shape of the HTML page (KJV text, public domain).
const PAGE = `<html><body><div id='container'>
  <div class='scriptures'>
  <div class='section'>
    <div class='passage ver_KJV'><h2 version="KJV">Genesis</h2>
      <h3 class="heading" version="KJV" heading_verse_id="1" headless="1" ref="Genesis 1:1–2">
      Genesis 1:1–2
      </h3>
      <div class="summary" version="KJV">God creates the earth &amp; its heaven.</div>
      <p class="prose">
      <span class="verse v_1 prose genesis-1-1" verse_id="1" ref="Genesis 1:1" version="KJV" verse_label="1:1"><span class="smallcaps">In</span> the beginning God created the heaven and the earth.</span>
      </p>
      <p class="prose">
      <span class="verse v_2 prose genesis-1-2" verse_id="2" ref="Genesis 1:2" version="KJV" verse_label="2">And the earth was without form, and void; {and} darkness was upon the face of the deep.</span>
      </p>
    </div>
    <div class='passage ver_'><div class="chapterNav"><a href="/gen.2" class="next">Genesis 2 ▶</a></div></div>
  </div>
  </div>
</div><script>var x = "<p>";</script></body></html>`;

const POEM = `<div class='scriptures'><div class='section'><div class='passage ver_KJV'>
  <h3 class="heading">Psalms 23</h3>
  <p class="ellipses">...</p>
  <blockquote class="poetry">
  <span class="verse v_14237 poetry psalms-23-1" verse_label="23:1">The LORD is my shepherd;</span> <span class="verse v_14237 poetry indent linebreak psalms-23-1">I shall not want.</span> <span class="verse v_14238 poetry linebreak psalms-23-2" verse_label="2">He maketh me to lie down</span>
  </blockquote>
</div></div></div>`;

// Small XML well-formedness check: balanced tags, valid names, escaped text.
function assertWellFormed(xml) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack = [];
  const re = /<(\/?)([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|([^<]+)/gy;
  let m;
  let pos = 0;
  let roots = 0;
  while ((m = re.exec(body))) {
    pos = re.lastIndex;
    if (m[5] !== undefined) {
      expect(m[5]).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i);
      if (!stack.length) expect(m[5].trim()).toBe('');
      continue;
    }
    expect(m[2]).toMatch(/^[\p{L}_][\p{L}\p{N}_.-]*$/u);
    if (m[1]) expect(stack.pop()).toBe(m[2]);
    else if (!m[4]) { if (!stack.length) roots++; stack.push(m[2]); }
  }
  expect(pos).toBe(body.length);
  expect(stack).toEqual([]);
  expect(roots).toBe(1);
}

describe('htmlTree', () => {
  it('parses nested markup, attributes, entities and raw text', () => {
    const root = parseHtml('<p class="a b" x=\'1\'>A &amp; <br>B<img src=x></p><script>if (a<b) {}</script>');
    expect(root.content[0]).toEqual({ el: 'p', attr: { class: 'a b', x: '1' }, content: ['A & ', { el: 'br', attr: {}, content: [] }, 'B', { el: 'img', attr: { src: 'x' }, content: [] }] });
    expect(root.content[1].content).toEqual(['if (a<b) {}']);
  });
});

describe('passageSections', () => {
  it('finds the passages and drops the chapter navigation', () => {
    const sections = passageSections(PAGE);
    expect(sections).toHaveLength(1);
    expect(sections[0].passages.map(p => p.version)).toEqual(['KJV']);
    expect(JSON.stringify(sections)).not.toContain('chapterNav');
  });
});

describe('renderXml', () => {
  const xml = renderXml(passageSections(PAGE));

  it('is well-formed', () => {
    assertWellFormed(xml);
    assertWellFormed(renderXml(passageSections(POEM)));
  });

  it('names elements from classes and keeps only verse_label', () => {
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      "<scripture><div class='scriptures'>\n\t<div class='section'>\n\t\t<div class='passage ver_KJV'>" +
      '<title>Genesis</title><heading>Genesis 1:1–2</heading><summary>God creates the earth &amp; its heaven.</summary>' +
      '<prose><verse_prose verse_label="1:1"><span class="smallcaps">In</span> the beginning God created the heaven and the earth.</verse_prose></prose>' +
      '<prose><verse_prose verse_label="2">And the earth was without form, and void; <small>and</small> darkness was upon the face of the deep.</verse_prose></prose>' +
      "\n\t\t</div>\n\t</div>\n</div></scripture>\n"
    );
  });

  it('maps verse classes to verse_prose, verse_poetry and verse_indent', () => {
    expect(elementName({ el: 'span', attr: { class: 'verse v_1 prose x-1-1' } })).toBe('verse_prose');
    expect(elementName({ el: 'span', attr: { class: 'verse v_1 poetry x-1-1' } })).toBe('verse_poetry');
    expect(elementName({ el: 'span', attr: { class: 'verse v_1 poetry indent linebreak x' } })).toBe('verse_indent');
    expect(elementName({ el: 'blockquote', attr: { class: 'poetry' } })).toBe('poetry');
    expect(elementName({ el: 'h2', attr: {} })).toBe('title');
    expect(elementName({ el: 'p', attr: { class: '1830 x' } })).toBe('_1830_x');
  });

  it('converts inline marks', () => {
    expect(inlineMarks('{a} 〔b〕 「c」 ｟d｠ 《e》 ~~f~~ ||')).toBe(
      "<small>a</small> <em>b</em> <strong>c</strong> <span class=\"smallcaps\">d</span> <sup>e</sup> <s>f</s> <span class='breaker'></span>"
    );
  });

  it('separates sections', () => {
    const two = renderXml([{ passages: [{ version: 'KJV', content: [] }] }, { passages: [{ version: 'KJV', content: [] }] }]);
    expect(two).toContain("</div>\n\t</div>\n\t<hr class='sectionbreak'/>\n\t<div class='section'>");
    assertWellFormed(two);
  });
});

describe('renderMarkdown', () => {
  it('renders headings, paragraphs and plain text', () => {
    expect(renderMarkdown(passageSections(PAGE))).toBe(
      '# Genesis\n\n## Genesis 1:1–2\n\nGod creates the earth & its heaven.\n\n' +
      'In the beginning God created the heaven and the earth.\n\n' +
      'And the earth was without form, and void; and darkness was upon the face of the deep.\n'
    );
  });

  it('indents poetry and skips ellipses', () => {
    expect(renderMarkdown(passageSections(POEM))).toBe(
      '## Psalms 23\n\n    The LORD is my shepherd;\n         I shall not want.\n    He maketh me to lie down\n'
    );
  });

  it('flattens scripture markup', () => {
    expect(flattenText('§¶｟In｠ the 「beginning」｢12｣ was/the ~~gone~~word|x')).toBe('In the beginning was the word x');
  });
});

describe('renderPage', () => {
  it('captures what the HTML presenter renders', async () => {
    const presenter = { present: (result, req, res) => res.render('page', { a: 1 }) };
    const res = {
      locals: { b: 2 },
      app: { render: (view, locals, cb) => cb(null, `${view}:${locals.a}${locals.b}`) },
    };
    await expect(renderPage({}, {}, res, presenter)).resolves.toBe('page:12');
  });
});
