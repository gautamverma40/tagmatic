/**
 * Version parsing, validation, and semver bumping utilities
 */

const PURE_SEMVER_PATTERN = '(?<major>0|[1-9]\\d*)\\.(?<minor>0|[1-9]\\d*)\\.(?<patch>0|[1-9]\\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\\+(?<build>[0-9A-Za-z.-]+))?$';
const PURE_SEMVER_REGEX = new RegExp(`^${PURE_SEMVER_PATTERN}`);
const SEMVER_REGEX = new RegExp(`^(?<prefix>[a-zA-Z@/_-][a-zA-Z0-9@/_.-]*?[a-zA-Z@/_-]|[vV])?${PURE_SEMVER_PATTERN}`);

/**
 * Parse a semver version string into its components.
 * @param {string} versionStr - e.g. "v1.2.3", "1.2.3", "release-1.2.3", "v2.0.0-beta.1"
 * @param {string} [expectedPrefix] - optional expected prefix to match against
 * @returns {{ prefix: string, major: number, minor: number, patch: number, prerelease: string|null, build: string|null, raw: string } | null}
 */
export function parseSemver(versionStr, expectedPrefix) {
  if (typeof versionStr !== 'string') return null;
  const str = versionStr.trim();

  if (expectedPrefix !== undefined && expectedPrefix !== null) {
    if (!str.startsWith(expectedPrefix)) return null;
    const pure = str.slice(expectedPrefix.length);
    const match = pure.match(PURE_SEMVER_REGEX);
    if (!match || !match.groups) return null;
    return {
      prefix: expectedPrefix,
      major: parseInt(match.groups.major, 10),
      minor: parseInt(match.groups.minor, 10),
      patch: parseInt(match.groups.patch, 10),
      prerelease: match.groups.prerelease || null,
      build: match.groups.build || null,
      raw: str
    };
  }

  const match = str.match(SEMVER_REGEX);
  if (!match || !match.groups) return null;

  return {
    prefix: match.groups.prefix || '',
    major: parseInt(match.groups.major, 10),
    minor: parseInt(match.groups.minor, 10),
    patch: parseInt(match.groups.patch, 10),
    prerelease: match.groups.prerelease || null,
    build: match.groups.build || null,
    raw: str
  };
}

/**
 * Check if a version string is valid semver.
 * @param {string} versionStr
 * @param {string} [expectedPrefix]
 * @returns {boolean}
 */
export function isValidVersion(versionStr, expectedPrefix) {
  return parseSemver(versionStr, expectedPrefix) !== null;
}

/**
 * Format a version string with an optional prefix.
 * @param {string} versionStr
 * @param {string} [prefix='v']
 * @returns {string}
 */
export function formatTag(versionStr, prefix = 'v') {
  const parsed = parseSemver(versionStr);
  if (!parsed) {
    throw new Error(`Invalid semver version: "${versionStr}"`);
  }
  const cleanVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}` +
    (parsed.prerelease ? `-${parsed.prerelease}` : '') +
    (parsed.build ? `+${parsed.build}` : '');

  return `${prefix}${cleanVersion}`;
}

/**
 * Compare prerelease identifiers according to SemVer 2.0.
 * @param {string} pre1
 * @param {string} pre2
 * @returns {number}
 */
function comparePrereleases(pre1, pre2) {
  const parts1 = pre1.split('.');
  const parts2 = pre2.split('.');
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i];
    const p2 = parts2[i];

    if (p1 === undefined) return -1;
    if (p2 === undefined) return 1;
    if (p1 === p2) continue;

    const isNum1 = /^\d+$/.test(p1);
    const isNum2 = /^\d+$/.test(p2);

    if (isNum1 && isNum2) {
      const n1 = parseInt(p1, 10);
      const n2 = parseInt(p2, 10);
      if (n1 !== n2) return n1 > n2 ? 1 : -1;
    } else if (isNum1 && !isNum2) {
      return -1;
    } else if (!isNum1 && isNum2) {
      return 1;
    } else {
      const cmp = p1.localeCompare(p2);
      if (cmp !== 0) return cmp > 0 ? 1 : -1;
    }
  }

  return 0;
}

/**
 * Compare two semver strings.
 * Returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2.
 * @param {string} v1
 * @param {string} v2
 * @returns {number}
 */
export function compareVersions(v1, v2) {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (!p1 || !p2) {
    throw new Error(`Cannot compare invalid versions: "${v1}", "${v2}"`);
  }

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // Prerelease comparison (normal release > prerelease)
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease && p2.prerelease) {
    return comparePrereleases(p1.prerelease, p2.prerelease);
  }

  return 0;
}

/**
 * Sort a list of versions.
 * @param {string[]} versions
 * @param {'asc' | 'desc'} [direction='desc']
 * @returns {string[]}
 */
export function sortVersions(versions, direction = 'desc') {
  return [...versions].filter(v => isValidVersion(v)).sort((a, b) => {
    const cmp = compareVersions(a, b);
    return direction === 'asc' ? cmp : -cmp;
  });
}

/**
 * Bump a semver version.
 * @param {string} versionStr - current version (e.g. "v1.2.3")
 * @param {'major' | 'minor' | 'patch'} type - bump type
 * @param {object} [options]
 * @param {boolean} [options.keepPrefix=true] - preserve prefix from input or apply default
 * @param {string} [options.prefix] - override prefix
 * @returns {string}
 */
export function bumpVersion(versionStr, type = 'patch', options = {}) {
  const parsed = parseSemver(versionStr);
  if (!parsed) {
    throw new Error(`Cannot bump invalid version: "${versionStr}"`);
  }

  if (!type || typeof type !== 'string') {
    throw new Error(`Invalid bump type: "${type}". Allowed values are: 'major', 'minor', 'patch'.`);
  }

  const { keepPrefix = true, prefix: forcedPrefix } = options;
  const prefix = forcedPrefix !== undefined ? forcedPrefix : (keepPrefix ? parsed.prefix : '');

  let { major, minor, patch } = parsed;

  switch (type.toLowerCase()) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
    default:
      throw new Error(`Invalid bump type: "${type}". Allowed values are: 'major', 'minor', 'patch'.`);
  }

  return `${prefix}${major}.${minor}.${patch}`;
}
