// Requests compared between the live PHP site and the Node app. URLs only; responses
// are cached locally under .cache/ (gitignored) because they contain licensed text.

const REFS = [
  'john.3.16', 'gen.1.1-5', 'gen.1.30-2.3', 'ps.23', '1ne.3.7', 'd&c.4', 'moses.1.39',
  'john.3.16;gen.1.1', 'isa.2', 'matt.5', 'alma.32.21-43', 'rev.22.21', 'jacob.5.1-10',
  'abr.3.22-23', 'js-h.1.17',
  'kjv/john.3.16', 'niv/matt.5', 'nrsv/ps.23', '1830/1ne.1.1', 'krbom/1ne.1.1',
  'esv/rom.8.28-39', 'kjv/gen.1.1-5',
];

const PER_REF_FORMATS = ['html', 'api', 'meta', 'raw', 'plain', 'latex'];

const EXTRA = [
  ['html', '/search/faith.hope.charity'],
  ['html', '/faith'],
  ['html', '/kjv/isa.2.1~2ne.12.1'],
  ['html', '/isa.2~2ne.12'],
  ['html', '/'],
  ['api', '/john.3.16?meta_only'],
  ['api', '/john.3.16?output_only'],
  ['api', '/john.3.16?meta_only&heads'],
  ['plain', '/john.3.16?plain_reference'],
  ['passage', '/passage?ref=John%203:16&version=KJV'],
  ['passage', '/passage?ref=Matthew%205&version=NIV'],
  ['versionselect', '/versionselect?ref=John%203:16&ver=LDS'],
  ['vbox', '/vbox?verse_id=26137&ver=LDS&seq=1'],
];

// Static files the live pages reference (src=/href= in the cached pages and the parallel page's
// book_open.png), plus the fonts and images the live CSS pulls in with url() and the images the
// live JS inserts (main.js: ref/ver.png; audio.js: audio.gif, audioload.gif, audioplay.png).
// Off-site URLs (fonts.gstatic.com) are left out.
const ASSETS = [
  '/favicon.ico',
  '/css/fax.css', '/css/featherlight.css', '/css/parallel.css', '/css/style.css', '/css/ui.css', '/css/versions.css',
  '/js/audio.js', '/js/cookie.js', '/js/diff.js', '/js/diff_match_patch.js', '/js/fax.js', '/js/featherlight.js',
  '/js/jplayer.js', '/js/main.js', '/js/parallel.js', '/js/scroll.js', '/js/tipsy.js',
  '/img/audio.gif', '/img/audioload.gif', '/img/audiooff.png', '/img/audioplay.png', '/img/back.jpg', '/img/book_open.png',
  '/img/check.svg', '/img/chrome.png', '/img/copy.svg', '/img/diff.png', '/img/green.png', '/img/numbers.png', '/img/paper.jpg',
  '/img/red.png', '/img/ref.png', '/img/ver.png', '/img/xref.png', '/img/yellow.png',
  ...['Goudy-Bold', 'Goudy-Italic', 'Goudy-Regular'].flatMap(f => ['eot', 'svg', 'ttf', 'woff'].map(ext => `/css/webfont/${f}.${ext}`)),
  '/css/webfont/ShadowsIntoLight.woff2',
  '/css/webfont/SortsMillGoudy-Italic.woff', '/css/webfont/SortsMillGoudy-Regular.woff',
  '/css/webfont/YanoneKaffeesatz-Bold.woff', '/css/webfont/YanoneKaffeesatz-Light.woff', '/css/webfont/YanoneKaffeesatz-Regular.woff',
];

export const corpus = [
  ...REFS.flatMap(ref => PER_REF_FORMATS.map(format => [format, '/' + ref])),
  ...EXTRA,
  ...ASSETS.map(p => ['asset', p]),
];

// Where each format lives on the live site, and the Host header the Node app should see.
const SUBDOMAIN = { api: 'api', meta: 'meta', raw: 'raw', plain: 'plain', latex: 'latex', markdown: 'markdown', xml: 'xml', notes: 'notes' };

export function hostFor(format) {
  return SUBDOMAIN[format] ? `${SUBDOMAIN[format]}.scripture.guide` : 'scripture.guide';
}
