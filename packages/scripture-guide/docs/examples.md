# Examples

Real-world usage patterns and recipes for Scripture Guide.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Creating Hyperlinks](#creating-hyperlinks)
- [React Components](#react-components)
- [Building a Scripture Search](#building-a-scripture-search)
- [Cross-Reference System](#cross-reference-system)
- [Reading Plan Generator](#reading-plan-generator)
- [Multi-Language Application](#multi-language-application)
- [Content Processing Pipeline](#content-processing-pipeline)
- [API Integration](#api-integration)

---

## Basic Usage

### Parse and Validate References

```javascript
import { lookupReference } from 'scripture-guide';

function isValidReference(input) {
  const result = lookupReference(input);
  return result.verse_ids.length > 0;
}

isValidReference('John 3:16');      // true
isValidReference('Not a verse');    // false
isValidReference('Genesis 100:1');  // false (chapter doesn't exist)
```

### Normalize Reference Format

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

function normalizeReference(input) {
  const { verse_ids } = lookupReference(input);
  if (verse_ids.length === 0) return null;
  return generateReference(verse_ids);
}

normalizeReference('mt 5.3-12');     // 'Matthew 5:3-12'
normalizeReference('1 jn 1:1');      // '1 John 1:1'
normalizeReference('gen1:1');        // 'Genesis 1:1'
```

### Get Verse Count

```javascript
import { lookupReference } from 'scripture-guide';

function getVerseCount(reference) {
  const { verse_ids } = lookupReference(reference);
  return verse_ids.length;
}

getVerseCount('John 3:16');       // 1
getVerseCount('Psalm 23');        // 6
getVerseCount('Matthew 5-7');     // 111
```

---

## Creating Hyperlinks

### Simple HTML Links

```javascript
import { detectReferences } from 'scripture-guide';

function linkReferences(text, baseUrl = '/bible') {
  return detectReferences(text, (query, verseIds) => {
    const url = `${baseUrl}?v=${verseIds.join(',')}`;
    return `<a href="${url}">${query}</a>`;
  });
}

const text = 'Read John 3:16 and Romans 8:28.';
linkReferences(text);
// 'Read <a href="/bible?v=26137">John 3:16</a> and <a href="/bible?v=28098">Romans 8:28</a>.'
```

### Markdown Links

```javascript
import { detectReferences } from 'scripture-guide';

function markdownLinks(text) {
  return detectReferences(text, (query, verseIds) => {
    return `[${query}](https://bible.com/verse/${verseIds[0]})`;
  });
}

const text = 'My favorite verse is John 3:16.';
markdownLinks(text);
// 'My favorite verse is [John 3:16](https://bible.com/verse/26137).'
```

### Tooltip-Enabled Links

```javascript
import { detectReferences, generateReference } from 'scripture-guide';

function tooltipLinks(text) {
  return detectReferences(text, (query, verseIds) => {
    const canonical = generateReference(verseIds);
    return `<a href="#"
              class="scripture-ref"
              data-verse-ids="${verseIds.join(',')}"
              title="${canonical}">${query}</a>`;
  });
}
```

---

## React Components

### Scripture Link Component

```jsx
import { lookupReference } from 'scripture-guide';

function ScriptureLink({ reference, children }) {
  const { verse_ids, ref } = lookupReference(reference);

  if (verse_ids.length === 0) {
    return <span className="invalid-ref">{children || reference}</span>;
  }

  return (
    <a
      href={`/scripture/${verse_ids[0]}`}
      className="scripture-link"
      data-verses={verse_ids.join(',')}
    >
      {children || ref}
    </a>
  );
}

// Usage
<ScriptureLink reference="John 3:16" />
<ScriptureLink reference="mt 5:3-12">The Beatitudes</ScriptureLink>
```

### Auto-Linking Text Component

```jsx
import { detectReferences } from 'scripture-guide';
import { useMemo } from 'react';

function LinkedText({ children, onReferenceClick }) {
  const processedContent = useMemo(() => {
    if (typeof children !== 'string') return children;

    const parts = [];
    let lastIndex = 0;
    let partKey = 0;

    // Use detectReferences to find all references
    detectReferences(children, (query, verseIds) => {
      const index = children.indexOf(query, lastIndex);

      // Add text before this reference
      if (index > lastIndex) {
        parts.push(children.slice(lastIndex, index));
      }

      // Add the linked reference
      parts.push(
        <a
          key={partKey++}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onReferenceClick?.(query, verseIds);
          }}
          className="scripture-ref"
        >
          {query}
        </a>
      );

      lastIndex = index + query.length;
      return query; // Return original for position tracking
    });

    // Add remaining text
    if (lastIndex < children.length) {
      parts.push(children.slice(lastIndex));
    }

    return parts;
  }, [children, onReferenceClick]);

  return <span>{processedContent}</span>;
}

// Usage
<LinkedText onReferenceClick={(ref, ids) => console.log(ref, ids)}>
  Read John 3:16 and compare with Genesis 1:1.
</LinkedText>
```

### Language Selector Hook

```jsx
import { setLanguage } from 'scripture-guide';
import { useState, useEffect } from 'react';

function useScriptureLanguage(initialLang = 'en') {
  const [language, setLang] = useState(initialLang);

  useEffect(() => {
    setLanguage(language);
  }, [language]);

  return [language, setLang];
}

// Usage in component
function LanguageSelector() {
  const [lang, setLang] = useScriptureLanguage('en');

  return (
    <select value={lang} onChange={(e) => setLang(e.target.value)}>
      <option value="en">English</option>
      <option value="ko">한국어</option>
      <option value="fr">Français</option>
      <option value="de">Deutsch</option>
    </select>
  );
}
```

---

## Building a Scripture Search

### Reference Search with Fuzzy Matching

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

function searchReference(query) {
  // Try direct lookup first
  let result = lookupReference(query);

  if (result.verse_ids.length > 0) {
    return {
      success: true,
      reference: result.ref,
      verseIds: result.verse_ids
    };
  }

  // Try common corrections
  const corrections = [
    query.replace(/\s+/g, ' '),           // Normalize spaces
    query.replace(/(\d)([a-z])/gi, '$1 $2'), // Add space after numbers
    query.replace(/([a-z])(\d)/gi, '$1 $2'), // Add space before numbers
  ];

  for (const corrected of corrections) {
    result = lookupReference(corrected);
    if (result.verse_ids.length > 0) {
      return {
        success: true,
        reference: result.ref,
        verseIds: result.verse_ids,
        correctedFrom: query
      };
    }
  }

  return {
    success: false,
    error: 'Could not parse reference',
    original: query
  };
}
```

### Batch Reference Processing

```javascript
import { lookupReference } from 'scripture-guide';

function processReferences(references) {
  return references.map(ref => {
    const result = lookupReference(ref);
    return {
      input: ref,
      normalized: result.ref,
      verseIds: result.verse_ids,
      valid: result.verse_ids.length > 0
    };
  });
}

const refs = ['John 3:16', 'invalid', 'mt 5:3', 'Gen 1:1-3'];
processReferences(refs);
// [
//   { input: 'John 3:16', normalized: 'John 3:16', verseIds: [26137], valid: true },
//   { input: 'invalid', normalized: '', verseIds: [], valid: false },
//   { input: 'mt 5:3', normalized: 'Matthew 5:3', verseIds: [23239], valid: true },
//   { input: 'Gen 1:1-3', normalized: 'Genesis 1:1-3', verseIds: [1,2,3], valid: true }
// ]
```

---

## Cross-Reference System

### Find Related Verses

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

// Example cross-reference database
const crossRefs = {
  26137: [1, 28098, 26924],  // John 3:16 -> Genesis 1:1, Romans 8:28, John 21:25
  // ... more mappings
};

function getRelatedVerses(reference) {
  const { verse_ids } = lookupReference(reference);

  const related = new Set();
  for (const id of verse_ids) {
    const refs = crossRefs[id] || [];
    refs.forEach(r => related.add(r));
  }

  return Array.from(related).map(id => ({
    verseId: id,
    reference: generateReference([id])
  }));
}

getRelatedVerses('John 3:16');
// [
//   { verseId: 1, reference: 'Genesis 1:1' },
//   { verseId: 28098, reference: 'Romans 8:28' },
//   { verseId: 26924, reference: 'John 21:25' }
// ]
```

### Build Cross-Reference Links

```javascript
import { detectReferences, lookupReference } from 'scripture-guide';

function buildCrossRefMap(text) {
  const refs = [];

  detectReferences(text, (query, verseIds) => {
    refs.push({
      text: query,
      verseIds,
      normalized: lookupReference(query).ref
    });
    return query;
  });

  // Build adjacency map
  const crossRefs = {};
  for (let i = 0; i < refs.length; i++) {
    for (const id of refs[i].verseIds) {
      crossRefs[id] = crossRefs[id] || new Set();

      // Link to other refs in same text
      for (let j = 0; j < refs.length; j++) {
        if (i !== j) {
          refs[j].verseIds.forEach(otherId => crossRefs[id].add(otherId));
        }
      }
    }
  }

  return crossRefs;
}
```

---

## Reading Plan Generator

### Generate Daily Reading Plan

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

function generateReadingPlan(startRef, endRef, days) {
  const start = lookupReference(startRef).verse_ids[0];
  const end = lookupReference(endRef).verse_ids[0];
  const totalVerses = end - start + 1;
  const versesPerDay = Math.ceil(totalVerses / days);

  const plan = [];
  let currentStart = start;

  for (let day = 1; day <= days && currentStart <= end; day++) {
    const dayEnd = Math.min(currentStart + versesPerDay - 1, end);
    const verseIds = [];
    for (let id = currentStart; id <= dayEnd; id++) {
      verseIds.push(id);
    }

    plan.push({
      day,
      reference: generateReference(verseIds),
      verseCount: verseIds.length,
      verseIds
    });

    currentStart = dayEnd + 1;
  }

  return plan;
}

// Generate 7-day plan for Sermon on the Mount
generateReadingPlan('Matthew 5:1', 'Matthew 7:29', 7);
// [
//   { day: 1, reference: 'Matthew 5:1-16', verseCount: 16, ... },
//   { day: 2, reference: 'Matthew 5:17-32', verseCount: 16, ... },
//   ...
// ]
```

### Chapter-Based Reading Plan

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

function chapterPlan(book, chaptersPerDay = 1) {
  const plan = [];
  let chapter = 1;
  let day = 1;

  while (true) {
    const endChapter = chapter + chaptersPerDay - 1;
    const ref = `${book} ${chapter}${chaptersPerDay > 1 ? `-${endChapter}` : ''}`;
    const result = lookupReference(ref);

    if (result.verse_ids.length === 0) break;

    plan.push({
      day: day++,
      reference: result.ref,
      verseCount: result.verse_ids.length
    });

    chapter = endChapter + 1;
  }

  return plan;
}

chapterPlan('Psalms', 5);  // 5 psalms per day
```

---

## Multi-Language Application

### Language-Aware Reference Display

```javascript
import { lookupReference, generateReference, setLanguage } from 'scripture-guide';

class ScriptureService {
  constructor(defaultLanguage = 'en') {
    this.language = defaultLanguage;
    setLanguage(defaultLanguage);
  }

  setLanguage(lang) {
    this.language = lang;
    setLanguage(lang);
  }

  // Parse in any language, return verse IDs
  parse(reference, inputLang = null) {
    return lookupReference(reference, inputLang || this.language);
  }

  // Generate reference in current language
  format(verseIds) {
    return generateReference(verseIds, this.language);
  }

  // Translate reference between languages
  translate(reference, fromLang, toLang) {
    const { verse_ids } = lookupReference(reference, fromLang);
    return generateReference(verse_ids, toLang);
  }
}

const service = new ScriptureService('en');

// Translate Korean to English
service.translate('요한복음 3:16', 'ko', 'en');
// 'John 3:16'

// Translate English to French
service.translate('John 3:16', 'en', 'fr');
// 'Jean 3:16'
```

### Internationalized Reference Input

```javascript
import { lookupReference } from 'scripture-guide';

function parseMultilingualInput(input) {
  const languages = ['en', 'ko', 'fr', 'de', 'ru', 'vn', 'jp'];

  for (const lang of languages) {
    const result = lookupReference(input, lang, { noMulti: true });
    if (result.verse_ids.length > 0) {
      return {
        ...result,
        detectedLanguage: lang
      };
    }
  }

  return {
    query: input,
    ref: '',
    verse_ids: [],
    detectedLanguage: null
  };
}

parseMultilingualInput('요한복음 3:16');
// { ref: '요한복음 3장 16절', verse_ids: [26137], detectedLanguage: 'ko' }

parseMultilingualInput('Jean 3:16');
// { ref: 'Jean 3:16', verse_ids: [26137], detectedLanguage: 'fr' }
```

---

## Content Processing Pipeline

### Blog Post Processor

```javascript
import { detectReferences, lookupReference } from 'scripture-guide';

function processPost(content, options = {}) {
  const {
    linkTemplate = (ref, ids) => `<a href="/bible/${ids[0]}">${ref}</a>`,
    collectRefs = false
  } = options;

  const references = [];

  const processed = detectReferences(content, (query, verseIds) => {
    if (collectRefs) {
      references.push({
        text: query,
        verseIds,
        normalized: lookupReference(query).ref
      });
    }
    return linkTemplate(query, verseIds);
  });

  return {
    content: processed,
    references: collectRefs ? references : undefined
  };
}

const post = `
  Today we study John 3:16-18. This passage teaches about God's love.
  Compare with 1 John 4:8-10 and Romans 5:8.
`;

const result = processPost(post, { collectRefs: true });
// result.content: HTML with linked references
// result.references: Array of all found references
```

### Markdown to HTML with Scripture Links

```javascript
import { detectReferences } from 'scripture-guide';
import { marked } from 'marked'; // Example markdown parser

function processMarkdown(markdown) {
  // First, process scripture references
  const withLinks = detectReferences(markdown, (query, verseIds) => {
    return `[${query}](/scripture?v=${verseIds.join(',')})`;
  });

  // Then convert to HTML
  return marked(withLinks);
}
```

---

## API Integration

### Express.js Middleware

```javascript
import { lookupReference, generateReference, detectReferences } from 'scripture-guide';
import express from 'express';

const app = express();

// Lookup endpoint
app.get('/api/lookup/:reference', (req, res) => {
  const result = lookupReference(decodeURIComponent(req.params.reference));
  res.json(result);
});

// Generate endpoint
app.get('/api/generate', (req, res) => {
  const ids = req.query.ids.split(',').map(Number);
  const lang = req.query.lang || 'en';
  res.json({
    reference: generateReference(ids, lang),
    verse_ids: ids
  });
});

// Detect endpoint
app.post('/api/detect', express.json(), (req, res) => {
  const { text, format = 'json' } = req.body;
  const refs = [];

  const processed = detectReferences(text, (query, verseIds) => {
    refs.push({ query, verseIds });
    return `[[${refs.length - 1}]]`; // Placeholder
  });

  res.json({
    text: processed,
    references: refs
  });
});

app.listen(3000);
```

### REST API Client

```javascript
import { lookupReference, generateReference } from 'scripture-guide';

class ScriptureAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async getVerseText(reference) {
    const { verse_ids } = lookupReference(reference);

    const response = await fetch(
      `${this.baseUrl}/verses?ids=${verse_ids.join(',')}`
    );

    return response.json();
  }

  async search(query) {
    const response = await fetch(
      `${this.baseUrl}/search?q=${encodeURIComponent(query)}`
    );

    const results = await response.json();

    // Add formatted references to results
    return results.map(result => ({
      ...result,
      reference: generateReference([result.verse_id])
    }));
  }
}
```

---

## Additional Recipes

### Validate Reference Input Field

```javascript
import { lookupReference } from 'scripture-guide';

function validateReferenceInput(input) {
  const result = lookupReference(input.trim());

  if (result.verse_ids.length === 0) {
    return {
      valid: false,
      error: 'Invalid scripture reference'
    };
  }

  if (result.verse_ids.length > 500) {
    return {
      valid: false,
      error: 'Reference too broad (max 500 verses)'
    };
  }

  return {
    valid: true,
    normalized: result.ref,
    verseCount: result.verse_ids.length
  };
}
```

### Compare Two References

```javascript
import { lookupReference } from 'scripture-guide';

function compareReferences(ref1, ref2) {
  const r1 = lookupReference(ref1);
  const r2 = lookupReference(ref2);

  const set1 = new Set(r1.verse_ids);
  const set2 = new Set(r2.verse_ids);

  const overlap = r1.verse_ids.filter(id => set2.has(id));

  return {
    ref1: { reference: r1.ref, count: r1.verse_ids.length },
    ref2: { reference: r2.ref, count: r2.verse_ids.length },
    overlap: overlap.length,
    identical: overlap.length === r1.verse_ids.length &&
               overlap.length === r2.verse_ids.length
  };
}

compareReferences('John 3:16-18', 'John 3:17');
// { ref1: {..., count: 3}, ref2: {..., count: 1}, overlap: 1, identical: false }
```
