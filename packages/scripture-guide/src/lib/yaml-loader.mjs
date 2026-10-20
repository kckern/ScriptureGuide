import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

/**
 * Load and parse a YAML file
 * @param {string} filePath - Path to YAML file
 * @returns {Object|null} Parsed YAML or null if file doesn't exist
 */
export function loadYaml(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

/**
 * Check if a YAML file exists
 * @param {string} filePath - Path to YAML file
 * @returns {boolean}
 */
export function yamlExists(filePath) {
  return existsSync(filePath);
}
