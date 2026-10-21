// Pages the browser smoke suite (smoke.mjs) loads on the live PHP site and on the Node app.
//
//   name      file name under test/browser/.out/
//   path      request path (html format, main host)
//   interact  interactions asserted on the Node page:
//               versebox  right-click the first .verse: the version box opens with a "Versions" tab
//               copy      the Copy button puts non-empty text on the clipboard
//               versions  the version selector (click the heading's cover) shows covers that load
//   mask      selectors painted over on BOTH screenshots before comparing, for regions that
//             change from load to load whatever the server does. Each one says why.
// Node-page problems that live has too, so they are reported but do not fail. Anything Node-only
// is a finding and fails. Each run without --reuse-live checks the entries against live's own
// problems and warns about any that excused a Node problem but no longer occur on live.
//
//   re       matched against the problem line ("requestfailed: <url> ...", "console: ...")
//   why      where live shows it too
//   trigger  an interaction that causes it; it then also runs on live, once per run
//   echo     a line naming no URL, excused only next to a non-echo entry's problem
export const SHARED_WITH_LIVE = [
  {
    re: /media\.scripture\.guide\/covers\/nirv\.jpg/,
    why: 'S3 has no covers/nirv.jpg (403); live /versionselect lists the same cover (checked 2026-10-20)',
    trigger: 'versions',
  },
  {
    re: /fonts\.gstatic\.com\/ea\/kopubbatang\//,
    why: 'versions.css (same file on live) points KoPub Batang at Google early-access URLs that now 404',
  },
  // Chrome's console line for those same 404s ("Failed to load resource") names no URL.
  { re: /^console: Failed to load resource: net::ERR_FAILED$/, why: 'console echo of the failures above', echo: true },
];

const READER =['versebox', 'copy', 'versions'];

export const PAGES = [
  { name: 'plain-verse', path: '/john.3.16', interact: READER },
  { name: 'niv-matt5', path: '/niv/matt.5', interact: READER },
  { name: 'psalm23', path: '/ps.23', interact: READER },
  { name: '1ne3-7', path: '/1ne.3.7', interact: READER },
  { name: '1830-1ne1-1', path: '/1830/1ne.1.1', interact: READER },
  { name: 'search-faith', path: '/faith', interact: [] },
  { name: 'parallel', path: '/isa.2~2ne.12', interact: [] },
  {
    name: 'home',
    path: '/',
    interact: [],
    // The search box cycles through a shuffled list of examples ("e.g. 'John 3:14'") on a timer.
    mask: ['#searchbox'],
  },
  { name: 'krbom-1ne1-1', path: '/krbom/1ne.1.1', interact: READER },
  { name: 'dc76', path: '/dc.76', interact: READER },
];
