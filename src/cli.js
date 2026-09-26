/**
 * CLI command-line interface parser and runner
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateTag } from './tagmatic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read package.json version
 */
function getPackageVersion() {
  try {
    const pkgPath = join(__dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Print help menu
 */
export function printHelp() {
  console.log(`
Tagmatic - Automated Git & Google Artifact Registry Release Tool

Usage:
  tagmatic [options]
  tagmatic [image] [type]

Options:
  -s, --source <source>    Tag source: git | gar (default: "git")
      --image <name>       Docker image repository in Google Artifact Registry
      --limit <number>     Max images to inspect in GAR (default: 25)
  -t, --type <type>        Bump type: patch | minor | major (default: "patch")
  -p, --prefix <prefix>    Tag prefix string (default: "v")
      --no-prefix          Disable tag prefix (equivalent to --prefix "")
  -m, --message <msg>      Custom annotation message for the tag
      --sync [target]      Sync version to manifests (all, or target: npm, maven, gradle, python, etc.)
  -q, --quiet              Print only the computed tag string (ideal for CI/CD)
  -d, --dry-run            Simulate tag calculation without creating or pushing
      --push               Push the newly created tag to remote repository
  -r, --remote <name>      Git remote name when pushing (default: "origin")
      --allow-dirty        Allow tag creation with uncommitted working changes
  -i, --initial <version>  Initial version when no prior tag exists
  -v, --version            Display current CLI version
  -h, --help               Show this help message

Examples:
  # Git tagging:
  $ tagmatic
  $ tagmatic --type minor
  $ tagmatic --type minor --sync
  $ tagmatic --type minor --sync=npm
  $ tagmatic --dry-run
  $ tagmatic --push

  # Google Artifact Registry (GAR) tagging:
  $ tagmatic --source gar --image us-east4-docker.pkg.dev/my-proj/repo/app
  $ tagmatic us-east4-docker.pkg.dev/my-proj/repo/app minor
  $ tagmatic --image us-east4-docker.pkg.dev/my-proj/repo/app --quiet
`);
}

/**
 * Parse process.argv arguments
 * @param {string[]} argv
 * @returns {object}
 */
export function parseArgs(argv = []) {
  const options = {
    source: 'git',
    image: '',
    limit: 25,
    type: 'patch',
    prefix: 'v',
    initialVersion: 'v0.1.0',
    message: '',
    dryRun: false,
    push: false,
    sync: false,
    remote: 'origin',
    allowDirty: false,
    quiet: false,
    help: false,
    version: false
  };

  let sourceExplicitlySet = false;
  let initialExplicitlySet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-v' || arg === '--version') {
      options.version = true;
    } else if (arg === '-q' || arg === '--quiet' || arg === '--silent') {
      options.quiet = true;
    } else if (arg === '-d' || arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--push') {
      options.push = true;
    } else if (arg === '--sync') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options.sync = argv[++i];
      } else {
        options.sync = true;
      }
    } else if (arg.startsWith('--sync=')) {
      const val = arg.slice(arg.indexOf('=') + 1).trim();
      options.sync = val || true;
    } else if (arg === '--allow-dirty') {
      options.allowDirty = true;
    } else if (arg === '--no-prefix') {
      options.prefix = '';
    } else if (arg === '-s' || arg === '--source') {
      if (i + 1 < argv.length) options.source = argv[++i].toLowerCase();
      sourceExplicitlySet = true;
    } else if (arg.startsWith('--source=')) {
      options.source = arg.slice(arg.indexOf('=') + 1).toLowerCase();
      sourceExplicitlySet = true;
    } else if (arg === '--image') {
      if (i + 1 < argv.length) options.image = argv[++i];
      if (!sourceExplicitlySet) options.source = 'gar';
    } else if (arg.startsWith('--image=')) {
      options.image = arg.slice(arg.indexOf('=') + 1);
      if (!sourceExplicitlySet) options.source = 'gar';
    } else if (arg === '--limit') {
      if (i + 1 < argv.length) options.limit = parseInt(argv[++i], 10) || 25;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.slice(arg.indexOf('=') + 1), 10) || 25;
    } else if (arg === '-t' || arg === '--type') {
      if (i + 1 < argv.length) options.type = argv[++i].toLowerCase();
    } else if (arg.startsWith('--type=')) {
      options.type = arg.slice(arg.indexOf('=') + 1).toLowerCase();
    } else if (arg === '-p' || arg === '--prefix') {
      if (i + 1 < argv.length) options.prefix = argv[++i];
    } else if (arg.startsWith('--prefix=')) {
      options.prefix = arg.slice(arg.indexOf('=') + 1);
    } else if (arg === '-m' || arg === '--message') {
      if (i + 1 < argv.length) options.message = argv[++i];
    } else if (arg.startsWith('--message=')) {
      options.message = arg.slice(arg.indexOf('=') + 1);
    } else if (arg === '-r' || arg === '--remote') {
      if (i + 1 < argv.length) options.remote = argv[++i];
    } else if (arg.startsWith('--remote=')) {
      options.remote = arg.slice(arg.indexOf('=') + 1);
    } else if (arg === '-i' || arg === '--initial') {
      if (i + 1 < argv.length) options.initialVersion = argv[++i];
      initialExplicitlySet = true;
    } else if (arg.startsWith('--initial=')) {
      options.initialVersion = arg.slice(arg.indexOf('=') + 1);
      initialExplicitlySet = true;
    } else if (arg.startsWith('-')) {
      // Unknown flag — warn the user
      console.warn(`⚠️  Unknown option: "${arg}"`);
    } else {
      // Positional argument support (<image> [type])
      if (!options.image && (arg.includes('/') || arg.includes('.'))) {
        options.image = arg;
        if (!sourceExplicitlySet) options.source = 'gar';
      } else if (['patch', 'minor', 'major'].includes(arg.toLowerCase())) {
        options.type = arg.toLowerCase();
      }
    }
  }

  if (options.source === 'gar' && !initialExplicitlySet) {
    options.initialVersion = '0.0.1';
  }

  return options;
}

/**
 * Execute CLI command
 * @param {string[]} argv
 */
export async function runCLI(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    console.log(`tagmatic v${getPackageVersion()}`);
    return;
  }

  try {
    const result = await generateTag(options);

    if (options.quiet) {
      console.log(result.nextTag);
      return;
    }

    if (result.source === 'gar') {
      console.log('\n🏷️  Tagmatic [Google Artifact Registry]');
      console.log('----------------------------------------');
      console.log(`📦 Image:        ${result.image}`);
      console.log(`🔍 Current Tag:  ${result.currentTag || '(none)'}`);
      console.log(`✨ Next Tag:     ${result.nextTag} [${options.type.toUpperCase()}]`);
      if (result.dryRun) {
        console.log('\n⚠️  DRY RUN: Tag calculated.');
      }
      console.log('----------------------------------------\n');
      return;
    }

    // Git Output
    console.log('\n🏷️  Tagmatic');
    console.log('----------------------------------------');
    console.log(`📍 Branch:       ${result.branch}`);
    console.log(`🔍 Current Tag:  ${result.currentTag || '(none)'}`);
    console.log(`✨ Next Tag:     ${result.nextTag} [${options.type.toUpperCase()}]`);
    console.log(`💬 Message:      ${result.message}`);

    if (result.manifests && result.manifests.length > 0) {
      console.log('\n📄 Manifests:');
      for (const m of result.manifests) {
        console.log(`   - ${m.file} (${m.oldVersion} → ${m.newVersion})`);
      }
    }

    if (result.dryRun) {
      console.log('\n⚠️  DRY RUN: Tag was calculated but NOT created or pushed.');
    } else {
      if (result.manifestCommit) {
        console.log(`\n📝 Manifests committed: "${result.manifestCommit}"`);
      }
      if (result.created) {
        console.log(`\n✅ Tag "${result.nextTag}" created successfully.`);
      }
      if (result.pushed) {
        const dest = result.manifestCommit && result.branch ? `tag "${result.nextTag}" and branch "${result.branch}"` : `Tag "${result.nextTag}"`;
        console.log(`🚀 ${dest} pushed to "${options.remote}".`);
      }
    }

    if (result.commits && result.commits.length > 0) {
      console.log('\n📝 Recent commits included:');
      for (const commit of result.commits.slice(0, 5)) {
        console.log(`   - ${commit}`);
      }
      if (result.commits.length > 5) {
        console.log(`   ...and ${result.commits.length - 5} more`);
      }
    }

    console.log('----------------------------------------\n');
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}
