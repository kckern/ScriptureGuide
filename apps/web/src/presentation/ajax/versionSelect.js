import { escapeHtml as esc } from '../../domain/rules/legacyText.js';

const COVERS = 'https://media.scripture.guide/covers';

// version_select.php: one cover per alternative version. versions: [{ id, title, img }].
export function renderVersionSelect(versions, seq = '') {
  return versions.map(v =>
    `\t<img class="option" src="${COVERS}/${esc(String(v.img).toLowerCase())}.jpg" title="${esc(v.title)}" ver="${esc(v.id)}" seq="${esc(seq)}">\n\t`
  ).join('');
}

export default renderVersionSelect;
