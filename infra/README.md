# Local stack

Runs scripture.guide on the public-domain seeds: KJV, ASV, WEB, Tyndale (`TYN`), the 1830, 1837, 1840, 1841, 1879 and 1920 Book of Mormon editions, the 1833 Book of Commandments and the 1835 Doctrine and Covenants, with their headings. No credentials or private data are needed.

```sh
docker compose -f infra/docker-compose.yml up -d --build                  # db + web on http://localhost:3000
docker compose -f infra/docker-compose.yml --profile search up -d --build # also Sphinx on 127.0.0.1:9306
docker compose -f infra/docker-compose.yml down -v                        # stop and drop the seeded database
```

| Service | Image | Notes |
|---|---|---|
| `db` | `ghcr.io/kckern/scripture-guide-seed` (built from `infra/seed/Dockerfile`) | MySQL 8 with `data/seeds` loaded on first start; `127.0.0.1:3307`, user `sg` / `dev` |
| `web` | `ghcr.io/kckern/scripture-guide` (built from `apps/web/Dockerfile`) | `127.0.0.1:3000` |
| `sphinx` | `macbre/sphinxsearch:latest` (matches production) | Profile `search`. `sphinx.conf` is a shell script so credentials come from the environment at start-up |

Try `http://localhost:3000/kjv/John.3.16`, `http://localhost:3000/tyn/gen.1.1`, `http://localhost:3000/1830/1-ne.1` or `http://localhost:3000/1833/boc.1.1`.

## Known gaps

- The default version is `LDS`, whose text is not seeded, so unversioned URLs such as `/John.3.16` render an empty passage. Use a version prefix.
- Cross-references, footnotes, facsimiles, and annotations are not seeded (see `data/seeds/SOURCE.md`).
