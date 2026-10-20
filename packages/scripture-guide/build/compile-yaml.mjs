#!/usr/bin/env node

/**
 * Compile YAML data files to JavaScript modules
 *
 * Converts:
 *   data/canons/{canon}/_{canon}.yml  →  src/data/canons/{canon}/structure.mjs
 *   data/canons/{canon}/{lang}.yml    →  src/data/canons/{canon}/{lang}.mjs
 *   data/shared/{lang}.yml            →  src/data/shared/{lang}.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';

const DATA_DIR = 'data';
const OUTPUT_DIR = 'src/data';

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function compileYamlToJs(yamlContent) {
  const data = yaml.load(yamlContent);
  return `// Auto-generated from YAML - do not edit\nexport default ${JSON.stringify(data, null, 2)};\n`;
}

function processFile(inputPath, outputPath) {
  const yamlContent = readFileSync(inputPath, 'utf8');
  const jsContent = compileYamlToJs(yamlContent);
  ensureDir(dirname(outputPath));
  writeFileSync(outputPath, jsContent);
  return true;
}

function compileShared() {
  const sharedDir = join(DATA_DIR, 'shared');
  const outputSharedDir = join(OUTPUT_DIR, 'shared');
  let count = 0;

  if (!existsSync(sharedDir)) return count;

  for (const file of readdirSync(sharedDir)) {
    if (!file.endsWith('.yml')) continue;
    const lang = file.replace('.yml', '');
    const inputPath = join(sharedDir, file);
    const outputPath = join(outputSharedDir, `${lang}.mjs`);
    processFile(inputPath, outputPath);
    count++;
  }

  return count;
}

function compileCanons() {
  const canonsDir = join(DATA_DIR, 'canons');
  const outputCanonsDir = join(OUTPUT_DIR, 'canons');
  let structureCount = 0;
  let langCount = 0;

  if (!existsSync(canonsDir)) return { structureCount, langCount };

  for (const canon of readdirSync(canonsDir)) {
    const canonDir = join(canonsDir, canon);
    const outputCanonDir = join(outputCanonsDir, canon);

    for (const file of readdirSync(canonDir)) {
      if (!file.endsWith('.yml')) continue;

      const inputPath = join(canonDir, file);

      if (file === '_mapping.yml') {
        // Mapping file: _mapping.yml → mapping.mjs
        const outputPath = join(outputCanonDir, 'mapping.mjs');
        processFile(inputPath, outputPath);
        structureCount++;
      } else if (file.startsWith('_')) {
        // Structure file: _bible.yml → structure.mjs
        const outputPath = join(outputCanonDir, 'structure.mjs');
        processFile(inputPath, outputPath);
        structureCount++;
      } else {
        // Language file: en.yml → en.mjs
        const lang = file.replace('.yml', '');
        const outputPath = join(outputCanonDir, `${lang}.mjs`);
        processFile(inputPath, outputPath);
        langCount++;
      }
    }
  }

  return { structureCount, langCount };
}

function main() {
  console.log('Compiling YAML to JavaScript modules...\n');

  // Clean output directory
  ensureDir(OUTPUT_DIR);

  // Compile shared language files
  const sharedCount = compileShared();
  console.log(`Shared language files: ${sharedCount}`);

  // Compile canon files
  const { structureCount, langCount } = compileCanons();
  console.log(`Canon structure files: ${structureCount}`);
  console.log(`Canon language files: ${langCount}`);

  console.log(`\nTotal: ${sharedCount + structureCount + langCount} files compiled to ${OUTPUT_DIR}/`);
}

main();
