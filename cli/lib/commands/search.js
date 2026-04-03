import { searchAll } from '../utils/registries.js';
import { add as addSkill } from './add.js';
import {
  info, success, warn, error,
  bold, dim, green, cyan, yellow, magenta,
  divider, printHeader, spinner, printSnakeList,
} from '../utils/ui.js';

// ─── Source badges ──────────────────────────────────────────

const SOURCE_BADGE = {
  'anthropic':            magenta('anthropic'),
  'skills.sh':            cyan('skills.sh'),
  'awesome-agent-skills': green('awesome'),
  'github':               dim('github'),
  'mcp-registry':         yellow('mcp'),
};

function sourceBadge(source) {
  return SOURCE_BADGE[source] || dim(source);
}

function starsLabel(stars) {
  if (!stars && stars !== 0) return '';
  if (stars >= 1000) return dim(` ${(stars / 1000).toFixed(1)}k\u2605`);
  if (stars > 0) return dim(` ${stars}\u2605`);
  return '';
}

// ─── Search command ─────────────────────────────────────────

export async function search(query) {
  if (!query || query.trim().length === 0) {
    printHeader();
    console.log();
    error('Missing search query.');
    console.log();
    console.log(`  ${dim('Usage:')} ${bold('serpentstack search')} ${dim('<query>')}`);
    console.log();
    console.log(`  ${dim('Examples:')}`);
    printSnakeList([
      `${cyan('serpentstack search')} ${dim('"react testing"')}`,
      `${cyan('serpentstack search')} ${dim('"auth oauth"')}`,
      `${cyan('serpentstack search')} ${dim('"terraform aws"')}`,
      `${cyan('serpentstack search')} ${dim('"stripe payments"')}`,
      `${cyan('serpentstack search')} ${dim('"docker deploy"')}`,
    ]);
    console.log();
    return;
  }

  printHeader();

  const spin = spinner(`Slithering through registries for ${bold(query)}...`);

  let data;
  try {
    data = await searchAll(query, { limit: 20 });
  } catch (err) {
    spin.stop();
    error(`Search failed: ${err.message}`);
    console.log();
    return;
  }

  const { results, mcp = [], sources } = data;
  const sourceList = sources.names.join(', ');
  const sourceCount = sources.names.length;
  const totalResults = results.length + mcp.length;

  if (totalResults === 0) {
    spin.stop();
    console.log();
    divider(`No results for "${query}"`);
    console.log();
    if (sourceCount > 0) {
      info(`Searched ${sourceCount} ${sourceCount === 1 ? 'registry' : 'registries'}: ${dim(sourceList)}`);
    }
    if (sources.failed > 0) {
      warn(`${sources.failed} ${sources.failed === 1 ? 'registry' : 'registries'} unreachable`);
    }
    console.log();
    console.log(`  ${dim('Try broader terms, or browse directly:')}`);
    printSnakeList([
      `${cyan('https://skills.sh')}              ${dim('Vercel skill leaderboard')}`,
      `${cyan('https://skillsmp.com')}            ${dim('500K+ indexed skills')}`,
      `${cyan('https://github.com/anthropics/skills')} ${dim('Anthropic official')}`,
    ]);
    console.log();
    return;
  }

  spin.stop();

  // Header
  console.log();
  divider(`${totalResults} results for "${query}"`);
  info(`Searched ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}: ${dim(sourceList)}`);
  if (sources.failed > 0) {
    warn(`${sources.failed} ${sources.failed === 1 ? 'source' : 'sources'} unreachable`);
  }

  // ─── Skill results ──────────────────────────────────────
  if (results.length > 0) {
    console.log();
    divider(`Skills ${dim(`(${results.length})`)}`);
    console.log();

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const num = dim(`${String(i + 1).padStart(2)}.`);
      const badge = sourceBadge(r.source);
      const stars = starsLabel(r.stars);
      const name = bold(r.name);

      console.log(`  ${num} ${name}  ${badge}${stars}`);
      if (r.description) {
        console.log(`      ${dim(r.description.slice(0, 90))}`);
      }
      console.log(`      ${dim('$')} ${cyan(r.install)}`);
      if (i < results.length - 1) console.log();
    }
  }

  // ─── MCP server results ─────────────────────────────────
  if (mcp.length > 0) {
    console.log();
    divider(`MCP Servers ${dim(`(${mcp.length})`)}`);
    console.log();

    for (let i = 0; i < mcp.length; i++) {
      const r = mcp[i];
      const num = dim(`${String(i + 1).padStart(2)}.`);
      const name = bold(r.name);
      const badge = yellow('mcp');

      console.log(`  ${num} ${name}  ${badge}`);
      if (r.description) {
        console.log(`      ${dim(r.description.slice(0, 90))}`);
      }
      console.log(`      ${dim('Claude Code:')} ${cyan(`claude mcp add ${r.name} -- ${r.mcpUrl}`)}`);
      if (r.url) {
        console.log(`      ${dim('Docs:')}        ${dim(r.url)}`);
      }
      if (i < mcp.length - 1) console.log();
    }
  }

  // Footer
  console.log();
  if (results.length > 0) {
    console.log(`  ${dim('Install a skill:')}  ${bold('serpentstack add <owner/repo>')}`);
  }
  console.log(`  ${dim('Refine search:')}    ${bold(`serpentstack search "${query} <more terms>"`)}`);
  console.log();
  console.log(`  ${dim('Sources:')} ${magenta('anthropic')} ${dim('official')}  ${cyan('skills.sh')} ${dim('Vercel')}  ${green('awesome')} ${dim('curated')}  ${dim('github community')}  ${yellow('mcp')} ${dim('servers')}`);
  console.log();
}
