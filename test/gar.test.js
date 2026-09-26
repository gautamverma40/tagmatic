import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isGcloudInstalled, fetchGARTags, getLatestGARTag } from '../src/gar.js';
import { generateTag } from '../src/tagmatic.js';
import { parseArgs } from '../src/cli.js';

describe('Google Artifact Registry (GAR) Provider', () => {
  describe('isGcloudInstalled', () => {
    it('should return a boolean', () => {
      assert.equal(typeof isGcloudInstalled(), 'boolean');
    });
  });

  describe('fetchGARTags', () => {
    it('should throw an error if image name is missing', () => {
      assert.throws(() => fetchGARTags(), /Image name is mandatory/);
      assert.throws(() => fetchGARTags(''), /Image name is mandatory/);
    });

    it('should invoke gcloud with correct arguments and parse comma, semicolon, newline delimited tags', () => {
      let passedCmd = null;
      let passedArgs = null;

      const mockExec = (cmd, args) => {
        passedCmd = cmd;
        passedArgs = args;
        return 'v1.0.0, latest; production\nv1.1.0\nsha-abc123';
      };

      const tags = fetchGARTags('us-east4-docker.pkg.dev/project/repo/image', 15, mockExec);

      assert.equal(passedCmd, 'gcloud');
      assert.deepEqual(passedArgs, [
        'artifacts',
        'docker',
        'images',
        'list',
        'us-east4-docker.pkg.dev/project/repo/image',
        '--include-tags',
        '--sort-by=~CREATE_TIME',
        '--limit=15',
        '--format=value(tags)'
      ]);

      assert.deepEqual(tags, ['v1.0.0', 'latest', 'production', 'v1.1.0', 'sha-abc123']);
    });

    it('should return empty array if gcloud output is empty', () => {
      const mockExec = () => '';
      const tags = fetchGARTags('my-image', 25, mockExec);
      assert.deepEqual(tags, []);
    });

    it('should wrap execution errors with descriptive message', () => {
      const mockExec = () => {
        const err = new Error('Permission denied');
        err.stderr = Buffer.from('Denied');
        throw err;
      };

      assert.throws(
        () => fetchGARTags('my-image', 25, mockExec),
        /Failed to fetch tags from Google Artifact Registry.*Denied/
      );
    });
  });

  describe('getLatestGARTag', () => {
    it('should return highest semver tag and ignore non-semver tags', () => {
      const mockFetch = () => ['latest', 'v0.9.0', 'v1.2.3', 'production', 'v1.10.0', 'master', 'sha-1234'];
      const latest = getLatestGARTag('my-image', 'v', 25, mockFetch);
      assert.equal(latest, 'v1.10.0');
    });

    it('should support unprefixed semver tags when prefix is empty string', () => {
      const mockFetch = () => ['v2.0.0', '1.5.0', '1.8.2', 'latest'];
      const latest = getLatestGARTag('my-image', '', 25, mockFetch);
      assert.equal(latest, '1.8.2');
    });

    it('should support custom prefixes like release-', () => {
      const mockFetch = () => ['release-1.0.0', 'release-1.2.0', 'v9.9.9'];
      const latest = getLatestGARTag('my-image', 'release-', 25, mockFetch);
      assert.equal(latest, 'release-1.2.0');
    });

    it('should return null when no semver tags match', () => {
      const mockFetch = () => ['latest', 'staging', 'commit-sha'];
      const latest = getLatestGARTag('my-image', 'v', 25, mockFetch);
      assert.equal(latest, null);
    });

    it('should return null when image has no tags at all', () => {
      const mockFetch = () => [];
      const latest = getLatestGARTag('my-image', 'v', 25, mockFetch);
      assert.equal(latest, null);
    });
  });

  describe('generateTag with GAR', () => {
    it('should fail if image is not provided for source: gar', async () => {
      await assert.rejects(
        async () => {
          await generateTag({ source: 'gar' });
        },
        /Image name is mandatory/
      );
    });

    it('should default source to gar when image is provided', () => {
      const parsed = parseArgs(['--image', 'us-east4-docker.pkg.dev/project/repo/image']);
      assert.equal(parsed.source, 'gar');
      assert.equal(parsed.image, 'us-east4-docker.pkg.dev/project/repo/image');
    });

    it('should parse positional image and bump type syntax', () => {
      const parsed = parseArgs(['us-east4-docker.pkg.dev/project/repo/image', 'minor']);
      assert.equal(parsed.source, 'gar');
      assert.equal(parsed.image, 'us-east4-docker.pkg.dev/project/repo/image');
      assert.equal(parsed.type, 'minor');
    });

    it('should support quiet flag in CLI parser', () => {
      const parsed = parseArgs(['--image', 'pkg.dev/repo/img', '-q']);
      assert.equal(parsed.quiet, true);
    });
  });
});
