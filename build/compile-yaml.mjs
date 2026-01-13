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
