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
  pushTag,
  commitFiles,
  pushBranch
} from './git.js';
import { getLatestGARTag } from './gar.js';
import { bumpVersion, formatTag, isValidVersion, parseSemver } from './version.js';
import { syncManifests } from './manifest.js';

/**
 * @typedef {Object} TagmaticOptions
 * @property {'git' | 'gar'} [source='git'] - Tag source provider (Git repository or Google Artifact Registry)
 * @property {string} [image] - Docker image name (required when source is 'gar')
 * @property {number} [limit=25] - Max tags to fetch when inspecting remote registries
 * @property {'major' | 'minor' | 'patch'} [type='patch'] - Version bump level
 * @property {string} [prefix='v'] - Tag prefix
 * @property {string} [initialVersion] - Initial tag if no prior tags exist ('v0.1.0' for git, '0.0.1' for gar)
 * @property {string} [message] - Tag annotation message
 * @property {boolean} [dryRun=false] - Preview next tag without writing or pushing
 * @property {boolean} [push=false] - Push generated tag to git remote
 * @property {boolean} [sync=false] - Sync version to project manifest files (package.json, pyproject.toml, etc.)
 * @property {string} [remote='origin'] - Git remote name
 * @property {boolean} [allowDirty=false] - Allow tag generation even if git tree has changes
 * @property {string} [cwd=process.cwd()] - Target directory
 */
/**
 * Built-in source providers
 */
const providers = {
  git: {
    defaultInitial: 'v0.1.0',
    validate(opts) {
      if (!isGitRepo(opts.cwd)) {
        throw new Error(`The directory "${opts.cwd}" is not a valid Git repository.`);
      }
      if (!opts.allowDirty && !isWorkingTreeClean(opts.cwd)) {
        throw new Error('Working directory has uncommitted changes. Commit or stash them, or use --allow-dirty.');
      }
    },
    getLatestTag(opts) {
      return getLatestTag(opts.prefix, opts.cwd);
    },
    afterBump(opts, nextTag, tagMessage) {
      let created = false;
      let pushed = false;
      let syncedManifests = [];
      let manifestCommit = null;

      const branch = getCurrentBranch(opts.cwd);

      if (opts.sync) {
        const cleanVersion = formatTag(nextTag, '');
        const filter = typeof opts.sync === 'string' ? opts.sync : null;
        const syncResult = syncManifests(cleanVersion, opts.cwd, opts.dryRun, filter);
        syncedManifests = syncResult.synced;

        if (!opts.dryRun && syncResult.files.length > 0) {
          manifestCommit = `chore(release): ${nextTag}`;
          commitFiles(syncResult.files, manifestCommit, opts.cwd);
        }
      }

      if (!opts.dryRun) {
        createTag(nextTag, tagMessage, opts.cwd);
        created = true;

        if (opts.push) {
          if (manifestCommit && branch) {
            pushBranch(branch, opts.remote, opts.cwd);
          }
          pushTag(nextTag, opts.remote, opts.cwd);
          pushed = true;
        }
      }

      return {
        branch,
        created,
        pushed,
        commits: getCommitsSince(opts.currentTag, 10, opts.cwd),
        manifests: syncedManifests,
        manifestCommit
      };
    }
  },
  gar: {
    defaultInitial: '0.0.1',
    validate(opts) {
      if (!opts.image) {
        throw new Error('Image name is mandatory when using "--source gar". Specify --image <name>.');
      }
    },
    getLatestTag(opts) {
      return getLatestGARTag(opts.image, opts.prefix, opts.limit);
    },
    afterBump(opts, nextTag) {
      let syncedManifests = [];
      if (opts.sync) {
        const cleanVersion = formatTag(nextTag, '');
        const filter = typeof opts.sync === 'string' ? opts.sync : null;
        const syncResult = syncManifests(cleanVersion, opts.cwd, opts.dryRun, filter);
        syncedManifests = syncResult.synced;
      }
      return {
        branch: null,
        created: false,
        pushed: false,
        commits: [],
        manifests: syncedManifests,
        manifestCommit: null
      };
    }
  }
};

// Alias gcp -> gar
providers.gcp = providers.gar;

/**
 * Register a custom source provider.
 * @param {string} name - Source name (e.g. 'ecr', 'docker')
 * @param {object} provider - Provider implementation
 */
export function registerProvider(name, provider) {
  if (!name || typeof name !== 'string') {
    throw new Error('Provider name is required.');
  }
  if (!provider || typeof provider.getLatestTag !== 'function') {
    throw new Error('Provider must implement a getLatestTag method.');
  }
  providers[name.toLowerCase()] = provider;
}

/**
 * Get all registered provider names.
 * @returns {string[]}
 */
export function getRegisteredProviders() {
  return Object.keys(providers);
}

/**
 * Generate and calculate next semver tag for any supported source provider.
 * @param {TagmaticOptions} [options={}]
 * @returns {Promise<{
 *   source: string,
 *   image?: string,
 *   currentTag: string|null,
 *   nextTag: string,
 *   branch: string|null,
 *   dryRun: boolean,
 *   created: boolean,
 *   pushed: boolean,
 *   message: string,
 *   commits: string[]
 * }>}
 */
export async function generateTag(options = {}) {
  const {
    source: rawSource = options.image ? 'gar' : 'git',
    image,
    limit = 25,
    type = 'patch',
    prefix,
    initialVersion,
    message,
    dryRun = false,
    push = false,
    sync = false,
    remote = 'origin',
    allowDirty = false,
    cwd = process.cwd()
  } = options;

  const sourceKey = rawSource.toLowerCase();
  const provider = providers[sourceKey];

  if (!provider) {
    const available = Object.keys(providers).filter(k => k !== 'gcp').join(', ');
    throw new Error(`Unsupported source: "${rawSource}". Available sources are: ${available}.`);
  }

  const effectivePrefix = prefix !== undefined ? prefix : (sourceKey === 'gar' ? '' : 'v');

  const opts = {
    source: sourceKey,
    image,
    limit,
    type,
    prefix: effectivePrefix,
    initialVersion,
    message,
    dryRun,
    push,
    sync,
    remote,
    allowDirty,
    cwd
  };

  if (typeof provider.validate === 'function') {
    provider.validate(opts);
  }

  const defaultInitial = provider.defaultInitial || 'v0.1.0';
  const effectiveInitial = initialVersion !== undefined ? initialVersion : defaultInitial;

  const currentTag = provider.getLatestTag(opts);
  opts.currentTag = currentTag;

  let nextTag;
  if (!currentTag) {
    if (!isValidVersion(effectiveInitial)) {
      throw new Error(`Invalid initialVersion format: "${effectiveInitial}".`);
    }
    nextTag = formatTag(effectiveInitial, effectivePrefix);
  } else {
    // When bumping an existing tag, preserve its prefix unless prefix was explicitly passed
    nextTag = bumpVersion(currentTag, type, { prefix });
  }

  const tagMessage = message || `Release ${nextTag}`;
  const metadata = typeof provider.afterBump === 'function' ? provider.afterBump(opts, nextTag, tagMessage) : {};

  return {
    source: sourceKey,
    image,
    currentTag,
    nextTag,
    branch: metadata.branch ?? null,
    dryRun: Boolean(dryRun),
    created: Boolean(metadata.created),
    pushed: Boolean(metadata.pushed),
    message: tagMessage,
    commits: metadata.commits || [],
    manifests: metadata.manifests || [],
    manifestCommit: metadata.manifestCommit || null
  };
}

export default generateTag;
