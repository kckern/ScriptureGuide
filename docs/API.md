# scripture.guide API, v1

A free, open HTTP API for scripture: passages in one or several versions, parallel passages, search and random verses. No account or key is needed. Every URL here works in a browser.

```sh
curl https://api.scripture.guide/v1/nrsv/john3.16
curl https://txt.scripture.guide/john3.16
```

## Terms

- A **version** is a scripture version or edition: `NRSV`, `KJV`, `LDS` (the current Latter-day Saint edition), `1830` (the 1830 Book of Mormon), and about 100 more. `/v1/versions` lists them all.
- The **API version** is the version of this API: `v1`. It appears in the path (`/v1/`), in every JSON body (`"api": "v1"`) and in the `X-API-Version: 1` header.

## Hosts

| Host | Answers with |
|---|---|
| `api.scripture.guide` | The full JSON described below. Supports options, parallel, search, random and the version list |
| `json.scripture.guide` | Small fixed JSON: reference, version, text, verses, copyright |
| `yml.scripture.guide`, `yaml.scripture.guide` | The same fields as `json.`, as YAML |
| `md.scripture.guide`, `markdown.scripture.guide` | A Markdown blockquote with a citation line |
| `txt.scripture.guide`, `plain.scripture.guide` | The verse text only |

`https://scripture.guide/api/...` is the same as `https://api.scripture.guide/...`, and `https://scripture.guide/json/...` is the same as `https://json.scripture.guide/...`.

Only `GET` and `HEAD` are served.

### Root

`https://api.scripture.guide/`, `/v1` and `/v1/` return an index:

```json
{ "api": "v1", "docs": "https://scripture.guide/SKILL.md", "versions": "https://api.scripture.guide/v1/versions", "example": "https://api.scripture.guide/v1/john3.16" }
```

The root of each simple host returns a one-line usage hint in that host's format. For example, `https://txt.scripture.guide/` returns:

```
Usage: https://txt.scripture.guide/<version>/<reference>, e.g. https://txt.scripture.guide/nrsv/john3.16
```

`json.` and `yml.` return `{ "usage": "…", "example": "…" }`.

## URL format

```
https://api.scripture.guide/{api version}/{options...}/{versions}/{reference}
```

Every part except the reference is optional.

- **API version:** `v1`. Leaving it out means the current API version, so `/nrsv/john3.16` is the same as `/v1/nrsv/john3.16`. `v2` and up return `unsupported_api_version`.
- **Options:** zero or more of the option words below.
- **Versions:** one version id, or several joined with `.` (`nrsv.kjv`). Ids are case-insensitive, a version named twice is listed once, and at most 10 are allowed. The website's layout suffix (`1830*rebom`) is accepted and ignored. Without a version segment, the API picks the website's default version for the passage (for example `LDS` for the standard works).
- **Reference:** written the way the website accepts it: `john3.16`, `john3.16-18`, `John%203:16`, `1ne3.7`, `dc4`, `john3`. Join several pieces with `;` (`john3.16;rom8.28`). A piece without a book name takes the book before it (`john3.16;4.1`). Extra path segments after the reference are more pieces (`/nrsv/john3.16/rom8.28` is `john3.16; rom8.28`). A number or range of numbers on its own (`/26137`, `/26137-26140`) is a list of verse ids.

A version segment with nothing after it (`/v1/nrsv/`) is `unparseable_reference`. An unknown word in the version position, before a reference, is `unknown_version`. It is never read as part of the reference.

### Reserved words

These words have fixed meanings in a path and are never read as a version id:

`v1` (and any `v` + digits), `html`, `ids`, `search`, `random`, `versions`, `ot`, `nt`, `bom`, `dc`, `pgp`, `page-<n>`.

## Options

Options come right after the API version, before the versions.

| Option | Effect |
|---|---|
| `html` | Adds `html` to each passage: an HTML fragment per version (see below) |
| `ids` | Leaves out verse text and headings: references and verse ids only |

`/v1/html/ids/...` is allowed. With `ids` the response has no text, so it has no `html` either. Options apply to passages and random verses, and `ids` also applies to search. Parallel and the version list ignore them, and so do the simple hosts.

## Passages

`GET https://api.scripture.guide/v1/nrsv/john3.16-17`

```json
{
  "api": "v1",
  "query": "john3.16-17",
  "versions": [
    { "id": "NRSV", "name": "New Revised Standard Version", "language": "en", "copyright": null }
  ],
  "reference": [
    {
      "label": "John 3:16-17",
      "book": "John",
      "slug": "john.3.16-17",
      "start": { "book": "John", "chapter": 3, "verse": 16 },
      "end": { "book": "John", "chapter": 3, "verse": 17 }
    }
  ],
  "passages": [
    {
      "headings": { "NRSV": "Nicodemus Visits Jesus" },
      "verses": [
        { "id": 26137, "chapter": 3, "verse": 16,
          "texts": { "NRSV": "“For God so loved the world that he gave his only Son, so that everyone who believes in him may not perish but may have eternal life." } },
        { "id": 26138, "chapter": 3, "verse": 17,
          "texts": { "NRSV": "“Indeed, God did not send the Son into the world to condemn the world, but in order that the world might be saved through him." } }
      ]
    }
  ],
  "parallels": [{ "reference": "JST John 3:16-17", "slug": "jst.john.3.16-17" }],
  "links": { "web": "https://scripture.guide/nrsv/john.3.16-17" }
}
```

| Field | Meaning |
|---|---|
| `query` | The reference as written in the URL |
| `versions` | The versions in the response, in path order. When no version was asked for, this is the default version that was picked |
| `reference` | One entry per `;` piece, in order. `book` is the book the piece starts in, and `start` and `end` each name their own book, so a range across books (`mal4.5-matt1.2`) ends in Matthew. `slug` is the piece in the website's URL form |
| `passages` | Runs of verses. A new passage starts where a section heading starts and where the reference jumps (a new piece, or a gap) |
| `passages[].headings` | The section heading in force at the start of the passage, per version id. `null` when there is none |
| `passages[].verses[].id` | The verse id. Verse ids are the same in every version |
| `passages[].verses[].texts` | The verse text per version id: plain text, with no markup. `null` when that version lacks the verse |
| `parallels` | Passages linked to these verses as their sources or stand-ins (for example the JST version of a Gospel verse). `[]` when there are none |
| `links.web` | The same passage on the website |

`versions`, `reference`, `passages` and `parallels` are always arrays, even when they hold one item. Every field is always present with the same type, apart from the changes the `ids` and `html` options make.

### Version objects

Every response uses the same version object:

```json
{ "id": "NRSV", "name": "New Revised Standard Version", "language": "en", "copyright": null }
```

- `id` is the version id as stored, mostly upper case (`NRSV`, `1830`), with one lower-case id (`printer`).
- `language` is an ISO 639-1 code: `en`, `ko`, `hi`, …
- `copyright` is `null` for every version until licensing is settled. When it holds text, show it with any quotation.

### With `ids`

`GET https://api.scripture.guide/v1/ids/kjv/john3.16;rom8.28`

Passages have no `headings`, and verses have no `texts`:

```json
"passages": [
  { "verses": [{ "id": 26137, "chapter": 3, "verse": 16 }] },
  { "verses": [{ "id": 28145, "chapter": 8, "verse": 28 }] }
]
```

### With `html`

`GET https://api.scripture.guide/v1/html/nrsv/john3.16`

Each passage gets `html`, keyed by version id:

```html
<div class="passage" data-version="NRSV"><h3 class="heading">Nicodemus Visits Jesus</h3><p><span class="verse" data-verse-id="26137" data-chapter="3" data-verse="16">“For God so loved the world …</span></p></div>
```

The fragment holds classes and data attributes only, with no layout markup. Paragraph breaks are not kept: each passage is one `<p>`.

## Several versions

`GET https://api.scripture.guide/v1/nrsv.kjv/john3.16`

The response has the same shape as for one version: `versions` lists both, and `headings` and `texts` have one key per version.

```json
"passages": [{
  "headings": { "NRSV": "Nicodemus Visits Jesus", "KJV": null },
  "verses": [{ "id": 26137, "chapter": 3, "verse": 16,
               "texts": { "NRSV": "“For God so loved the world …", "KJV": "For God so loved the world, …" } }]
}]
```

A version that lacks a verse has `null` for it. The response is an error (`not_in_version`) only when none of the versions has any of the verses.

## Parallel

`GET https://api.scripture.guide/v1/kjv/isa2~lds/2ne12`

Two different references side by side, aligned where one quotes or alludes to the other: Isaiah in the Book of Mormon, the JST against the KJV, the synoptic Gospels. Each side is `{version}/{reference}` or a bare reference, and the two sides are joined by `~`. To compare one reference in several versions, use the `.` syntax above instead.

```json
{
  "api": "v1",
  "query": "kjv/isa2.1-2~lds/2ne12.1-2",
  "left":  { "version": { "id": "KJV", "name": "King James Version", "language": "en", "copyright": null }, "reference": "Isaiah 2:1–2" },
  "right": { "version": { "id": "LDS", "name": "Current LDS Scriptures", "language": "en", "copyright": null }, "reference": "2 Nephi 12:1–2" },
  "rows": [
    { "match": "quote", "significant": true,
      "left":  { "verse_id": 17687, "reference": "Isaiah 2:1", "text": "The word that Isaiah the son of Amoz saw concerning Judah and Jerusalem." },
      "right": { "verse_id": 32018, "reference": "2 Nephi 12:1", "text": "The word that Isaiah, the son of Amoz, saw concerning Judah and Jerusalem:" } }
  ],
  "links": { "web": "https://scripture.guide/kjv/isa.2.1-2~lds/2.ne.12.1-2" }
}
```

- `left.reference` and `right.reference` are strings: the label of each side.
- Each row has one verse group per side, or `null` where that side has nothing to line up. When several verses on one side match one verse on the other, they are joined into one cell.
- `match` is `quote` or `allusion` when the two cells are linked, and `none` otherwise. `significant` is `true` when the linked texts differ in a way the database marks as significant.
- An unknown version on either side is `unknown_version`. A side that finds no verses is `unparseable_reference`. A version with no text for its side is `not_in_version`.
- Parallel is on `api.` only. The simple hosts return `parallel_not_supported`.

## Search

```
https://api.scripture.guide/v1/search/{scope...}/{terms}
```

The terms are the last segment. Write spaces as `+`, `.` or `%20`. Scope segments come before the terms, in any order, and are all optional:

| Segment | Meaning |
|---|---|
| A version id (`nrsv`) | Search that version only |
| A volume (`ot`, `nt`, `bom`, `dc`, `pgp`) | Search that volume only |
| `page-<n>` | Results page `n` (from 1) |

Any other scope segment is `unknown_version`. Without a version, the search runs over the website's default versions.

`GET https://api.scripture.guide/v1/search/nrsv/nt/loved+the+world`

```json
{
  "api": "v1",
  "query": "loved the world",
  "scope": { "version": "NRSV", "volume": "nt" },
  "total": 14,
  "truncated": false,
  "page": 1,
  "per_page": 50,
  "results": [
    { "id": 26137, "reference": "John 3:16", "slug": "john.3.16", "version": "NRSV",
      "text": "“For God so loved the world that he gave his only Son, so that everyone who believes in him may not perish but may have eternal life.",
      "highlights": [[12, 27]] }
  ],
  "links": { "next": null, "web": "https://scripture.guide/nrsv/loved.the.world" }
}
```

- Results are in canon order (book, chapter, verse), 50 per page. `links.next` is the URL of the next page, or `null` on the last page.
- `highlights` holds `[start, end]` offsets of matched words in `text`, so you can mark them however you like (`text.slice(start, end)` in JavaScript). Offsets count UTF-16 code units: a character outside the Basic Multilingual Plane counts as two.
- Matches are highlighted only in text with ASCII letters. Text in Korean, Hindi or other scripts gets `highlights: []` even when the verse matched.
- `truncated` is `true` when the search stopped early or a result limit left verses out. `total` is then a lower bound.
- With the `ids` option (`/v1/ids/search/nrsv/love`), results have no `text` or `highlights`, and `links.next` keeps the option.
- No matches is a 200 with `results: []`. Empty terms (`/v1/search/+`) are `empty_query`.
- Search is on `api.` only. The simple hosts return `search_not_supported`.

## Random verse

```
https://api.scripture.guide/v1/random              any verse
https://api.scripture.guide/v1/nrsv/random         a verse NRSV has
https://api.scripture.guide/v1/nrsv.kjv/random     the same verse in several versions; the pick comes from the first
https://api.scripture.guide/v1/random/bom          a verse in one volume: ot, nt, bom, dc or pgp
https://api.scripture.guide/v1/nrsv/random/nt      both
```

The response is a normal passage response for one verse, and the options apply to it (`/v1/ids/random`). The simple hosts support random too: `https://txt.scripture.guide/random`, `https://md.scripture.guide/nrsv/random`.

Random responses carry `Cache-Control: no-store`, so every request gets a new verse. An unknown volume word is `unknown_volume`. A version with no verses in the volume asked for is `not_in_version`.

## Version list

`GET https://api.scripture.guide/v1/versions`

```json
{ "api": "v1", "versions": [
  { "id": "1835", "name": "1835 Doctrine and Covenants", "language": "en", "copyright": null },
  { "id": "MILLER", "name": "Adam Miller Paraphrase", "language": "en", "copyright": null }
] }
```

Every version, in the website's priority order, as version objects. Filter by `language` on the client (`ko` lists the Korean versions). The version list is on `api.` only. The simple hosts return `versions_not_supported`.

## Simple hosts

They take the same `/{versions}/{reference}` path (and `/random`), with no options.

`https://json.scripture.guide/nrsv/john3.16-17`

```json
{
  "reference": "John 3:16-17",
  "version": "NRSV",
  "text": "“For God so loved the world … “Indeed, God did not send the Son into the world …",
  "verses": [
    { "chapter": 3, "verse": 16, "text": "“For God so loved the world …" },
    { "chapter": 3, "verse": 17, "text": "“Indeed, God did not send the Son into the world …" }
  ],
  "copyright": null
}
```

- Several pieces join `reference` with `; `. `text` is every verse joined by a space.
- With several versions (`/nrsv.kjv/john3.16`), `json.` and `yml.` return a list with one object per version. A version that has none of the verses is kept, with `text: ""` and `verses: []`.

`https://md.scripture.guide/nrsv/john3.16`

```markdown
> “For God so loved the world that he gave his only Son, so that everyone who believes in him may not perish but may have eternal life.
>
> — John 3:16 (NRSV)
```

`https://txt.scripture.guide/nrsv.kjv/john3.16`

```
NRSV: “For God so loved the world that he gave his only Son, so that everyone who believes in him may not perish but may have eternal life.
KJV: For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.
```

With one version, `txt.` prints the text with no version prefix. `md.` and `txt.` print one block per version, in path order, and leave out a version that has none of the verses.

## Errors

On `api.`, errors return this body with a 4xx or 5xx status:

```json
{ "api": "v1", "error": { "code": "verse_out_of_range", "message": "Jonah 3 has 10 verses.", "suggestion": "Jonah 3:10" } }
```

`suggestion` is present only when there is one: a reference that would work, written as a label (`Jonah 3:10`, `Alma 63`). It can be used as the reference of a new request. `message` is meant to be read by people.

The simple hosts use the same status and code in their own format: `json.` returns `{ "error": { "code", "message", "suggestion"? } }`, `yml.` the same as YAML, and `md.` and `txt.` the message on one line.

| Code | Status | When |
|---|---|---|
| `unparseable_reference` | 400 | The reference can't be read (`/v1/@@@`), is missing (`/v1/nrsv/`), or a parallel side finds no verses |
| `empty_query` | 400 | Search terms are empty |
| `reference_too_large` | 400 | More than 100 `;` pieces, 5,000 verses or 10 versions (see Limits) |
| `parallel_not_supported` | 400 | Parallel on a simple host |
| `search_not_supported` | 400 | Search on a simple host |
| `versions_not_supported` | 400 | `/versions` on a simple host |
| `unknown_book` | 404 | No book matches (`/v1/xyz9.9`) |
| `chapter_out_of_range` | 404 | The book has fewer chapters (`/v1/jonah9`: "Jonah has 4 chapters.", suggestion `Jonah 4`) |
| `verse_out_of_range` | 404 | The chapter has fewer verses (`/v1/jon3.16`) |
| `unknown_version` | 404 | A version segment or search scope isn't a known version (`/v1/foo/john3.16`) |
| `unknown_volume` | 404 | The word after `random` isn't `ot`, `nt`, `bom`, `dc` or `pgp` (`/v1/random/xx`) |
| `not_in_version` | 404 | None of the versions asked for has text for the reference (`/v1/nrsv/dc4.1`: "NRSV has no text for Doctrine and Covenants 4:1.") |
| `unsupported_api_version` | 404 | `v2` or a later API version (`/v2/john3.16`) |
| `service_unavailable` | 503 | The database is not answering. Retry after the `Retry-After` header (30 seconds) |

## Limits

- At most 100 reference pieces, counted as `;`-separated pieces in the URL. A `,` list of verses inside a piece does not add pieces (`ps119.1,3,5` is one), though the response lists each verse as its own `reference` entry (Psalms 119:1; 119:3; 119:5).
- At most 5,000 verses per request, however they are written: `/v1/gen1-ex40` (2,746 verses) is served whole, and `/v1/gen1-deut34` is `reference_too_large`.
- At most 10 versions per request.

## Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` on `api.` and `json.`. `application/yaml`, `text/markdown` and `text/plain` (all `charset=utf-8`) on the other hosts |
| `X-API-Version` | `1` on every response from these hosts, errors included |
| `Cache-Control` | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` on a 200. `public, max-age=300` on a 4xx error. `no-store` on random verses and on 5xx errors |
| `ETag` | A strong ETag over the response body. Send it back in `If-None-Match` and an unchanged response is a `304 Not Modified`. A weak form (`W/"…"`) of the same tag also matches |
| `Retry-After` | `30` on a 503 |
| `Access-Control-Allow-Origin` | `*`, so pages on any site can call the API from the browser |

JSON is compact (not pretty-printed). Responses are compressed when the client accepts gzip.

## Etiquette

- Responses cache well. Look a passage up again instead of storing large copies of the text.
- Call `random` once per request, not in a loop.
- When you quote, give the reference and the version id (`John 3:16, NRSV`). When `copyright` is not `null`, include it.
- Send a `User-Agent` that names your client.
