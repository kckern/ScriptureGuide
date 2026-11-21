# scripture.guide/SKILL.md Design

**Status:** agreed with KC, 2026-11-20.

**Goal:** A public skill file at `https://scripture.guide/SKILL.md`. Point any agent or harness at it and the agent can look up, compare, search and quote scripture through the v1 API right away, and can set up its own `/scripture` skill backed by a small CLI it builds for its own environment.

We don't ship a CLI, because we don't know the agent's environment. The file gives a standard command set, the mapping from each command to the API, short samples in several languages and one complete reference CLI.

**Depends on:** the v1 API (`2026-11-20-api-v1-design.md`, plan `2026-11-20-api-v1.md`), plus two changes below: the term "version" in place of "translation", and a new `/v1/versions` endpoint.

## Changes to the v1 API design

### "Version", not "translation"

1830, `printer` and other ids are printings or editions, not translations. The database (`scripture_verses.version`) and the site already say "version". The v1 API uses the same word:

| v1 design | Becomes |
|---|---|
| `translations` (response field) | `versions` |
| `translation` (parallel sides, search results, simple `json.`) | `version` |
| `unknown_translation` | `unknown_version` |
| `scope.translation` (search) | `scope.version` |
| `ApiRepository.translations()` | `ApiRepository.versions()` |
| version object `{id, name, copyright}` | `{id, name, language, copyright}` |

The API's own version is never the bare word "version": it is `/v1/`, `"api": "v1"`, `X-API-Version` and `unsupported_api_version`.

The other session implementing the API plan is at Task 3, so the rename is cheap now. It must be applied to that plan and design doc before more code depends on the old names.

### Versions carry a language

Every version object in every response gains `language`, an ISO 639-1 code:

```json
{ "id": "NRSV", "name": "New Revised Standard Version", "language": "en", "copyright": null }
```

It comes from `scripture_versions.lang` (today `en` ×89, `kr` ×7, `hi` ×1). The database stores Korean as `kr`, which is the country code, so one function, `languageFor(lang)`, maps stored values to ISO codes (`kr` → `ko`). It is the one place to fix as languages are added.

### New endpoint: `GET /v1/versions`

```json
{ "api": "v1", "versions": [{ "id": "NRSV", "name": "New Revised Standard Version", "language": "en", "copyright": null }] }
```

All versions, in database order, built from `ApiRepository.versions()` (which also selects `lang`). It has the same headers as other 200 responses. Without it an agent can't list or check version ids. Add it as a small task after the router exists (API plan Task 12).

## API key protocol

- The key is read from the environment variable `SCRIPTURE_GUIDE_API_KEY` (or a `.env` file the agent's environment loads).
- It is sent as `Authorization: Bearer <key>`.
- The API is open today and ignores the header. Clients send it whenever the variable is set and never fail when it is missing. SKILL.md says this plainly, so a future key is a config change, not a code change.

## The file

**Location:** `apps/web/public/SKILL.md`, served as-is with `Content-Type: text/markdown; charset=utf-8`.

**Frontmatter:** standard skill format, so a harness can install the file unchanged:

```yaml
---
name: scripture
description: Look up, compare, search and quote scripture via the scripture.guide API: the Bible, the Book of Mormon, D&C and Pearl of Great Price, plus the Quran, Bhagavad Gita, Dhammapada and others, in about 100 versions across English, Korean and Hindi. Use when the user asks for a verse, a passage, a comparison of versions, a parallel, a search, or a random verse.
---
```

**Sections, in order:**

1. **Quick use.** Five curl lines that work with no setup: `txt.` for plain text, `md.` for a quote, `api./v1` for JSON, search, random.
2. **Authentication.** The key protocol above.
3. **Set up /scripture (optional, recommended).** Why: build the CLI once, and every later lookup is one short command instead of the model writing request code each time. Steps: check which languages are available, build `scripture` to the spec (port the reference CLI), run the setup checks, then write a local `/scripture` skill that calls the CLI. An agent that skips this uses Quick use.
4. **CLI spec.**
5. **API mapping** and trimmed response shapes.
6. **Core samples** in shell, Python, JavaScript and Rust.
7. **Reference CLI** in Python.
8. **Errors and etiquette.**

## CLI spec

```
scripture get <ref> [-V ID[,ID...]] [-f text|md|json] [--ids] [--html]
scripture parallel <ID/ref> <ID/ref> [-f text|json]
scripture search <terms...> [-V ID] [--volume ot|nt|bom|dc|pgp] [-p N] [-f text|json] [--ids]
scripture random [-V ID[,ID...]] [--volume VOLUME] [-f text|md|json]
scripture versions [-l LANG] [-f text|json]
```

- `-V, --versions` is case-insensitive. A comma list joins with `.` in the URL (`nrsv,kjv` → `nrsv.kjv`). Without it the site's default version is used. `--version` keeps its usual meaning (print the CLI's own version).
- `<ref>` is passed through as the site accepts it (`john3.16`, `"John 3:16-18"`, `john3.16;rom8.28`), URL-encoded and nothing more. The API parses it.
- `-f text` is the default. For `get` and `random` it is the `txt.` host's output, with one labelled block per version. `search` prints `John 3:16  For God so loved…` per line and a `42 results (page 1)` footer. `parallel` prints `L:` / `R:` pairs per row with `—` for an empty side. `versions` prints `NRSV  en  New Revised Standard Version` per line. `-l ko` filters by language on the client.
- Exit codes: `0` ok, `1` API error (message and suggestion to stderr, e.g. `Jonah 3 has 10 verses. Try: jon3.10`), `2` usage error, `3` network error.
- `SCRIPTURE_GUIDE_BASE` overrides the host for testing or a self-hosted copy.
- Left out: config files, local caching, pagination loops, interactive mode.

## API mapping

`A` = `https://api.scripture.guide/v1`.

| CLI | URL |
|---|---|
| `get john3.16` | `https://txt.scripture.guide/john3.16` |
| `get john3.16 -f md` | `https://md.scripture.guide/john3.16` |
| `get john3.16 -V nrsv,kjv -f json` | `A/nrsv.kjv/john3.16` |
| `get john3.16 --ids -f json` | `A/ids/john3.16` |
| `get john3.16 --html -f json` | `A/html/john3.16` |
| `parallel kjv/isa2 lds/2ne12` | `A/kjv/isa2~lds/2ne12` |
| `search loved the world -V nrsv --volume nt -p 2` | `A/search/nrsv/nt/page-2/loved+the+world` |
| `random -V nrsv --volume bom` | `A/nrsv/random/bom` |
| `versions [-l ko]` | `A/versions` (filtered on the client) |

Text mode for `search`, `parallel` and `versions` fetches the JSON and formats it on the client, because the simple hosts don't support those commands. On a 4xx the client reads `error.message` and `error.suggestion` from the JSON when it can, and otherwise prints the one-line body from a simple host.

Response shapes are trimmed copies of the v1 design examples (passage, several versions, parallel, search, error), with the rule that every field is always present with the same type. SKILL.md is checked against the shipped API before release.

## Samples

**Core samples:** each language shows the same three pieces: `request(url)` (GET, `Authorization: Bearer` only when the variable is set, `User-Agent: scripture-cli/1`), error handling for the `{error:{code,message,suggestion}}` body, and one working `get`.

- Shell: `curl -fsS`, `jq` where available.
- Python: `urllib`, stdlib only.
- JavaScript: Node 18+ `fetch`, no dependencies.
- Rust: `ureq` + `serde_json` (the only sample with dependencies, and it says so).

**Reference CLI:** one Python file of about 150 lines, `argparse` + `urllib`, with all five commands. The setup steps say to port it when Python isn't available.

**Setup checks** the agent runs after building:

- `scripture get john3.16` prints text and exits 0.
- `scripture get jon3.16` exits 1 and suggests `jon3.10`.
- `scripture search "loved the world" -V nrsv` lists John 3:16.
- `scripture versions` includes NRSV, and `scripture versions -l ko` lists only Korean versions.

## Errors and etiquette

- The error-code table from the v1 design, each with what the agent should do (`verse_out_of_range`: retry with `suggestion` or tell the user).
- Responses are cached for a day, so repeating a lookup is cheap. `random` is `no-store`: call it once per request, not in a loop.
- Quote with the reference and version id, and pass along `copyright` when it isn't null.

## Rollout

SKILL.md describes the v1 API, which isn't live yet. It ships with the API (plan Task 16), so the public URL never describes endpoints that 404.

## Testing

- A vitest that `GET /SKILL.md` returns 200, `text/markdown`, and frontmatter with `name: scripture`.
- After v1 runs locally: run the reference CLI's setup checks against it with `SCRIPTURE_GUIDE_BASE`.
