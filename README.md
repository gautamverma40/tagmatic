# Tagmatic

Multi-source automated SemVer release management and tagging tool for Git repositories, container registries, and CI/CD pipelines.

## Features

- 🚀 **Automated Version Calculation**: Inspects existing Git or Google Artifact Registry tags and increments major, minor, or patch versions following SemVer 2.0.
- 🐳 **Google Artifact Registry (GAR) Support**: Native support for container image tagging, parsing multi-tag digests and filtering non-semver tags (`latest`, commit hashes, etc.).
- 🔍 **Dry-Run Preview**: Preview tag calculations and upcoming release metadata without modifying state.
- 💬 **Customizable Tag Messages**: Provide custom annotated tag messages or use clean, automated defaults.
- 🌿 **Git Safety Checks**: Verifies working tree cleanliness before tagging (with `--allow-dirty` for flexibility).
- 📡 **Remote Push Support**: Directly push newly generated tags to your remote repository.
- 🤫 **CI/CD Quiet Mode**: `--quiet` outputs only the computed tag string for seamless shell script integration (`docker build -t image:$(tagmatic ...) .`).
- 🧪 **Zero-Dependency Testing**: Includes unit tests using Node.js's built-in `node:test` runner.
- 📦 **Dual Usage**: Use as a global or local CLI command, or import programmatically in Node.js scripts.

## Installation

### Local Installation
```bash
npm install
npm link # to install CLI command globally
```

### Global Installation
```bash
npm install -g .
```

## CLI Usage

### Git Tagging

Run inside any Git repository:

```bash
# Calculate and create the next patch tag (e.g. v1.0.0 -> v1.0.1)
tagmatic

# Minor bump (e.g. v1.0.1 -> v1.1.0)
tagmatic --type minor

# Major bump (e.g. v1.1.0 -> v2.0.0)
tagmatic --type major

# Preview without creating or pushing (dry-run)
tagmatic --dry-run

# Create and push to remote origin
tagmatic --type minor --push

# Create, commit updated manifest (e.g. package.json), tag, and push
tagmatic --type minor --sync --push

# Custom tag annotation message
tagmatic --type patch --message "Release v1.0.2: Bug fixes in parser"

# Custom tag prefix (e.g. release-1.0.0)
tagmatic --prefix "release-"

# Without prefix (e.g. 1.0.0)
tagmatic --no-prefix
```

### Multi-Ecosystem Manifest Synchronization (`--sync`)

When `--sync` is enabled, Tagmatic automatically detects and updates the version string in your project's manifest files, stages the changes, creates a release commit (`chore(release): <tag>`), and tags that release commit:

| Ecosystem | Manifest File | How Tagmatic Handles It |
|---|---|---|
| **Node.js** | `package.json` | Updates `"version"` (and `package-lock.json` if present), preserving indentation and newlines |
| **Java (Maven)** | `pom.xml` | Updates project `<version>` under `<artifactId>`, preserving XML structure |
| **Java / Kotlin (Gradle)** | `gradle.properties`, `build.gradle`, `build.gradle.kts` | Updates `version = "..."` |
| **Python** | `pyproject.toml` | Updates `version = "..."` under `[project]` (PEP 621) or `[tool.poetry]` |
| **Rust** | `Cargo.toml` | Updates `version = "..."` under `[package]` |
| **PHP** | `composer.json` | Updates `"version"` if explicitly defined in the file |
| **Deno** | `deno.json` | Updates `"version"` if explicitly defined in the file |
| **Go** | `go.mod` | Go modules store versions exclusively via Git tags; no file modification needed |

#### Polyglot Repositories & Selective Targeting
If a repository contains multiple manifests (e.g. a Node CLI + Rust backend or full-stack Python + JS app):
- **Sync all manifests** *(default)*:
  ```bash
  tagmatic --type minor --sync --push
  ```
- **Sync a specific manifest only** (by ecosystem type or file name):
  ```bash
  tagmatic --type minor --sync=npm --push
  tagmatic --type minor --sync=pom.xml --push
  ```

```bash
# Preview manifest changes without modifying disk
tagmatic --type minor --sync --dry-run

# Update manifest, commit, tag, and push in one command
tagmatic --type minor --sync --push
```

### Google Artifact Registry (GAR) Tagging

Compute container image tags directly from GCP Artifact Registry:

```bash
# Standard GAR tag calculation
tagmatic --source gar --image us-east4-docker.pkg.dev/my-project/my-repo/my-service --type patch

# Positional syntax shorthand
tagmatic us-east4-docker.pkg.dev/my-project/my-repo/my-service minor

# CI/CD Shell Script Integration (prints only the tag string)
NEXT_TAG=$(tagmatic us-east4-docker.pkg.dev/my-project/my-repo/my-service patch --quiet)
docker build -t us-east4-docker.pkg.dev/my-project/my-repo/my-service:$NEXT_TAG .
docker push us-east4-docker.pkg.dev/my-project/my-repo/my-service:$NEXT_TAG
```

### CLI Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--source` | `-s` | Tag source provider (`git`, `gar`) | `git` |
| `--image` | | Docker image repository in Google Artifact Registry | |
| `--limit` | | Max remote images to inspect in GAR | `25` |
| `--type` | `-t` | Version bump type (`patch`, `minor`, `major`) | `patch` |
| `--prefix` | `-p` | Tag prefix string | `v` |
| `--no-prefix` | | Omit tag prefix (equivalent to `--prefix ""`) | `false` |
| `--sync [target]` | | Sync version into manifest files (all, or target: `npm`, `maven`, `gradle`, `python`, etc.) and commit before tagging | `false` |
| `--message` | `-m` | Custom annotation message for tag | `Release <tag>` |
| `--quiet` | `-q` | Print only computed tag string (ideal for CI/CD) | `false` |
| `--dry-run` | `-d` | Preview calculation without creating tag | `false` |
| `--push` | | Push tag to Git remote | `false` |
| `--remote` | `-r` | Git remote name | `origin` |
| `--allow-dirty` | | Allow tagging even with uncommitted changes | `false` |
| `--initial` | `-i` | Initial tag if no prior tags exist | `v0.1.0` (git) / `0.0.1` (gar) |
| `--version` | `-v` | Display CLI version | |
| `--help` | `-h` | Display help menu | |

## Programmatic Usage

You can also import and use `tagmatic` in your own Node.js automation scripts:

```javascript
import { generateTag } from 'tagmatic';

// Git repository bump
const gitRelease = await generateTag({
  type: 'minor',
  prefix: 'v',
  push: true,
  message: 'Automated release via CI'
});
console.log(`Git tag: ${gitRelease.nextTag}`);

// Google Artifact Registry bump
const garRelease = await generateTag({
  source: 'gar',
  image: 'us-east4-docker.pkg.dev/my-project/my-repo/my-service',
  type: 'patch'
});
console.log(`Docker image tag: ${garRelease.nextTag}`);
```

## Running Tests

Run the test suite using Node's native test runner:

```bash
npm test
```

## License

MIT
