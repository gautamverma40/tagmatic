import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateTag } from '../src/tagmatic.js';
import { parseArgs, printHelp } from '../src/cli.js';

describe('Tagmatic Core Module', () => {
  it('should export generateTag function', () => {
    assert.equal(typeof generateTag, 'function');
  });

  it('should fail gracefully when run outside a git repository', async () => {
    await assert.rejects(
      async () => {
        await generateTag({ cwd: '/' });
      },
      /not a valid Git repository/
    );
  });

  it('should export printHelp from cli', () => {
    assert.equal(typeof printHelp, 'function');
  });
});

describe('CLI Argument Parser (parseArgs)', () => {
  it('should parse default options when no args provided', () => {
    const opts = parseArgs([]);
    assert.equal(opts.type, 'patch');
    assert.equal(opts.prefix, 'v');
    assert.equal(opts.initialVersion, 'v0.1.0');
    assert.equal(opts.dryRun, false);
    assert.equal(opts.push, false);
    assert.equal(opts.allowDirty, false);
    assert.equal(opts.remote, 'origin');
  });

  it('should parse space-separated flags', () => {
    const argv = [
      '-t', 'minor',
      '-p', 'release-',
      '-m', 'Custom release message',
      '-d',
      '--push',
      '-r', 'upstream',
      '--allow-dirty',
      '-i', 'v1.0.0'
    ];
    const opts = parseArgs(argv);
    assert.equal(opts.type, 'minor');
    assert.equal(opts.prefix, 'release-');
    assert.equal(opts.message, 'Custom release message');
    assert.equal(opts.dryRun, true);
    assert.equal(opts.push, true);
    assert.equal(opts.remote, 'upstream');
    assert.equal(opts.allowDirty, true);
    assert.equal(opts.initialVersion, 'v1.0.0');
  });

  it('should parse flags with equal sign syntax and preserve inner equal signs', () => {
    const argv = [
      '--type=major',
      '--prefix=v',
      '--message=fix: foo=bar and baz=qux',
      '--remote=backup',
      '--initial=v0.0.1'
    ];
    const opts = parseArgs(argv);
    assert.equal(opts.type, 'major');
    assert.equal(opts.prefix, 'v');
    assert.equal(opts.message, 'fix: foo=bar and baz=qux');
    assert.equal(opts.remote, 'backup');
    assert.equal(opts.initialVersion, 'v0.0.1');
  });

  it('should support --no-prefix flag', () => {
    const opts = parseArgs(['--no-prefix']);
    assert.equal(opts.prefix, '');
  });
});

describe('End-to-End generateTag Integration', () => {
  function createTempGitRepo() {
    const repoPath = mkdtempSync(join(tmpdir(), 'tagmatic-test-'));
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoPath, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath, stdio: 'pipe' });
    writeFileSync(join(repoPath, 'file.txt'), 'hello');
    execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: repoPath, stdio: 'pipe' });
    return repoPath;
  }

  it('should generate initial tag in clean repository', async () => {
    const repo = createTempGitRepo();
    try {
      const res = await generateTag({ cwd: repo, dryRun: true });
      assert.equal(res.currentTag, null);
      assert.equal(res.nextTag, 'v0.1.0');
      assert.equal(res.isDryRun, true);
      assert.equal(res.created, false);
      assert.ok(res.commits.length > 0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('should create actual tag and bump subsequently', async () => {
    const repo = createTempGitRepo();
    try {
      // 1. Create first tag
      const res1 = await generateTag({ cwd: repo, dryRun: false });
      assert.equal(res1.nextTag, 'v0.1.0');
      assert.equal(res1.created, true);

      // 2. Add another commit
      writeFileSync(join(repo, 'file2.txt'), 'second file');
      execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', 'feat: second commit'], { cwd: repo, stdio: 'pipe' });

      // 3. Generate patch bump
      const res2 = await generateTag({ cwd: repo, type: 'patch', dryRun: true });
      assert.equal(res2.currentTag, 'v0.1.0');
      assert.equal(res2.nextTag, 'v0.1.1');

      // 4. Generate minor bump
      const res3 = await generateTag({ cwd: repo, type: 'minor', dryRun: true });
      assert.equal(res3.currentTag, 'v0.1.0');
      assert.equal(res3.nextTag, 'v0.2.0');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('should support custom prefixes end-to-end', async () => {
    const repo = createTempGitRepo();
    try {
      // Create initial tag with release- prefix
      const res1 = await generateTag({ cwd: repo, prefix: 'release-', dryRun: false });
      assert.equal(res1.nextTag, 'release-0.1.0');
      assert.equal(res1.created, true);

      // Add a commit
      writeFileSync(join(repo, 'update.txt'), 'update');
      execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', 'fix: bug fix'], { cwd: repo, stdio: 'pipe' });

      // Bump with release- prefix
      const res2 = await generateTag({ cwd: repo, prefix: 'release-', type: 'minor', dryRun: true });
      assert.equal(res2.currentTag, 'release-0.1.0');
      assert.equal(res2.nextTag, 'release-0.2.0');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('should reject dirty working trees unless allowDirty is true', async () => {
    const repo = createTempGitRepo();
    try {
      writeFileSync(join(repo, 'dirty.txt'), 'uncommitted');
      await assert.rejects(
        async () => {
          await generateTag({ cwd: repo });
        },
        /uncommitted changes/
      );

      const res = await generateTag({ cwd: repo, allowDirty: true, dryRun: true });
      assert.equal(res.nextTag, 'v0.1.0');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
