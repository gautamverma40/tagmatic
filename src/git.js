/**
 * Git operations helper module
 */

import { execFileSync } from 'node:child_process';
import { parseSemver, sortVersions } from './version.js';

/**
 * Execute a git command with argument array and return its trimmed stdout.
 * @param {string[]|string} args
 * @param {string} [cwd=process.cwd()]
 * @returns {string}
 */
function runGit(args, cwd = process.cwd()) {
  const argList = Array.isArray(args) ? args : args.split(' ').filter(Boolean);
  return execFileSync('git', argList, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

/**
 * Check if the directory is inside a git repository.
 * @param {string} [cwd=process.cwd()]
 * @returns {boolean}
 */
export function isGitRepo(cwd = process.cwd()) {
  try {
    const res = runGit(['rev-parse', '--is-inside-work-tree'], cwd);
    return res === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if working directory has uncommitted changes.
 * @param {string} [cwd=process.cwd()]
 * @returns {boolean}
 */
export function isWorkingTreeClean(cwd = process.cwd()) {
  try {
    const status = runGit(['status', '--porcelain'], cwd);
    return status.length === 0;
  } catch {
    return false;
  }
}

/**
 * Get current branch name.
 * @param {string} [cwd=process.cwd()]
 * @returns {string}
 */
export function getCurrentBranch(cwd = process.cwd()) {
  try {
    return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  } catch {
    return 'unknown';
  }
}

/**
 * Get all git tags from repository.
 * @param {string} [cwd=process.cwd()]
 * @returns {string[]}
 */
export function getAllTags(cwd = process.cwd()) {
  try {
    const output = runGit(['tag', '-l'], cwd);
    if (!output) return [];
    return output.split('\n').map(t => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get the latest semver tag in the repository.
 * @param {string} [prefix='v']
 * @param {string} [cwd=process.cwd()]
 * @returns {string|null}
 */
export function getLatestTag(prefix = 'v', cwd = process.cwd()) {
  const tags = getAllTags(cwd);
  const matchingTags = tags.filter(tag => {
    const parsed = parseSemver(tag, prefix || undefined);
    if (!parsed) return false;
    if (prefix !== undefined && prefix !== null) {
      if (prefix.toLowerCase() === 'v') {
        return parsed.prefix.toLowerCase() === 'v';
      }
      return parsed.prefix === prefix;
    }
    return true;
  });

  if (matchingTags.length === 0) return null;

  const sorted = sortVersions(matchingTags, 'desc');
  return sorted[0] || null;
}

/**
 * Get commit messages since a given tag (or all recent commits if tag is null).
 * @param {string|null} [tag=null]
 * @param {number} [limit=10]
 * @param {string} [cwd=process.cwd()]
 * @returns {string[]}
 */
export function getCommitsSince(tag = null, limit = 10, cwd = process.cwd()) {
  try {
    const args = tag ? ['log', `${tag}..HEAD`, '--oneline'] : ['log', '-n', String(limit), '--oneline'];
    const output = runGit(args, cwd);
    if (!output) return [];
    return output.split('\n').map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Create an annotated Git tag.
 * @param {string} tagName
 * @param {string} message
 * @param {string} [cwd=process.cwd()]
 */
export function createTag(tagName, message, cwd = process.cwd()) {
  runGit(['tag', '-a', tagName, '-m', message], cwd);
}

/**
 * Push a git tag to remote repository.
 * @param {string} tagName
 * @param {string} [remote='origin']
 * @param {string} [cwd=process.cwd()]
 */
export function pushTag(tagName, remote = 'origin', cwd = process.cwd()) {
  runGit(['push', remote, tagName], cwd);
}
