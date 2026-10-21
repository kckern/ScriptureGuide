// PHP json_encode($value, JSON_PRETTY_PRINT [| JSON_NUMERIC_CHECK]) as the legacy site emitted it:
// four-space indent, "\/" for slashes, \uXXXX for every non-ASCII code unit, and (with
// numericCheck) numeric strings written as numbers. Object keys are never converted.
// A Map is written as an object in insertion order: a PHP array keeps its order, a JS object
// moves integer-like keys first ({"2":..,"0":..} would come out as {"0":..,"2":..}).

const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/;

export function isPhpNumeric(s) {
  return typeof s === 'string' && NUMERIC.test(s);
}

function numericCheck(value) {
  if (isPhpNumeric(value)) return Number(value);
  if (Array.isArray(value)) return value.map(numericCheck);
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, numericCheck(v)]));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, numericCheck(v)]));
  }
  return value;
}

// JSON.stringify(value, null, 4), with Maps written as objects in their order.
function encode(value, indent = '') {
  if (value instanceof Map) {
    if (!value.size) return '{}';
    const inner = indent + '    ';
    const items = [...value].map(([k, v]) => `${inner}${JSON.stringify(String(k))}: ${encode(v, inner)}`);
    return `{\n${items.join(',\n')}\n${indent}}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const inner = indent + '    ';
    return `[\n${value.map(v => inner + encode(v ?? null, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object' && typeof value.toJSON !== 'function') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined && typeof v !== 'function');
    if (!entries.length) return '{}';
    const inner = indent + '    ';
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${encode(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value ?? null, null, 4)?.replace(/\n/g, '\n' + indent) ?? 'null';
}

export function phpJson(value, { numericCheck: check = false } = {}) {
  const v = check ? numericCheck(value) : value;
  const json = encode(v ?? null);
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
