/**
 * Main Tagmatic core logic
 */

import {
  isGitRepo,
  isWorkingTreeClean,
  getCurrentBranch,
  getLatestTag,
  getCommitsSince,
  createTag,
  pushTag
} from './git.js';
import { bumpVersion, formatTag, isValidVersion } from './version.js';

/**
 * @typedef {Object} TagmaticOptions
 * @property {'major' | 'minor' | 'patch'} [type='patch'] - Version bump level
 * @property {string} [prefix='v'] - Tag prefix
 * @property {string} [initialVersion='v0.1.0'] - Initial tag if no prior tags exist
 * @property {string} [message] - Tag annotation message
 * @property {boolean} [dryRun=false] - Preview next tag without writing or pushing
 * @property {boolean} [push=false] - Push generated tag to git remote
 * @property {string} [remote='origin'] - Git remote name
 * @property {boolean} [allowDirty=false] - Allow tag generation even if git tree has changes
 * @property {string} [cwd=process.cwd()] - Target directory
 */

/**
 * Generate and create a new semver git tag.
 * @param {TagmaticOptions} [options={}]
 * @returns {Promise<{
 *   source: string,
 *   currentTag: string|null,
 *   nextTag: string,
 *   branch: string,
 *   isDryRun: boolean,
 *   dryRun: boolean,
 *   created: boolean,
 *   pushed: boolean,
 *   message: string,
 *   commits: string[]
 * }>}
 */
export async function generateTag(options = {}) {
  const {
    type = 'patch',
    prefix = 'v',
    initialVersion = 'v0.1.0',
    message,
    dryRun = false,
    push = false,
    remote = 'origin',
    allowDirty = false,
    cwd = process.cwd()
  } = options;

  if (!isGitRepo(cwd)) {
    throw new Error(`The directory "${cwd}" is not a valid Git repository.`);
  }

  if (!allowDirty && !isWorkingTreeClean(cwd)) {
    throw new Error('Working directory has uncommitted changes. Commit or stash them, or use --allow-dirty.');
  }

  const branch = getCurrentBranch(cwd);
  const currentTag = getLatestTag(prefix, cwd);
  const commits = getCommitsSince(currentTag, 10, cwd);

  let nextTag;
  if (!currentTag) {
    if (!isValidVersion(initialVersion)) {
      throw new Error(`Invalid initialVersion format: "${initialVersion}".`);
    }
    nextTag = prefix !== undefined ? formatTag(initialVersion, prefix) : initialVersion;
  } else {
    nextTag = bumpVersion(currentTag, type, { prefix });
  }

  const tagMessage = message || `Release ${nextTag}`;

  let created = false;
  let pushed = false;

  if (!dryRun) {
    createTag(nextTag, tagMessage, cwd);
    created = true;

    if (push) {
      pushTag(nextTag, remote, cwd);
      pushed = true;
    }
  }

  return {
    source: 'git',
    currentTag,
    nextTag,
    branch,
    isDryRun: Boolean(dryRun),
    dryRun: Boolean(dryRun),
    created,
    pushed,
    message: tagMessage,
    commits
  };
}

export default generateTag;
