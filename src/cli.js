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
Tagmatic - Automated Git Tag & Release Tool

Usage:
  tagmatic [options]

Options:
  -t, --type <type>        Bump type: patch | minor | major (default: "patch")
  -p, --prefix <prefix>    Tag prefix string (default: "v")
      --no-prefix          Disable tag prefix (equivalent to --prefix "")
  -m, --message <msg>      Custom annotation message for the tag
  -d, --dry-run            Simulate tag calculation without creating or pushing
      --push               Push the newly created tag to remote repository
  -r, --remote <name>      Git remote name when pushing (default: "origin")
      --allow-dirty        Allow tag creation with uncommitted working changes
  -i, --initial <version>  Initial version when no prior tag exists (default: "v0.1.0")
  -v, --version            Display current CLI version
  -h, --help               Show this help message

Examples:
  $ tagmatic
  $ tagmatic --type minor
  $ tagmatic --type major --message "Major release 2.0.0"
  $ tagmatic --dry-run
  $ tagmatic --push
`);
}

/**
 * Parse process.argv arguments
 * @param {string[]} argv
 * @returns {object}
 */
export function parseArgs(argv = []) {
  const options = {
    type: 'patch',
    prefix: 'v',
    initialVersion: 'v0.1.0',
    message: '',
    dryRun: false,
    push: false,
    remote: 'origin',
    allowDirty: false,
    help: false,
    version: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-v' || arg === '--version') {
      options.version = true;
    } else if (arg === '-d' || arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--push') {
      options.push = true;
    } else if (arg === '--allow-dirty') {
      options.allowDirty = true;
    } else if (arg === '--no-prefix') {
      options.prefix = '';
    } else if (arg === '-t' || arg === '--type') {
      if (i + 1 < argv.length) options.type = argv[++i];
    } else if (arg.startsWith('--type=')) {
      options.type = arg.slice(arg.indexOf('=') + 1);
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
    } else if (arg.startsWith('--initial=')) {
      options.initialVersion = arg.slice(arg.indexOf('=') + 1);
    }
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
    console.log('\n🏷️  Tagmatic');
    console.log('----------------------------------------');

    const result = await generateTag(options);

    console.log(`📍 Branch:       ${result.branch}`);
    console.log(`🔍 Current Tag:  ${result.currentTag || '(none)'}`);
    console.log(`✨ Next Tag:     ${result.nextTag} [${options.type.toUpperCase()}]`);
    console.log(`💬 Message:      ${result.message}`);

    if (result.isDryRun) {
      console.log('\n⚠️  DRY RUN: Tag was calculated but NOT created or pushed.');
    } else {
      if (result.created) {
        console.log(`\n✅ Tag "${result.nextTag}" created successfully.`);
      }
      if (result.pushed) {
        console.log(`🚀 Tag "${result.nextTag}" pushed to "${options.remote}".`);
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
