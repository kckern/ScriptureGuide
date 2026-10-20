#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// Step 1: Compile YAML to JS (always, so YAML edits are never silently stale)
execSync('node build/compile-yaml.mjs', { stdio: 'inherit' });

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const banner = `/* scripture-guide v${pkg.version} */`;

const shared = {
  entryPoints: ['src/scriptures.mjs'],
  bundle: true,
  banner: { js: banner },
  sourcemap: true,
};

// Step 2: ESM build
await esbuild.build({
  ...shared,
  format: 'esm',
  outfile: 'dist/scriptures.mjs',
});

// Step 3: CommonJS build
await esbuild.build({
  ...shared,
  format: 'cjs',
  outfile: 'dist/scriptures.cjs',
});

console.log('Built ESM and CJS bundles with source maps');
