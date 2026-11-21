// Errors the v1 API answers with: a 4xx status and { code, message, suggestion? }.
export const STATUS = Object.freeze({
  unparseable_reference: 400,
  empty_query: 400,
  parallel_not_supported: 400,
  search_not_supported: 400,
  unknown_book: 404,
  chapter_out_of_range: 404,
  verse_out_of_range: 404,
  unknown_translation: 404,
  not_in_translation: 404,
  unsupported_api_version: 404,
});

export class ApiError extends Error {
  constructor(code, message, suggestion = null) {
    super(message);
    this.code = code;
    this.status = STATUS[code] ?? 400;
    this.suggestion = suggestion;
  }

  toJSON() {
    return { code: this.code, message: this.message, ...(this.suggestion ? { suggestion: this.suggestion } : {}) };
  }
}
