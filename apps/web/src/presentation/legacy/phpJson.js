// PHP json_encode($value, JSON_PRETTY_PRINT [| JSON_NUMERIC_CHECK]) as the legacy site emitted it:
// four-space indent, "\/" for slashes, \uXXXX for every non-ASCII code unit, and (with
// numericCheck) numeric strings written as numbers. Object keys are never converted.

const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/;

export function isPhpNumeric(s) {
  return typeof s === 'string' && NUMERIC.test(s);
}

function numericCheck(value) {
  if (isPhpNumeric(value)) return Number(value);
  if (Array.isArray(value)) return value.map(numericCheck);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, numericCheck(v)]));
  }
  return value;
}

export function phpJson(value, { numericCheck: check = false } = {}) {
  const v = check ? numericCheck(value) : value;
  const json = JSON.stringify(v ?? null, null, 4) ?? 'null';
  return json
    .replace(/\//g, '\\/')
    .replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function sendPhpJson(res, value, options) {
  res.set('Access-Control-Allow-Origin', '*');
  res.type('application/json');
  res.send(phpJson(value, options));
}

export default phpJson;
