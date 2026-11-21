// A random verse id for /random, /{version}/random and /random/{volume}.
import apiRepository from '../../data/repositories/ApiRepository.js';
import { randomVerseId } from '../../domain/rules/requestParsing.js';
import { volumeRange } from '../../services/SearchService.js';
import { ApiError } from './errors.js';

// Every verse id, for a version with no volume given: some versions (JST, the Qur'an
// versions) have no verses in the standard works
const ALL_VERSES = [1, 2147483647];
// The version a volume-only pick reads
const DEFAULT_VERSION = 'LDS';

// With several versions, the verse comes from the first one
export async function pickRandomVerse({ versions, volume }, { repo = apiRepository, random = Math.random } = {}) {
  if (!versions.length && !volume) return randomVerseId(random);
  const range = volume ? volumeRange(volume) : ALL_VERSES;
  const version = versions[0] ?? DEFAULT_VERSION;
  const id = await repo.randomVerseId({ range, version }, random);
  if (id == null) throw new ApiError('not_in_version', `${version} has no verses${volume ? ` in ${volume}` : ''}.`);
  return id;
}
