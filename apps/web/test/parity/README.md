# Parity harness

Compares the live PHP site with the Node app, request by request, and reports per output format.

## Setup

The Node app must run against a full copy of the database. Licensed text stays on your machine.

```sh
# 1. Restore a private dump into a local MySQL (once)
docker run -d --name sg-full -e MYSQL_ROOT_PASSWORD=dev -e MYSQL_DATABASE=sgfull \
  -p 127.0.0.1:3310:3306 -v sg-full-data:/var/lib/mysql mysql:8.0
gunzip -c scripture.guide-YYYY-MM-DD.sql.gz | docker exec -i sg-full mysql -uroot -pdev sgfull

# 2. Run the app against it
MYSQL_HOST=127.0.0.1 MYSQL_PORT=3310 MYSQL_USER=root MYSQL_PASSWORD=dev MYSQL_DATABASE=sgfull \
  PORT=3101 node src/app.js

# 3. Compare
npm run parity -- [--format api,meta] [--only john] [--refresh] [--verbose]
```

## How it compares

- `corpus.mjs` lists the requests: each reference in every per-reference format, plus search, parallel, and AJAX endpoints.
- Live responses are fetched once and cached in `.cache/live/` (gitignored; `PARITY_CACHE` points several worktrees at one cache). `--refresh` refetches.
- The Node app is called at `NODE_BASE` (default `http://127.0.0.1:3101`) with the format's `Host` header, so subdomain routing is exercised.
- `normalize.mjs` canonicalizes both sides: HTML as a tree of tags, sorted attributes and collapsed text (scoped to `#container` plus `<title>` for pages); JSON with sorted keys, with the `api` `output` HTML canonicalized too; text formats compared exactly apart from trailing spaces.
- Differences are written to `.cache/diffs/<format>__<path>.{live,node}.txt`.
- `allow.json` records intentional differences: `{ "<format> <path>": "reason" }`. Allowed entries are reported but do not fail.
