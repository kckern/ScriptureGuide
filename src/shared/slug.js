// Convert a reference string (e.g. "John 3:16-18") into a scripture.guide URL
// slug (e.g. "john.3.16-18"). Preserves the legacy scheme the linker used:
// dashes normalized to "-", whitespace/colons to ".", ";" and "," kept as
// compound/split separators.
export function refToSlug(ref) {
  return ref.trim().toLowerCase()
    .replace(/[־᠆‐‒–—―﹣－‑]+/gu, '-') // unicode dashes -> hyphen
    .replace(/[\s:]+/g, '.')          // spaces and colons -> dot
    .replace(/\.+/g, '.')             // collapse repeated dots
    .replace(/;\./g, ';')             // "; ." -> ";"
    .replace(/,\./g, ',')             // ", ." -> ","
    .replace(/\.;/g, ';')
    .replace(/\.,/g, ',');
}
