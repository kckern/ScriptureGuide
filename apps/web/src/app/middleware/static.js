import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../public');

// Live (Apache/openresty) sends .ico as image/vnd.microsoft.icon; Express 4 would say image/x-icon.
function setHeaders(res, filePath) {
  if (filePath.endsWith('.ico')) res.setHeader('Content-Type', 'image/vnd.microsoft.icon');
}

export function publicStatic(dir = PUBLIC_DIR) {
  return express.static(dir, { setHeaders });
}
