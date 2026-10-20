import { escapeHtml as esc, stemText } from '../../domain/rules/legacyText.js';

const COVERS = 'https://media.scripture.guide/covers';
const BOOK = decodeURIComponent('%F0%9F%93%96');

// Markup of versebox.php, kept byte-for-byte where it matters to the client script
// (including its unclosed <td>s and the stray attribute on </tr>, which browsers ignore).
//
// model: {
//   seq, verseId, title, verCount, refCount, verLead, refLead,
//   original: { ver, title, titleShort, chapter, text },
//   refs: [{ verseId, type, version, ref, slug, chapter, text }],
//   versions: [{ version, verseId, img, fax, chapter, text }],
//   refslug,
// }
export function renderVersebox(m) {
  const refTab = m.refCount > 0
    ? `\n\t\t\t<li link="refpanel" lead="${m.refLead}">${m.refCount} Reference${m.refCount > 1 ? 's' : ''}</li>\n\t\t\t`
    : '\n\t\t\t';

  let refCells = '';
  let i = 2;
  for (const r of m.refs) {
    const icon = r.type === 'xref' ? 'xref' : 'diff';
    const v = String(r.version || '').toLowerCase();
    refCells += `\t\t\t\t<td class='gridbox' valign='top' width="33.33%">
				<div class='versionbar ${v} ref'><a href="/${r.slug}" target="_blank">${r.ref}</a><img style='position:absolute; top:0; right:0;' src='/img/${icon}.png'/></div>
				<div class='gridtext' ver="${v}"  chapter='${r.chapter}'  vtitle='${r.ref}'  ver='${v}'>${r.text}</div></td>
				`;
    i++;
    if ((i + 1) % 3 === 0) refCells += '</tr><tr>';
  }

  let verCells = '';
  m.versions.forEach((x, idx) => {
    const v = String(x.version).toLowerCase();
    const fax = x.fax
      ? `<div class='fax' ver='${x.version}' ref='${x.verseId}'>\n\t\t\t\t${BOOK}\n\t\t\t\t</div>`
      : '';
    verCells += `\t\t\t\t<td class='gridbox' valign='top' width="33.33%">
				<div class='versionbar' ver='${v}'>
				<a href="/${v}/${m.refslug}" target="_blank"><img class="cover" src="${COVERS}/${x.img}.jpg"  ver='${x.version}' style='width:120px; height:40px;'></a>
				${fax}				</div>
				<div class='gridtext' ver="${v}"  chapter='${x.chapter}'   >${stemText(x.text)}</div>
				`;
    if ((idx + 1) % 3 === 0) verCells += '</tr><tr>';
  });

  const o = m.original;
  return `
<div class='versebox' seq='${esc(m.seq)}' verse_id='${esc(m.verseId)}'>


	<h5><a dir="prev" >◀</a> ${m.title} <a dir="next">▶</a></h5>
	<div class="paneltabs">
		<ul>
			<li link="verpanel" lead="${m.verLead}">${m.verCount} Versions</li>${refTab}<li id="comparetab" link='diffpanel' class="locked">Comparison <span>Ⓧ</span></li>
		</ul></div>
	<div class="panel diffpanel">

		<div class="diffmodel">
			<table>
				<tr>
					<td class="original_wrap"><div  class="original_meta" align="center"></div></td>
					<td class="changed_wrap"><div  class="changed_meta" align="center"></div></td>
				</tr>
				<tr id="diff_fax">
					<td class="original_wrap" valign="middle"><div  class="original_fax"></div></td>
					<td class="changed_wrap" valign="middle"><div  class="changed_fax"></div></td>
				</tr>
				<tr>
					<td class="original_wrap"><div class="original" ver=""></div></td>
					<td class="changed_wrap"><div class="changed" ver=""></div></td>
				</tr>
			</table>

		</div>
			<div align='center'><a class="chapter">Compare Full ⇅ Chapter</a></div>
		<div class="diff"></div>
	</div>


	<div class="panel refpanel">

		<table>
			<tr class='original'>
				<td class='gridbox' valign='top' width="100" colspan=3>
				<div class='versionbar ${esc(o.ver)}' style='color:white'>${o.title}</div>
				<div class='gridtext' ver="${esc(o.ver)}"   chapter='${o.chapter}'  vtitle='${o.titleShort}'  style="padding:1.2em;" >${o.text}</div></td>
			</tr  class='matches'>
			<tr class='matches'>
${refCells}			</tr>
		</table>
	</div>


	<div class="panel verpanel">
		<table>
			<tr>
${verCells}			</tr>
		</table>
		<div class="diff"></div>
	</div>`;
}

export default renderVersebox;
