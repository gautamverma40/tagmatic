import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemver,
  isValidVersion,
  formatTag,
  compareVersions,
  sortVersions,
  bumpVersion
} from '../src/version.js';

describe('Version Utilities', () => {
  describe('parseSemver', () => {
    it('should parse standard semver with v prefix', () => {
      const parsed = parseSemver('v1.2.3');
      assert.deepEqual(parsed, {
        prefix: 'v',
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: null,
        build: null,
        raw: 'v1.2.3'
      });
    });

    it('should parse semver without prefix', () => {
      const parsed = parseSemver('2.4.10');
      assert.deepEqual(parsed, {
        prefix: '',
        major: 2,
        minor: 4,
        patch: 10,
        prerelease: null,
        build: null,
        raw: '2.4.10'
      });
    });

    it('should parse prerelease and build metadata', () => {
      const parsed = parseSemver('v3.0.0-rc.1+build.42');
      assert.equal(parsed?.major, 3);
      assert.equal(parsed?.prerelease, 'rc.1');
      assert.equal(parsed?.build, 'build.42');
    });

    it('should parse custom prefixes', () => {
      const parsed = parseSemver('release-1.2.3');
      assert.deepEqual(parsed, {
        prefix: 'release-',
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: null,
        build: null,
        raw: 'release-1.2.3'
      });
    });

    it('should parse with expectedPrefix', () => {
      const parsed = parseSemver('release-1.0.0', 'release-');
      assert.equal(parsed?.major, 1);
      assert.equal(parseSemver('v1.0.0', 'release-'), null);
    });

    it('should return null for invalid versions', () => {
      assert.equal(parseSemver('invalid-version'), null);
      assert.equal(parseSemver('1.2'), null);
      assert.equal(parseSemver('1.2.3.4'), null);
      assert.equal(parseSemver(''), null);
      assert.equal(parseSemver(null), null);
    });
  });

  describe('isValidVersion', () => {
    it('should return true for valid semver strings', () => {
      assert.equal(isValidVersion('v0.1.0'), true);
      assert.equal(isValidVersion('1.0.0'), true);
      assert.equal(isValidVersion('release-1.0.0'), true);
      assert.equal(isValidVersion('v2.1.3-beta.0'), true);
    });

    it('should return false for invalid semver strings', () => {
      assert.equal(isValidVersion('abc'), false);
      assert.equal(isValidVersion('1.2.x'), false);
      assert.equal(isValidVersion('1.2.3.4'), false);
    });
  });

  describe('formatTag', () => {
    it('should add default prefix to raw version', () => {
      assert.equal(formatTag('1.2.3'), 'v1.2.3');
    });

    it('should allow custom prefix', () => {
      assert.equal(formatTag('1.2.3', 'release-'), 'release-1.2.3');
    });

    it('should allow empty prefix', () => {
      assert.equal(formatTag('v1.2.3', ''), '1.2.3');
    });

    it('should throw for invalid version', () => {
      assert.throws(() => formatTag('not-a-version'), /Invalid semver/);
    });
  });

  describe('compareVersions', () => {
    it('should compare major versions', () => {
      assert.equal(compareVersions('v2.0.0', 'v1.0.0'), 1);
      assert.equal(compareVersions('v1.0.0', 'v2.0.0'), -1);
    });

    it('should compare minor versions', () => {
      assert.equal(compareVersions('v1.3.0', 'v1.2.0'), 1);
      assert.equal(compareVersions('v1.2.0', 'v1.3.0'), -1);
    });

    it('should compare patch versions', () => {
      assert.equal(compareVersions('v1.2.4', 'v1.2.3'), 1);
      assert.equal(compareVersions('v1.2.3', 'v1.2.4'), -1);
    });

    it('should treat release higher than prerelease', () => {
      assert.equal(compareVersions('v1.0.0', 'v1.0.0-rc.1'), 1);
      assert.equal(compareVersions('v1.0.0-rc.1', 'v1.0.0'), -1);
    });

    it('should compare prerelease numbers numerically per SemVer 2.0', () => {
      assert.equal(compareVersions('v1.0.0-alpha.10', 'v1.0.0-alpha.2'), 1);
      assert.equal(compareVersions('v1.0.0-alpha.2', 'v1.0.0-alpha.10'), -1);
    });

    it('should return 0 for equal versions', () => {
      assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
    });
  });

  describe('sortVersions', () => {
    it('should sort versions descending by default', () => {
      const tags = ['v0.1.0', 'v2.0.0', 'v1.5.0', 'v1.2.3'];
      assert.deepEqual(sortVersions(tags), ['v2.0.0', 'v1.5.0', 'v1.2.3', 'v0.1.0']);
    });

    it('should sort versions ascending when requested', () => {
      const tags = ['v2.0.0', 'v0.1.0', 'v1.0.0'];
      assert.deepEqual(sortVersions(tags, 'asc'), ['v0.1.0', 'v1.0.0', 'v2.0.0']);
    });
  });

  describe('bumpVersion', () => {
    it('should bump patch version', () => {
      assert.equal(bumpVersion('v1.2.3', 'patch'), 'v1.2.4');
      assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
    });

    it('should bump minor version and reset patch', () => {
      assert.equal(bumpVersion('v1.2.9', 'minor'), 'v1.3.0');
    });

    it('should bump major version and reset minor and patch', () => {
      assert.equal(bumpVersion('v1.5.9', 'major'), 'v2.0.0');
    });

    it('should preserve existing custom prefix', () => {
      assert.equal(bumpVersion('release-1.2.0', 'minor'), 'release-1.3.0');
    });

    it('should support custom prefix override', () => {
      assert.equal(bumpVersion('v1.0.0', 'minor', { prefix: 'tag-' }), 'tag-1.1.0');
    });

    it('should throw on invalid bump type', () => {
      assert.throws(() => bumpVersion('v1.0.0', 'unknown'), /Invalid bump type/);
      assert.throws(() => bumpVersion('v1.0.0', null), /Invalid bump type/);
    });

    it('should throw on invalid version string', () => {
      assert.throws(() => bumpVersion('invalid', 'patch'), /Cannot bump invalid version/);
    });
  });
});
