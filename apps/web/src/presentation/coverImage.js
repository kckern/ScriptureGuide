// Cover images: static files at https://media.scripture.guide/covers/<name>.jpg.
export const COVER_BASE = (process.env.COVER_MEDIA_BASE || 'https://media.scripture.guide/covers').replace(/\/+$/, '');

// PHP scriptutil::versionIMG($ver, $verses): the cover name for a version. LDS has one cover per
// volume (lds_scriptures_volumes.volume_id; PHP fell back to 3 when no verse matched).
export function versionIMG(version, volumeId = 3) {
  const ver = String(version || 'LDS');
  if (ver === 'LDS') {
    const vol = Number(volumeId) || 3;
    if (vol === 1 || vol === 2) return 'ldskjv';
    if (vol === 3) return 'lds-bom2';
    if (vol === 4) return 'lds-dc2';
    if (vol === 5) return 'lds-pgp2';
  }
  return ver.replace(/\*.*$/, '').toLowerCase();
}

export const coverUrl = name => `${COVER_BASE}/${encodeURIComponent(name)}.jpg`;

export default versionIMG;
