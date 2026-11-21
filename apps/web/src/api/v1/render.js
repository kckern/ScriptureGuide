// Bodies for each host: api (full v1 JSON), and the simple formats json, yaml, markdown and
// text built from the same passage object. Content types live in CONTENT_TYPES.
import yaml from 'js-yaml';

// lineWidth -1: verse text stays on one line instead of folding at 80 columns.
// noRefs: a value used twice is written out twice, not as an &anchor.
const dumpYaml = value => yaml.dump(value, { lineWidth: -1, noRefs: true });

export const CONTENT_TYPES = Object.freeze({
  api: 'application/json; charset=utf-8',
  json: 'application/json; charset=utf-8',
  yaml: 'application/yaml; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  text: 'text/plain; charset=utf-8',
});

function forVersion(data, t) {
  const verses = data.passages.flatMap(p => p.verses)
    .filter(v => v.texts?.[t.id] != null)
    .map(v => ({ chapter: v.chapter, verse: v.verse, text: v.texts[t.id] }));
  return {
    reference: data.reference.map(r => r.label).join('; '),
    version: t.id,
    text: verses.map(v => v.text).join(' '),
    verses,
    copyright: t.copyright,
  };
}

// One object for one version, a list for several
export function simpleData(data) {
  const all = data.versions.map(t => forVersion(data, t));
  return all.length === 1 ? all[0] : all;
}

// json and yaml keep a version with no verses (text '', verses []); markdown and text leave
// it out. The builder throws when no version has any of the verses.
// Markdown does not escape verse text: plainText has already collapsed newlines, and inline
// characters such as * or [ ] are left as they are.
export function renderSimple(kind, data) {
  const blocks = data.versions.map(t => forVersion(data, t)).filter(b => b.verses.length);
  const named = data.versions.length > 1;
  switch (kind) {
    case 'json': return JSON.stringify(simpleData(data));
    case 'yaml': return dumpYaml(simpleData(data));
    case 'markdown':
      return blocks.map(b => `> ${b.text}\n>\n> — ${b.reference} (${b.version})\n`).join('\n');
    case 'text':
      return blocks.map(b => `${named ? `${b.version}: ` : ''}${b.text}\n`).join('');
    default: throw new Error(`unknown simple format ${kind}`);
  }
}

export function renderError(kind, err) {
  const error = err.toJSON();
  switch (kind) {
    case 'api': return JSON.stringify({ api: 'v1', error });
    case 'json': return JSON.stringify({ error });
    case 'yaml': return dumpYaml({ error });
    default: return `${err.message}\n`;
  }
}

// What a simple host's root (/) answers: how to use it, in its own format. host is the
// subdomain the request came in on (txt or plain, md or markdown, ...).
export function renderUsage(kind, host) {
  const usage = `https://${host}.scripture.guide/<version>/<reference>`;
  const example = `https://${host}.scripture.guide/nrsv/john3.16`;
  switch (kind) {
    case 'json': return JSON.stringify({ usage, example });
    case 'yaml': return dumpYaml({ usage, example });
    case 'markdown': return `Usage: \`${usage}\`, e.g. <${example}>\n`;
    case 'text': return `Usage: ${usage}, e.g. ${example}\n`;
    default: throw new Error(`unknown simple format ${kind}`);
  }
}
