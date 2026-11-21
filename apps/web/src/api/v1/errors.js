// Errors the v1 API answers with: a status (4xx; 503 when the database fails, 500 for a bug) and
// { code, message, suggestion? }.
export const STATUS = Object.freeze({
  unparseable_reference: 400,
  empty_query: 400,
  parallel_not_supported: 400,
  search_not_supported: 400,
  versions_not_supported: 400,
  reference_too_large: 400,
  unknown_book: 404,
  chapter_out_of_range: 404,
  verse_out_of_range: 404,
  unknown_version: 404,
  unknown_volume: 404,
  not_in_version: 404,
  unsupported_api_version: 404,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
});

// A database or driver failure: mysql2's server errors carry sqlState and an ER_* code, its
// connection errors PROTOCOL_* or a socket code (ECONNREFUSED, ETIMEDOUT, …)
const DB_CODES = /^(?:E(?:CONNREFUSED|CONNRESET|TIMEDOUT|HOSTUNREACH|NOTFOUND|PIPE)|PROTOCOL_|ER_)/;
export function isDatabaseError(err) {
  if (!err || typeof err !== 'object') return false;
  return DB_CODES.test(String(err.code ?? '')) || err.sqlState != null;
}

export class ApiError extends Error {
  constructor(code, message, suggestion = null) {
    super(message);
    this.code = code;
    this.status = STATUS[code] ?? 500;
    this.suggestion = suggestion;
  }

  toJSON() {
    return { code: this.code, message: this.message, ...(this.suggestion ? { suggestion: this.suggestion } : {}) };
  }
}
