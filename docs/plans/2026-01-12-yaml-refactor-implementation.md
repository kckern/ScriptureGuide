# YAML Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor data loading from archived MJS files to YAML-based multi-canon architecture with build-time compilation.

**Architecture:** YAML source files compile to JS modules at build time. A data-loader module handles lazy loading and caching. Canon priority: explicit → LDS default → auto-detect fallback.

**Tech Stack:** Node.js, js-yaml (devDependency), esbuild (existing bundler)

---

## Phase 1: Build Pipeline

### Task 1.1: Create YAML Compiler Script

**Files:**
- Create: `build/compile-yaml.mjs`

**Step 1: Write the compiler script**

```javascript
// build/compile-yaml.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const OUT_DIR = join(ROOT, 'src', 'data');

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function compileYaml(inputPath, outputPath) {
  const content = readFileSync(inputPath, 'utf8');
  const data = yaml.load(content);
  const js = `export default ${JSON.stringify(data, null, 2)};`;
  ensureDir(dirname(outputPath));
  writeFileSync(outputPath, js);
  console.log(`Compiled: ${inputPath} → ${outputPath}`);
}

function compileDirectory(inputDir, outputDir) {
  if (!existsSync(inputDir)) return;

  for (const entry of readdirSync(inputDir, { withFileTypes: true })) {
    const inputPath = join(inputDir, entry.name);

    if (entry.isDirectory()) {
      compileDirectory(inputPath, join(outputDir, entry.name));
    } else if (entry.name.endsWith('.yml')) {
      const outName = entry.name.replace(/^_/, '').replace('.yml', '.mjs');
      compileYaml(inputPath, join(outputDir, outName));
    }
  }
}

// Compile canons and shared
console.log('Compiling YAML to JS...\n');
compileDirectory(join(DATA_DIR, 'canons'), join(OUT_DIR, 'canons'));
compileDirectory(join(DATA_DIR, 'shared'), join(OUT_DIR, 'shared'));

// Compile COC mapping from archive (special case)
const cocMappingPath = join(ROOT, '_archive', 'data', 'coc-mapping.mjs');
if (existsSync(cocMappingPath)) {
  const mappingContent = readFileSync(cocMappingPath, 'utf8');
  ensureDir(join(OUT_DIR, 'canons', 'coc'));
  writeFileSync(join(OUT_DIR, 'canons', 'coc', 'mapping.mjs'), mappingContent);
  console.log(`Copied: coc-mapping.mjs → src/data/canons/coc/mapping.mjs`);
}

console.log('\nDone!');
```

**Step 2: Run the compiler**

Run: `node build/compile-yaml.mjs`
Expected: Creates `src/data/canons/` and `src/data/shared/` with compiled JS files

**Step 3: Verify output structure**

Run: `find src/data -name "*.mjs" | sort`
Expected:
```
src/data/canons/bible/en.mjs
src/data/canons/bible/structure.mjs
src/data/canons/coc/en.mjs
src/data/canons/coc/mapping.mjs
src/data/canons/coc/structure.mjs
src/data/canons/lds/en.mjs
src/data/canons/lds/structure.mjs
src/data/shared/en.mjs
src/data/shared/ko.mjs
```

**Step 4: Add src/data to gitignore**

Append to `.gitignore`:
```
src/data/
```

**Step 5: Commit**

```bash
git add build/compile-yaml.mjs .gitignore
git commit -m "feat: add YAML to JS compiler script"
```

---

### Task 1.2: Integrate Compiler into Build

**Files:**
- Modify: `build/build.mjs`
- Modify: `package.json`

**Step 1: Read current build.mjs**

Check the current build script structure.

**Step 2: Add compile-yaml call to build**

Add at the top of build.mjs (before bundling):
```javascript
// Run YAML compilation first
import './compile-yaml.mjs';
```

**Step 3: Add compile script to package.json**

Add to scripts:
```json
"compile": "node build/compile-yaml.mjs",
"prebuild": "npm run compile"
```

**Step 4: Test build**

Run: `npm run build`
Expected: Compiles YAML, then bundles to dist/

**Step 5: Commit**

```bash
git add build/build.mjs package.json
git commit -m "feat: integrate YAML compiler into build pipeline"
```

---

## Phase 2: Data Loader Module

### Task 2.1: Create Data Loader with Tests

**Files:**
- Create: `src/lib/data-loader.mjs`
- Create: `test/unit/data-loader.test.js`

**Step 1: Write failing tests**

```javascript
// test/unit/data-loader.test.js
import {
  getCanonStructure,
  getLanguageData,
  clearDataCache
} from '../../src/lib/data-loader.mjs';

describe('Data Loader', () => {
  beforeEach(() => {
    clearDataCache();
  });

  describe('getCanonStructure', () => {
    test('returns bible structure', () => {
      const structure = getCanonStructure('bible');
      expect(structure.canon).toBe('bible');
      expect(structure.books.length).toBe(66);
    });

    test('returns lds structure with bible books merged', () => {
      const structure = getCanonStructure('lds');
      expect(structure.canon).toBe('lds');
      expect(structure.extends).toBe('bible');
      // LDS has 66 bible + 21 lds = 87 books
      expect(structure.books.length).toBe(87);
    });

    test('returns coc structure with bible books merged', () => {
      const structure = getCanonStructure('coc');
      expect(structure.canon).toBe('coc');
      expect(structure.extends).toBe('bible');
      // COC has 66 bible + 15 coc = 81 books
      expect(structure.books.length).toBe(81);
    });
  });

  describe('getLanguageData', () => {
    test('returns merged english data for bible', () => {
      const data = getLanguageData('bible', 'en');
      expect(data.books.genesis).toBeDefined();
      expect(data.books.genesis.name).toBe('Genesis');
      expect(data.delimiters).toBeDefined(); // from shared
    });

    test('returns merged english data for lds', () => {
      const data = getLanguageData('lds', 'en');
      // Has bible books
      expect(data.books.genesis.name).toBe('Genesis');
      // Has lds books
      expect(data.books['1_nephi'].name).toBe('1 Nephi');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:jest -- test/unit/data-loader.test.js`
Expected: FAIL - module not found

**Step 3: Write data-loader implementation**

```javascript
// src/lib/data-loader.mjs
import { deepMerge } from './deep-merge.mjs';

// Eagerly loaded structures
import bibleStructure from '../data/canons/bible/structure.mjs';
import ldsStructure from '../data/canons/lds/structure.mjs';

// Eagerly loaded language data
import sharedEn from '../data/shared/en.mjs';
import bibleEn from '../data/canons/bible/en.mjs';
import ldsEn from '../data/canons/lds/en.mjs';

// Lazy loaded
let cocStructure = null;
let cocEn = null;
let cocMapping = null;
let sharedKo = null;

// Caches
const structureCache = {};
const languageCache = {};

export function clearDataCache() {
  Object.keys(structureCache).forEach(k => delete structureCache[k]);
  Object.keys(languageCache).forEach(k => delete languageCache[k]);
}

function loadCocStructure() {
  if (!cocStructure) {
    // Dynamic import would be async, but for build-time compiled files
    // we can use require-style import
    cocStructure = require('../data/canons/coc/structure.mjs').default;
  }
  return cocStructure;
}

function mergeWithParent(structure) {
  if (!structure.extends) return structure;

  const parent = getCanonStructure(structure.extends);
  return {
    ...structure,
    books: [...parent.books, ...structure.books]
  };
}

export function getCanonStructure(canon) {
  if (structureCache[canon]) return structureCache[canon];

  let structure;
  switch (canon) {
    case 'bible':
      structure = bibleStructure;
      break;
    case 'lds':
      structure = mergeWithParent(ldsStructure);
      break;
    case 'coc':
      structure = mergeWithParent(loadCocStructure());
      break;
    default:
      throw new Error(`Unknown canon: ${canon}`);
  }

  structureCache[canon] = structure;
  return structure;
}

function loadSharedLang(lang) {
  switch (lang) {
    case 'en':
      return sharedEn;
    case 'ko':
      if (!sharedKo) {
        sharedKo = require('../data/shared/ko.mjs').default;
      }
      return sharedKo;
    default:
      return sharedEn; // fallback
  }
}

function loadCanonLang(canon, lang) {
  if (lang !== 'en') return null; // Only EN implemented for now

  switch (canon) {
    case 'bible':
      return bibleEn;
    case 'lds':
      return ldsEn;
    case 'coc':
      if (!cocEn) {
        cocEn = require('../data/canons/coc/en.mjs').default;
      }
      return cocEn;
    default:
      return null;
  }
}

export function getLanguageData(canon, lang) {
  const cacheKey = `${canon}:${lang}`;
  if (languageCache[cacheKey]) return languageCache[cacheKey];

  const shared = loadSharedLang(lang);
  const canonLang = loadCanonLang(canon, lang);

  // For canons that extend others, merge parent language data
  const structure = getCanonStructure(canon);
  let parentLang = null;
  if (structure.extends) {
    parentLang = loadCanonLang(structure.extends, lang);
  }

  // Merge: shared + parent canon + this canon
  const merged = deepMerge(shared, parentLang || {}, canonLang || {});

  // Merge books from parent if extending
  if (parentLang?.books && canonLang?.books) {
    merged.books = { ...parentLang.books, ...canonLang.books };
  }

  languageCache[cacheKey] = merged;
  return merged;
}

export async function getCocMapping() {
  if (!cocMapping) {
    const module = await import('../data/canons/coc/mapping.mjs');
    cocMapping = module.default;
  }
  return cocMapping;
}
```

**Step 4: Run tests**

Run: `npm run test:jest -- test/unit/data-loader.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/data-loader.mjs test/unit/data-loader.test.js
git commit -m "feat: add data-loader module with lazy loading"
```

---

## Phase 3: Canon Converter

### Task 3.1: Rename and Refactor scriptcanon.mjs

**Files:**
- Rename: `src/scriptcanon.mjs` → `src/canon-converter.mjs`
- Modify: `src/canon-converter.mjs`
- Modify: `test/unit/` (add tests)

**Step 1: Rename file**

```bash
git mv src/scriptcanon.mjs src/canon-converter.mjs
```

**Step 2: Write tests for generic convertCanon**

```javascript
// test/unit/canon-converter.test.js
import { convertCanon, detectCanon } from '../../src/canon-converter.mjs';

describe('Canon Converter', () => {
  describe('detectCanon', () => {
    test('detects LDS from integer', () => {
      expect(detectCanon(1000)).toBe('lds');
    });

    test('detects COC from C-prefixed string', () => {
      expect(detectCanon('C00001')).toBe('coc');
    });
  });

  describe('convertCanon', () => {
    test('converts COC to LDS', async () => {
      const result = await convertCanon(['C00001', 'C00002'], { from: 'coc', to: 'lds' });
      expect(result.verse_ids).toBeDefined();
      expect(Array.isArray(result.verse_ids)).toBe(true);
    });

    test('converts LDS to COC', async () => {
      const result = await convertCanon([31103, 31104], { from: 'lds', to: 'coc' });
      expect(result.verse_ids).toBeDefined();
    });

    test('returns same IDs when from === to', async () => {
      const result = await convertCanon([1, 2, 3], { from: 'lds', to: 'lds' });
      expect(result.verse_ids).toEqual([1, 2, 3]);
    });
  });
});
```

**Step 3: Refactor canon-converter.mjs**

```javascript
// src/canon-converter.mjs
import { getCocMapping } from './lib/data-loader.mjs';

export const detectCanon = (verseId) => {
  if (typeof verseId === 'string' && /^C\d+$/.test(verseId)) return 'coc';
  if (typeof verseId === 'number') return 'lds';
  if (typeof verseId === 'string' && /^\d+$/.test(verseId)) return 'lds';
  return null;
};

export const formatCocId = (num) => `C${String(num).padStart(5, '0')}`;

export const parseCocId = (id) => parseInt(id.slice(1), 10);

export async function convertCanon(verseIds, { from, to }) {
  // Same canon, no conversion needed
  if (from === to) {
    return { verse_ids: verseIds, partial: false };
  }

  const mapping = await getCocMapping();
  const result = { verse_ids: [], partial: false };

  if (from === 'coc' && to === 'lds') {
    for (const id of verseIds) {
      const num = typeof id === 'string' ? parseCocId(id) : id;
      const mapped = mapping.cocToLds[num];
      if (mapped) {
        result.verse_ids.push(...mapped.lds);
        if (mapped.partial) result.partial = true;
      }
    }
  } else if (from === 'lds' && to === 'coc') {
    for (const id of verseIds) {
      const mapped = mapping.ldsToCoc[id];
      if (mapped) {
        result.verse_ids.push(...mapped.coc);
        if (mapped.partial) result.partial = true;
      }
    }
  }

  return result;
}

// Keep old exports for backward compatibility during transition
export const convertToLds = async (cocIds) => convertCanon(cocIds, { from: 'coc', to: 'lds' });
export const convertToCoc = async (ldsIds) => convertCanon(ldsIds, { from: 'lds', to: 'coc' });
```

**Step 4: Run tests**

Run: `npm run test:jest -- test/unit/canon-converter.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/canon-converter.mjs test/unit/canon-converter.test.js
git commit -m "refactor: rename scriptcanon to canon-converter with generic API"
```

---

## Phase 4: Update Main Entry Point

### Task 4.1: Add Canon Config to scriptures.mjs

**Files:**
- Modify: `src/scriptures.mjs`

**Step 1: Update imports**

Replace old imports:
```javascript
// OLD - remove these
import raw_index_orig from '../data/scriptdata.mjs';
import raw_regex_orig from '../data/scriptregex.mjs';
import raw_lang from '../data/scriptlang.mjs';
import cocData from '../data/coc.mjs';

// NEW - add these
import { getCanonStructure, getLanguageData } from './lib/data-loader.mjs';
```

**Step 2: Add canon state management**

```javascript
// Add after language state management
let defaultCanon = 'lds';

export const setCanon = (canon) => {
  defaultCanon = canon;
};

export const getCanon = () => defaultCanon;

const getEffectiveCanon = (explicitCanon) => {
  return explicitCanon || defaultCanon || 'lds';
};
```

**Step 3: Update lookupReference to accept canon**

Modify the config parameter handling:
```javascript
const lookupReference = function(query, language = null, lookupConfig = {}) {
  const { canon: explicitCanon, ...restConfig } = lookupConfig;
  const effectiveCanon = getEffectiveCanon(explicitCanon);
  // ... rest of implementation uses effectiveCanon
};
```

**Step 4: Update buildIndexes to use data-loader**

Replace direct data access with:
```javascript
const structure = getCanonStructure(effectiveCanon);
const langData = getLanguageData(effectiveCanon, effectiveLanguage);
```

**Step 5: Run full test suite**

Run: `npm run test:jest`
Expected: Previously failing tests now pass

**Step 6: Commit**

```bash
git add src/scriptures.mjs
git commit -m "feat: integrate data-loader and add canon support to scriptures.mjs"
```

---

### Task 4.2: Implement Auto-Detect Fallback

**Files:**
- Modify: `src/scriptures.mjs`
- Create: `test/integration/auto-detect-canon.test.js`

**Step 1: Write failing test**

```javascript
// test/integration/auto-detect-canon.test.js
import { lookupReference } from '../../src/scriptures.mjs';

describe('Auto-detect Canon Fallback', () => {
  test('detects COC when verse number exceeds LDS', () => {
    // LDS 1 Nephi 3 has 31 verses, COC has 255
    const result = lookupReference('1 Nephi 3:150');
    expect(result.canon).toBe('coc');
    expect(result.verse_ids.length).toBeGreaterThan(0);
  });

  test('does not include canon field when matches default', () => {
    const result = lookupReference('John 3:16');
    expect(result.canon).toBeUndefined();
  });

  test('explicit canon overrides auto-detect', () => {
    const result = lookupReference('1 Nephi 1:1', 'en', { canon: 'coc' });
    expect(result.canon).toBeUndefined(); // matches explicit, no field
  });
});
```

**Step 2: Implement auto-detect logic**

Add to lookupReference after initial lookup fails:
```javascript
// If lookup failed and no explicit canon, try other canons
if (result.verse_ids.length === 0 && !explicitCanon) {
  const otherCanons = ['coc', 'lds', 'bible'].filter(c => c !== effectiveCanon);
  for (const tryCanon of otherCanons) {
    const tryResult = lookupInCanon(query, tryCanon, effectiveLanguage);
    if (tryResult.verse_ids.length > 0) {
      tryResult.canon = tryCanon; // Include because different from expected
      return tryResult;
    }
  }
}
```

**Step 3: Run tests**

Run: `npm run test:jest -- test/integration/auto-detect-canon.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add src/scriptures.mjs test/integration/auto-detect-canon.test.js
git commit -m "feat: implement auto-detect canon fallback"
```

---

## Phase 5: Exports and Cleanup

### Task 5.1: Update Exports

**Files:**
- Modify: `src/scriptures.mjs`

**Step 1: Add new exports**

```javascript
export {
  // Existing
  lookupReference,
  generateReference,
  detectReferences,
  setLanguage,
  getLanguage,
  // New
  setCanon,
  getCanon,
  convertCanon
};
```

**Step 2: Commit**

```bash
git add src/scriptures.mjs
git commit -m "feat: export setCanon, getCanon, convertCanon"
```

---

### Task 5.2: Cleanup Unused Files

**Files:**
- Delete: `src/lib/yaml-loader.mjs` (move to build/)
- Delete: `src/lib/canon-loader.mjs`

**Step 1: Move yaml-loader to build directory**

```bash
git mv src/lib/yaml-loader.mjs build/yaml-loader.mjs
```

**Step 2: Update compile-yaml.mjs import**

```javascript
import { loadYaml } from './yaml-loader.mjs';
```

**Step 3: Delete canon-loader**

```bash
git rm src/lib/canon-loader.mjs
```

**Step 4: Update any remaining imports**

Search and replace old imports.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: cleanup unused loader modules"
```

---

## Phase 6: Final Verification

### Task 6.1: Full Test Suite

**Step 1: Run all tests**

Run: `npm run test:jest`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds, dist/ updated

**Step 3: Test built package**

```javascript
// Quick smoke test
import { lookupReference, setCanon } from './dist/scriptures.mjs';
console.log(lookupReference('John 3:16'));
console.log(lookupReference('1 Nephi 1:1'));
setCanon('coc');
console.log(lookupReference('1 Nephi 1:1'));
```

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "test: verify full test suite and build"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1-1.2 | Build pipeline (YAML compiler) |
| 2 | 2.1 | Data loader module |
| 3 | 3.1 | Canon converter refactor |
| 4 | 4.1-4.2 | Main entry point updates |
| 5 | 5.1-5.2 | Exports and cleanup |
| 6 | 6.1 | Final verification |

**Total: 8 tasks across 6 phases**
