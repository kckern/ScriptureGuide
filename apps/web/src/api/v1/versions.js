// The v1 version list (/v1/versions): every version, in the repository's priority order.
import apiRepository from '../../data/repositories/ApiRepository.js';
import { versionInfo } from './passage.js';

export async function buildVersions({ repo = apiRepository } = {}) {
  const versions = await repo.versions();
  return { api: 'v1', versions: [...versions.values()].map(v => versionInfo(v.id, versions)) };
}
