#!/usr/bin/env node

import { error, bold, dim, green, cyan, yellow, getVersion, printHeader, divider, printSnakeList } from '../lib/utils/ui.js';

// Short flag aliases
const FLAG_ALIASES = { f: 'force', h: 'help', v: 'version', a: 'all' };

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      flags[key] = val ?? true;
    } else if (arg.startsWith('-') && arg.length > 1 && !arg.startsWith('--')) {
      // Short flags: -f, -h, -v, -a, or combined like -fa
      for (const ch of arg.slice(1)) {
        const long = FLAG_ALIASES[ch];
        if (long) flags[long] = true;
        else flags[ch] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

// Known commands for fuzzy matching on typos
const KNOWN_COMMANDS = ['stack', 'skills', 'persistent', 'search', 'add', 'discover', 'notifications', 'notifs'];

function suggestCommand(input) {
  const lower = input.toLowerCase();
  let best = null, bestDist = 3; // threshold: edit distance ≤ 2
  for (const cmd of KNOWN_COMMANDS) {
    if (cmd.startsWith(lower) || lower.startsWith(cmd)) return cmd;
    const d = editDistance(lower, cmd);
    if (d < bestDist) { bestDist = d; best = cmd; }
  }
  return best;
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
      );
  return dp[m][n];
}

function showHelp() {
  printHeader();
  console.log(`  ${dim(green('╰─'))} ${dim('Find any AI agent skill or MCP server. Search every registry, install in seconds.')}`);
  console.log();

  divider('Search & install');
  console.log();
  printSnakeList([
    `${cyan('search')} ${dim('<query>')}               Search skills + MCP servers across all registries`,
    `${cyan('add')} ${dim('<source>')}                  Install a skill from any registry, repo, or URL`,
    `${cyan('discover')}                      Analyze your project, recommend skills + MCP servers`,
  ]);
  console.log();

  divider('Base skills');
  console.log();
  printSnakeList([
    `${cyan('skills')}                        Download all base skills + agent configs`,
    `${cyan('skills update')}                 Update base skills to latest versions`,
  ]);
  console.log();

  divider('Persistent agents');
  console.log();
  printSnakeList([
    `${cyan('persistent')}                    Status dashboard (first run = full setup)`,
    `${cyan('persistent')} ${dim('--start')}           Launch enabled agents`,
    `${cyan('persistent')} ${dim('--stop')}            Stop all running agents`,
    `${cyan('persistent')} ${dim('--agents')}          Change agent models, enable/disable`,
    `${cyan('persistent')} ${dim('--models')}          List installed & recommended models`,
    `${cyan('persistent')} ${dim('--configure')}       Edit project settings`,
    `${cyan('persistent')} ${dim('--watch')}           Live agent activity feed`,
    `${cyan('notifications')}                 What your agents have found`,
  ]);
  console.log();

  divider('Template');
  console.log();
  printSnakeList([
    `${cyan('stack new')} ${dim('<name>')}             Scaffold a full project from the template`,
    `${cyan('stack update')}                  Update template-level files to latest`,
  ]);
  console.log();

  divider('Options');
  console.log();
  printSnakeList([
    `${bold('-f')}, ${bold('--force')}                   Overwrite existing files`,
    `${bold('-a')}, ${bold('--all')}                     Include new files in updates`,
    `${bold('-v')}, ${bold('--version')}                 Show version`,
    `${bold('-h')}, ${bold('--help')}                    Show this help`,
  ]);
  console.log();

  console.log(`  ${dim('Examples:')}`);
  console.log(`    ${dim('$')} serpentstack search "react testing"`);
  console.log(`    ${dim('$')} serpentstack add clerk`);
  console.log(`    ${dim('$')} serpentstack discover`);
  console.log();
  console.log(`  ${dim('Docs:')} ${cyan('https://github.com/Benja-Pauls/SerpentStack')}`);
  console.log();
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { flags, positional } = parseArgs(rawArgs);

  const noun = positional[0];
  const verb = positional[1];
  const rest = positional.slice(2);

  // Top-level flags
  if (noun === '--version' || flags.version) {
    console.log(getVersion());
    return;
  }
  if (!noun || noun === '--help' || flags.help) {
    showHelp();
    return;
  }

  if (noun === 'stack') {
    if (verb === 'new') {
      const { stackNew } = await import('../lib/commands/stack-new.js');
      await stackNew(rest[0]);
    } else if (verb === 'update') {
      const { stackUpdate } = await import('../lib/commands/stack-update.js');
      await stackUpdate({ force: !!flags.force });
    } else {
      error(`Unknown stack command: ${verb}`);
      console.log(`\n  Available: ${bold('stack new <name>')}, ${bold('stack update')}\n`);
      process.exit(1);
    }
  } else if (noun === 'skills') {
    if (!verb || verb === 'init') {
      // `serpentstack skills` or `serpentstack skills init` both work
      const { skillsInit } = await import('../lib/commands/skills-init.js');
      await skillsInit({ force: !!flags.force });
    } else if (verb === 'update') {
      const { skillsUpdate } = await import('../lib/commands/skills-update.js');
      await skillsUpdate({ force: !!flags.force, all: !!flags.all });
    } else {
      error(`Unknown skills command: ${verb}`);
      console.log(`\n  Available: ${bold('skills')}, ${bold('skills update')}\n`);
      process.exit(1);
    }
  } else if (noun === 'search') {
    const query = [verb, ...rest].filter(Boolean).join(' ');
    const { search } = await import('../lib/commands/search.js');
    await search(query);
  } else if (noun === 'add') {
    if (!verb) {
      error('Missing skill source.');
      console.log(`\n  Usage: ${bold('serpentstack add <owner/repo>')} or ${bold('serpentstack add <url>')}\n`);
      process.exit(1);
    }
    const { add } = await import('../lib/commands/add.js');
    await add([verb, ...rest].join('/'), { force: !!flags.force });
  } else if (noun === 'discover') {
    const { discover } = await import('../lib/commands/discover.js');
    await discover();
  } else if (noun === 'notifications' || noun === 'notifs') {
    const { notifications } = await import('../lib/commands/notifications.js');
    // --read 3 parses as read:true + verb:'3', --read=3 parses as read:'3'
    const readIdx = flags.read === true ? verb : flags.read;
    await notifications({
      clear: !!flags.clear,
      read: readIdx || undefined,
      agent: typeof flags.agent === 'string' ? flags.agent : (flags.agent === true ? verb : undefined),
      errors: !!flags.errors,
      warnings: !!flags.warnings,
      limit: flags.limit === true ? verb : flags.limit,
    });
  } else if (noun === 'persistent') {
    const { persistent } = await import('../lib/commands/persistent.js');
    await persistent({
      stop: !!flags.stop,
      configure: !!flags.configure,
      agents: !!flags.agents,
      start: !!flags.start,
      models: !!flags.models,
      watch: !!flags.watch,
    });
  } else {
    error(`Unknown command: ${bold(noun)}`);
    const suggestion = suggestCommand(noun);
    if (suggestion) {
      console.log(`\n  Did you mean ${bold(suggestion)}? Run ${bold(`serpentstack ${suggestion}`)} or ${bold('serpentstack --help')}.\n`);
    } else {
      console.log(`\n  Run ${bold('serpentstack --help')} to see available commands.\n`);
    }
    process.exit(1);
  }
}

// Global error handling
process.on('unhandledRejection', (err) => {
  error(err.message || 'An unexpected error occurred');
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

main().catch((err) => {
  error(err.message || 'An unexpected error occurred');
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
