import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  info, success, warn, error,
  bold, dim, green, cyan, magenta, yellow,
  printHeader, spinner, divider,
} from '../utils/ui.js';
import { searchAll, searchMcpServers } from '../utils/registries.js';

// ─── Stack detection ────────────────────────────────────────

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function fileExists(name) {
  return existsSync(join(process.cwd(), name));
}

function dirExists(name) {
  try {
    const stat = readdirSync(join(process.cwd(), name));
    return stat.length > 0;
  } catch { return false; }
}

/**
 * Detect the project's technology stack by reading config files,
 * dependency manifests, and directory structure.
 * Returns { languages, frameworks, tools, services, categories }.
 */
function detectStack() {
  const signals = {
    languages: new Set(),
    frameworks: new Set(),
    tools: new Set(),
    services: new Set(),
  };

  // ── Node.js / JavaScript / TypeScript ───────────────────
  const pkg = readJSON(join(process.cwd(), 'package.json'));
  if (pkg) {
    signals.languages.add('javascript');
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps.typescript || fileExists('tsconfig.json')) signals.languages.add('typescript');

    // Frameworks
    if (allDeps.next) signals.frameworks.add('nextjs');
    if (allDeps.react || allDeps['react-dom']) signals.frameworks.add('react');
    if (allDeps['react-native'] || allDeps.expo) signals.frameworks.add('react-native');
    if (allDeps.vue) signals.frameworks.add('vue');
    if (allDeps.svelte || allDeps['@sveltejs/kit']) signals.frameworks.add('svelte');
    if (allDeps.nuxt) signals.frameworks.add('nuxt');
    if (allDeps.astro) signals.frameworks.add('astro');
    if (allDeps.express) signals.frameworks.add('express');
    if (allDeps.fastify) signals.frameworks.add('fastify');
    if (allDeps.hono) signals.frameworks.add('hono');
    if (allDeps.remix || allDeps['@remix-run/react']) signals.frameworks.add('remix');
    if (allDeps.angular || allDeps['@angular/core']) signals.frameworks.add('angular');
    if (allDeps.electron) signals.frameworks.add('electron');
    if (allDeps.tauri || allDeps['@tauri-apps/api']) signals.frameworks.add('tauri');

    // Auth
    if (allDeps['@clerk/nextjs'] || allDeps['@clerk/clerk-react'] || allDeps['@clerk/backend']) signals.services.add('clerk');
    if (allDeps['next-auth'] || allDeps['@auth/core']) signals.services.add('auth');
    if (allDeps['better-auth']) signals.services.add('better-auth');

    // Databases & ORMs
    if (allDeps.prisma || allDeps['@prisma/client']) signals.services.add('prisma');
    if (allDeps.drizzle || allDeps['drizzle-orm']) signals.services.add('drizzle');
    if (allDeps.mongoose || allDeps.mongodb) signals.services.add('mongodb');
    if (allDeps.pg || allDeps.postgres || allDeps['@neondatabase/serverless']) signals.services.add('postgres');
    if (allDeps['@supabase/supabase-js']) signals.services.add('supabase');
    if (allDeps.firebase || allDeps['firebase-admin']) signals.services.add('firebase');
    if (allDeps.convex) signals.services.add('convex');
    if (allDeps['@planetscale/database']) signals.services.add('planetscale');
    if (allDeps.redis || allDeps.ioredis) signals.services.add('redis');

    // Payments & APIs
    if (allDeps.stripe || allDeps['@stripe/stripe-js']) signals.services.add('stripe');

    // Testing
    if (allDeps.jest) signals.tools.add('jest');
    if (allDeps.vitest) signals.tools.add('vitest');
    if (allDeps.playwright || allDeps['@playwright/test']) signals.tools.add('playwright');
    if (allDeps.cypress) signals.tools.add('cypress');
    if (allDeps.mocha) signals.tools.add('mocha');

    // Build / Tooling
    if (allDeps.tailwindcss) signals.tools.add('tailwindcss');
    if (allDeps.eslint) signals.tools.add('eslint');
    if (allDeps.prettier) signals.tools.add('prettier');
    if (allDeps.webpack) signals.tools.add('webpack');
    if (allDeps.vite) signals.tools.add('vite');
    if (allDeps.turborepo || allDeps.turbo) signals.tools.add('turborepo');

    // AI
    if (allDeps.openai || allDeps['@anthropic-ai/sdk'] || allDeps.ai || allDeps['@ai-sdk/core']) signals.services.add('ai');
    if (allDeps.langchain || allDeps['@langchain/core']) signals.services.add('langchain');

    // Infra
    if (allDeps['@cloudflare/workers-types'] || allDeps.wrangler) signals.services.add('cloudflare');
    if (allDeps['@vercel/og'] || allDeps['@vercel/analytics']) signals.services.add('vercel');
    if (allDeps['@aws-sdk/client-s3'] || Object.keys(allDeps).some(k => k.startsWith('@aws-sdk'))) signals.services.add('aws');
  }

  // ── Python ──────────────────────────────────────────────
  const pyReqs = readText(join(process.cwd(), 'requirements.txt'));
  const pyproject = readText(join(process.cwd(), 'pyproject.toml'));
  const pipfile = readText(join(process.cwd(), 'Pipfile'));
  const pyDeps = [pyReqs, pyproject, pipfile].filter(Boolean).join('\n').toLowerCase();

  if (pyDeps || fileExists('setup.py') || fileExists('manage.py')) {
    signals.languages.add('python');

    if (pyDeps.includes('django') || fileExists('manage.py')) signals.frameworks.add('django');
    if (pyDeps.includes('fastapi')) signals.frameworks.add('fastapi');
    if (pyDeps.includes('flask')) signals.frameworks.add('flask');
    if (pyDeps.includes('sqlalchemy')) signals.services.add('sqlalchemy');
    if (pyDeps.includes('pytest')) signals.tools.add('pytest');
    if (pyDeps.includes('celery')) signals.services.add('celery');
    if (pyDeps.includes('langchain')) signals.services.add('langchain');
    if (pyDeps.includes('openai') || pyDeps.includes('anthropic')) signals.services.add('ai');
    if (pyDeps.includes('boto3')) signals.services.add('aws');
    if (pyDeps.includes('stripe')) signals.services.add('stripe');
    if (pyDeps.includes('redis')) signals.services.add('redis');
    if (pyDeps.includes('psycopg') || pyDeps.includes('asyncpg')) signals.services.add('postgres');
  }

  // ── Go ──────────────────────────────────────────────────
  const goMod = readText(join(process.cwd(), 'go.mod'));
  if (goMod) {
    signals.languages.add('go');
    if (goMod.includes('gin-gonic')) signals.frameworks.add('gin');
    if (goMod.includes('echo')) signals.frameworks.add('echo');
    if (goMod.includes('fiber')) signals.frameworks.add('fiber');
    if (goMod.includes('aws-sdk-go')) signals.services.add('aws');
    if (goMod.includes('stripe-go')) signals.services.add('stripe');
  }

  // ── Rust ────────────────────────────────────────────────
  const cargoToml = readText(join(process.cwd(), 'Cargo.toml'));
  if (cargoToml) {
    signals.languages.add('rust');
    if (cargoToml.includes('actix')) signals.frameworks.add('actix');
    if (cargoToml.includes('axum')) signals.frameworks.add('axum');
    if (cargoToml.includes('tokio')) signals.tools.add('tokio');
    if (cargoToml.includes('tauri')) signals.frameworks.add('tauri');
  }

  // ── Ruby ────────────────────────────────────────────────
  if (fileExists('Gemfile')) {
    signals.languages.add('ruby');
    const gemfile = readText(join(process.cwd(), 'Gemfile')) || '';
    if (gemfile.includes('rails')) signals.frameworks.add('rails');
    if (gemfile.includes('stripe')) signals.services.add('stripe');
  }

  // ── Infrastructure signals ──────────────────────────────
  if (fileExists('Dockerfile') || fileExists('docker-compose.yml') || fileExists('docker-compose.yaml')) {
    signals.tools.add('docker');
  }
  if (fileExists('.github/workflows') || dirExists('.github/workflows')) {
    signals.tools.add('github-actions');
  }
  if (fileExists('terraform') || dirExists('terraform') || fileExists('main.tf')) {
    signals.tools.add('terraform');
  }
  if (fileExists('k8s') || dirExists('k8s') || fileExists('kubernetes')) {
    signals.tools.add('kubernetes');
  }
  if (fileExists('vercel.json') || fileExists('.vercel')) {
    signals.services.add('vercel');
  }
  if (fileExists('netlify.toml')) {
    signals.services.add('netlify');
  }
  if (fileExists('fly.toml')) {
    signals.services.add('fly');
  }
  if (fileExists('wrangler.toml')) {
    signals.services.add('cloudflare');
  }
  if (fileExists('.env') || fileExists('.env.local')) {
    // Check env vars for service hints
    const envContent = readText(join(process.cwd(), '.env')) || readText(join(process.cwd(), '.env.local')) || '';
    if (envContent.includes('STRIPE')) signals.services.add('stripe');
    if (envContent.includes('SUPABASE')) signals.services.add('supabase');
    if (envContent.includes('CLERK')) signals.services.add('clerk');
    if (envContent.includes('FIREBASE')) signals.services.add('firebase');
    if (envContent.includes('DATABASE_URL')) signals.services.add('database');
    if (envContent.includes('REDIS')) signals.services.add('redis');
    if (envContent.includes('SENTRY')) signals.services.add('sentry');
    if (envContent.includes('OPENAI') || envContent.includes('ANTHROPIC')) signals.services.add('ai');
    if (envContent.includes('AWS_')) signals.services.add('aws');
  }

  // ── Mobile ──────────────────────────────────────────────
  if (fileExists('ios') || dirExists('ios')) signals.frameworks.add('ios');
  if (fileExists('android') || dirExists('android')) signals.frameworks.add('android');
  if (fileExists('app.json') && pkg?.dependencies?.expo) signals.frameworks.add('expo');

  return {
    languages: [...signals.languages],
    frameworks: [...signals.frameworks],
    tools: [...signals.tools],
    services: [...signals.services],
  };
}

// ─── Query generation ───────────────────────────────────────

/**
 * Generate search queries from detected stack.
 * Each query targets a specific technology or combination.
 * Returns [{ query, category, reason }]
 */
function generateQueries(stack) {
  const queries = [];

  // Service-specific queries (highest value — exact tool matches)
  for (const svc of stack.services) {
    queries.push({
      query: svc,
      category: 'Services',
      reason: `${svc} detected in your dependencies`,
    });
  }

  // Framework queries
  for (const fw of stack.frameworks) {
    queries.push({
      query: fw,
      category: 'Frameworks',
      reason: `${fw} framework detected`,
    });

    // Framework + common concerns
    if (['nextjs', 'react', 'vue', 'svelte', 'nuxt', 'remix', 'angular'].includes(fw)) {
      queries.push({
        query: `${fw} testing`,
        category: 'Testing',
        reason: `testing skills for ${fw}`,
      });
    }
  }

  // Tool queries
  for (const tool of stack.tools) {
    queries.push({
      query: tool,
      category: 'Tooling',
      reason: `${tool} detected in your project`,
    });
  }

  // Language-level queries for less common languages
  for (const lang of stack.languages) {
    if (['rust', 'go', 'ruby'].includes(lang)) {
      queries.push({
        query: `${lang} best practices`,
        category: 'Language',
        reason: `${lang} project detected`,
      });
    }
  }

  // Universal recommendations
  queries.push({
    query: 'git workflow',
    category: 'Workflow',
    reason: 'every project benefits from git workflow skills',
  });

  return queries;
}

// ─── Installed skill detection ──────────────────────────────

function getInstalledSkills() {
  const skillsDir = join(process.cwd(), '.skills');
  try {
    return readdirSync(skillsDir).filter(f => {
      try {
        return existsSync(join(skillsDir, f, 'SKILL.md'));
      } catch { return false; }
    });
  } catch { return []; }
}

// ─── Source badge formatting ────────────────────────────────

const SOURCE_COLORS = {
  anthropic: s => magenta(s),
  'skills.sh': s => cyan(s),
  'awesome-agent-skills': s => green(s),
  github: s => dim(s),
};

const SOURCE_LABELS = {
  anthropic: 'anthropic',
  'skills.sh': 'skills.sh',
  'awesome-agent-skills': 'awesome',
  github: 'github',
};

function sourceBadge(source) {
  const label = SOURCE_LABELS[source] || source;
  const colorFn = SOURCE_COLORS[source] || dim;
  return colorFn(label);
}

// ─── Main command ───────────────────────────────────────────

export async function discover() {
  printHeader();

  const spin = spinner('Scanning your project...');

  // Step 1: Detect stack
  const stack = detectStack();

  const totalSignals = stack.languages.length + stack.frameworks.length +
                       stack.tools.length + stack.services.length;

  if (totalSignals === 0) {
    spin.stop();
    warn('Could not detect your project\'s technology stack.');
    console.log();
    console.log(`  ${dim('Make sure you\'re in a project directory with:')}`);
    console.log(`    ${dim('•')} package.json, requirements.txt, go.mod, or Cargo.toml`);
    console.log(`    ${dim('•')} Framework config files (next.config.js, etc.)`);
    console.log();
    console.log(`  ${dim('Or search manually:')}`);
    console.log(`    ${dim('$')} ${bold('serpentstack search "your-stack"')}`);
    console.log();
    return;
  }

  // Show detected stack
  spin.stop();
  divider('Your stack');
  console.log();

  if (stack.languages.length) {
    console.log(`  ${dim('Languages:')}    ${stack.languages.map(l => bold(l)).join(', ')}`);
  }
  if (stack.frameworks.length) {
    console.log(`  ${dim('Frameworks:')}   ${stack.frameworks.map(f => bold(f)).join(', ')}`);
  }
  if (stack.services.length) {
    console.log(`  ${dim('Services:')}     ${stack.services.map(s => bold(s)).join(', ')}`);
  }
  if (stack.tools.length) {
    console.log(`  ${dim('Tools:')}        ${stack.tools.map(t => bold(t)).join(', ')}`);
  }
  console.log();

  // Step 2: Get installed skills
  const installed = new Set(getInstalledSkills().map(s => s.toLowerCase()));

  // Step 3: Generate queries and search
  const queries = generateQueries(stack);

  const spin2 = spinner(`Slithering through ${bold(queries.length + ' queries')} across all registries...`);

  // Run searches in batches to avoid overwhelming the API
  const BATCH_SIZE = 4;
  const allResults = new Map(); // dedup by name
  const resultCategories = new Map(); // name → category

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    spin2.update(`Searching ${bold(batch.map(q => q.query).join(', '))}...`);

    const results = await Promise.allSettled(
      batch.map(q => searchAll(q.query, { limit: 5 }).then(r => ({ ...r, _query: q })))
    );

    for (const settled of results) {
      if (settled.status !== 'fulfilled') continue;
      const { results: skills, _query } = settled.value;

      for (const skill of skills) {
        const normName = skill.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Skip already-installed skills
        if (installed.has(normName)) continue;

        // Skip skills that are too generic (e.g., just the language name)
        if (skill.name.length < 3) continue;

        // Keep highest-scoring version
        if (!allResults.has(normName) || skill._score > allResults.get(normName)._score) {
          allResults.set(normName, skill);
          resultCategories.set(normName, _query.category);
        }
      }
    }
  }

  // Step 3b: Find MCP servers for detected services and tools
  const mcpQueries = [...stack.services, ...stack.tools, ...stack.frameworks];
  const mcpResults = new Map();

  for (const q of mcpQueries) {
    const servers = searchMcpServers(q, { limit: 3 });
    for (const server of servers) {
      if (!mcpResults.has(server.name)) {
        mcpResults.set(server.name, server);
      }
    }
  }

  spin2.stop();

  if (allResults.size === 0 && mcpResults.size === 0) {
    success('No new recommendations — you\'re well covered!');
    console.log();
    console.log(`  ${dim('Installed skills:')} ${installed.size}`);
    console.log(`  ${dim('Search manually:')}`);
    console.log(`    ${dim('$')} ${bold('serpentstack search "anything"')}`);
    console.log();
    return;
  }

  // Step 4: Group skills by category and display
  const grouped = new Map();
  for (const [normName, skill] of allResults) {
    const category = resultCategories.get(normName) || 'Other';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(skill);
  }

  // Sort categories by relevance, skills by score within each
  const categoryOrder = ['Services', 'Frameworks', 'Testing', 'Tooling', 'Language', 'Workflow', 'Other'];

  let totalRecommendations = 0;
  const displayCategories = categoryOrder.filter(c => grouped.has(c));

  if (displayCategories.length > 0) {
    for (const category of displayCategories) {
      const skills = grouped.get(category);
      skills.sort((a, b) => (b._score || 0) - (a._score || 0));

      // Cap per category
      const capped = skills.slice(0, 8);
      totalRecommendations += capped.length;

      divider(category);
      console.log();

      for (const skill of capped) {
        const badge = sourceBadge(skill.source);
        const stars = skill.stars ? dim(` ${(skill.stars / 1000).toFixed(1)}k★`) : '';
        const name = bold(skill.name);
        const desc = skill.description
          ? dim(skill.description.length > 70 ? skill.description.slice(0, 67) + '...' : skill.description)
          : '';

        console.log(`  ${name}  ${badge}${stars}`);
        if (desc) console.log(`  ${desc}`);
        console.log(`  ${dim(skill.install)}`);
        console.log();
      }
    }
  }

  // Step 5: Show MCP server recommendations
  if (mcpResults.size > 0) {
    divider(`MCP Servers ${dim(`(${mcpResults.size})`)}`);
    console.log();

    for (const [, server] of mcpResults) {
      const name = bold(server.name);
      const badge = yellow('mcp');
      const desc = server.description
        ? dim(server.description.length > 70 ? server.description.slice(0, 67) + '...' : server.description)
        : '';

      console.log(`  ${name}  ${badge}`);
      if (desc) console.log(`  ${desc}`);
      console.log(`  ${dim('$')} ${cyan(server.install)}`);
      console.log();
    }
  }

  // Footer
  console.log(dim(`  ─────────────────────────────────────────────────────`));
  console.log();
  console.log(`  ${bold(String(totalRecommendations))} skill recommendations, ${bold(String(mcpResults.size))} MCP servers based on your stack.`);
  console.log(`  ${dim(`${installed.size} skills already installed.`)}`);
  console.log();
  console.log(`  ${dim('Install a skill:')} ${bold('serpentstack add <name>')}`);
  console.log(`  ${dim('Search more:')}     ${bold('serpentstack search "<query>"')}`);
  console.log();
}
