---
name: scripture
description: Look up, compare, search and quote scripture via the scripture.guide API. Covers the Bible, the Book of Mormon, D&C and Pearl of Great Price, plus the Quran, Bhagavad Gita, Dhammapada and others, in about 100 versions across English, Korean and Hindi. Use when the user asks for a verse, a passage, a comparison of versions, a parallel passage, a scripture search or a random verse.
---

# Scripture (scripture.guide)

This file does two things:

1. It tells you how to call the scripture.guide API right now, with nothing but an HTTP client.
2. It tells you how to set up a `/scripture` skill for yourself, backed by a small `scripture` CLI that you write once for your own environment.

The API is free and needs no account. Every URL below works in a browser.

## Quick use

```sh
curl https://txt.scripture.guide/john3.16                  # verse text only
curl https://md.scripture.guide/kjv/ps23                   # Markdown: title, headings, numbered verses
curl https://raw.scripture.guide/nrsv/john3.16             # stored rows, markers kept (JSON)
curl https://api.scripture.guide/v1/nrsv.kjv/john3.16      # full JSON, two versions side by side
curl https://api.scripture.guide/v1/search/nrsv/loved+the+world
curl https://api.scripture.guide/v1/random/bom             # a random Book of Mormon verse
curl https://api.scripture.guide/v1/versions               # every version id, name and language
```

A path is `/{version}/{reference}`, the same as on the website. Leave out the version to get the site's default. References are written the way the site accepts them: `john3.16`, `john3.16-18`, `John 3:16`, `1ne3.7`, `dc4`, and several pieces joined with `;` (`john3.16;rom8.28`). Encode spaces as `%20`.

Hosts: `api.` is the full JSON API (everything below). `json.`, `yml.` (or `yaml.`), `md.` (or `markdown.`) and `txt.` (or `plain.`) return one passage in a small fixed format, and take no options. Their text keeps the passage's layout: a blank line between paragraphs, a line break between poetry lines, and two spaces for each indent (`md.` writes a Markdown document: the reference and version as a `#` title, a `##` per chapter when there are several, section headings, bold verse numbers, poetry lines with hard breaks and em-space indents). The `verses` list of `json.` and `yml.` is plain text per verse. `raw.` takes the same paths and returns the stored rows as a JSON array, one per version per verse: `{ "id", "version", "book", "chapter", "verse", "format", "p", "s", "text" }`, where `text` keeps the database's markup (`¶`, `§`, `/`, `▼` and others) and `format` is `prose`, `poetry`, `indent` or `sense`. Use `api.` for clean text; search, parallel and the version list are on `api.` only. `https://scripture.guide/api/...` is the same as `https://api.scripture.guide/...`. `https://api.scripture.guide/` returns a short index with links to this file, the version list and an example.

## Authentication

The API is open today. A key may be required later. Set it up now so that a future key is a config change, not a code change:

- Read the key from the environment variable `SCRIPTURE_GUIDE_API_KEY` (or from a `.env` file your environment loads).
- When it is set, send it as `Authorization: Bearer <key>`.
- When it is not set, send no header. Never fail because the key is missing.

```sh
# .env
SCRIPTURE_GUIDE_API_KEY=sg_xxxxxxxx
```

Keys are not issued yet, and until they are the API ignores the header. Once keys are live, a key raises your rate limit (see Rate limits).

## Set up /scripture (optional, recommended)

You can use the API with the curl lines above every time. Building a small CLI once is faster and cheaper: each later lookup becomes one short command, and you don't write request code again on every call.

1. **Pick a language** your environment can run: Python 3, Node 18+, a POSIX shell with `curl`, or Rust. Python is the shortest path, since the reference CLI below is Python with no dependencies.
2. **Build `scripture`** to the CLI spec below. Copy the reference CLI, or port it. Put it on your `PATH` (or note its full path).
3. **Run the checks:**
   - `scripture get john3.16` prints the verse and exits 0.
   - `scripture get jon3.16` exits 1 and prints `Jonah 3 has 10 verses. Try: Jonah 3:10` to stderr.
   - `scripture search loved the world -V nrsv` lists John 3:16.
   - `scripture versions -l ko` lists only Korean versions.
4. **Write your own `/scripture` skill** in the place your harness keeps skills (for Claude Code: `~/.claude/skills/scripture/SKILL.md`). Use the frontmatter at the top of this file, then the command table from the CLI spec, and the path to the CLI. Keep it short: it only needs to tell you which command answers which question.

## CLI spec

```
scripture get <ref> [-V ID[,ID...]] [-f text|md|json] [-n] [--ids] [--html] [--verses]
scripture parallel <ID/ref> <ID/ref> [-f text|json]
scripture search <terms...> [-V ID] [--volume ot|nt|bom|dc|pgp] [-p N] [-f text|json] [--ids]
scripture random [-V ID[,ID...]] [--volume ot|nt|bom|dc|pgp] [-f text|md|json] [-n]
scripture versions [-l LANG] [-f text|json]
scripture --version
```

| Command | Answers |
|---|---|
| `get` | "What does John 3:16 say?", "Quote Alma 32:21 in the NRSV", "Show John 3 in KJV and NRSV" |
| `parallel` | "Compare Isaiah 2 with 2 Nephi 12", "JST against KJV for Genesis 1" |
| `search` | "Where does it say 'faith without works'?", "Find 'charity' in the Book of Mormon" |
| `random` | "Give me a verse for today" |
| `versions` | "Which versions are there?", "Which Korean versions are there?" |

Rules:

- `-V, --versions` takes version ids, case-insensitive, comma-separated (`nrsv,kjv`). Without it the site's default version is used. `--version` (singular) prints the CLI's own version.
- `<ref>` and `<terms...>` may be several words (`scripture get John 3:16`). The CLI passes the reference through as written and lets the API parse it.
- `-f text` is the default for every command. It prints plain lines meant for reading: a passage as its paragraphs and poetry lines. `-f json` prints the API response unchanged. `-f md` prints a Markdown blockquote with the citation.
- `-n, --numbers` puts each verse's number where the verse starts (`text` and `md`).
- `--ids` returns references and verse ids only, with no text (for `search`: no text or highlights). `--html` adds a semantic HTML fragment to each passage, and `--verses` the flat verse list (JSON only).
- `--volume` limits `search` and `random` to the Old Testament, New Testament, Book of Mormon, Doctrine and Covenants or Pearl of Great Price.
- `-l, --language` filters `versions` by ISO 639-1 code (`en`, `ko`, `hi`).
- Exit codes: `0` ok, `1` the API returned an error (message and suggestion on stderr), `2` bad arguments, `3` network error.
- On a `429` the CLI waits `Retry-After` seconds and retries once; a second `429` exits `1` with the message.
- `SCRIPTURE_GUIDE_BASE` overrides `https://api.scripture.guide`, for testing or a self-hosted copy.

## API mapping

Every CLI command is one GET to `https://api.scripture.guide/v1/...`. Options come first in the path, then the version, then the reference or terms.

| CLI | URL (after `https://api.scripture.guide`) |
|---|---|
| `get john3.16` | `/v1/john3.16` |
| `get john3.16 -V nrsv,kjv` | `/v1/nrsv.kjv/john3.16` |
| `get "John 3:16"` | `/v1/John%203:16` |
| `get john3.16 --ids` | `/v1/ids/john3.16` |
| `get john3.16 --html -f json` | `/v1/html/john3.16` |
| `get john3.16 --verses -f json` | `/v1/verses/john3.16` |
| `parallel kjv/isa2 lds/2ne12` | `/v1/kjv/isa2~lds/2ne12` |
| `search loved the world` | `/v1/search/loved+the+world` |
| `search loved the world -V nrsv --volume nt -p 2` | `/v1/search/nrsv/nt/page-2/loved+the+world` |
| `random -V lds --volume bom` | `/v1/lds/random/bom` |
| `versions -l ko` | `/v1/versions` (filtered on the client) |

### Passage (`get`, `random`)

`/v1/web/ps1.1-2`:

```json
{
  "api": "v1",
  "query": "ps1.1-2",
  "versions": [{ "id": "WEB", "name": "World English Bible", "language": "en", "copyright": null }],
  "reference": [
    { "label": "Psalms 1:1-2", "book": "Psalms", "slug": "ps.1.1-2",
      "start": { "book": "Psalms", "chapter": 1, "verse": 1 }, "end": { "book": "Psalms", "chapter": 1, "verse": 2 } }
  ],
  "passages": [
    { "headings": { "WEB": null },
      "blocks": { "WEB": [
        { "type": "subtitle", "pieces": [
          { "id": 13941, "verse": 1, "start": true, "runs": [{ "text": "Book", "mark": "smallcaps" }, { "text": " I" }] } ] },
        { "type": "poetry", "style": null, "lines": [
          { "indent": 0, "pieces": [{ "id": 13941, "verse": 1, "start": false, "runs": [{ "text": "Blessed is the man who doesn’t walk in the counsel of the wicked," }] }] },
          { "indent": 1, "pieces": [{ "id": 13941, "verse": 1, "start": false, "runs": [{ "text": "nor stand on the path of sinners," }] }] },
          { "indent": 1, "pieces": [{ "id": 13941, "verse": 1, "start": false, "runs": [{ "text": "nor sit in the seat of scoffers;" }] }] },
          { "indent": 0, "pieces": [{ "id": 13942, "verse": 2, "start": true, "runs": [{ "text": "but his delight is in Yahweh’s law." }] }] },
          { "indent": 1, "pieces": [{ "id": 13942, "verse": 2, "start": false, "runs": [{ "text": "On his law he meditates day and night." }] }] }
        ] }
      ] } }
  ],
  "parallels": [{ "reference": "JST Psalms 1:1-2", "slug": "jst.ps.1.1-2" }],
  "links": { "web": "https://scripture.guide/web/ps.1.1-2" }
}
```

- `query` is the reference as written in the URL.
- `versions`, `reference` and `passages` are always arrays, even for one item.
- `start` and `end` each name their book: a range across books (`mal4.5-matt1.2`) starts in Malachi and ends in Matthew.
- `blocks` and `headings` are keyed by version id. A new passage starts at each heading or where the reference jumps.
- `blocks` is the passage's layout, in order. A block's `type` is:
  - `paragraph`, with `pieces`. `style` is `null`, `flush` (no first-line indent), `linebreak` (a line break inside prose: the paragraph goes on the next line, with no gap), `nogap` or `indent` (an indented block, such as a letter or a quotation). An optional `indent` (1, 2, …) indents the paragraph's first line.
  - `poetry` or `sense` (sense lines), with `lines`: `{ "indent", "pieces" }`. Each new `poetry` block is a new stanza.
  - `subtitle`, with `pieces`: a superscription or division label ("A Psalm of David.").
- A piece is the part of one verse that lies in one paragraph or line: `{ "id", "verse", "start", "runs" }`. `start` is `true` on the piece where the verse begins, which is where to put the verse number. A verse can run across several paragraphs or lines, and a paragraph or line holds several verses.
- `runs` is the text: `{ "text" }`, or `{ "text", "mark" }` where `mark` is `smallcaps`, `small`, `em`, `strong`, `sup`, `strike` or `sans`. Joining the runs of a paragraph or line gives its text with normal spacing: a piece that continues the text before it starts with a space. `strike` is struck text in a manuscript (`printer`); leave it out for a reading text.
- A version that lacks a verse has no piece for it, and `[]` for blocks when it has none of the passage.
- With `verses` (`/v1/verses/web/ps1.1-2`), each passage also has the flat verse list, one plain text per version per verse:

  ```json
  "verses": [
    { "id": 13941, "book": "Psalms", "chapter": 1, "verse": 1,
      "texts": { "WEB": "Book I Blessed is the man who doesn’t walk in the counsel of the wicked, nor stand on the path of sinners, nor sit in the seat of scoffers;" } }
  ]
  ```

  Each verse names its `book`, so a range across books names each verse's own book. A version that lacks a verse has `null` for it.
- With `ids`, passages have only `verses`, with `id`, `book`, `chapter` and `verse` (no `texts`, `blocks` or `headings`).
- With `html`, each passage has `html`, a fragment per version: `<p class="paragraph …">`, `<div class="poetry"><span class="line indent-1">`, `<p class="subtitle">`, the mark tags, and `<span class="verse-num" data-verse="2" data-verse-id="13942">2</span>` where a verse starts.

### Parallel

`/v1/kjv/isa2~lds/2ne12`:

```json
{
  "api": "v1",
  "query": "kjv/isa2~lds/2ne12",
  "left":  { "version": { "id": "KJV", "name": "King James Version", "language": "en", "copyright": null }, "reference": "Isaiah 2" },
  "right": { "version": { "id": "LDS", "name": "Current LDS Scriptures", "language": "en", "copyright": null }, "reference": "2 Nephi 12" },
  "rows": [
    { "match": "quote", "significant": true,
      "left":  { "verse_id": 17687, "reference": "Isaiah 2:1", "text": "The word that Isaiah the son of Amoz saw concerning Judah and Jerusalem." },
      "right": { "verse_id": 32018, "reference": "2 Nephi 12:1", "text": "The word that Isaiah, the son of Amoz, saw concerning Judah and Jerusalem:" } }
  ],
  "links": { "web": "https://scripture.guide/kjv/isa.2~lds/2.ne.12" }
}
```

`left.reference` and `right.reference` are strings. `match` is `quote`, `allusion` or `none`. A side with no matching verse is `null`.

### Search

`/v1/search/nrsv/nt/loved+the+world`:

```json
{
  "api": "v1",
  "query": "loved the world",
  "scope": { "version": "NRSV", "volume": "nt" },
  "total": 14, "truncated": false, "page": 1, "per_page": 50,
  "results": [
    { "id": 26137, "reference": "John 3:16", "slug": "john.3.16", "version": "NRSV",
      "text": "“For God so loved the world that he gave his only Son, …", "highlights": [[12, 27]] }
  ],
  "links": { "next": null, "web": "https://scripture.guide/nrsv/loved.the.world" }
}
```

Results are in canon order, 50 a page. `highlights` are `[start, end]` offsets into `text` in UTF-16 code units (JavaScript string indexes, Python needs `text.encode('utf-16-le')` for characters outside the BMP). Only text with ASCII letters is highlighted: Korean or Hindi results get `highlights: []`. With `ids`, results have no `text` or `highlights`. When `truncated` is true, `total` is a lower bound. No matches is `results: []`, not an error.

### Versions

```json
{ "api": "v1", "versions": [{ "id": "NRSV", "name": "New Revised Standard Version", "language": "en", "copyright": null }] }
```

### Errors

Errors have a 4xx status (or 500/503, below) and this body:

```json
{ "api": "v1", "error": { "code": "verse_out_of_range", "message": "Jonah 3 has 10 verses.", "suggestion": "Jonah 3:10" } }
```

`suggestion` is a reference that would work, written as a label (`Jonah 3:10`, `Alma 63`). It can be sent back as the reference.

| Code | Status | What to do |
|---|---|---|
| `unparseable_reference` | 400 | Rewrite the reference (`john3.16`, `John 3:16`) and retry once. Also when a version has no reference after it (`/v1/nrsv/`) or a parallel side finds no verses |
| `unknown_book` | 404 | Use `suggestion` if there is one, or ask the user |
| `chapter_out_of_range` | 404 | Use `suggestion`, or tell the user the book is shorter |
| `verse_out_of_range` | 404 | Use `suggestion`, or tell the user the chapter is shorter |
| `unknown_version` | 404 | Run `scripture versions` and pick a real id |
| `unknown_volume` | 404 | Use `ot`, `nt`, `bom`, `dc` or `pgp` |
| `not_in_version` | 404 | None of the versions has that text (NRSV has no D&C). Drop `-V` or pick another version |
| `reference_too_large` | 400 | Ask for less (see Limits) |
| `unsupported_api_version` | 404 | Use `/v1/` |
| `empty_query` | 400 | Search needs at least one term |
| `parallel_not_supported` | 400 | Parallel works on `api.` only |
| `search_not_supported` | 400 | Search works on `api.` only |
| `versions_not_supported` | 400 | The version list is on `api.` only |
| `rate_limited` | 429 | Too many requests. Wait for `Retry-After` (seconds) and retry once; the reference CLI does this. Don't retry in a loop |
| `service_unavailable` | 503 | The database is not answering. Wait for `Retry-After` (30 seconds) and retry once |
| `internal_error` | 500 | A server bug. Don't retry in a loop; report it if it repeats |

Apart from `suggestion`, every field is always present with the same type. The options change that on purpose: `ids` leaves only the verse ids, `verses` adds `verses`, and `html` adds `html`.

### Limits

- At most 100 reference pieces, counted as the `;`-separated pieces you write. A `,` verse list inside a piece (`ps119.1,3,5`) is still one piece.
- At most 5,000 verses and 10 versions per request.
- Larger requests return `reference_too_large`. Split them.

### Rate limits

- Requests are counted per caller: by IP address without a key, by key with one. A caller over the limit gets `429` `rate_limited` with `Retry-After`, the seconds to wait before the next request. Wait that long and retry once.
- The `RateLimit-Policy` and `RateLimit` headers appear only on answers that are not cached (a `429`, a 5xx error, `random`): a cached answer goes to every caller, so it can't carry one caller's numbers. `RateLimit-Policy: "anonymous";q=60;w=60` is the limit (60 requests in a 60-second window); `RateLimit: "anonymous";r=12;t=30` is what is left (12 requests) and `t`, the seconds until the limit is fully reset. `Retry-After` is the shorter wait, until the next request is allowed.
- An API key (`SCRIPTURE_GUIDE_API_KEY`, sent as `Authorization: Bearer …`) raises the limit once keys are live.

## Core samples

Each sample does the same three things: one GET with the key header when the key is set, error handling for the error body, and one lookup. They ask for the flat verse list (`verses`), the shortest thing to print; the reference CLI prints from `blocks`. Use one to start your own CLI in a language other than Python.

### Shell

```sh
scripture_get() {  # usage: scripture_get <path>, e.g. scripture_get nrsv/john3.16
  local url="${SCRIPTURE_GUIDE_BASE:-https://api.scripture.guide}/v1/$1" body status
  local auth=()
  [ -n "$SCRIPTURE_GUIDE_API_KEY" ] && auth=(-H "Authorization: Bearer $SCRIPTURE_GUIDE_API_KEY")
  body=$(curl -sS -A 'scripture-cli/1' "${auth[@]}" -w '\n%{http_code}' "$url") || return 3
  status=${body##*$'\n'}; body=${body%$'\n'*}
  if [ "$status" -ge 400 ]; then
    printf '%s\n' "$body" | jq -r '.error | .message + (if .suggestion then " Try: " + .suggestion else "" end)' >&2
    return 1
  fi
  printf '%s\n' "$body"
}

scripture_get verses/nrsv/john3.16 | jq -r '.passages[].verses[] | "\(.chapter):\(.verse) \(.texts | to_entries[0].value)"'
```

Without `jq`, use the text hosts directly: `curl -fsS https://txt.scripture.guide/nrsv/john3.16`.

### Python

```python
import json, os, urllib.error, urllib.request

def scripture(path):
    base = os.environ.get("SCRIPTURE_GUIDE_BASE", "https://api.scripture.guide")
    req = urllib.request.Request(f"{base}/v1/{path}", headers={"User-Agent": "scripture-cli/1"})
    if key := os.environ.get("SCRIPTURE_GUIDE_API_KEY"):
        req.add_header("Authorization", f"Bearer {key}")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        err = json.load(e)["error"]
        raise SystemExit(err["message"] + (f" Try: {err['suggestion']}" if err.get("suggestion") else ""))

data = scripture("verses/nrsv/john3.16")  # verses: the flat verse list
for p in data["passages"]:
    for v in p["verses"]:
        print(f'{v["chapter"]}:{v["verse"]} {v["texts"]["NRSV"]}')
```

### JavaScript (Node 18+)

```js
async function scripture(path) {
  const base = process.env.SCRIPTURE_GUIDE_BASE ?? 'https://api.scripture.guide';
  const headers = { 'User-Agent': 'scripture-cli/1' };
  const key = process.env.SCRIPTURE_GUIDE_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/v1/${path}`, { headers });
  const body = await res.json();
  if (!res.ok) {
    const { message, suggestion } = body.error;
    throw new Error(suggestion ? `${message} Try: ${suggestion}` : message);
  }
  return body;
}

const data = await scripture('verses/nrsv/john3.16'); // verses: the flat verse list
for (const p of data.passages) for (const v of p.verses) console.log(`${v.chapter}:${v.verse} ${v.texts.NRSV}`);
```

### Rust

Needs `ureq = { version = "2", features = ["json"] }` and `serde_json = "1"`.

```rust
use serde_json::Value;

fn scripture(path: &str) -> Result<Value, String> {
    let base = std::env::var("SCRIPTURE_GUIDE_BASE").unwrap_or("https://api.scripture.guide".into());
    let mut req = ureq::get(&format!("{base}/v1/{path}")).set("User-Agent", "scripture-cli/1");
    if let Ok(key) = std::env::var("SCRIPTURE_GUIDE_API_KEY") {
        req = req.set("Authorization", &format!("Bearer {key}"));
    }
    match req.call() {
        Ok(res) => res.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(_, res)) => {
            let body: Value = res.into_json().map_err(|e| e.to_string())?;
            let err = &body["error"];
            let mut msg = err["message"].as_str().unwrap_or("API error").to_string();
            if let Some(s) = err["suggestion"].as_str() { msg += &format!(" Try: {s}"); }
            Err(msg)
        }
        Err(e) => Err(format!("network error: {e}")),
    }
}

fn main() {
    let data = scripture("verses/nrsv/john3.16").unwrap_or_else(|e| { eprintln!("{e}"); std::process::exit(1) });
    for p in data["passages"].as_array().unwrap() {
        for v in p["verses"].as_array().unwrap() {
            println!("{}:{} {}", v["chapter"], v["verse"], v["texts"]["NRSV"].as_str().unwrap_or(""));
        }
    }
}
```

## Reference CLI (Python 3, no dependencies)

Save as `scripture`, `chmod +x`, and put it on your `PATH`.

<!-- reference-cli -->
```python
#!/usr/bin/env python3
"""scripture: a small client for the scripture.guide v1 API (https://scripture.guide/SKILL.md)."""
import argparse, json, os, sys, time, urllib.error, urllib.parse, urllib.request

__version__ = "1.2.0"
BASE = os.environ.get("SCRIPTURE_GUIDE_BASE", "https://api.scripture.guide").rstrip("/")
KEY = os.environ.get("SCRIPTURE_GUIDE_API_KEY")
VOLUMES = ["ot", "nt", "bom", "dc", "pgp"]


class ApiError(Exception):
    pass


def seg(text, safe=".:;,-"):
    return urllib.parse.quote(text, safe=safe)


def retry_after(value):
    try:
        return min(max(int(value), 0), 60)
    except (TypeError, ValueError):
        return 1


def call(*parts):
    url = "/".join([BASE, "v1", *[p for p in parts if p]])
    for attempt in (1, 2):
        req = urllib.request.Request(url, headers={"User-Agent": f"scripture-cli/{__version__}"})
        if KEY:
            req.add_header("Authorization", f"Bearer {KEY}")
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code == 429 and attempt == 1:  # rate_limited: wait as told, then retry once
                time.sleep(retry_after(e.headers.get("Retry-After")))
                continue
            try:
                err = json.loads(body)["error"]
                msg = err["message"] + (f" Try: {err['suggestion']}" if err.get("suggestion") else "")
            except (ValueError, KeyError, TypeError):
                msg = f"HTTP {e.code}: {body.strip()[:200]}"
            raise ApiError(msg)


def label(refs):
    return "; ".join(r["label"] for r in refs)


MD_MARKS = {"em": "*", "strong": "**", "strike": "~~"}


def run_text(run, md):
    text, mark = run["text"], run.get("mark")
    if mark == "strike" and not md:  # struck manuscript text is not part of the reading text
        return ""
    if md and mark in MD_MARKS and text.strip():
        lead, body, trail = text[: len(text) - len(text.lstrip())], text.strip(), text[len(text.rstrip()):]
        return f"{lead}{MD_MARKS[mark]}{body}{MD_MARKS[mark]}{trail}"
    return text


def piece_text(piece, numbers, md):
    text = "".join(run_text(r, md) for r in piece["runs"])
    if numbers and piece["start"]:
        lead = " " if text.startswith(" ") else ""
        text = f'{lead}{piece["verse"]} {text.lstrip()}'
    return text


def render_blocks(blocks, numbers, md):
    """Paragraphs with a blank line between them, poetry lines one per line, indents."""
    out = ""
    for b in blocks:
        lines = b.get("lines") or [{"indent": b.get("indent", 0), "pieces": b["pieces"]}]
        lines = [(l["indent"], " ".join("".join(piece_text(p, numbers, md) for p in l["pieces"]).split())) for l in lines]
        lines = [(i, t) for i, t in lines if t]
        if not lines:
            continue
        if md:
            text, line, gap = "  \n".join("> " + "&emsp;" * i + t for i, t in lines), "  \n", "\n>\n"
        else:
            text, line, gap = "\n".join("  " * i + t for i, t in lines), "\n", "\n\n"
        if out:  # a linebreak paragraph goes on the next line
            out += line if b.get("style") == "linebreak" else gap
        out += text
    return out


def render_passage(data, fmt, numbers=False):
    where = label(data["reference"])
    passages = data["passages"]
    if passages and "blocks" not in passages[0]:  # --ids
        verses = [v for p in passages for v in p["verses"]]
        return "\n".join(f'{where}\t{v["chapter"]}:{v["verse"]}\t{v["id"]}' for v in verses)
    out = []
    for ver in data["versions"]:
        blocks = [b for p in passages for b in p["blocks"].get(ver["id"], [])]
        body = render_blocks(blocks, numbers, fmt == "md")
        if not body:
            continue
        if fmt == "md":
            block = f"{body}\n>\n> — {where} ({ver['id']})"
        else:
            block = f"{where} ({ver['id']})\n{body}"
        if ver.get("copyright"):
            block += f"\n{ver['copyright']}"
        out.append(block)
    return "\n\n".join(out)


def cmd_get(a):
    opts = (["ids"] if a.ids else []) + (["html"] if a.html else []) + (["verses"] if a.verses else [])
    data = call(*opts, a.versions, seg(" ".join(a.ref)))
    return data if a.format == "json" else render_passage(data, a.format, a.numbers)


def cmd_random(a):
    data = call(a.versions, "random", a.volume)
    return data if a.format == "json" else render_passage(data, a.format, a.numbers)


def cmd_parallel(a):
    data = call(f"{seg(a.left, '.:;,-/')}~{seg(a.right, '.:;,-/')}")
    if a.format == "json":
        return data
    cell = lambda c: f'{c["reference"]}  {c["text"]}' if c else "—"
    head = [f'L = {data["left"]["reference"]} ({data["left"]["version"]["id"]})',
            f'R = {data["right"]["reference"]} ({data["right"]["version"]["id"]})', ""]
    rows = [f'L: {cell(r["left"])}\nR: {cell(r["right"])}\n   [{r["match"]}]' for r in data["rows"]]
    return "\n".join(head) + "\n\n".join(rows)


def cmd_search(a):
    terms = "+".join(seg(t) for t in " ".join(a.terms).split())
    opts = ["ids"] if a.ids else []
    page = f"page-{a.page}" if a.page > 1 else None
    data = call(*opts, "search", a.versions, a.volume, page, terms)
    if a.format == "json":
        return data
    lines = [f'{r["reference"]} ({r["version"]})  {r.get("text", "")}'.rstrip() for r in data["results"]]
    more = "+" if data["truncated"] else ""
    lines.append(f'{data["total"]}{more} results (page {data["page"]})'
                 + (f', next: --page {data["page"] + 1}' if data["links"]["next"] else ""))
    return "\n".join(lines)


def cmd_versions(a):
    data = call("versions")
    vs = [v for v in data["versions"] if not a.language or v["language"] == a.language.lower()]
    if a.format == "json":
        return {**data, "versions": vs}
    return "\n".join(f'{v["id"]:<12} {v["language"]}  {v["name"]}' for v in vs)


def version_list(s):
    return ".".join(v.strip().lower() for v in s.split(",") if v.strip()) or None


def main(argv=None):
    p = argparse.ArgumentParser(prog="scripture", description="Scripture from scripture.guide.")
    p.add_argument("--version", action="version", version=f"scripture {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, formats=("text", "json")):
        sp = sub.add_parser(name)
        sp.add_argument("-f", "--format", choices=formats, default="text")
        sp.set_defaults(fn=fn)
        return sp

    g = add("get", cmd_get, ("text", "md", "json"))
    g.add_argument("ref", nargs="+")
    g.add_argument("-V", "--versions", type=version_list)
    g.add_argument("-n", "--numbers", action="store_true", help="verse numbers where each verse starts")
    g.add_argument("--ids", action="store_true")
    g.add_argument("--html", action="store_true")
    g.add_argument("--verses", action="store_true", help="add the flat verse list (json)")

    r = add("random", cmd_random, ("text", "md", "json"))
    r.add_argument("-V", "--versions", type=version_list)
    r.add_argument("--volume", choices=VOLUMES)
    r.add_argument("-n", "--numbers", action="store_true")

    pa = add("parallel", cmd_parallel)
    pa.add_argument("left", help="version/reference, e.g. kjv/isa2")
    pa.add_argument("right", help="version/reference, e.g. lds/2ne12")

    s = add("search", cmd_search)
    s.add_argument("terms", nargs="+")
    s.add_argument("-V", "--versions", type=version_list)
    s.add_argument("--volume", choices=VOLUMES)
    s.add_argument("-p", "--page", type=int, default=1)
    s.add_argument("--ids", action="store_true")

    v = add("versions", cmd_versions)
    v.add_argument("-l", "--language")

    a = p.parse_args(argv)
    try:
        out = a.fn(a)
    except ApiError as e:
        print(f"scripture: {e}", file=sys.stderr)
        return 1
    except OSError as e:  # URLError, timeouts, DNS
        print(f"scripture: network error: {e}", file=sys.stderr)
        return 3
    print(out if isinstance(out, str) else json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

## Etiquette

- Responses are cached (a day in your client, a week at the CDN; errors for 5 minutes), so repeating a lookup is cheap. Look things up instead of quoting from memory. Each response has an `ETag`; send it back as `If-None-Match` to get a `304`.
- `random` and 5xx errors are never cached. Call `random` once per request, not in a loop.
- When you quote, give the reference and the version id (`John 3:16, NRSV`). When a version's `copyright` is not `null`, include it.
- Send a `User-Agent` that names your client (`scripture-cli/1`).
