// Output formats, selected by subdomain (<format>.scripture.guide) or path prefix (/<format>/...).
export const OutputFormat = Object.freeze({
  HTML: 'html',
  META: 'meta',
  RAW: 'raw',
  PLAIN: 'plain',
  MARKDOWN: 'markdown',
  XML: 'xml',
  LATEX: 'latex',
  NOTES: 'notes',
  AUDIO: 'audio',
  COVER: 'cover',
});

export default OutputFormat;
