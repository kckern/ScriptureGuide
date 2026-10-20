# Scripture Guide Node.js Migration - Work Plan

## Current Status

**Foundation complete.** The 5-layer architecture is scaffolded with basic scripture lookup working.

### What's Built
- [x] Project structure (5 layers)
- [x] Package.json with dependencies
- [x] Config/environment handling
- [x] Database connection pool
- [x] Basic repositories (Verse, Version, Heading)
- [x] Domain entities (Verse, Reference, ScriptureResult)
- [x] Domain rules (volumeDetection)
- [x] Value objects (VerseRange)
- [x] ReferenceService (wraps scripture-guide npm)
- [x] ScriptureLookupService
- [x] ScriptureController
- [x] Basic routing
- [x] Middleware (config, subdomain, output, error)
- [x] HtmlPresenter, JsonPresenter
- [x] VerseSerializer
- [x] EJS templates (home, scripture, error)
- [x] Basic CSS
- [x] Docker configuration

---

## Phase 1: Database Verification & Queries
**Goal:** Verify database schema and refine queries

### Tasks
- [ ] Connect to actual database and verify table names
- [ ] Update `VerseRepository` queries to match actual schema
- [ ] Update `VersionRepository` queries to match actual schema
- [ ] Update `HeadingRepository` queries to match actual schema
- [ ] Add query logging for development
- [ ] Test basic lookup end-to-end

### Files to Update
- `src/data/repositories/VerseRepository.js`
- `src/data/repositories/VersionRepository.js`
- `src/data/repositories/HeadingRepository.js`
- `src/data/db/connection.js`

### Verification
```bash
npm run dev
# Visit http://localhost:3000/John3:16
# Should display verse from database
```

---

## Phase 2: Complete Domain Layer
**Goal:** Add remaining entities and business rules

### Tasks
- [ ] Create `Book.js` entity
- [ ] Create `Chapter.js` entity
- [ ] Create `Volume.js` entity
- [ ] Create `Version.js` entity
- [ ] Create `Heading.js` entity
- [ ] Create `Annotation.js` entity
- [ ] Create `Facsimile.js` entity
- [ ] Implement `chapterDetection.js` rule
- [ ] Implement `bookDetection.js` rule
- [ ] Add `VerseId.js` value object with validation
- [ ] Write unit tests for domain rules

### Files to Create
```
src/domain/entities/Book.js
src/domain/entities/Chapter.js
src/domain/entities/Volume.js
src/domain/entities/Version.js
src/domain/entities/Heading.js
src/domain/entities/Annotation.js
src/domain/entities/Facsimile.js
src/domain/rules/chapterDetection.js
src/domain/rules/bookDetection.js
src/domain/valueObjects/VerseId.js
tests/unit/domain/rules.test.js
tests/unit/domain/entities.test.js
```

---

## Phase 3: Complete Data Layer
**Goal:** Add all repositories and external API clients

### Tasks
- [ ] Create `AnnotationRepository.js`
- [ ] Create `FacsimileRepository.js`
- [ ] Create `PreferenceRepository.js`
- [ ] Create `ParallelRepository.js` (cross-references)
- [ ] Create `src/data/external/sphinx.js` (search client)
- [ ] Create `src/data/external/covers.js` (cover images)
- [ ] Add query files in `src/data/db/queries/`
- [ ] Write integration tests for repositories

### Files to Create
```
src/data/repositories/AnnotationRepository.js
src/data/repositories/FacsimileRepository.js
src/data/repositories/PreferenceRepository.js
src/data/repositories/ParallelRepository.js
src/data/external/sphinx.js
src/data/external/covers.js
src/data/db/queries/verses.js
src/data/db/queries/annotations.js
src/data/db/queries/parallels.js
tests/integration/repositories.test.js
```

---

## Phase 4: Complete Service Layer
**Goal:** Implement all business logic services

### Tasks
- [ ] Create `SearchService.js`
- [ ] Create `ParallelService.js`
- [ ] Create `AnnotationService.js`
- [ ] Create `FacsimileService.js`
- [ ] Create `PreferenceService.js`
- [ ] Create `AudioService.js`
- [ ] Add version detection to `ScriptureLookupService`
- [ ] Add parallel passage detection
- [ ] Write service unit tests (mock repositories)

### Files to Create
```
src/services/SearchService.js
src/services/ParallelService.js
src/services/AnnotationService.js
src/services/FacsimileService.js
src/services/PreferenceService.js
src/services/AudioService.js
tests/unit/services/ScriptureLookupService.test.js
tests/unit/services/SearchService.test.js
```

---

## Phase 5: Search Functionality
**Goal:** Full-text search via Sphinx (or Meilisearch)

### Tasks
- [ ] Implement Sphinx API client
- [ ] Create `SearchController.js`
- [ ] Create search routes (`/search/:query`)
- [ ] Create `SearchResult` entity
- [ ] Create `SearchResultSerializer.js`
- [ ] Create `search.ejs` template
- [ ] Add search highlighting
- [ ] Group results by volume
- [ ] Add search to home page

### Files to Create/Update
```
src/data/external/sphinx.js
src/services/SearchService.js
src/domain/entities/SearchResult.js
src/app/controllers/SearchController.js
src/app/routes/search.js
src/presentation/serializers/SearchResultSerializer.js
src/presentation/views/search.ejs
src/presentation/views/home.ejs (update)
src/app/routes/index.js (update)
```

---

## Phase 6: Output Format Presenters
**Goal:** All output formats working

### Tasks
- [ ] Implement `XmlPresenter.js`
- [ ] Implement `PlainPresenter.js`
- [ ] Implement `MarkdownPresenter.js`
- [ ] Implement `LatexPresenter.js`
- [ ] Implement `RawPresenter.js`
- [ ] Update `outputMiddleware` with all presenters
- [ ] Add format-specific routes (`/api/*`, `/xml/*`, etc.)
- [ ] Test all output formats

### Files to Create
```
src/presentation/presenters/XmlPresenter.js
src/presentation/presenters/PlainPresenter.js
src/presentation/presenters/MarkdownPresenter.js
src/presentation/presenters/LatexPresenter.js
src/presentation/presenters/RawPresenter.js
```

### API Response Format
Ensure JSON matches existing PHP API:
```json
{
  "reference": "John 3:16",
  "version": "KJV",
  "verses": [{ "id": 26137, "verse": 16, "text": "..." }],
  "meta": { "book": "John", "chapter": 3, "volume": "NT" }
}
```

---

## Phase 7: Parallel Text Comparison
**Goal:** Side-by-side version comparison

### Tasks
- [ ] Create `ParallelController.js`
- [ ] Create parallel routes (`/parallel/:refs`)
- [ ] Implement parallel passage detection in service
- [ ] Create `parallel.ejs` template
- [ ] Add diff highlighting (port `diff.js`)
- [ ] Create `parallel.css`
- [ ] Support `~` separator in references (e.g., `KJV/John1~MSG/John1`)

### Files to Create
```
src/app/controllers/ParallelController.js
src/app/routes/parallel.js
src/presentation/views/parallel.ejs
public/css/parallel.css
public/js/parallel.js
```

---

## Phase 8: User Preferences & Sessions
**Goal:** Persistent user settings

### Tasks
- [ ] Create `PreferenceRepository.js` (if not done)
- [ ] Create `PreferenceService.js` (if not done)
- [ ] Create `SettingsController.js`
- [ ] Create settings routes (`/settings`, `/save`)
- [ ] Create `settings.ejs` template
- [ ] Add preference middleware to load user prefs
- [ ] Store version preferences per volume
- [ ] Store UI preferences (verse numbers, annotations, etc.)
- [ ] Add Google OAuth (optional)

### Files to Create
```
src/app/controllers/SettingsController.js
src/app/routes/settings.js
src/app/middleware/preferences.js
src/presentation/views/settings.ejs
src/presentation/views/partials/settings-panel.ejs
```

---

## Phase 9: Annotations System
**Goal:** Display verse annotations from sources

### Tasks
- [ ] Complete `AnnotationRepository.js`
- [ ] Complete `AnnotationService.js`
- [ ] Create `NotesController.js`
- [ ] Create notes routes (`/notes/:reference`)
- [ ] Create `notes.ejs` template
- [ ] Add annotation indicators to verse display
- [ ] Create annotation popup/modal
- [ ] Style annotation sources

### Files to Create
```
src/app/controllers/NotesController.js
src/app/routes/notes.js
src/presentation/views/notes.ejs
src/presentation/views/partials/annotation.ejs
public/css/annotations.css
public/js/annotations.js
```

---

## Phase 10: Facsimile Viewer
**Goal:** View manuscript images with coordinate mapping

### Tasks
- [ ] Complete `FacsimileRepository.js`
- [ ] Complete `FacsimileService.js`
- [ ] Create `FacsimileController.js`
- [ ] Create fax routes (`/fax/:reference`)
- [ ] Create `fax.ejs` template
- [ ] Implement coordinate-to-image mapping
- [ ] Add image cropping support
- [ ] Create scrollable viewer
- [ ] Port `fax.js` and `fax.css`

### Files to Create
```
src/app/controllers/FacsimileController.js
src/app/routes/fax.js
src/presentation/views/fax.ejs
public/css/fax.css
public/js/fax.js
```

---

## Phase 11: Audio Support
**Goal:** MP3 audio playback and generation

### Tasks
- [ ] Complete `AudioService.js` with ffmpeg
- [ ] Create `AudioPresenter.js`
- [ ] Create audio routes (`/audio/:reference`)
- [ ] Implement MP3 concatenation for verse ranges
- [ ] Add ID3 metadata tagging
- [ ] Create audio player UI component
- [ ] Support multiple voice options
- [ ] Port `audio.js`

### Files to Create/Update
```
src/services/AudioService.js (complete)
src/presentation/presenters/AudioPresenter.js
src/app/routes/audio.js
src/presentation/views/partials/audio-player.ejs
public/js/audio.js
```

---

## Phase 12: Hub/Dashboard
**Goal:** User dashboard with reading history

### Tasks
- [ ] Create `HubController.js`
- [ ] Create hub routes (`/hub`)
- [ ] Create `hub.ejs` template
- [ ] Display recent lookups
- [ ] Show bookmarks (if implemented)
- [ ] Quick access to volumes

### Files to Create
```
src/app/controllers/HubController.js
src/app/routes/hub.js
src/presentation/views/hub.ejs
```

---

## Phase 13: Port Static Assets
**Goal:** Migrate CSS, JS, fonts, images from PHP version

### Tasks
- [ ] Copy CSS files from PHP `css/` directory
- [ ] Copy JS files from PHP `js/` directory
- [ ] Copy webfonts from PHP `webfont/` directory
- [ ] Copy images from PHP `img/` directory
- [ ] Update CSS paths if needed
- [ ] Update JS to work with new DOM structure
- [ ] Remove jQuery dependency (optional)

### Files to Copy
```
From: ../css/ → public/css/
From: ../js/ → public/js/
From: ../webfont/ → public/webfont/
From: ../img/ → public/img/
```

---

## Phase 14: Testing
**Goal:** Comprehensive test coverage

### Tasks
- [ ] Set up Vitest configuration
- [ ] Write domain layer unit tests
- [ ] Write service layer unit tests (mock repos)
- [ ] Write serializer unit tests
- [ ] Write presenter unit tests
- [ ] Write repository integration tests
- [ ] Write route integration tests (supertest)
- [ ] Add test database seeding
- [ ] Set up CI pipeline

### Files to Create
```
vitest.config.js
tests/setup.js
tests/fixtures/verses.js
tests/unit/domain/entities.test.js
tests/unit/domain/rules.test.js
tests/unit/domain/valueObjects.test.js
tests/unit/services/*.test.js
tests/unit/serializers/*.test.js
tests/integration/routes.test.js
tests/integration/repositories.test.js
```

---

## Phase 15: Production Hardening
**Goal:** Ready for production deployment

### Tasks
- [ ] Add comprehensive error handling
- [ ] Add request validation (express-validator)
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Add request logging (structured JSON)
- [ ] Add health check endpoint (done)
- [ ] Add metrics endpoint
- [ ] Configure Helmet CSP properly
- [ ] Add graceful shutdown handling
- [ ] Optimize database queries (indexes, explain)
- [ ] Add response caching headers
- [ ] Configure EJS caching for production

### Files to Create/Update
```
src/app/middleware/validation.js
src/app/middleware/rateLimit.js
src/app/middleware/cors.js
src/app.js (update)
```

---

## Phase 16: Legacy URL Support
**Goal:** Backward compatibility with PHP URLs

### Tasks
- [ ] Map subdomain routes to path routes
- [ ] Add redirects for old URL patterns
- [ ] Support version prefix subdomains
- [ ] Test all legacy URL formats
- [ ] Create nginx config for subdomain routing

### URL Mappings
| Legacy | New |
|--------|-----|
| `api.scripture.guide/john1` | `/api/john1` |
| `esv.scripture.guide/john1` | `/john1?version=ESV` |
| `audio.scripture.guide/john1` | `/audio/john1` |
| `fax.scripture.guide/john1` | `/fax/john1` |

### Files to Create
```
docker/nginx.conf
src/app/middleware/legacyRedirects.js
```

---

## Phase 17: Docker & Deployment
**Goal:** Production-ready containers

### Tasks
- [ ] Optimize Dockerfile (multi-stage build)
- [ ] Add nginx reverse proxy container
- [ ] Configure SSL/TLS (Let's Encrypt)
- [ ] Add database initialization script
- [ ] Create production docker-compose
- [ ] Add container health checks
- [ ] Configure logging drivers
- [ ] Document deployment process

### Files to Create/Update
```
docker/Dockerfile (optimize)
docker/docker-compose.yml (update)
docker/docker-compose.prod.yml
docker/nginx.conf
docker/init.sql
DEPLOYMENT.md
```

---

## Phase 18: Documentation
**Goal:** Complete project documentation

### Tasks
- [ ] Update README.md with setup instructions
- [ ] Document API endpoints
- [ ] Document environment variables
- [ ] Document architecture decisions
- [ ] Add JSDoc comments to services
- [ ] Create contributing guidelines

### Files to Create
```
README.md
docs/API.md
docs/ARCHITECTURE.md
docs/CONTRIBUTING.md
```

---

## Phase 19: Future Enhancements

### Search Modernization
- [ ] Evaluate Meilisearch vs Sphinx
- [ ] Create search indexing script
- [ ] Migrate to Meilisearch
- [ ] Add typo tolerance
- [ ] Add search suggestions

### Performance
- [ ] Add Redis caching layer
- [ ] Implement response caching
- [ ] Add CDN for static assets
- [ ] Optimize database queries

### Features
- [ ] Bookmarking system
- [ ] Reading plans
- [ ] Cross-reference explorer
- [ ] Mobile-responsive design improvements
- [ ] PWA support

---

## Quick Reference

### Run Development
```bash
cd scripture-guide-js
npm install
cp .env.example .env
# Edit .env with database credentials
npm run dev
```

### Run Tests
```bash
npm test
npm run test:watch
```

### Build Docker
```bash
cd docker
docker-compose up --build
```

### File Counts by Layer
| Layer | Files | Status |
|-------|-------|--------|
| Config | 1 | Done |
| Data | 4 | Partial |
| Domain | 7 | Partial |
| Services | 2 | Partial |
| Application | 6 | Done |
| Presentation | 10 | Partial |
| **Total** | **30** | **~50%** |

---

## Priority Order

1. **Phase 1** - Database verification (required to test anything)
2. **Phase 5** - Search (high-value feature)
3. **Phase 6** - Output formats (API compatibility)
4. **Phase 13** - Port assets (visual parity)
5. **Phase 14** - Testing (confidence for changes)
6. **Phase 7** - Parallel text (unique feature)
7. Remaining phases as needed

---

*Last updated: January 2026*
