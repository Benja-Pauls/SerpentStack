/**
 * Registry adapters for cross-registry skill and MCP server search.
 *
 * Each adapter returns: { name, source, type, description, url, install, stars?, author?, _score }[]
 *   type: 'skill' | 'mcp'
 *   _score is internal relevance (0-100) used for cross-source ranking.
 */

const TIMEOUT = 8000;

function headers(extra = {}) {
  return { 'Accept': 'application/json', 'User-Agent': 'SerpentStack-CLI', ...extra };
}

async function fetchJSON(url, opts = {}) {
  const resp = await fetch(url, {
    headers: headers(opts.headers),
    signal: AbortSignal.timeout(opts.timeout || TIMEOUT),
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchText(url, opts = {}) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'SerpentStack-CLI', ...opts.headers },
    signal: AbortSignal.timeout(opts.timeout || TIMEOUT),
  });
  if (!resp.ok) return null;
  return resp.text();
}

// ─── Scoring helpers ───────────────────────────────────────

/**
 * Score a skill against search terms. Returns 0-100.
 *   - Exact name match: 50 points
 *   - Term in name: 20 points per term
 *   - Term in description: 5 points per term
 *   - All terms matched: 10 bonus points
 */
function scoreMatch(name, description, terms) {
  // Normalize everything the same way: lowercase, non-alphanumeric → spaces
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normName = norm(name);
  const normDesc = norm(description || '');
  const normTerms = terms.map(t => norm(t));
  const fullQuery = normTerms.join(' ');

  let score = 0;
  let termsMatched = 0;

  // Exact name match (the query IS the skill name)
  if (normName === fullQuery || normName.endsWith(fullQuery)) {
    score += 50;
  }

  for (const term of normTerms) {
    if (normName.includes(term)) {
      score += 20;
      termsMatched++;
    } else if (normDesc.includes(term)) {
      score += 5;
      termsMatched++;
    }
  }

  // Bonus if all terms matched somewhere
  if (termsMatched === terms.length && terms.length > 1) {
    score += 10;
  }

  return score;
}

// ─── Source weight multipliers ─────────────────────────────
// Curated sources are more trustworthy than raw GitHub search.

const SOURCE_WEIGHT = {
  'anthropic': 1.5,
  'skills.sh': 1.3,
  'awesome-agent-skills': 1.2,
  'github': 1.0,
};

// ─── GitHub Repository Search ──────────────────────────────
// Runs two parallel strategies:
//   1. Topic-based search (repos tagged agent-skill or claude-skill)
//   2. Keyword search with aggressive filtering

async function searchGitHubTopics(query, limit) {
  const results = [];

  // Search repos tagged with skill-related topics
  const topicQueries = [
    `topic:agent-skill ${query}`,
    `topic:claude-skill ${query}`,
  ];

  const fetches = topicQueries.map(q =>
    fetchJSON(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=${limit}`,
      { headers: { 'Accept': 'application/vnd.github+json' } }
    )
  );

  const responses = await Promise.allSettled(fetches);
  const seen = new Set();

  for (const resp of responses) {
    if (resp.status !== 'fulfilled' || !resp.value?.items) continue;
    for (const repo of resp.value.items) {
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      results.push(repo);
    }
  }

  return results;
}

async function searchGitHubKeyword(query, limit) {
  // More targeted: search for repos that mention SKILL.md AND the query
  const q = encodeURIComponent(`${query} SKILL.md in:readme,description`);
  const data = await fetchJSON(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=${Math.round(limit * 2)}`,
    { headers: { 'Accept': 'application/vnd.github+json' } }
  );
  return data?.items || [];
}

// Repos that are clearly not skills — frameworks, meta-repos, aggregators
const GITHUB_BLOCKLIST = [
  'openclaw', 'everything-claude', 'serpentstack', 'awesome-',
  'deer-flow', 'nanobot', 'zeroclaw', 'picoclaw', 'nanoclaw',
  'openfang', 'browser-use', 'superpowers',
];

function isLikelySkillRepo(repo) {
  const name = repo.full_name.toLowerCase();
  const desc = (repo.description || '').toLowerCase();

  // Block known non-skill repos
  for (const blocked of GITHUB_BLOCKLIST) {
    if (name.includes(blocked)) return false;
  }

  // Repos with 50k+ stars are almost certainly frameworks, not skills
  if (repo.stargazers_count > 50000) return false;

  // Skip meta-content
  if (name.includes('-guide') || name.includes('-toolkit') || name.includes('everything-you-need')) return false;
  if (desc.includes('ultimate guide') || desc.includes('all-in-one guide') || desc.includes('comprehensive toolkit')) return false;
  if (desc.includes('curated list') || desc.includes('collection of')) return false;

  // Positive signals: repos that look like actual skills
  const hasSkillSignal =
    name.includes('skill') ||
    name.includes('agent-') ||
    desc.includes('skill') ||
    desc.includes('SKILL.md') ||
    desc.includes('claude code') ||
    (repo.topics || []).some(t => t.includes('skill') || t.includes('claude'));

  return hasSkillSignal || repo.stargazers_count < 5000;
}

export async function searchGitHub(query, { limit = 10 } = {}) {
  const terms = query.toLowerCase().split(/\s+/);

  // Run topic search and keyword search in parallel
  const [topicRepos, keywordRepos] = await Promise.allSettled([
    searchGitHubTopics(query, limit),
    searchGitHubKeyword(query, limit),
  ]);

  // Merge results, topic repos first (higher quality)
  const topicSet = new Set();
  const merged = [];

  if (topicRepos.status === 'fulfilled') {
    for (const repo of topicRepos.value) {
      topicSet.add(repo.full_name);
      merged.push({ ...repo, _fromTopic: true });
    }
  }

  if (keywordRepos.status === 'fulfilled') {
    for (const repo of keywordRepos.value) {
      if (!topicSet.has(repo.full_name)) {
        merged.push({ ...repo, _fromTopic: false });
      }
    }
  }

  const results = [];
  for (const repo of merged) {
    if (!isLikelySkillRepo(repo)) continue;

    const relevance = scoreMatch(repo.name, repo.description, terms);
    // Topic repos get a bonus
    const topicBonus = repo._fromTopic ? 15 : 0;

    results.push({
      name: repo.name,
      author: repo.owner?.login || '',
      source: 'github',
      type: 'skill',
      description: (repo.description || '').slice(0, 120),
      url: repo.html_url,
      install: `serpentstack add ${repo.full_name}`,
      stars: repo.stargazers_count,
      _score: relevance + topicBonus,
    });
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit);
}

// ─── awesome-agent-skills (VoltAgent) ──────────────────────
// Parses the curated README from GitHub. ~1,000+ skills.
// Cached in-process for the session.

let _awesomeCache = null;
let _awesomeFetchedAt = 0;
const AWESOME_TTL = 300_000; // 5 min cache

async function loadAwesomeSkills() {
  const now = Date.now();
  if (_awesomeCache && now - _awesomeFetchedAt < AWESOME_TTL) return _awesomeCache;

  const md = await fetchText(
    'https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md',
    { timeout: 10000 }
  );
  if (!md) return [];

  // Parse entries: - **[org/skill-name](url)** - Description
  const entries = [];
  const pattern = /^-\s+\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*[-–—]\s*(.+)$/gm;
  let match;
  while ((match = pattern.exec(md)) !== null) {
    entries.push({
      name: match[1].trim(),
      url: match[2].trim(),
      description: match[3].trim(),
    });
  }

  _awesomeCache = entries;
  _awesomeFetchedAt = now;
  return entries;
}

export async function searchAwesome(query, { limit = 15 } = {}) {
  const entries = await loadAwesomeSkills();
  if (entries.length === 0) return [];

  const terms = query.toLowerCase().split(/\s+/);
  const scored = [];

  for (const entry of entries) {
    const relevance = scoreMatch(entry.name, entry.description, terms);
    if (relevance > 0) {
      scored.push({ ...entry, _score: relevance });
    }
  }

  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, limit).map(e => ({
    name: e.name,
    author: e.name.split('/')[0] || '',
    source: 'awesome-agent-skills',
    type: 'skill',
    description: e.description.slice(0, 120),
    url: e.url,
    install: `serpentstack add ${e.name}`,
    stars: null,
    _score: e._score,
  }));
}

// ─── skills.sh (Vercel) ───────────────────────────────────
// No public search API (SPA behind Cloudflare).
// Curated list of known skills from the registry.

const SKILLS_SH_POPULAR = [
  { name: 'find-skills', author: 'vercel-labs', description: 'Find and install Agent Skills from the community', url: 'https://skills.sh/vercel-labs/skills/find-skills' },
  { name: 'frontend-design', author: 'anthropics', description: 'Design beautiful, accessible frontends with semantic HTML and modern CSS', url: 'https://skills.sh/anthropics/skills/frontend-design' },
  { name: 'create-mcp-server', author: 'anthropics', description: 'Build custom MCP servers for extending agent capabilities', url: 'https://skills.sh/anthropics/skills/create-mcp-server' },
  { name: 'stripe-best-practices', author: 'stripe', description: 'Best practices for building Stripe integrations', url: 'https://skills.sh/stripe/ai/stripe-best-practices' },
  { name: 'cloudflare-workers', author: 'cloudflare', description: 'Build and deploy Cloudflare Workers and Pages applications', url: 'https://skills.sh/cloudflare/ai/cloudflare-workers' },
  { name: 'supabase', author: 'supabase-community', description: 'Build apps with Supabase: auth, database, storage, edge functions', url: 'https://skills.sh/supabase-community/supabase' },
  { name: 'nextjs', author: 'vercel-labs', description: 'Build Next.js applications with App Router and best practices', url: 'https://skills.sh/vercel-labs/skills/nextjs' },
  { name: 'react-native', author: 'expo', description: 'Build React Native and Expo applications', url: 'https://skills.sh/expo/agent-skills/react-native' },
  { name: 'terraform', author: 'hashicorp-dev-advocates', description: 'Write and manage Terraform and OpenTofu infrastructure', url: 'https://skills.sh/hashicorp-dev-advocates/agent-skills/terraform' },
  { name: 'better-auth', author: 'better-auth', description: 'Implement authentication with Better Auth framework', url: 'https://skills.sh/better-auth/better-auth' },
  { name: 'firecrawl', author: 'firecrawl', description: 'Web scraping and crawling with Firecrawl API', url: 'https://skills.sh/mendableai/firecrawl' },
  { name: 'neon-postgres', author: 'neondatabase', description: 'Build serverless Postgres applications with Neon', url: 'https://skills.sh/neondatabase/neon-agent-skills/neon-postgres' },
  { name: 'sentry', author: 'getsentry', description: 'Error tracking and performance monitoring with Sentry SDK', url: 'https://skills.sh/getsentry/sentry-agent-skills/sentry' },
  { name: 'tailwindcss', author: 'anthropics', description: 'Build interfaces with Tailwind CSS utility classes', url: 'https://skills.sh/anthropics/skills/tailwindcss' },
  { name: 'figma', author: 'nichochar', description: 'Convert Figma designs to code implementations', url: 'https://skills.sh/nichochar/figma-agent-skill/figma' },
  { name: 'prisma', author: 'nichochar', description: 'Build database schemas and queries with Prisma ORM', url: 'https://skills.sh/nichochar/prisma-agent-skill/prisma' },
  { name: 'eslint', author: 'nichochar', description: 'Configure and maintain ESLint rules and plugins', url: 'https://skills.sh/nichochar/eslint-agent-skill/eslint' },
  { name: 'docker', author: 'nichochar', description: 'Build and manage Docker containers and Compose configs', url: 'https://skills.sh/nichochar/docker-agent-skill/docker' },
  { name: 'vitest', author: 'nichochar', description: 'Write and run tests with Vitest testing framework', url: 'https://skills.sh/nichochar/vitest-agent-skill/vitest' },
  { name: 'drizzle-orm', author: 'nichochar', description: 'Build type-safe database queries with Drizzle ORM', url: 'https://skills.sh/nichochar/drizzle-agent-skill/drizzle-orm' },
  { name: 'playwright', author: 'nichochar', description: 'End-to-end testing with Playwright for web applications', url: 'https://skills.sh/nichochar/playwright-agent-skill/playwright' },
  { name: 'jest', author: 'nichochar', description: 'Unit and integration testing with Jest framework', url: 'https://skills.sh/nichochar/jest-agent-skill/jest' },
  { name: 'mongodb', author: 'mongodb', description: 'Build applications with MongoDB Atlas and drivers', url: 'https://skills.sh/mongodb/mongodb-agent-skills/mongodb' },
  { name: 'convex', author: 'get-convex', description: 'Build reactive backends with Convex database and functions', url: 'https://skills.sh/get-convex/convex-agent-skill/convex' },
  { name: 'resend', author: 'resend', description: 'Send transactional emails with Resend API', url: 'https://skills.sh/resend/agent-skills/resend' },
  { name: 'linear', author: 'nichochar', description: 'Project management and issue tracking with Linear API', url: 'https://skills.sh/nichochar/linear-agent-skill/linear' },
  { name: 'clerk', author: 'clerk', description: 'Authentication and user management with Clerk', url: 'https://skills.sh/clerk/agent-skills/clerk' },
  { name: 'vercel', author: 'vercel-labs', description: 'Deploy and manage applications on Vercel platform', url: 'https://skills.sh/vercel-labs/skills/vercel' },
  { name: 'aws-cdk', author: 'nichochar', description: 'Define cloud infrastructure with AWS CDK constructs', url: 'https://skills.sh/nichochar/aws-cdk-agent-skill/aws-cdk' },
  { name: 'github-actions', author: 'nichochar', description: 'Build CI/CD workflows with GitHub Actions', url: 'https://skills.sh/nichochar/github-actions-agent-skill/github-actions' },
];

export async function searchSkillsSh(query, { limit = 10 } = {}) {
  const terms = query.toLowerCase().split(/\s+/);
  const results = [];

  for (const skill of SKILLS_SH_POPULAR) {
    const relevance = scoreMatch(skill.name, `${skill.author} ${skill.description}`, terms);
    if (relevance > 0) {
      results.push({
        ...skill,
        source: 'skills.sh',
        type: 'skill',
        install: `npx skills add ${skill.author}/${skill.name}`,
        stars: null,
        _score: relevance,
      });
    }
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit);
}

// ─── Anthropic Official Skills ─────────────────────────────
// Dynamically fetches the skill list from anthropics/skills repo tree.
// Falls back to a hardcoded list if the API is unreachable.

const ANTHROPIC_SKILLS_FALLBACK = [
  { name: 'algorithmic-art', description: 'Create algorithmic and generative art with code' },
  { name: 'brand-guidelines', description: 'Apply and maintain brand identity guidelines' },
  { name: 'canvas-design', description: 'Design interactive canvas-based visuals and layouts' },
  { name: 'claude-api', description: 'Build applications using the Claude API and SDKs' },
  { name: 'doc-coauthoring', description: 'Collaboratively write and edit long-form documents' },
  { name: 'docx', description: 'Create, edit, and analyze Word documents' },
  { name: 'frontend-design', description: 'Design beautiful, accessible frontends with semantic HTML and modern CSS' },
  { name: 'internal-comms', description: 'Draft internal communications, memos, and announcements' },
  { name: 'mcp-builder', description: 'Build custom MCP servers for extending agent capabilities' },
  { name: 'pdf', description: 'Read, create, merge, split, and manipulate PDF files' },
  { name: 'pptx', description: 'Create and edit PowerPoint presentations' },
  { name: 'skill-creator', description: 'Create, test, and optimize new agent skills' },
  { name: 'slack-gif-creator', description: 'Generate animated GIFs for Slack messages' },
  { name: 'theme-factory', description: 'Generate and customize UI themes and color palettes' },
  { name: 'web-artifacts-builder', description: 'Build interactive web artifacts and components' },
  { name: 'webapp-testing', description: 'Test web applications with automated browser testing' },
  { name: 'xlsx', description: 'Read, create, and edit Excel spreadsheets' },
];

let _anthropicCache = null;
let _anthropicFetchedAt = 0;
const ANTHROPIC_TTL = 300_000; // 5 min cache

async function loadAnthropicSkills() {
  const now = Date.now();
  if (_anthropicCache && now - _anthropicFetchedAt < ANTHROPIC_TTL) return _anthropicCache;

  // Try fetching the repo tree to get live skill list
  const tree = await fetchJSON(
    'https://api.github.com/repos/anthropics/skills/git/trees/main',
    { headers: { 'Accept': 'application/vnd.github+json' } }
  );

  if (tree?.tree) {
    const skillsDir = tree.tree.find(t => t.path === 'skills' && t.type === 'tree');
    if (skillsDir) {
      const subtree = await fetchJSON(skillsDir.url, {
        headers: { 'Accept': 'application/vnd.github+json' },
      });

      if (subtree?.tree) {
        const skills = subtree.tree
          .filter(t => t.type === 'tree')
          .map(t => {
            // Try to find this skill in fallback for description
            const fallback = ANTHROPIC_SKILLS_FALLBACK.find(f => f.name === t.path);
            return {
              name: t.path,
              description: fallback?.description || `Anthropic official ${t.path.replace(/-/g, ' ')} skill`,
            };
          });

        if (skills.length > 0) {
          _anthropicCache = skills;
          _anthropicFetchedAt = now;
          return skills;
        }
      }
    }
  }

  // Fallback to hardcoded list
  _anthropicCache = ANTHROPIC_SKILLS_FALLBACK;
  _anthropicFetchedAt = now;
  return ANTHROPIC_SKILLS_FALLBACK;
}

export async function searchAnthropic(query, { limit = 10 } = {}) {
  const skills = await loadAnthropicSkills();
  const terms = query.toLowerCase().split(/\s+/);
  const results = [];

  for (const skill of skills) {
    const relevance = scoreMatch(skill.name, skill.description, terms);
    if (relevance > 0) {
      results.push({
        name: `anthropics/${skill.name}`,
        author: 'anthropics',
        source: 'anthropic',
        type: 'skill',
        description: skill.description,
        url: `https://github.com/anthropics/skills/tree/main/skills/${skill.name}`,
        install: `npx skills add anthropics/skills/${skill.name}`,
        stars: null,
        _score: relevance,
      });
    }
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit);
}

// ─── MCP Server Registry ──────────────────────────────────
// Curated list of popular MCP servers from the official registry,
// mcp.so, and Glama. Supplemented with live API search.

const MCP_SERVERS_POPULAR = [
  // Databases
  { name: 'postgres', author: 'modelcontextprotocol', description: 'Read-only access to PostgreSQL databases with schema inspection and query execution', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres', mcpUrl: 'npx -y @modelcontextprotocol/server-postgres', tags: ['database', 'postgres', 'sql'] },
  { name: 'sqlite', author: 'modelcontextprotocol', description: 'Query and manage SQLite databases with business intelligence capabilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite', mcpUrl: 'npx -y @modelcontextprotocol/server-sqlite', tags: ['database', 'sqlite', 'sql'] },
  { name: 'neon', author: 'neondatabase', description: 'Serverless Postgres with branching, schema migrations, and database management', url: 'https://github.com/neondatabase/mcp-server-neon', mcpUrl: 'https://mcp.neon.tech/sse', transport: 'http', tags: ['database', 'postgres', 'neon', 'serverless'] },
  { name: 'supabase', author: 'supabase', description: 'Manage Supabase projects, databases, edge functions, and auth', url: 'https://github.com/supabase-community/supabase-mcp', mcpUrl: 'npx -y supabase-mcp-server', tags: ['database', 'supabase', 'auth', 'storage'] },
  { name: 'redis', author: 'redis', description: 'Redis database operations, caching, and pub/sub messaging', url: 'https://github.com/redis/mcp-redis', mcpUrl: 'npx -y @redis/mcp-server', tags: ['database', 'redis', 'cache'] },
  { name: 'mongodb', author: 'mongodb', description: 'MongoDB Atlas database operations, queries, and aggregation pipelines', url: 'https://github.com/mongodb-js/mongodb-mcp-server', mcpUrl: 'npx -y mongodb-mcp-server', tags: ['database', 'mongodb', 'nosql'] },
  { name: 'turso', author: 'turso', description: 'Edge-hosted SQLite database with sync, branching, and embedded replicas', url: 'https://github.com/turso-extended/mcp-server-turso', mcpUrl: 'npx -y @turso/mcp-server', tags: ['database', 'sqlite', 'turso', 'edge'] },

  // APIs & services
  { name: 'stripe', author: 'stripe', description: 'Manage Stripe payments, customers, subscriptions, and invoices', url: 'https://github.com/stripe/agent-toolkit', mcpUrl: 'npx -y @stripe/mcp', tags: ['payments', 'stripe', 'billing'] },
  { name: 'github', author: 'modelcontextprotocol', description: 'GitHub repository management, issues, pull requests, and actions', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github', mcpUrl: 'npx -y @modelcontextprotocol/server-github', tags: ['github', 'git', 'vcs'] },
  { name: 'gitlab', author: 'modelcontextprotocol', description: 'GitLab project management, merge requests, and CI/CD pipelines', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab', mcpUrl: 'npx -y @modelcontextprotocol/server-gitlab', tags: ['gitlab', 'git', 'vcs', 'cicd'] },
  { name: 'linear', author: 'jerhadf', description: 'Linear issue tracking, project management, and workflow automation', url: 'https://github.com/jerhadf/linear-mcp-server', mcpUrl: 'npx -y mcp-linear', tags: ['linear', 'project-management', 'issues'] },
  { name: 'slack', author: 'modelcontextprotocol', description: 'Slack messaging, channel management, and workspace interaction', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack', mcpUrl: 'npx -y @modelcontextprotocol/server-slack', tags: ['slack', 'messaging', 'chat'] },
  { name: 'notion', author: 'makenotion', description: 'Notion pages, databases, and workspace management', url: 'https://github.com/makenotion/notion-mcp-server', mcpUrl: 'npx -y @notionhq/notion-mcp-server', tags: ['notion', 'docs', 'wiki'] },
  { name: 'sentry', author: 'getsentry', description: 'Sentry error tracking, issue search, and performance monitoring', url: 'https://github.com/getsentry/sentry-mcp', mcpUrl: 'npx -y @sentry/mcp-server', tags: ['sentry', 'errors', 'monitoring'] },
  { name: 'resend', author: 'resend', description: 'Send transactional and marketing emails via Resend API', url: 'https://github.com/resend/mcp-send-email', mcpUrl: 'npx -y mcp-send-email', tags: ['email', 'resend', 'transactional'] },
  { name: 'twilio', author: 'twilio', description: 'SMS, voice calls, and messaging via Twilio API', url: 'https://github.com/twilio/mcp-server-twilio', mcpUrl: 'npx -y @twilio/mcp-server', tags: ['sms', 'twilio', 'voice', 'messaging'] },

  // Cloud & infrastructure
  { name: 'aws', author: 'aws', description: 'AWS service management across S3, Lambda, EC2, CloudWatch, and more', url: 'https://github.com/awslabs/mcp', mcpUrl: 'npx -y @aws/mcp-server', tags: ['aws', 'cloud', 'infrastructure'] },
  { name: 'cloudflare', author: 'cloudflare', description: 'Manage Cloudflare Workers, KV, R2, D1, and DNS', url: 'https://github.com/cloudflare/mcp-server-cloudflare', mcpUrl: 'npx -y @cloudflare/mcp-server-cloudflare', tags: ['cloudflare', 'workers', 'edge', 'dns'] },
  { name: 'vercel', author: 'vercel', description: 'Manage Vercel deployments, domains, environment variables, and logs', url: 'https://github.com/vercel/vercel-mcp', mcpUrl: 'npx -y @vercel/mcp', tags: ['vercel', 'deploy', 'hosting'] },
  { name: 'terraform', author: 'hashicorp', description: 'Terraform plan, apply, state management, and HCL generation', url: 'https://github.com/hashicorp/terraform-mcp-server', mcpUrl: 'npx -y @hashicorp/terraform-mcp-server', tags: ['terraform', 'iac', 'infrastructure'] },
  { name: 'kubernetes', author: 'statemind-io', description: 'Kubernetes cluster management, pod operations, and resource inspection', url: 'https://github.com/statemind-io/mcp-server-kubernetes', mcpUrl: 'npx -y mcp-server-kubernetes', tags: ['kubernetes', 'k8s', 'containers'] },
  { name: 'docker', author: 'docker', description: 'Docker container, image, volume, and network management', url: 'https://github.com/docker/mcp-server-docker', mcpUrl: 'npx -y @docker/mcp-server', tags: ['docker', 'containers'] },

  // Web & data
  { name: 'fetch', author: 'modelcontextprotocol', description: 'Fetch web content and convert to markdown for agent consumption', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch', mcpUrl: 'npx -y @modelcontextprotocol/server-fetch', tags: ['web', 'fetch', 'http', 'scraping'] },
  { name: 'firecrawl', author: 'firecrawl', description: 'Web scraping, crawling, and structured data extraction at scale', url: 'https://github.com/mendableai/firecrawl-mcp-server', mcpUrl: 'npx -y firecrawl-mcp', tags: ['web', 'scraping', 'crawling', 'firecrawl'] },
  { name: 'browserbase', author: 'browserbase', description: 'Cloud browser sessions for web scraping and automation', url: 'https://github.com/browserbase/mcp-server-browserbase', mcpUrl: 'npx -y @browserbasehq/mcp-server', tags: ['browser', 'scraping', 'automation'] },
  { name: 'puppeteer', author: 'modelcontextprotocol', description: 'Browser automation with Puppeteer for screenshots, navigation, and form filling', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer', mcpUrl: 'npx -y @modelcontextprotocol/server-puppeteer', tags: ['browser', 'puppeteer', 'automation', 'testing'] },
  { name: 'playwright', author: 'nichochar', description: 'Browser automation with Playwright for testing and web interaction', url: 'https://github.com/nichochar/playwright-mcp', mcpUrl: 'npx -y @nichochar/playwright-mcp', tags: ['browser', 'playwright', 'testing', 'automation'] },

  // AI & search
  { name: 'brave-search', author: 'modelcontextprotocol', description: 'Web and local search using Brave Search API', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search', mcpUrl: 'npx -y @modelcontextprotocol/server-brave-search', tags: ['search', 'web', 'brave'] },
  { name: 'exa', author: 'exa-labs', description: 'Neural search engine for finding relevant web content', url: 'https://github.com/exa-labs/exa-mcp-server', mcpUrl: 'npx -y exa-mcp-server', tags: ['search', 'ai', 'exa'] },
  { name: 'context7', author: 'upstash', description: 'Up-to-date documentation lookup for any library or framework', url: 'https://github.com/upstash/context7', mcpUrl: 'https://mcp.context7.com/mcp', transport: 'http', tags: ['docs', 'documentation', 'search', 'context'] },

  // Files & storage
  { name: 'filesystem', author: 'modelcontextprotocol', description: 'Secure file operations with configurable access controls', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', mcpUrl: 'npx -y @modelcontextprotocol/server-filesystem', tags: ['files', 'filesystem', 'storage'] },
  { name: 's3', author: 'aws', description: 'AWS S3 bucket and object management', url: 'https://github.com/awslabs/mcp', mcpUrl: 'npx -y @aws/mcp-server-s3', tags: ['s3', 'aws', 'storage', 'files'] },

  // Dev tools
  { name: 'sequential-thinking', author: 'modelcontextprotocol', description: 'Dynamic problem-solving through sequential thought chains with branching and revision', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking', mcpUrl: 'npx -y @modelcontextprotocol/server-sequential-thinking', tags: ['thinking', 'reasoning', 'planning'] },
  { name: 'memory', author: 'modelcontextprotocol', description: 'Persistent knowledge graph for maintaining context across conversations', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory', mcpUrl: 'npx -y @modelcontextprotocol/server-memory', tags: ['memory', 'knowledge', 'context'] },
];

export function searchMcpServers(query, { limit = 10 } = {}) {
  const terms = query.toLowerCase().split(/\s+/);
  const results = [];

  for (const server of MCP_SERVERS_POPULAR) {
    // Score against name, description, and tags
    const tagStr = server.tags.join(' ');
    const relevance = scoreMatch(server.name, `${server.description} ${tagStr}`, terms);

    // Bonus for exact tag matches
    let tagBonus = 0;
    for (const term of terms) {
      if (server.tags.includes(term)) tagBonus += 10;
    }

    const totalScore = relevance + tagBonus;
    if (totalScore > 0) {
      // HTTP/SSE servers need --transport http; stdio servers (npx) don't
      const transport = server.transport || (server.mcpUrl.startsWith('http') ? 'http' : null);
      const installCmd = transport
        ? `claude mcp add --transport ${transport} ${server.name} ${server.mcpUrl}`
        : `claude mcp add ${server.name} -- ${server.mcpUrl}`;

      results.push({
        name: server.name,
        author: server.author,
        source: 'mcp-registry',
        type: 'mcp',
        description: server.description,
        url: server.url,
        install: installCmd,
        mcpUrl: server.mcpUrl,
        transport,
        stars: null,
        _score: totalScore,
      });
    }
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit);
}

// ─── Unified Search ────────────────────────────────────────

/**
 * Search all skill registries and MCP server registries in parallel.
 * Returns deduplicated, ranked results split by type.
 */
export async function searchAll(query, { limit = 20 } = {}) {
  const [awesome, github, skillsSh, anthropic] = await Promise.allSettled([
    searchAwesome(query, { limit: 15 }),
    searchGitHub(query, { limit: 12 }),
    searchSkillsSh(query, { limit: 10 }),
    searchAnthropic(query, { limit: 10 }),
  ]);

  // MCP search is synchronous (curated list) but we keep the same structure
  const mcpResults = searchMcpServers(query, { limit: 10 });

  const all = [];
  const sources = { fulfilled: 0, failed: 0, names: [] };

  for (const [result, name] of [
    [anthropic, 'Anthropic'],
    [skillsSh, 'skills.sh'],
    [awesome, 'awesome-agent-skills'],
    [github, 'GitHub'],
  ]) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      all.push(...result.value);
      sources.fulfilled++;
      sources.names.push(name);
    } else if (result.status === 'rejected') {
      sources.failed++;
    }
  }

  if (mcpResults.length > 0) {
    sources.fulfilled++;
    sources.names.push('MCP Registry');
  }

  // Deduplicate skills by normalized name, keeping the highest-weighted version
  const seen = new Map();
  const deduped = [];

  for (const item of all) {
    const baseName = item.name.includes('/') ? item.name.split('/').pop() : item.name;
    const key = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');

    const weight = SOURCE_WEIGHT[item.source] || 1.0;
    const weightedScore = (item._score || 0) * weight;

    if (seen.has(key)) {
      const existingIdx = seen.get(key);
      if (weightedScore > deduped[existingIdx]._weightedScore) {
        deduped[existingIdx] = { ...item, _weightedScore: weightedScore };
      }
    } else {
      seen.set(key, deduped.length);
      deduped.push({ ...item, _weightedScore: weightedScore });
    }
  }

  deduped.sort((a, b) => b._weightedScore - a._weightedScore);

  const skillResults = deduped.slice(0, limit).map(({ _score, _weightedScore, ...rest }) => rest);

  // MCP results are kept separate — no dedup against skills (different type)
  const mcpFinal = mcpResults.map(({ _score, ...rest }) => rest);

  return { results: skillResults, mcp: mcpFinal, sources };
}

/**
 * Get counts of skills and MCP servers in each registry (for display).
 */
export async function getRegistryStats() {
  const entries = await loadAwesomeSkills();
  const anthropicSkills = await loadAnthropicSkills();
  return {
    awesome: entries.length,
    skillsSh: SKILLS_SH_POPULAR.length,
    anthropic: anthropicSkills.length,
    mcp: MCP_SERVERS_POPULAR.length,
  };
}
