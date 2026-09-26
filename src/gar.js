/**
 * Google Artifact Registry (GAR) operations helper module
 */

import { execFileSync } from 'node:child_process';
import { filterSemverTags, sortVersions } from './version.js';

/**
 * Check if gcloud CLI is available.
 * @returns {boolean}
 */
export function isGcloudInstalled() {
  try {
    execFileSync('gcloud', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch all image tags from Google Artifact Registry.
 *
 * Example imageName:
 *   us-east4-docker.pkg.dev/my-project/my-repository/my-image
 *
 * @param {string} imageName - Docker image repository in GAR
 * @param {number} [limit=25] - Max number of recent images to inspect
 * @param {Function} [execFn=execFileSync] - Injectable exec function for testing
 * @returns {string[]}
 */
export function fetchGARTags(imageName, limit = 25, execFn = execFileSync) {
  if (!imageName || typeof imageName !== 'string') {
    throw new Error('Image name is mandatory for Google Artifact Registry.');
  }

  try {
    const output = execFn(
      'gcloud',
      [
        'artifacts',
        'docker',
        'images',
        'list',
        imageName.trim(),
        '--include-tags',
        '--sort-by=~CREATE_TIME',
        `--limit=${limit}`,
        '--format=value(tags)'
      ],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    if (!output) return [];

    return output
      .toString()
      .split(/[,\n;]+/)
      .map(tag => tag.trim())
      .filter(Boolean);
  } catch (err) {
    // If command failed due to missing gcloud or permission, rethrow with clear context
    if (err.code === 'ENOENT') {
      throw new Error('gcloud CLI is not installed or not in PATH.');
    }
    throw new Error(`Failed to fetch tags from Google Artifact Registry for "${imageName}": ${err.stderr?.toString()?.trim() || err.message}`);
  }
}

/**
 * Get the latest semver tag from Google Artifact Registry.
 *
 * @param {string} imageName - Docker image repository in GAR
 * @param {string} [prefix='v'] - Tag prefix to match (or '' / null for any prefix)
 * @param {number} [limit=25] - Max number of recent images to inspect
 * @param {Function} [fetchFn=fetchGARTags] - Injectable fetch function for testing
 * @returns {string|null}
 */
export function getLatestGARTag(imageName, prefix = 'v', limit = 25, fetchFn = fetchGARTags) {
  const tags = fetchFn(imageName, limit);
  if (!tags || tags.length === 0) return null;

  const matchingTags = filterSemverTags(tags, prefix);

  if (matchingTags.length === 0) return null;

  const sorted = sortVersions(matchingTags, 'desc');
  return sorted[0] || null;
}
