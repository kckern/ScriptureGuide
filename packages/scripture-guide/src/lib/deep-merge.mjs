/**
 * Deep merge multiple objects (left to right)
 * Arrays are replaced, not concatenated
 * @param  {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export function deepMerge(...objects) {
  const result = {};

  for (const obj of objects) {
    if (obj == null) continue;

    for (const [key, value] of Object.entries(obj)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] !== null &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = Array.isArray(value) ? [...value] : value;
      }
    }
  }

  return result;
}
