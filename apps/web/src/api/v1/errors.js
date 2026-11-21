// Errors the v1 API answers with: a status (4xx, or 503 when the database fails) and
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
  service_unavailable: 503,
});

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
