# SerpentStack

<p align="center"><img src="assets/serpentstack-logo.png" alt="SerpentStack" width="400" /></p>

<p align="center">
  <a href="https://www.npmjs.com/package/serpentstack"><img src="https://img.shields.io/npm/v/serpentstack?color=blue" alt="npm" /></a>
  <a href="https://github.com/Benja-Pauls/SerpentStack/releases/latest"><img src="https://img.shields.io/github/v/release/Benja-Pauls/SerpentStack?label=release&color=blue" alt="Release" /></a>
  <a href="https://github.com/Benja-Pauls/SerpentStack/actions/workflows/ci.yml"><img src="https://github.com/Benja-Pauls/SerpentStack/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

<p align="center"><strong>Find any AI agent skill or MCP server. Search every registry, install in seconds.</strong></p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#search">Search</a> &middot;
  <a href="#install">Install</a> &middot;
  <a href="#discover">Discover</a> &middot;
  <a href="#base-skills">Base Skills</a> &middot;
  <a href="#persistent-agents">Persistent Agents</a>
</p>

---

[Agent skills](https://agentskills.io/home) are how [Stripe merges 1,300+ agent-generated PRs per week](https://stripe.dev/blog/how-we-build-software-at-stripe-in-2025) and [Shopify operates with agents as a core part of engineering](https://www.businessinsider.com/shopify-ceo-tells-employees-to-use-ai-before-asking-for-more-staff-2025-4). But skills are scattered across registries with no unified way to find or install them.

SerpentStack searches **every major skill registry and MCP server directory at once** — [Anthropic](https://github.com/anthropics/skills), [skills.sh](https://skills.sh/), [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills), public GitHub, and the [MCP Registry](https://registry.modelcontextprotocol.io/) — with a single command. One CLI to search, install, and manage skills and discover MCP servers for any AI coding agent.

```bash
npm install -g serpentstack
```

Works with Claude Code, Codex, Cursor, Copilot, Gemini CLI, Windsurf, and any tool that reads the [Agent Skills open standard](https://agentskills.io/home). Zero dependencies. Requires Node 22+.

---

## Why SerpentStack?

Skills and MCP servers are scattered across isolated registries. There's no unified way to find what exists.

| | [skills.sh](https://skills.sh/) | [Anthropic](https://github.com/anthropics/skills) | [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | [Glama](https://glama.ai/mcp) | [mcp.so](https://mcp.so) | **SerpentStack** |
|---|---|---|---|---|---|---|
| Skills | :white_check_mark: | :white_check_mark: | :white_check_mark: | | | :white_check_mark: **all** |
| MCP servers | | | | :white_check_mark: | :white_check_mark: | :white_check_mark: **all** |
| Single CLI search | | | | | | :white_check_mark: |
| Install from any source | | | | | | :white_check_mark: |
| Project-aware recommendations | | | | | | :white_check_mark: |
| Auto-generate missing skills | | | | | | :white_check_mark: |

One search, every source. Skills and MCP servers together, clearly labeled.

---

## Quick Start

```bash
serpentstack search "react testing"        # search every registry
serpentstack add clerk                     # install by name
serpentstack add stripe/agent-toolkit      # install from a GitHub repo
serpentstack discover                      # get recommendations for your project
```

That's it. Skills are installed to `.skills/<name>/SKILL.md` and your agents pick them up automatically.

---

## Search

Search across all major skill registries and MCP server directories with one command. Results are ranked by relevance, clearly split into **Skills** and **MCP Servers** so you always know what you're looking at.

```bash
serpentstack search "auth oauth"
serpentstack search "stripe payments"
serpentstack search "postgres database"
serpentstack search "docker deploy"
```

```
  ── Skills (3) ──────────────────────────────────────

   1. clerk  anthropic
      Authentication and user management with Clerk
      $ serpentstack add anthropics/skills/clerk

   2. better-auth  skills.sh
      Type-safe authentication framework for TypeScript
      $ serpentstack add better-auth/best-practices

   3. oauth-patterns  awesome
      OAuth 2.0 and OpenID Connect integration patterns
      $ serpentstack add nichochar/oauth-patterns

  ── MCP Servers (2) ─────────────────────────────────

   1. supabase  mcp
      Manage Supabase projects, databases, edge functions, and auth
      Claude Code: claude mcp add supabase -- npx -y supabase-mcp-server
      Docs:        github.com/supabase-community/supabase-mcp

   2. neon  mcp
      Serverless Postgres with branching, schema migrations, and database management
      Claude Code: claude mcp add --transport http neon https://mcp.neon.tech/sse
      Docs:        github.com/neondatabase/mcp-server-neon
```

Skills and MCP servers are clearly labeled: `anthropic` `skills.sh` `awesome` `github` for skills, `mcp` for MCP servers. Skills teach agents *how* to build; MCP servers give agents *tools* to use — you often want both.

---

## Install

Install skills from any source — a registry name, a GitHub repo, or a URL. SerpentStack resolves the source, fetches the `SKILL.md`, and drops it into your `.skills/` directory.

```bash
serpentstack add clerk                           # resolve via registries
serpentstack add anthropics/skills/clerk          # specific GitHub path
serpentstack add stripe/agent-toolkit             # GitHub repo
serpentstack add --force clerk                    # overwrite existing
```

**If no community skill exists**, SerpentStack auto-generates a context-rich stub by pulling the project's README, package metadata, install commands, and docs URL from GitHub. You get a useful starting point instead of nothing.

```bash
serpentstack add fastify
# → Generated fastify → .skills/fastify/SKILL.md
#   Source: github.com/fastify/fastify
#   Docs:   fastify.dev
```

---

## Discover

Analyze your project and get skill and MCP server recommendations tailored to your actual stack. SerpentStack reads your dependency files, detects frameworks/services/tools, and searches registries for matching skills and MCP servers — skipping skills you already have installed.

```bash
cd your-project
serpentstack discover
```

```
  Your stack
  Languages:    javascript, typescript
  Frameworks:   react, nextjs
  Services:     clerk, stripe, prisma
  Tools:        vitest, tailwindcss, eslint

  ── Services ────────────────────────────────────────
  clerk  anthropic
  $ serpentstack add anthropics/skills/clerk

  stripe-best-practices  skills.sh
  $ serpentstack add stripe/agent-toolkit
  ...

  ── MCP Servers (3) ─────────────────────────────────
  stripe  mcp
  $ claude mcp add stripe -- npx -y @stripe/mcp

  neon  mcp
  $ claude mcp add --transport http neon https://mcp.neon.tech/sse
  ...

  12 skill recommendations, 3 MCP servers based on your stack.
  3 skills already installed.
```

Detects: JavaScript/TypeScript, Python, Go, Rust, Ruby — and 50+ frameworks, services, and tools within each.

---

## Base Skills

SerpentStack ships 10 production-quality skills you can install into any project. These aren't descriptions — they contain complete, copy-paste templates with real imports and type signatures. Every skill ends with a verification step so agents can confirm their own work.

```bash
serpentstack skills                     # install all 10 base skills
serpentstack skills update              # update to latest versions
```

| Skill | What it teaches agents |
|---|---|
| `scaffold` | End-to-end resource generation: model, schema, service, route, migration, tests, frontend types |
| `auth` | JWT, ownership enforcement, SSO swap patterns (one function to replace) |
| `test` | Real Postgres via testcontainers, savepoint isolation, async httpx |
| `db-migrate` | Alembic workflow: create, review, apply, troubleshoot, rollback |
| `deploy` | Docker multi-stage builds, ECR push, Terraform plan/apply, rollback |
| `dev-server` | Error detection patterns for FastAPI and Vite/React |
| `git-workflow` | Branch naming, conventional commits, PR checklists |
| `model-routing` | Delegate code generation to local models for 10-50x cost reduction |
| `generate-skills` | Interview-based generation of project-specific skills for any codebase |
| `find-skills` | Evaluate and adopt community skills safely |

The most powerful is **`generate-skills`** — ask your agent to read `.skills/generate-skills/SKILL.md` and it will analyze your codebase, interview you about your decisions, and produce a custom skill set for your project. This is the fastest path to agents that understand your conventions.

---

## Persistent Agents

SerpentStack also includes three background agents that run on local models via [Ollama](https://ollama.com) at zero cost. They watch your project continuously — catching crashes, running tests, and keeping your skills accurate as code evolves.

<details>
<summary><strong>Setup and usage</strong></summary>

```bash
serpentstack persistent                  # guided setup on first run
serpentstack persistent --start          # launch agents
serpentstack persistent --stop           # stop all agents
serpentstack persistent --agents         # change models or enable/disable
serpentstack notifications               # see what your agents found
```

```
.openclaw/
  SOUL.md                     # shared context inherited by all agents
  agents/
    log-watcher/AGENT.md      # dev server health, crash detection     (every 30-60s)
    test-runner/AGENT.md       # test suite, lint, typecheck            (every 5-15min)
    skill-maintainer/AGENT.md  # skill drift detection                  (every 1hr)
```

**Log Watcher** monitors dev server output and catches crashes, import failures, and runtime errors with file paths and fix suggestions.

**Test Runner** runs your test suite, linter, and type checker on a schedule. Tracks which tests are failing, what changed, and whether the test or the source needs updating.

**Skill Maintainer** compares `.skills/` files against actual code patterns and proposes updates when conventions drift. Without this, skills go stale and agents start producing code that doesn't match your project.

During setup, SerpentStack installs Ollama and downloads a model if needed — no API keys required. To add your own agent, create a folder under `.openclaw/agents/` with an `AGENT.md` file.

</details>

---

## Production Template

Projects created with `serpentstack stack new` include a complete fullstack application with all skills and agents pre-configured. This is not a starter template with TODO comments — it ships with working authentication, resource CRUD, ownership enforcement, database migrations, and infrastructure-as-code.

<details>
<summary><strong>Architecture and conventions</strong></summary>

**Prerequisites:** Python 3.12+, Node 22+, Docker, [uv](https://docs.astral.sh/uv/)

```bash
serpentstack stack new my-app
cd my-app
make init && make setup && make dev
```

```
backend/        FastAPI + async SQLAlchemy + asyncpg + Alembic
frontend/       React + TypeScript + Vite + Tailwind + React Query
infra/          Terraform: App Runner, RDS, ECR, VPC (dev/staging/prod)
.skills/        All 10 base skills pre-installed
.openclaw/      Persistent agent workspace pre-configured
```

**Key conventions** (encoded in `.skills/` so agents learn them automatically):

- **Services flush, routes commit.** Services call `db.flush()` but never `db.commit()`. Routes own the transaction boundary.
- **Services return domain objects, not HTTP errors.** `None` = not found, `False` = forbidden, domain object = success. Routes translate to HTTP status codes.
- **Auth is one function.** All protected routes depend on `get_current_user()`. Swapping JWT for Clerk/Auth0 means replacing one dependency.
- **Types flow from backend to frontend.** `make types` generates TypeScript interfaces from the OpenAPI spec. No hand-written API types.

```bash
make dev             # Postgres + Redis + backend + frontend with hot reload
make verify          # lint + typecheck + test (both stacks)
make deploy          # build, push, terraform apply
```

</details>

---

## CLI Reference

```bash
# Search & install
serpentstack search <query>             # search skills + MCP servers across all registries
serpentstack add <source>               # install a skill from any registry or repo
serpentstack discover                   # analyze project, recommend skills + MCP servers

# Base skills
serpentstack skills                     # download base skills + agent configs
serpentstack skills update              # update to latest versions

# Persistent agents
serpentstack persistent                 # status dashboard (guided setup on first run)
serpentstack persistent --start         # launch agents
serpentstack persistent --stop          # stop all agents
serpentstack notifications              # what your agents found

# Template
serpentstack stack new <name>           # scaffold a new project
serpentstack stack update               # update template files
```

---

## Contributing

Contributions are welcome — see [CONTRIBUTING](CONTRIBUTING) for setup and guidelines. The highest-impact areas:

- **MCP server entries** — add popular servers to the curated registry in `registries.js`
- **Registry adapters** — connect additional skill or MCP sources
- **Stack detection** — detect more languages, frameworks, and tools in `discover`
- **New skills** for popular frameworks and services (follow [SKILL-AUTHORING.md](SKILL-AUTHORING.md))

[Open an issue](https://github.com/Benja-Pauls/SerpentStack/issues) for bugs and feature requests.

## License

[MIT](LICENSE)
