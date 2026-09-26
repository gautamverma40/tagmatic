import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Detect indentation in a JSON string.
 * @param {string} content
 * @returns {string|number}
 */
function detectIndentation(content) {
  const match = content.match(/^[ \t]+(?=")/m);
  return match ? match[0] : 2;
}

/**
 * Check if a file has a trailing newline.
 * @param {string} content
 * @returns {boolean}
 */
function hasTrailingNewline(content) {
  return content.endsWith('\n');
}

/**
 * Read and parse JSON file safely with metadata.
 * @param {string} filePath
 * @returns {{ data: object, indent: string|number, trailingNewline: boolean }|null}
 */
function readJsonFile(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const indent = detectIndentation(raw);
    const trailingNewline = hasTrailingNewline(raw);
    return { data, indent, trailingNewline };
  } catch {
    return null;
  }
}

/**
 * Write JSON data preserving indentation and trailing newline.
 * @param {string} filePath
 * @param {object} data
 * @param {string|number} indent
 * @param {boolean} trailingNewline
 */
function writeJsonFile(filePath, data, indent, trailingNewline) {
  const content = JSON.stringify(data, null, indent) + (trailingNewline ? '\n' : '');
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Manifest synchronizer definitions
 */
export const synchronizers = [
  // 1. Node.js: package.json and optional package-lock.json
  {
    type: 'npm',
    detect(cwd) {
      const pkgPath = join(cwd, 'package.json');
      if (!existsSync(pkgPath)) return null;
      const parsed = readJsonFile(pkgPath);
      if (!parsed || !parsed.data || typeof parsed.data.version !== 'string') return null;
      return {
        file: 'package.json',
        currentVersion: parsed.data.version
      };
    },
    sync(cwd, newVersion, dryRun = false) {
      const pkgPath = join(cwd, 'package.json');
      const parsed = readJsonFile(pkgPath);
      if (!parsed) return { updated: false, files: [] };

      const oldVersion = parsed.data.version;
      const filesModified = [];

      if (!dryRun) {
        parsed.data.version = newVersion;
        writeJsonFile(pkgPath, parsed.data, parsed.indent, parsed.trailingNewline);
      }
      filesModified.push('package.json');

      // Update package-lock.json if it exists
      const lockPath = join(cwd, 'package-lock.json');
      if (existsSync(lockPath)) {
        const lockParsed = readJsonFile(lockPath);
        if (lockParsed && lockParsed.data) {
          if (!dryRun) {
            lockParsed.data.version = newVersion;
            if (lockParsed.data.packages && lockParsed.data.packages['']) {
              lockParsed.data.packages[''].version = newVersion;
            }
            writeJsonFile(lockPath, lockParsed.data, lockParsed.indent, lockParsed.trailingNewline);
          }
          filesModified.push('package-lock.json');
        }
      }

      return {
        type: 'npm',
        file: 'package.json',
        oldVersion,
        newVersion,
        files: filesModified
      };
    }
  },

  // 2. Python: pyproject.toml (PEP 621 or Poetry)
  {
    type: 'python',
    detect(cwd) {
      const tomlPath = join(cwd, 'pyproject.toml');
      if (!existsSync(tomlPath)) return null;
      try {
        const content = readFileSync(tomlPath, 'utf8');
        // Match [project] version = "..." or [tool.poetry] version = "..."
        const match = content.match(/(?:^\[(?:project|tool\.poetry)\][\s\S]*?^version\s*=\s*["'])([^"']+)(?:["'])/m)
          || content.match(/^version\s*=\s*["']([^"']+)["']/m);
        if (!match) return null;
        return {
          file: 'pyproject.toml',
          currentVersion: match[1]
        };
      } catch {
        return null;
      }
    },
    sync(cwd, newVersion, dryRun = false) {
      const tomlPath = join(cwd, 'pyproject.toml');
      try {
        const content = readFileSync(tomlPath, 'utf8');
        let oldVersion = null;
        let updatedContent = null;

        // Try [project] or [tool.poetry] block first
        const scopedRegex = /(^\[(?:project|tool\.poetry)\][\s\S]*?^version\s*=\s*["'])([^"']+)(["'])/m;
        const scopedMatch = content.match(scopedRegex);

        if (scopedMatch) {
          oldVersion = scopedMatch[2];
          updatedContent = content.replace(scopedRegex, `$1${newVersion}$3`);
        } else {
          // Fallback to top-level version
          const generalRegex = /(^version\s*=\s*["'])([^"']+)(["'])/m;
          const generalMatch = content.match(generalRegex);
          if (generalMatch) {
            oldVersion = generalMatch[2];
            updatedContent = content.replace(generalRegex, `$1${newVersion}$3`);
          }
        }

        if (!oldVersion || updatedContent === null) {
          return { updated: false, files: [] };
        }

        if (!dryRun) {
          writeFileSync(tomlPath, updatedContent, 'utf8');
        }

        return {
          type: 'python',
          file: 'pyproject.toml',
          oldVersion,
          newVersion,
          files: ['pyproject.toml']
        };
      } catch {
        return { updated: false, files: [] };
      }
    }
  },

  // 3. Rust: Cargo.toml
  {
    type: 'rust',
    detect(cwd) {
      const cargoPath = join(cwd, 'Cargo.toml');
      if (!existsSync(cargoPath)) return null;
      try {
        const content = readFileSync(cargoPath, 'utf8');
        const match = content.match(/(?:^\[package\][\s\S]*?^version\s*=\s*["'])([^"']+)(?:["'])/m);
        if (!match) return null;
        return {
          file: 'Cargo.toml',
          currentVersion: match[1]
        };
      } catch {
        return null;
      }
    },
    sync(cwd, newVersion, dryRun = false) {
      const cargoPath = join(cwd, 'Cargo.toml');
      try {
        const content = readFileSync(cargoPath, 'utf8');
        const regex = /(^\[package\][\s\S]*?^version\s*=\s*["'])([^"']+)(["'])/m;
        const match = content.match(regex);
        if (!match) return { updated: false, files: [] };

        const oldVersion = match[2];
        const updatedContent = content.replace(regex, `$1${newVersion}$3`);

        if (!dryRun) {
          writeFileSync(cargoPath, updatedContent, 'utf8');
        }

        return {
          type: 'rust',
          file: 'Cargo.toml',
          oldVersion,
          newVersion,
          files: ['Cargo.toml']
        };
      } catch {
        return { updated: false, files: [] };
      }
    }
  },

  // 4. PHP: composer.json (only if version field explicitly exists)
  {
    type: 'php',
    detect(cwd) {
      const composerPath = join(cwd, 'composer.json');
      if (!existsSync(composerPath)) return null;
      const parsed = readJsonFile(composerPath);
      if (!parsed || !parsed.data || typeof parsed.data.version !== 'string') return null;
      return {
        file: 'composer.json',
        currentVersion: parsed.data.version
      };
    },
    sync(cwd, newVersion, dryRun = false) {
      const composerPath = join(cwd, 'composer.json');
      const parsed = readJsonFile(composerPath);
      if (!parsed || !parsed.data || typeof parsed.data.version !== 'string') {
        return { updated: false, files: [] };
      }

      const oldVersion = parsed.data.version;
      if (!dryRun) {
        parsed.data.version = newVersion;
        writeJsonFile(composerPath, parsed.data, parsed.indent, parsed.trailingNewline);
      }

      return {
        type: 'php',
        file: 'composer.json',
        oldVersion,
        newVersion,
        files: ['composer.json']
      };
    }
  },

  // 5. Deno: deno.json (only if version field explicitly exists)
  {
    type: 'deno',
    detect(cwd) {
      const denoPath = join(cwd, 'deno.json');
      if (!existsSync(denoPath)) return null;
      const parsed = readJsonFile(denoPath);
      if (!parsed || !parsed.data || typeof parsed.data.version !== 'string') return null;
      return {
        file: 'deno.json',
        currentVersion: parsed.data.version
      };
    },
    sync(cwd, newVersion, dryRun = false) {
      const denoPath = join(cwd, 'deno.json');
      const parsed = readJsonFile(denoPath);
      if (!parsed || !parsed.data || typeof parsed.data.version !== 'string') {
        return { updated: false, files: [] };
      }

      const oldVersion = parsed.data.version;
      if (!dryRun) {
        parsed.data.version = newVersion;
        writeJsonFile(denoPath, parsed.data, parsed.indent, parsed.trailingNewline);
      }

      return {
        type: 'deno',
        file: 'deno.json',
        oldVersion,
        newVersion,
        files: ['deno.json']
      };
    }
  },

  // 6. Java (Maven): pom.xml
  {
    type: 'maven',
    detect(cwd) {
      const pomPath = join(cwd, 'pom.xml');
      if (!existsSync(pomPath)) return null;
      try {
        const content = readFileSync(pomPath, 'utf8');
        const match = content.match(/<artifactId>[^<]+<\/artifactId>\s*<version>([^<]+)<\/version>/m)
          || content.match(/<version>([^<]+)<\/version>\s*<artifactId>[^<]+<\/artifactId>/m)
          || content.match(/<project[\s\S]*?^  <version>([^<]+)<\/version>/m);
        if (!match) return null;
        return {
          file: 'pom.xml',
          currentVersion: match[1].trim()
        };
      } catch {
        return null;
      }
    },
    sync(cwd, newVersion, dryRun = false) {
      const pomPath = join(cwd, 'pom.xml');
      try {
        const content = readFileSync(pomPath, 'utf8');
        const regex1 = /(<artifactId>[^<]+<\/artifactId>\s*<version>)([^<]+)(<\/version>)/m;
        const regex2 = /(<version>)([^<]+)(<\/version>\s*<artifactId>[^<]+<\/artifactId>)/m;
        const regex3 = /(^  <version>)([^<]+)(<\/version>)/m;

        let oldVersion = null;
        let updatedContent = null;

        if (content.match(regex1)) {
          oldVersion = content.match(regex1)[2].trim();
          updatedContent = content.replace(regex1, `$1${newVersion}$3`);
        } else if (content.match(regex2)) {
          oldVersion = content.match(regex2)[2].trim();
          updatedContent = content.replace(regex2, `$1${newVersion}$3`);
        } else if (content.match(regex3)) {
          oldVersion = content.match(regex3)[2].trim();
          updatedContent = content.replace(regex3, `$1${newVersion}$3`);
        }

        if (!oldVersion || !updatedContent) return { updated: false, files: [] };

        if (!dryRun) {
          writeFileSync(pomPath, updatedContent, 'utf8');
        }

        return {
          type: 'maven',
          file: 'pom.xml',
          oldVersion,
          newVersion,
          files: ['pom.xml']
        };
      } catch {
        return { updated: false, files: [] };
      }
    }
  },

  // 7. Java / Kotlin (Gradle): gradle.properties, build.gradle, or build.gradle.kts
  {
    type: 'gradle',
    detect(cwd) {
      // 1. Check gradle.properties first (recommended Gradle convention)
      const propsPath = join(cwd, 'gradle.properties');
      if (existsSync(propsPath)) {
        try {
          const content = readFileSync(propsPath, 'utf8');
          const match = content.match(/^version\s*=\s*([^\r\n#]+)/m);
          if (match) {
            return {
              file: 'gradle.properties',
              currentVersion: match[1].trim()
            };
          }
        } catch {}
      }

      // 2. Check build.gradle or build.gradle.kts
      for (const buildFile of ['build.gradle', 'build.gradle.kts']) {
        const filePath = join(cwd, buildFile);
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, 'utf8');
            const match = content.match(/^version\s*=\s*['"]([^'"]+)['"]/m);
            if (match) {
              return {
                file: buildFile,
                currentVersion: match[1].trim()
              };
            }
          } catch {}
        }
      }

      return null;
    },
    sync(cwd, newVersion, dryRun = false) {
      const propsPath = join(cwd, 'gradle.properties');
      if (existsSync(propsPath)) {
        try {
          const content = readFileSync(propsPath, 'utf8');
          const regex = /(^version\s*=\s*)([^\r\n#]+)/m;
          const match = content.match(regex);
          if (match) {
            const oldVersion = match[2].trim();
            if (!dryRun) {
              const updatedContent = content.replace(regex, `$1${newVersion}`);
              writeFileSync(propsPath, updatedContent, 'utf8');
            }
            return {
              type: 'gradle',
              file: 'gradle.properties',
              oldVersion,
              newVersion,
              files: ['gradle.properties']
            };
          }
        } catch {}
      }

      for (const buildFile of ['build.gradle', 'build.gradle.kts']) {
        const filePath = join(cwd, buildFile);
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, 'utf8');
            const regex = /(^version\s*=\s*['"])([^'"]+)(['"])/m;
            const match = content.match(regex);
            if (match) {
              const oldVersion = match[2].trim();
              if (!dryRun) {
                const updatedContent = content.replace(regex, `$1${newVersion}$3`);
                writeFileSync(filePath, updatedContent, 'utf8');
              }
              return {
                type: 'gradle',
                file: buildFile,
                oldVersion,
                newVersion,
                files: [buildFile]
              };
            }
          } catch {}
        }
      }

      return { updated: false, files: [] };
    }
  }
];

/**
 * Detect all supported manifests in the target directory with optional filtering.
 * @param {string} [cwd=process.cwd()]
 * @param {string|null} [filter=null] - Optional manifest type or file name (e.g. 'npm', 'pom.xml')
 * @returns {Array<{ type: string, file: string, currentVersion: string }>}
 */
export function detectManifests(cwd = process.cwd(), filter = null) {
  const detected = [];
  for (const sync of synchronizers) {
    const res = sync.detect(cwd);
    if (res) {
      if (filter && typeof filter === 'string') {
        const f = filter.toLowerCase().trim();
        const matchesType = sync.type.toLowerCase() === f;
        const matchesFile = res.file.toLowerCase() === f;
        if (!matchesType && !matchesFile) {
          continue;
        }
      }
      detected.push({
        type: sync.type,
        file: res.file,
        currentVersion: res.currentVersion
      });
    }
  }
  return detected;
}

/**
 * Synchronize all detected manifests to the new version with optional filtering.
 * @param {string} newVersion - Clean semver version (e.g. "1.2.3")
 * @param {string} [cwd=process.cwd()]
 * @param {boolean} [dryRun=false]
 * @param {string|null} [filter=null] - Optional manifest type or file name (e.g. 'npm', 'pom.xml')
 * @returns {{ synced: Array<{ type: string, file: string, oldVersion: string, newVersion: string }>, files: string[] }}
 */
export function syncManifests(newVersion, cwd = process.cwd(), dryRun = false, filter = null) {
  const synced = [];
  const allFiles = new Set();

  for (const synchronizer of synchronizers) {
    const detected = synchronizer.detect(cwd);
    if (!detected) continue;

    if (filter && typeof filter === 'string') {
      const f = filter.toLowerCase().trim();
      const matchesType = synchronizer.type.toLowerCase() === f;
      const matchesFile = detected.file.toLowerCase() === f;
      if (!matchesType && !matchesFile) {
        continue;
      }
    }

    const result = synchronizer.sync(cwd, newVersion, dryRun);
    if (result && result.files && result.files.length > 0) {
      synced.push({
        type: result.type,
        file: result.file,
        oldVersion: result.oldVersion,
        newVersion: result.newVersion
      });
      for (const file of result.files) {
        allFiles.add(file);
      }
    }
  }

  return {
    synced,
    files: Array.from(allFiles)
  };
}
