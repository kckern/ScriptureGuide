import { escapeHtml as esc } from '../../domain/rules/legacyText.js';

const BOOKS = decodeURIComponent('%F0%9F%93%9A');
const HEADPHONES = decodeURIComponent('%F0%9F%8E%A7');

// Volumes in the order settings.php lists them, with the verse it samples for available versions.
export const SETTINGS_VOLUMES = [
  { vol: 'bible', label: 'Bible', verseId: 23146 },
  { vol: 'bom', label: 'Book of Mormon', verseId: 31103 },
  { vol: 'dc', label: 'Doctrine and Covenants', verseId: 37707 },
  { vol: 'pgp', label: 'Pearl of Great Price', verseId: 41361 },
  { vol: 'kor', label: 'Qur’an', verseId: 83195 },
  { vol: 'dp', label: 'Dhammapada', verseId: 91463 },
  { vol: 'bg', label: 'Bhagavad Gita', verseId: 91886 },
];

// settings.php preferences form.
// model: { user: { name, mail, face }, prefs (saved JSON or null), versionsByVol: { vol: [{ id, title_long }] } }
export function renderSettings({ user = {}, prefs, versionsByVol }) {
  const p = prefs || {};
  const opt = p.options || {};
  const options = (vol, cmp) => (versionsByVol[vol] || []).map(v => {
    const sel = p.versions?.[vol]?.[cmp] === v.id ? 'selected="selected"' : '';
    return `<option value='${esc(v.id)}' ${sel}>${BOOKS} ${v.title_long}</option>`;
  }).join('');
  const checked = name => (opt[name] === 'false' ? '' : 'checked="checked"');
  const voice = v => (opt.voice !== v ? '' : 'selected="selected"');

  const rows = SETTINGS_VOLUMES.map(({ vol, label }) => `
	<tr>
		<td>${label}: </td>
		<td><select vol="${vol}" cmp="t" onchange="matchFormat(this)">${options(vol, 't')}</select></td>
		<td><select vol="${vol}" cmp="f">${options(vol, 'f')}</select></td>
	</tr>`).join('');

  return `<div id="settings">

<button onclick='logout()' id="logout">Logout</button>
<h3>Scripture.Guide Preferences for ${esc(user.name)}</h3>
<hr>
<h5>Preferred Versions:</h5>
<table id="versions_prefs">
	<tr>
		<td></td>
		<td>Text</td>
		<td>Headings and Formatting</td>
	</tr>${rows}
</table>
<hr>
<h5>User Interface Preferences:</h5>

<table id="options">
	<tr>
		<td width="33%">
			<label><input type="checkbox" name="parallel" ${checked('parallel')}>Parallel Passage Indicators</label>
		</td>
		<td width="33%">
			<label><input type="checkbox" name="allusion" ${checked('allusion')}>Allusion Indicators</label>
		</td>
		<td width="33%">
			<label><input type="checkbox" name="audio" ${checked('audio')}>Audio Indicators</label>
		</td>
	</tr>
	<tr>
		<td width="33%">
			<label><input type="checkbox" name="facsimile" ${checked('facsimile')}>Facsimile Indicators</label>
		</td>
		<td width="33%">
			<label><input type="checkbox" name="annotation" ${checked('annotation')}>Annotations</label>
		</td>
	</tr>
	<tr>
		<td>Audio Voice Preference<br><small><em>(When Available)</em></small></td>
		<td width="66%" colspan="2"><select key="voice">
			<option ${voice('male')} value='male'> ${HEADPHONES} Male</option>
			<option ${voice('female')} value='female'> ${HEADPHONES} Female</option>
			<option ${voice('legacy')} value='legacy'> ${HEADPHONES} Legacy (Male)</option>
		</select></td>
	</tr>
	<tr>
		<td width="33%">
			Verse Analysis Preference:
		</td>
		<td width="66%" colspan="2">
  			<label><input type="radio" name="verpanel" value="ver" ${opt.verpanel === 'ver' ? ' checked="checked" ' : ''}> Verse Version Panel</label>
  			<label><input type="radio" name="verpanel" value="ref" ${opt.verpanel !== 'ver' ? ' checked="checked" ' : ''}> Verse References Panel</label>
		</td>
	</tr>
</table>

<input id="name" type="hidden" value="${esc(user.name)}">
<input id="mail" type="hidden" value="${esc(user.mail)}">
<input id="face" type="hidden" value="${esc(user.face)}">
<hr>
<div align=center><button style="font-size:20px;" onclick='saveSettings()'>Save Settings</button></div>

</div>`;
}

export default renderSettings;
