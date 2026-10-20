#!/bin/bash
# Scripture Guide Chrome Extension — build, test, and package for the Web Store.
set -e

echo "==> Running tests"
npm test

echo "==> Building extension"
rm -f scripture-guide-extension.zip
npm run build

echo "==> Validating build output"
required=(manifest.json content.js content.css background.js \
          popup.html popup.css popup.js options.html options.css options.js)
for f in "${required[@]}"; do
  [ -f "dist/$f" ] || { echo "MISSING dist/$f"; exit 1; }
done
grep -q '"manifest_version": 3' dist/manifest.json || { echo "manifest is not v3"; exit 1; }

echo "==> Packaging"
( cd dist && zip -r -q ../scripture-guide-extension.zip . )
unzip -t scripture-guide-extension.zip > /dev/null

version=$(grep '"version"' dist/manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
echo "==> Done: scripture-guide-extension.zip (v$version)"
echo "    Load unpacked from dist/ at chrome://extensions, or upload the zip to the Web Store."
