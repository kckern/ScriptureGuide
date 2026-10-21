// JSON lines on stdout for the container log shipper. requestLog.js writes msg:'request';
// logError writes msg:'error' with whatever context the caller has (where, path, ref, ...).

export function stdoutLine(line) {
  process.stdout.write(line + '\n');
}

let writer = stdoutLine;

// Swap the writer (tests); returns the previous one.
export function setLogWriter(fn) {
  const prev = writer;
  writer = fn || stdoutLine;
  return prev;
}

export function writeLine(line) {
  try { writer(line); } catch { /* logging never breaks a response */ }
}

// A non-error event, e.g. logEvent('start', { port, env }).
export function logEvent(msg, fields = {}, write = writeLine) {
  write(JSON.stringify({ time: new Date().toISOString(), msg, ...fields }));
}

// A configuration warning as a JSON line, e.g. a font file missing under FONT_DIR.
export function logWarning(message) {
  logEvent('warn', { message });
}

// A readable message even for errors without one (mysql2's AggregateError has message '').
export function errorText(err) {
  if (err == null) return String(err);
  if (typeof err !== 'object') return String(err);
  return err.message || err.code || err.name || String(err);
}

export function errorRecord(err, fields = {}) {
  const rec = { time: new Date().toISOString(), msg: 'error', ...fields, error: errorText(err) };
  if (err && typeof err === 'object') {
    if (err.code !== undefined) rec.code = err.code;
    if (Array.isArray(err.errors)) rec.errors = err.errors.map(e => e?.code || errorText(e));
    rec.stack = err.stack ?? null;
  }
  return rec;
}

export function logError(err, fields = {}, write = writeLine) {
  let line;
  try { line = JSON.stringify(errorRecord(err, fields)); } catch { return; }
  write(line);
}
