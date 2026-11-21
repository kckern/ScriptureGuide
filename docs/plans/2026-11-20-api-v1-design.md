# API v1 Design

**Status:** draft for KC's review, 2026-11-20.

**Goal:** A supported scripture API. `api.scripture.guide` is the configurable, versioned API. `json.`, `yml.`, `md.` and `txt.` return one fixed simple shape each and take no options.

**Background:** `api.scripture.guide` copies the PHP `inc_api.php` response (`apps/web/src/presentation/presenters/formats/api.js`). That API has had no live clients for a long time, so its shape is dropped, not kept at a `/v0` path. v1 is the first schema we support.

Problems with the old response that v1 fixes:

- A missing verse (`/nrsv/jon3.16`; Jonah 3 has 10 verses) or an unknown book (`/nrsv/xyz9.9`) returns 200 with "No scripture verses found." inside the HTML.
- Verse text exists only inside an HTML blob (`output`). `meta` has verse ids but no text, chapter or verse numbers.
- Field types change: `verse_ids` is `[]` or `false`. `meta_only` drops `version`. `config` echoes internal request flags.
- Layout markup leaks into the data: the `ellipses` paragraph, `verse_count`, `last_verse_id`, the packed `parallel="JST*nrsv/john.3.16~jst.john.3.16"` attribute.
- No `Cache-Control` header. Responses have a weak ETag only.
- No copyright or attribution for licensed versions such as NRSV.
- An unknown first path segment is read as a version and falls back to LDS (`/v1/john3.16` today is LDS John 3:16).

**Terms:** a *version* is a scripture version: NRSV, KJV, the 1830 edition, the printer's manuscript. Many are printings or editions, not translations, and the database calls them versions (`scripture_verses.version`). The API's own version is always called the *API version* (`/v1/`, `"api": "v1"`, `X-API-Version`, `unsupported_api_version`), never the bare word "version".

## Hosts

| Host | Purpose | Options |
|---|---|---|
| `api.scripture.guide` | Full structured JSON, versioned | Path segments |
| `json.scripture.guide` | Small JSON | None |
| `yml.` / `yaml.` | Same fields as `json.`, as YAML | None |
| `md.` / `markdown.` | Markdown blockquote with citation | None |
| `txt.` / `plain.` | Verse text only | None |

`plain.` and `markdown.` move to the v1 renderers along with `txt.` and `md.`, and their legacy parity cases are retired. `plainFor` in `formats/plain.js` stays, because `AjaxController` uses it.

Other existing format subdomains (`xml.`, `raw.`, `meta.`, `latex.`, `notes.`, `audio.`, `cover.`, `img.`) are out of scope and stay as they are.

All hosts accept the same `/{version}/{reference}` path as the website, including the version-less form (`/john3.16`). The lookup picks the default version in that case, as the site does.

## `api.scripture.guide`

### URL format

```
/{api version}/{options...}/{version}/{reference}
```

Each leading segment is checked in this order:

1. `v` + digits: the API version. A missing API version means the current one (v1).
2. A reserved option word: an option.
3. A known version abbreviation: the version.
4. Anything left is the reference.

Options come before the reference because a reference can contain `.`, `:`, `-`, `;`, `,` and spaces, so a trailing segment can't be told apart from it.

A unit test checks that no version abbreviation matches an option word or the `v<digits>` pattern.

An unknown version segment is an error, not a fallback. The open question at the end covers how to tell an unknown version from a book name.

### Options (v1)

| Segment | Effect |
|---|---|
| `html` | Adds an `html` field to each passage: a semantic fragment (`<p>`, `<span class="verse" data-verse="16">`, `<h3 class="heading">`), with no layout attributes and no ellipses. v1 fragments don't keep paragraph breaks, because verse text is flattened by `plainText` |
| `ids` | Leaves out verse text and headings: references and verse ids only (replaces `meta_only`) |

Options can be combined (`/v1/html/ids/...` is valid but pointless; the response just has no html). Unknown option words are not possible, because an unknown segment is read as a version or a reference.

### Response

```json
{
  "api": "v1",
  "query": "john3.16-18",
  "versions": [{
    "id": "NRSV",
    "name": "New Revised Standard Version",
    "language": "en",
    "copyright": "…"
  }],
  "reference": {
    "label": "John 3:16–18",
    "book": "John",
    "slug": "john.3.16-18",
    "start": { "chapter": 3, "verse": 16 },
    "end": { "chapter": 3, "verse": 18 }
  },
  "passages": [
    {
      "headings": { "NRSV": "Nicodemus Visits Jesus" },
      "verses": [
        { "id": 26137, "chapter": 3, "verse": 16, "texts": { "NRSV": "“For God so loved the world…" } }
      ]
    }
  ],
  "parallels": [{ "reference": "JST John 3:16", "slug": "jst.john.3.16" }],
  "links": { "web": "https://scripture.guide/nrsv/john.3.16" }
}
```

- A reference with several pieces (`john3.16;rom8.28`) returns `reference` as an array with one entry per piece, and `passages` in the same order. A single piece is still an array of length one, so the type never changes. (The example above shows `reference` as an object for readability; the implementation uses an array.)
- `passages` splits where the text has a heading or where the reference jumps.
- `reference` entries carry `slug`, the site's URL form of the reference (`john.3.16-18`). There is no OSIS book table, so v1 has no `osis` field.
- `parallels` lists the source passages that `scripture_references` links to, without a version. It is `[]` when there are none. A heading is `null` when the passage has none in that version.
- Each version object is `{ id, name, language, copyright }`. `language` is an ISO 639-1 code from `scripture_versions.lang`. The database stores Korean as `kr`, so one function, `languageFor(lang)`, maps stored values to ISO codes (`kr` → `ko`).
- `versions`, `headings` and `texts` have the same shape for one version or several (see "Several versions" below).
- Every field is always present with the same type.

### Errors

Errors use a 4xx status and one shape:

```json
{ "api": "v1", "error": { "code": "verse_out_of_range", "message": "Jonah 3 has 10 verses.", "suggestion": "jon3.10" } }
```

| Code | Status | When |
|---|---|---|
| `unparseable_reference` | 400 | The reference can't be parsed |
| `unknown_book` | 404 | No book matches |
| `chapter_out_of_range` | 404 | The book has fewer chapters |
| `verse_out_of_range` | 404 | The chapter has fewer verses |
| `unknown_version` | 404 | The version segment isn't a known version |
| `unknown_volume` | 404 | The volume after `random` isn't `ot`, `nt`, `bom`, `dc` or `pgp` |
| `unsupported_api_version` | 404 | `v2` and up, before they exist |

`suggestion` is optional and holds a reference that would work (last verse of the chapter, closest book name).

### Headers

- `Content-Type: application/json; charset=utf-8`, compact JSON (not pretty-printed).
- `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` on 200. Errors get `max-age=300`.
- A strong `ETag` over the response body.
- `X-API-Version: 1`.
- `Access-Control-Allow-Origin: *` (unchanged).

## Several versions: `/v1/nrsv.kjv/john3.16`

Same reference, several versions. It uses the site's existing dot syntax.

- `version` becomes `versions`, an array, in every response, including single-version ones, so the type never changes.
- Each verse carries `texts`, keyed by version id. Verse ids are shared across versions, so the verses line up with no extra work.
- Headings differ by version, so `heading` becomes `headings`, also keyed by version id. A missing heading is `null`.
- The site's `*format` suffix (`1830*rebom`: 1830 text in REBOM paragraph layout) is layout only. v1 ignores it.
- A version that lacks a verse (NRSV has no D&C) gets `null` for that verse, not an error. It's an error only when no requested version has any of the verses.

```json
"versions": [{ "id": "NRSV", "name": "…", "language": "en", "copyright": "…" }, { "id": "KJV", "name": "…", "language": "en", "copyright": null }],
"passages": [{
  "headings": { "NRSV": "Nicodemus Visits Jesus", "KJV": null },
  "verses": [{ "id": 26137, "chapter": 3, "verse": 16,
               "texts": { "NRSV": "“For God so loved the world…", "KJV": "For God so loved the world…" } }]
}]
```

The simple hosts print one block per version, in path order, as `plain.` does today.

## Parallel: `/v1/kjv/isa2~lds/2ne12`

Two different references side by side, aligned by `scripture_references` (`ParallelService.alignRows`): Isaiah in the Book of Mormon, JST against KJV, the synoptic gospels. Each side is `{version}/{reference}`, joined by `~`. `~` is a URL-safe character, so it needs no encoding.

Several versions of the same reference stay on the dot syntax above. `~` is for references that differ.

```json
{
  "api": "v1",
  "query": "kjv/isa2~lds/2ne12",
  "left":  { "version": { "id": "KJV", … }, "reference": [ … ] },
  "right": { "version": { "id": "LDS", … }, "reference": [ … ] },
  "rows": [
    { "match": "quote", "significant": true,
      "left":  { "verse_id": 17687, "reference": "Isaiah 2:1", "text": "…" },
      "right": { "verse_id": 32147, "reference": "2 Nephi 12:1", "text": "…" } },
    { "match": "none", "significant": false, "left": null, "right": { … } }
  ]
}
```

- Each side of a row is one verse group or `null`. `ParallelService.build` already joins compound verses (several verses matched to one) into one cell, so a side is an object, not an array.
- `match` is `quote`, `allusion` or `none` (only one side has it), read from the row's CSS class. `significant` is a separate boolean from the `significant` column.
- The `html` option does not apply to parallel.
- Parallel is `api.` only. The simple hosts return a 400 `parallel_not_supported` error.

## Search: `/v1/search/{scope...}/{terms}`

Terms are the last segment. Spaces can be written as `%20`, `+` or `.`, as the site reads them. Scope segments come before the terms and are all optional:

| Segment | Meaning |
|---|---|
| version id (`nrsv`) | Search one version (the site's forced version) |
| volume (`ot`, `nt`, `bom`, `dc`, `pgp`) | Limit to a volume (`volumeRange`) |
| `page-2` | Results page |

```
/v1/search/loved+the+world
/v1/search/nrsv/nt/loved+the+world
/v1/search/nrsv/page-2/loved+the+world
```

```json
{
  "api": "v1",
  "query": "loved the world",
  "scope": { "version": "NRSV", "volume": "nt" },
  "total": 42,
  "truncated": false,
  "page": 1,
  "per_page": 50,
  "results": [
    { "id": 26137, "reference": "John 3:16", "slug": "john.3.16", "version": "NRSV",
      "text": "“For God so loved the world…", "highlights": [[16, 31]] }
  ],
  "links": { "next": null, "web": "https://scripture.guide/nrsv/search/loved%20the%20world" }
}
```

- `highlights` holds `[start, end]` character offsets into `text`, not `<span class="searchterm">` markup, so clients can mark matches however they want.
- `truncated` is `true` when the search stopped early (the MySQL fallback stops after `REQUERY_OVER` = 300 hits on a broad query). `total` is then a lower bound.
- No matches is a 200 with `results: []`, not an error. An empty query is a 400 `empty_query`.
- `ids` drops `text` and `highlights`.
- Search is `api.` only for now. `txt.scripture.guide/search/...` could later list matching references, one per line.

Results are in canon order (book, chapter, verse), as the site returns them.

## Random verse: `/v1/random`

```
/v1/random              any verse, default version
/v1/nrsv/random         one version
/v1/nrsv.kjv/random     several versions, same verse
/v1/random/bom          limited to a volume (ot, nt, bom, dc, pgp)
```

- Picks a verse with the existing `randomVerseId` (weighted by `RANDOM_RANGES`) and returns the normal passage response for it.
- With a version, the pick is limited to verses that version has.
- `Cache-Control: no-store`, so every request gets a new verse.
- The simple hosts support it too: `txt.scripture.guide/random`, `md.scripture.guide/nrsv/random`.

## Version list: `/v1/versions`

```json
{ "api": "v1", "versions": [{ "id": "NRSV", "name": "New Revised Standard Version", "language": "en", "copyright": null }] }
```

- Every version, in the database's priority order, with the same version objects as passage responses.
- `versions` is a reserved path word, like `search` and `random`.
- Same headers as other 200 responses. It lets a client list and check version ids.
- `api.` only. The simple hosts return a 400 `versions_not_supported` error, as they do for search and parallel.

## Simple format hosts

These build from the same lookup as `api.` v1 and render a fixed subset. A bad reference returns the same 4xx status, with a one-line error in the host's format.

**`json.`**

```json
{ "reference": "John 3:16", "version": "NRSV", "text": "“For God so loved the world…", "verses": [{ "chapter": 3, "verse": 16, "text": "…" }], "copyright": "…" }
```

Several pieces join `reference` with `; ` and `text` with a space between verses. `verses` items always carry `chapter`, so the shape is fixed. With several versions the body is a list with one object per version.

**`yml.` / `yaml.`** The same fields as `json.`, as YAML.

**`md.` / `markdown.`**

```markdown
> “For God so loved the world that he gave his only Son, so that everyone who believes in him may not perish but may have eternal life.
>
> — John 3:16 (NRSV)
```

**`txt.` / `plain.`** The verse text only, as `plain.` returns today.

Headers match `api.` (caching, ETag, CORS), with the right content type for each format.

## Code changes

- `src/domain/rules/requestParsing.js`: add `yml`, `yaml`, `md`, `txt` to `SUBDOMAIN_FORMATS`. Point `json` at the new simple JSON format instead of the legacy `api` format. Parse the `v<digits>` segment and option segments for `api.` only.
- New v1 presenter (`presentation/presenters/formats/apiV1.js`) and simple presenters (`json`, `yaml`, `markdown`, `plain`) built from one shared result-to-data function, so `api.` and the simple hosts agree.
- Errors: the lookup reports why a reference failed (book, chapter or verse out of range) instead of returning an empty result.
- Remove the legacy `ApiPresenter`, the `?meta_only` / `?output_only` handling, and the api/json cases in the parity harness (`apps/web/test/parity`) and its allow list.
- `/api/` and `/json/` path prefixes on the main host: `scripture.guide/api/...` and `/json/...` are served by the v1 router as if they came from those subdomains.
- `packages/scripture-guide/docs/api-reference.md` and a new public `docs/API.md` describing v1.

## Infra

- DNS records for `json`, `yml`, `yaml`, `md`, `markdown`, `txt`, `raw`, `xml` (today only `api`, `meta` and `plain` resolve). The hosts sit behind CloudFront, so each new name also needs to be an alternate domain name on the distribution and covered by its certificate.
- Infra lives in the private `kckern/bom-infra` repo.

## Testing

- Unit tests for URL segment parsing: API version, options, version, reference, and each error case.
- Unit test: no version abbreviation collides with an option word or `v<digits>`.
- Presenter tests against fixtures: John 3:16, John 3:16-18, a multi-piece reference, a reference that crosses a heading, a version with no headings, Jonah 3:16 (`verse_out_of_range`), `xyz9.9` (`unknown_book`).
- Header tests: `Cache-Control`, `ETag`, `X-API-Version`, CORS.

## Decisions (KC, 2026-11-20)

1. **Copyright:** a placeholder for now. Licensing work follows separately. Every version object has a `copyright` field, always present, `null` until then. One function, `copyrightFor(versionId)`, returns it, so filling it in later touches one place.
2. **Unknown version vs. book:** a segment followed by another segment is a version. `/v1/foo/john3.16` → `unknown_version`; `/v1/foo3.16` → `unknown_book`.
3. **Search order:** canon order. No relevance ordering.
4. **Random verse:** included in v1 (see "Random verse" above).
