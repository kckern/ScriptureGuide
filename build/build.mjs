#!/usr/bin/env node

// Run YAML compilation first
import './compile-yaml.mjs';

import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const banner = `/* scripture-guide v${pkg.version} */`;

const shared = {
  entryPoints: ['src/scriptures.mjs'],
  bundle: true,
  banner: { js: banner },
  sourcemap: true,
};

// ESM build
await esbuild.build({
  ...shared,
  format: 'esm',
  outfile: 'dist/scriptures.mjs',
});

// CommonJS build
await esbuild.build({
  ...shared,
  format: 'cjs',
  outfile: 'dist/scriptures.cjs',
});

console.log('Built ESM and CJS bundles with source maps');
