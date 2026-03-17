import { VolumeType } from '../enums/VolumeType.js';

// Verse ID ranges per volume
// These values should match the scripture-guide npm package data
const VOLUME_RANGES = {
  [VolumeType.OLD_TESTAMENT]: { start: 1, end: 23145 },
  [VolumeType.NEW_TESTAMENT]: { start: 23146, end: 31102 },
  [VolumeType.BOOK_OF_MORMON]: { start: 31103, end: 37706 },
  [VolumeType.DOCTRINE_COVENANTS]: { start: 37707, end: 40368 },
  [VolumeType.PEARL_OF_GREAT_PRICE]: { start: 40369, end: 40919 }
};

export function volumeDetection(verseId) {
  for (const [volume, range] of Object.entries(VOLUME_RANGES)) {
    if (verseId >= range.start && verseId <= range.end) {
      return volume;
    }
  }
  return null;
}

export function getVolumeRange(volume) {
  return VOLUME_RANGES[volume] || null;
}

export function isValidVerseId(verseId) {
  return verseId >= 1 && verseId <= 40919;
}

export default volumeDetection;
