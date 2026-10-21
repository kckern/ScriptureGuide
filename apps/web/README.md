# Scripture Guide web app

Node/Express port of scripture.guide. Start it with `npm start`; settings come from the
environment (`src/config/index.js`). Tests: `npm test`; comparison with the live site:
`test/parity/README.md`.

## Operations

### Per-process caches: restart after editing the database

Some lookups are read once per process and kept until it exits. They have no expiry, so after
an editorial change to these tables, restart the app:

| Cached | Source | Code |
|---|---|---|
| Version names for templates | `scripture_versions` (id, title) | `src/app.js` |
| Books of the verse index | `lds_scriptures_books` | `VerseRepository.findAllBooks` |
| Versions that have headings, and versions that have text | `scripture_headings`, `scripture_verses` (`DISTINCT version`) | `HeadingRepository.knownVersions` |
| Where each version's sections start (heading verse ids and book ids) | `scripture_headings` (footer = 0) | `HeadingRepository.headingStarts` |
| A version's last verse, `MAX(verse_id)` | `scripture_verses` | `HeadingRepository.findVersionLastVerseId` |
| Search fallback only: FULLTEXT settings and `MAX(id)` | `information_schema`, `scripture_verses` | `SearchRepository` |

Version ids arrive in URLs, so the per-version caches hold only versions that exist: the
versions present in `scripture_headings` and `scripture_verses` are read once, and any other
version gets an empty answer without a cache entry or a query.

Verse text, heading text and everything else is read on every request. A failed lookup is not
cached; it is retried on the next request (a database error is reported, not read as "no data").

### Text font (private)

The licensed text font is not in the repository or the image. Set `FONT_DIR` to a directory
holding `scripture.woff2` (served at `/private-fonts`), or `FONT_BASE` to where it is hosted;
`FONT_GOUDY_FILE` renames the file. Unset, pages use Sorts Mill Goudy. See
[docs/fonts.md](docs/fonts.md#served-privately), which also has the bom mount.

### Search

With `SPHINX_HOST` set, search goes to Sphinx (SphinxQL on `SPHINX_PORT`, default 9306), with the
PHP site's limits (99,999 hits, 5,000 per volume when a query is too broad). Without it, search
falls back to MySQL (meant for development), which stops a search after
`SEARCH_FALLBACK_MAX_MS` (default 1500) or after reading about `SEARCH_FALLBACK_MAX_ROWS` rows
(default 1,000,000; the verse table has about 1.6 million) and shows what it found with
"Showing partial results — narrow your search". The budget is checked between queries, so one
query can run past it (a LIKE-only scan over all versions reads 100,000 ids per query, about
150 ms; other queries are bounded by their FULLTEXT match or by the LDS/KJV rows of a verse
range). Rows read are counted as the id span of such a scan, otherwise as the rows returned.
