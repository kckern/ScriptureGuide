// Convert a reference string (e.g. "John 3:16-18") into a scripture.guide URL
// slug (e.g. "john.3.16-18"): dashes normalized to "-", whitespace/colons to
// ".", ";" and "," kept as compound/split separators.
export function toSlug(ref) {
  return ref.trim().toLowerCase()
    .replace(/[־᠆‐‒–—―﹣－‑]+/gu, '-')
    .replace(/[\s:]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/;\./g, ';')
    .replace(/,\./g, ',')
    .replace(/\.;/g, ';')
    .replace(/\.,/g, ',');
}
