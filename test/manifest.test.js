import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectManifests, syncManifests, synchronizers } from '../src/manifest.js';

describe('Manifest Utilities', () => {
  function createTempDir() {
    return mkdtempSync(join(tmpdir(), 'manifest-test-'));
  }

  describe('detectManifests', () => {
    it('should return empty array when no manifests exist', () => {
      const dir = createTempDir();
      try {
        const manifests = detectManifests(dir);
        assert.deepEqual(manifests, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect package.json', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '1.2.3' }, null, 2));
        const manifests = detectManifests(dir);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].type, 'npm');
        assert.equal(manifests[0].file, 'package.json');
        assert.equal(manifests[0].currentVersion, '1.2.3');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect pyproject.toml with [project]', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'pyproject.toml'), `[project]\nname = "my-app"\nversion = "0.4.2"\n`);
        const manifests = detectManifests(dir);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].type, 'python');
        assert.equal(manifests[0].currentVersion, '0.4.2');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect pyproject.toml with [tool.poetry]', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'pyproject.toml'), `[tool.poetry]\nname = "poetry-app"\nversion = "1.0.0-rc.1"\n`);
        const manifests = detectManifests(dir);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].type, 'python');
        assert.equal(manifests[0].currentVersion, '1.0.0-rc.1');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect Cargo.toml', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'Cargo.toml'), `[package]\nname = "rust-crate"\nversion = "0.2.1"\n`);
        const manifests = detectManifests(dir);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].type, 'rust');
        assert.equal(manifests[0].currentVersion, '0.2.1');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect composer.json only if version is present', () => {
      const dir = createTempDir();
      try {
        // Without version: should not detect
        writeFileSync(join(dir, 'composer.json'), JSON.stringify({ name: 'vendor/package' }));
        assert.equal(detectManifests(dir).length, 0);

        // With version: should detect
        writeFileSync(join(dir, 'composer.json'), JSON.stringify({ name: 'vendor/package', version: '2.0.0' }));
        const manifests = detectManifests(dir);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].type, 'php');
        assert.equal(manifests[0].currentVersion, '2.0.0');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect deno.json if version is present', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'deno.json'), JSON.stringify({ name: 'deno-mod', version: '0.1.0' }, null, 2));
        const manifests = detectManifests(dir);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].type, 'deno');
        assert.equal(manifests[0].currentVersion, '0.1.0');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('syncManifests', () => {
    it('should sync package.json and preserve indentation and trailing newline', () => {
      const dir = createTempDir();
      try {
        const pkgContent = '{\n  "name": "sample",\n  "version": "1.0.0"\n}\n';
        writeFileSync(join(dir, 'package.json'), pkgContent);

        const result = syncManifests('1.1.0', dir, false);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].oldVersion, '1.0.0');
        assert.equal(result.synced[0].newVersion, '1.1.0');

        const updated = readFileSync(join(dir, 'package.json'), 'utf8');
        assert.equal(updated, '{\n  "name": "sample",\n  "version": "1.1.0"\n}\n');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should sync package-lock.json alongside package.json', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sample', version: '1.0.0' }, null, 2) + '\n');
        writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
          name: 'sample',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': { name: 'sample', version: '1.0.0' }
          }
        }, null, 2) + '\n');

        const result = syncManifests('2.0.0', dir, false);
        assert.equal(result.files.length, 2);
        assert.ok(result.files.includes('package.json'));
        assert.ok(result.files.includes('package-lock.json'));

        const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
        assert.equal(lock.version, '2.0.0');
        assert.equal(lock.packages[''].version, '2.0.0');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should sync pyproject.toml', () => {
      const dir = createTempDir();
      try {
        const tomlContent = `[project]\nname = "cool-pkg"\nversion = "0.5.0"\ndescription = "A package"\n`;
        writeFileSync(join(dir, 'pyproject.toml'), tomlContent);

        const result = syncManifests('0.6.0', dir, false);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].oldVersion, '0.5.0');
        assert.equal(result.synced[0].newVersion, '0.6.0');

        const updated = readFileSync(join(dir, 'pyproject.toml'), 'utf8');
        assert.ok(updated.includes('version = "0.6.0"'));
        assert.ok(updated.includes('description = "A package"'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should sync Cargo.toml', () => {
      const dir = createTempDir();
      try {
        const cargoContent = `[package]\nname = "my-crate"\nversion = "0.1.0"\nedition = "2021"\n`;
        writeFileSync(join(dir, 'Cargo.toml'), cargoContent);

        const result = syncManifests('0.2.0', dir, false);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].oldVersion, '0.1.0');
        assert.equal(result.synced[0].newVersion, '0.2.0');

        const updated = readFileSync(join(dir, 'Cargo.toml'), 'utf8');
        assert.ok(updated.includes('version = "0.2.0"'));
        assert.ok(updated.includes('edition = "2021"'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should not modify files when dryRun is true', () => {
      const dir = createTempDir();
      try {
        const pkgContent = '{\n  "name": "sample",\n  "version": "1.0.0"\n}\n';
        writeFileSync(join(dir, 'package.json'), pkgContent);

        const result = syncManifests('1.1.0', dir, true);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].oldVersion, '1.0.0');
        assert.equal(result.synced[0].newVersion, '1.1.0');

        // File on disk must NOT have changed
        const unchanged = readFileSync(join(dir, 'package.json'), 'utf8');
        assert.equal(unchanged, pkgContent);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect and sync Maven pom.xml', () => {
      const dir = createTempDir();
      try {
        const pomContent = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo-app</artifactId>
  <version>1.0.0</version>
</project>
`;
        writeFileSync(join(dir, 'pom.xml'), pomContent);

        const detected = detectManifests(dir);
        assert.equal(detected.length, 1);
        assert.equal(detected[0].type, 'maven');
        assert.equal(detected[0].currentVersion, '1.0.0');

        const result = syncManifests('1.0.1', dir, false);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].type, 'maven');
        assert.equal(result.synced[0].oldVersion, '1.0.0');
        assert.equal(result.synced[0].newVersion, '1.0.1');

        const updated = readFileSync(join(dir, 'pom.xml'), 'utf8');
        assert.ok(updated.includes('<version>1.0.1</version>'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect and sync Gradle gradle.properties', () => {
      const dir = createTempDir();
      try {
        const propsContent = `group=com.example\nversion = 2.1.0\n`;
        writeFileSync(join(dir, 'gradle.properties'), propsContent);

        const detected = detectManifests(dir);
        assert.equal(detected.length, 1);
        assert.equal(detected[0].type, 'gradle');
        assert.equal(detected[0].currentVersion, '2.1.0');

        const result = syncManifests('2.2.0', dir, false);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].newVersion, '2.2.0');

        const updated = readFileSync(join(dir, 'gradle.properties'), 'utf8');
        assert.ok(updated.includes('version = 2.2.0'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should detect and sync Gradle build.gradle', () => {
      const dir = createTempDir();
      try {
        const buildContent = `plugins { id 'java' }\nversion = '0.9.0'\n`;
        writeFileSync(join(dir, 'build.gradle'), buildContent);

        const detected = detectManifests(dir);
        assert.equal(detected.length, 1);
        assert.equal(detected[0].type, 'gradle');
        assert.equal(detected[0].currentVersion, '0.9.0');

        const result = syncManifests('1.0.0', dir, false);
        assert.equal(result.synced.length, 1);
        assert.equal(result.synced[0].newVersion, '1.0.0');

        const updated = readFileSync(join(dir, 'build.gradle'), 'utf8');
        assert.ok(updated.includes("version = '1.0.0'"));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should sync all manifests when multiple exist in the same repository', () => {
      const dir = createTempDir();
      try {
        // Create both package.json and Cargo.toml and pom.xml
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'polyglot', version: '1.0.0' }, null, 2));
        writeFileSync(join(dir, 'Cargo.toml'), `[package]\nname = "core"\nversion = "1.0.0"\n`);
        writeFileSync(join(dir, 'pom.xml'), `<project><artifactId>backend</artifactId><version>1.0.0</version></project>`);

        const detected = detectManifests(dir);
        assert.equal(detected.length, 3);

        const result = syncManifests('1.1.0', dir, false);
        assert.equal(result.synced.length, 3);
        assert.equal(result.files.length, 3);

        assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '1.1.0');
        assert.ok(readFileSync(join(dir, 'Cargo.toml'), 'utf8').includes('version = "1.1.0"'));
        assert.ok(readFileSync(join(dir, 'pom.xml'), 'utf8').includes('<version>1.1.0</version>'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should support selective targeting with filter parameter', () => {
      const dir = createTempDir();
      try {
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'polyglot', version: '1.0.0' }, null, 2));
        writeFileSync(join(dir, 'Cargo.toml'), `[package]\nname = "core"\nversion = "1.0.0"\n`);

        // Target only npm
        const resultNpm = syncManifests('2.0.0', dir, false, 'npm');
        assert.equal(resultNpm.synced.length, 1);
        assert.equal(resultNpm.synced[0].type, 'npm');

        // package.json updated, Cargo.toml untouched
        assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '2.0.0');
        assert.ok(readFileSync(join(dir, 'Cargo.toml'), 'utf8').includes('version = "1.0.0"'));

        // Target by file name Cargo.toml
        const resultCargo = syncManifests('2.0.0', dir, false, 'Cargo.toml');
        assert.equal(resultCargo.synced.length, 1);
        assert.equal(resultCargo.synced[0].file, 'Cargo.toml');
        assert.ok(readFileSync(join(dir, 'Cargo.toml'), 'utf8').includes('version = "2.0.0"'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
