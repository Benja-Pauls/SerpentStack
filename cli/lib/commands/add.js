import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  info, success, warn, error,
  bold, dim, green, cyan,
  printHeader, spinner,
} from '../utils/ui.js';
import { searchAwesome, searchSkillsSh, searchAnthropic } from '../utils/registries.js';

const TIMEOUT = 10000;

async function tryFetchRaw(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': 'SerpentStack-CLI' },
    });
    if (!resp.ok) return null;
    const content = await resp.text();
    if (content.length > 20 && !content.startsWith('<!DOCTYPE') && !content.startsWith('<html')) {
      return content;
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchJSON(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': 'SerpentStack-CLI', 'Accept': 'application/vnd.github+json' },
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

/**
 * Parse a GitHub URL into { owner, repo, subpath }.
 */
function parseGitHubUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/[^/]+\/(.+))?/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], subpath: m[3] || '' };
}

/**
 * Try fetching a SKILL.md from a GitHub repo.
 * Returns { content, url } or null.
 */
async function fetchSkillMd(owner, repo, subpath, skillHint) {
  const base = `https://raw.githubusercontent.com/${owner}/${repo}`;

  // Strategy 1: direct path guesses (fast, no API calls)
  const candidates = [];

  if (subpath) {
    candidates.push(`${base}/main/${subpath}/SKILL.md`);
    candidates.push(`${base}/main/skills/${subpath}/SKILL.md`);
    candidates.push(`${base}/master/${subpath}/SKILL.md`);
  }

  candidates.push(`${base}/main/SKILL.md`);
  candidates.push(`${base}/master/SKILL.md`);

  if (skillHint && skillHint !== subpath) {
    candidates.push(`${base}/main/skills/${skillHint}/SKILL.md`);
    candidates.push(`${base}/main/${skillHint}/SKILL.md`);
  }

  for (const url of candidates) {
    const content = await tryFetchRaw(url);
    if (content) return { content, url };
  }

  // Strategy 2: GitHub code search API (requires auth, may 401)
  try {
    const data = await fetchJSON(
      `https://api.github.com/search/code?q=filename:SKILL.md+repo:${owner}/${repo}&per_page=5`
    );
    if (data?.items?.length > 0) {
      const sorted = [...data.items].sort((a, b) => {
        const aMatch = (subpath && a.path.includes(subpath)) || (skillHint && a.path.includes(skillHint)) ? 0 : 1;
        const bMatch = (subpath && b.path.includes(subpath)) || (skillHint && b.path.includes(skillHint)) ? 0 : 1;
        return aMatch - bMatch;
      });
      for (const item of sorted) {
        const rawUrl = `${base}/main/${item.path}`;
        const content = await tryFetchRaw(rawUrl);
        if (content) return { content, url: rawUrl };
      }
    }
  } catch { /* code search requires auth */ }

  // Strategy 3: recursive git tree traversal (free, thorough)
  const tree = await fetchJSON(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`
  );
  if (tree?.tree) {
    const skillFiles = tree.tree
      .filter(f => f.path.endsWith('/SKILL.md') || f.path === 'SKILL.md')
      .map(f => f.path);

    if (skillFiles.length > 0) {
      const sorted = [...skillFiles].sort((a, b) => {
        const aMatch = (subpath && a.includes(subpath)) || (skillHint && a.includes(skillHint)) ? 0 : 1;
        const bMatch = (subpath && b.includes(subpath)) || (skillHint && b.includes(skillHint)) ? 0 : 1;
        return aMatch - bMatch;
      });

      const rawUrl = `${base}/main/${sorted[0]}`;
      const content = await tryFetchRaw(rawUrl);
      if (content) return { content, url: rawUrl };
    }
  }

  return null;
}

/**
 * Find an exact match in skills.sh for the npx fallback message.
 * Returns the install command or null.
 */
async function findSkillsShFallback(input) {
  const results = await searchSkillsSh(input, { limit: 3 });
  const inputName = input.includes('/') ? input.split('/').pop() : input;

  for (const r of results) {
    const rName = r.name.includes('/') ? r.name.split('/').pop() : r.name;
    if (rName.toLowerCase() === inputName.toLowerCase()) {
      return r.install; // e.g., "npx skills add nichochar/docker"
    }
  }
  return null;
}

/**
 * Resolve a skill name or partial path through our registries.
 * Returns an array of { owner, repo, subpath, skillName } candidates to try.
 *
 * Handles:
 *   - "clerk" → finds clerk/skills via skills.sh
 *   - "better-auth/best-practices" → finds github.com/better-auth/skills via awesome
 *   - "stripe-best-practices" → finds stripe/ai via skills.sh or awesome
 */
async function resolveViaRegistries(input) {
  const normalized = input.toLowerCase().replace(/[^a-z0-9/-]/g, '');
  const inputName = input.includes('/') ? input.split('/').pop() : input;

  // For inputs with slashes like "better-auth/best-practices",
  // search for both the full string and individual parts
  const searchTerms = [input];
  if (input.includes('/')) {
    searchTerms.push(inputName);
    searchTerms.push(input.split('/')[0]);
  }

  // Run all searches in parallel
  const allSearches = searchTerms.flatMap(term => [
    searchAwesome(term, { limit: 8 }),
    searchSkillsSh(term, { limit: 5 }),
    searchAnthropic(term, { limit: 5 }),
  ]);

  const settled = await Promise.allSettled(allSearches);
  const allMatches = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') allMatches.push(...result.value);
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = [];
  for (const match of allMatches) {
    const key = match.url || match.name;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(match);
  }

  const candidates = [];

  for (const match of unique) {
    const matchName = match.name.includes('/') ? match.name.split('/').pop() : match.name;

    // Check if this is a relevant match for our input
    const isExact = matchName.toLowerCase() === inputName.toLowerCase() ||
                    match.name.toLowerCase() === normalized;

    if (!isExact) continue;

    // ─── GitHub URL: most reliable ──────────────────────────
    if (match.url?.includes('github.com')) {
      const parsed = parseGitHubUrl(match.url);
      if (parsed) {
        candidates.push({ ...parsed, skillName: matchName, source: match.source });
      }
      continue;
    }

    // ─── Anthropic skills: known structure ──────────────────
    if (match.source === 'anthropic') {
      candidates.push({
        owner: 'anthropics',
        repo: 'skills',
        subpath: `skills/${matchName}`,
        skillName: matchName,
        source: 'anthropic',
      });
      continue;
    }

    // ─── skills.sh: try multiple GitHub repo patterns ───────
    if (match.url?.includes('skills.sh')) {
      const parts = match.url.replace(/^https?:\/\/skills\.sh\//, '').split('/');
      if (parts.length >= 1) {
        const owner = parts[0];

        // Generate candidates in order of likelihood
        candidates.push({ owner, repo: 'skills', subpath: '', skillName: matchName, source: match.source });
        if (parts.length >= 2) {
          const urlRepo = parts.slice(1, parts.length >= 3 ? -1 : undefined).join('/');
          if (urlRepo !== 'skills') {
            candidates.push({ owner, repo: urlRepo, subpath: '', skillName: matchName, source: match.source });
          }
        }
        candidates.push({ owner, repo: 'agent-skills', subpath: '', skillName: matchName, source: match.source });
        candidates.push({ owner, repo: `${matchName}-skill`, subpath: '', skillName: matchName, source: match.source });
        candidates.push({ owner, repo: `${matchName}-agent-skill`, subpath: '', skillName: matchName, source: match.source });
        candidates.push({ owner, repo: matchName, subpath: '', skillName: matchName, source: match.source });
      }
    }
  }

  return candidates;
}

/**
 * Last resort: search GitHub for repos matching the input.
 */
async function resolveViaGitHubSearch(input) {
  const q = encodeURIComponent(`${input} SKILL.md in:name,description`);
  const data = await fetchJSON(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=5`
  );

  if (!data?.items?.length) return [];

  const candidates = [];
  const inputLower = input.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const repo of data.items) {
    const nameLower = repo.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!nameLower.includes(inputLower) && !inputLower.includes(nameLower)) continue;

    candidates.push({
      owner: repo.owner.login,
      repo: repo.name,
      subpath: '',
      skillName: repo.name,
    });
  }

  return candidates;
}

/**
 * Derive a meaningful skill name from the SKILL.md source URL or content.
 * Priority: frontmatter name → parent directory from URL → fallback
 */
function deriveSkillName(url, content, fallback) {
  // 1. Try YAML frontmatter: name: my-skill
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      const name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
      if (name.length > 1 && name.length < 64) {
        return name.replace(/[^a-z0-9_-]/gi, '-');
      }
    }
  }

  // 2. Try parent directory from URL: .../skills/stripe-best-practices/SKILL.md
  if (url) {
    const urlMatch = url.match(/\/([^/]+)\/SKILL\.md$/i);
    if (urlMatch) {
      const dirName = urlMatch[1];
      // Skip generic directory names
      if (!['main', 'master', 'skills', 'src', 'lib', 'plugin'].includes(dirName.toLowerCase())) {
        return dirName.replace(/[^a-z0-9_-]/gi, '-');
      }
    }
  }

  // 3. Try first markdown heading: # My Skill Name
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    const heading = headingMatch[1].trim();
    if (heading.length > 1 && heading.length < 64) {
      return heading.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    }
  }

  return fallback.replace(/[^a-z0-9_-]/gi, '-');
}

/**
 * Look up a tool on GitHub and generate a context-rich skill stub.
 * Returns { name, content } or null.
 */
async function generateSkillStub(input) {
  const inputLower = input.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Strategy 1: Direct repo lookup (e.g., "stripe" → github.com/stripe/stripe-node)
  // Try common patterns and pick the highest-starred match
  let repo = null;
  const directNames = [input, `${input}-node`, `${input}-js`, `${input}-python`, `${input}-sdk`];
  const directResults = await Promise.all(
    directNames.map(repoName =>
      fetchJSON(`https://api.github.com/repos/${input}/${repoName}`).catch(() => null)
    )
  );
  const validDirect = directResults.filter(r => r?.full_name && r?.stargazers_count != null);
  if (validDirect.length > 0) {
    repo = validDirect.sort((a, b) => b.stargazers_count - a.stargazers_count)[0];
  }

  // Strategy 2: Search with name qualifier for tighter matching
  if (!repo) {
    const data = await fetchJSON(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(input)}+in:name&sort=stars&per_page=10`
    );

    if (data?.items?.length) {
      // Strict matching: name or owner must match the input
      repo = data.items.find(r => r.name.toLowerCase().replace(/[^a-z0-9]/g, '') === inputLower);
      if (!repo) repo = data.items.find(r => r.owner.login.toLowerCase().replace(/[^a-z0-9]/g, '') === inputLower);
      if (!repo) repo = data.items.find(r => r.name.toLowerCase().includes(inputLower));
      if (!repo) repo = data.items[0];
    }
  }

  if (!repo) return null;

  const name = input.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const description = repo.description || `${repo.name} integration`;
  const homepage = repo.homepage || '';
  const ghUrl = repo.html_url;
  const language = repo.language || '';
  const topics = repo.topics?.length ? repo.topics.join(', ') : '';
  const stars = repo.stargazers_count || 0;

  // Try to detect the package manager and install command
  let installCmd = '';
  let packageSection = '';

  // Check for package.json (npm)
  const pkgJson = await tryFetchRaw(
    `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/package.json`
  );
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      let pkgName = pkg.name || repo.name;
      // Monorepo roots often have "/root" or "private: true" — use repo name instead
      if (pkg.private || pkgName.includes('/root') || pkgName.includes('/monorepo')) {
        pkgName = repo.name;
      }
      installCmd = `npm install ${pkgName}`;
      packageSection = `- **npm**: \`${pkgName}\`\n- **Install**: \`${installCmd}\``;
    } catch { /* not valid JSON */ }
  }

  // Check for pyproject.toml (Python)
  if (!installCmd) {
    const pyproject = await tryFetchRaw(
      `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/pyproject.toml`
    );
    if (pyproject) {
      const nameMatch = pyproject.match(/^name\s*=\s*"([^"]+)"/m);
      const pkgName = nameMatch?.[1] || repo.name;
      installCmd = `pip install ${pkgName}`;
      packageSection = `- **PyPI**: \`${pkgName}\`\n- **Install**: \`${installCmd}\``;
    }
  }

  // Check for setup.py as fallback
  if (!installCmd) {
    const setupPy = await tryFetchRaw(
      `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/setup.py`
    );
    if (setupPy) {
      installCmd = `pip install ${repo.name}`;
      packageSection = `- **PyPI**: \`${repo.name}\`\n- **Install**: \`${installCmd}\``;
    }
  }

  if (!packageSection) {
    packageSection = `- **Install**: See [${repo.name} docs](${homepage || ghUrl})`;
  }

  // Determine docs URL
  let docsUrl = '';
  if (homepage && homepage !== ghUrl) {
    docsUrl = homepage;
  } else {
    // Common docs URL patterns
    const docsPatterns = [
      `https://docs.${name}.com`,
      `https://${name}.dev`,
      `https://${name}.io`,
    ];
    // We won't fetch-check these to keep it fast; just use homepage or GitHub
    docsUrl = homepage || ghUrl;
  }

  // Fetch first part of README for context
  let readmeSnippet = '';
  for (const fname of ['README.md', 'readme.md', 'Readme.md']) {
    const readme = await tryFetchRaw(
      `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${fname}`
    );
    if (readme) {
      // Extract first meaningful section (skip badges, title, HTML)
      const lines = readme.split('\n');
      const meaningful = [];
      let started = false;
      for (const line of lines) {
        const trimmed = line.trim();
        // Always skip badge/image lines and HTML tags
        if (trimmed.startsWith('[![') || trimmed.startsWith('![') || trimmed.startsWith('<') || trimmed.startsWith('> [!')) continue;
        // Skip empty lines at start
        if (!started && trimmed === '') continue;
        // Skip headings before we've started collecting
        if (!started && trimmed.startsWith('#')) { started = true; continue; }
        if (started) {
          // Stop at the next heading
          if (trimmed.startsWith('## ') && meaningful.length > 2) break;
          if (meaningful.length >= 12) break;
          meaningful.push(line);
        }
      }
      if (meaningful.length > 0) {
        readmeSnippet = meaningful.join('\n').trim();
      }
      break;
    }
  }

  // Build the skill stub
  const content = `---
name: ${name}
generated: true
source: ${ghUrl}
---

# ${repo.name}

> ${description}

## Context

${packageSection}
- **GitHub**: [${repo.full_name}](${ghUrl})${stars > 100 ? ` (⭐ ${stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars})` : ''}
- **Docs**: [${docsUrl}](${docsUrl})${language ? `\n- **Language**: ${language}` : ''}${topics ? `\n- **Topics**: ${topics}` : ''}

## Overview

${readmeSnippet || `${repo.name} — ${description}. See the docs link above for full documentation.`}

## Agent Instructions

When working with ${repo.name}:

1. **Read the official docs** at [${docsUrl}](${docsUrl}) for the latest API reference and guides
2. **Install the package** with \`${installCmd || `see docs`}\`
3. **Follow the project's conventions** — check their README and examples directory for patterns
4. **Check for breaking changes** if upgrading — review the CHANGELOG or releases on GitHub

## Notes

This skill was auto-generated because no community-maintained skill exists yet for ${repo.name}.
To improve it, edit \`.skills/${name}/SKILL.md\` with project-specific patterns and conventions.
`;

  return { name, content, repoUrl: ghUrl, docsUrl, stars, description };
}

/**
 * Install a skill from a GitHub source into .skills/<name>/SKILL.md
 */
export async function add(source, { force = false } = {}) {
  printHeader();

  if (!source || source.trim().length === 0) {
    error('Missing skill source.');
    console.log();
    console.log(`  ${dim('Usage:')} ${bold('serpentstack add')} ${dim('<owner/repo>')}`);
    console.log(`  ${dim('       serpentstack add')} ${dim('<owner/repo/skill-name>')}`);
    console.log(`  ${dim('       serpentstack add')} ${dim('<skill-name>')}`);
    console.log();
    console.log(`  ${dim('Examples:')}`);
    console.log(`    ${dim('$')} ${bold('serpentstack add stripe/stripe-best-practices')}`);
    console.log(`    ${dim('$')} ${bold('serpentstack add clerk')}`);
    console.log(`    ${dim('$')} ${bold('serpentstack add docker')}`);
    console.log();
    return;
  }

  const clean = source.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
  const parts = clean.split('/');

  const spin = spinner(`Fetching ${bold(clean)}...`);

  let result = null;
  let skillName = parts[parts.length - 1].replace(/[^a-z0-9_-]/gi, '-');

  // ─── Step 1: Direct GitHub fetch (if we have owner/repo) ──
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = parts[1];
    const subpath = parts.slice(2).join('/');
    result = await fetchSkillMd(owner, repo, subpath, skillName);
  }

  // ─── Step 2: Registry lookup ──────────────────────────────
  if (!result) {
    spin.update(`Searching registries for ${bold(clean)}...`);
    const candidates = await resolveViaRegistries(clean);

    for (const candidate of candidates) {
      spin.update(`Trying ${bold(`${candidate.owner}/${candidate.repo}`)}...`);
      result = await fetchSkillMd(candidate.owner, candidate.repo, candidate.subpath, candidate.skillName);
      if (result) {
        skillName = candidate.skillName;
        break;
      }
    }
  }

  // ─── Step 3: GitHub search fallback ───────────────────────
  if (!result) {
    spin.update(`Searching GitHub for ${bold(clean)}...`);
    const candidates = await resolveViaGitHubSearch(clean);

    for (const candidate of candidates) {
      spin.update(`Trying ${bold(`${candidate.owner}/${candidate.repo}`)}...`);
      result = await fetchSkillMd(candidate.owner, candidate.repo, candidate.subpath, candidate.skillName);
      if (result) {
        skillName = candidate.skillName;
        break;
      }
    }
  }

  // ─── Handle result ────────────────────────────────────────

  // ─── Step 4: Generate a skill stub from GitHub context ───
  if (!result) {
    spin.update(`No existing skill found. Generating context for ${bold(clean)}...`);

    const stub = await generateSkillStub(clean);

    if (stub) {
      const stubDir = join(process.cwd(), '.skills', stub.name);
      const stubPath = join(stubDir, 'SKILL.md');

      if (existsSync(stubPath) && !force) {
        spin.stop();
        warn(`${bold(`.skills/${stub.name}/SKILL.md`)} already exists.`);
        info(`Use ${bold('--force')} to overwrite.`);
        console.log();
        return;
      }

      mkdirSync(stubDir, { recursive: true });
      writeFileSync(stubPath, stub.content, 'utf8');

      spin.stop();
      success(`Generated ${bold(stub.name)} → ${green(`.skills/${stub.name}/SKILL.md`)}`);
      console.log(`    ${dim(`Source: ${stub.repoUrl}`)}`);
      if (stub.docsUrl && stub.docsUrl !== stub.repoUrl) {
        console.log(`    ${dim(`Docs:   ${stub.docsUrl}`)}`);
      }
      if (stub.stars > 100) {
        const starStr = stub.stars >= 1000 ? `${(stub.stars / 1000).toFixed(1)}k` : `${stub.stars}`;
        console.log(`    ${dim(`⭐ ${starStr} stars`)}`);
      }
      console.log();

      const lines = stub.content.split('\n').length;
      const bytes = Buffer.byteLength(stub.content, 'utf8');
      const size = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
      info(`${lines} lines, ${size} ${dim('(generated)')}`);
      console.log();

      console.log(`  ${dim('Your agent can now use this skill. Try:')}`);
      console.log(`    ${dim('>')} ${bold(`Read .skills/${stub.name}/SKILL.md and integrate ${stub.name}`)}`);
      console.log();
      console.log(`  ${dim('Tip: Edit the generated skill to add project-specific patterns.')}`);
      console.log();
      return;
    }

    // Total failure — couldn't even find a GitHub repo
    spin.stop();
    error(`Could not find ${bold(clean)} on any registry or GitHub.`);
    console.log();
    console.log(`  ${dim('Try:')}`);
    console.log(`    ${dim('$')} ${cyan(`serpentstack search "${clean}"`)}`);
    console.log(`    ${dim('$')} ${cyan(`serpentstack add <owner>/<repo>`)}`);
    console.log();
    return;
  }

  // Derive a meaningful name from the source URL path or SKILL.md content.
  // e.g., ".../skills/stripe-best-practices/SKILL.md" → "stripe-best-practices"
  // e.g., YAML frontmatter "name: my-skill" → "my-skill"
  skillName = deriveSkillName(result.url, result.content, skillName);

  const skillDir = join(process.cwd(), '.skills', skillName);
  const skillPath = join(skillDir, 'SKILL.md');

  if (existsSync(skillPath) && !force) {
    spin.stop();
    warn(`${bold(`.skills/${skillName}/SKILL.md`)} already exists.`);
    info(`Use ${bold('--force')} to overwrite.`);
    console.log();
    return;
  }

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, result.content, 'utf8');

  spin.stop();
  success(`Installed ${bold(skillName)} → ${green(`.skills/${skillName}/SKILL.md`)}`);
  console.log(`    ${dim(`Source: ${result.url}`)}`);
  console.log();

  const lines = result.content.split('\n').length;
  const bytes = Buffer.byteLength(result.content, 'utf8');
  const size = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  info(`${lines} lines, ${size}`);
  console.log();

  console.log(`  ${dim('Your agents can now read this skill. Try:')}`);
  console.log(`    ${dim('>')} ${bold(`Read .skills/${skillName}/SKILL.md and follow its instructions`)}`);
  console.log();
}
