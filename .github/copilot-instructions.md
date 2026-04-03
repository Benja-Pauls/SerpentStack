# SerpentStack — GitHub Copilot Instructions

You are working on SerpentStack, a CLI that searches for AI agent skills and MCP servers across every major registry. It also includes a production fullstack template (FastAPI + React + PostgreSQL + Terraform) and persistent background agents.

## CLI Architecture

The CLI (`cli/`) is the primary product. It has **zero npm dependencies** — Node.js built-ins only.

```
cli/
  bin/serpentstack.js       # Entry point, argument parsing, command routing
  lib/
    commands/
      search.js             # Cross-registry skill + MCP server search
      add.js                # Install skills from any source
      discover.js           # Project-aware recommendations (detects stack, queries registries)
      skills-init.js        # Download base skills
      skills-update.js      # Update base skills
      persistent.js         # Persistent agent setup + management
      notifications.js      # View agent findings
      stack-new.js          # Scaffold new project from template
      stack-update.js       # Update template files
    utils/
      registries.js         # Registry adapters (Anthropic, skills.sh, awesome, GitHub, MCP)
      ui.js                 # Terminal formatting, colors, spinners, branded output
      config.js             # Project detection and config management
      models.js             # Ollama model detection and management
      agent-utils.js        # OpenClaw workspace management
      github.js             # GitHub API helpers
      fs-helpers.js         # File system utilities
```

## Key Conventions

### CLI
- Zero dependencies — use only Node.js built-ins (fetch, fs, path, readline, etc.)
- All registry adapters return `{ name, source, type, description, url, install, stars?, author?, _score }[]`
- `type` is either `'skill'` or `'mcp'`
- Scoring: 0-100 relevance score with source-weighted multipliers
- Results are deduplicated by normalized name within each type (skills and MCP are separate)
- MCP server entries include `mcpUrl` for the install command and `tags` for scoring
- UI uses the snake brand (green theme, `printHeader()`, `divider()`, `spinner()`)

### Template (backend)
- All route handlers and service methods MUST be `async def`
- Use `AsyncSession` from `sqlalchemy.ext.asyncio` — never sync Session
- Services return `None` or domain values — NEVER raise `HTTPException` in services
- Services flush() but do NOT commit() — routes own the transaction boundary
- Routes translate service results to HTTP responses (None -> 404, etc.) and call `await db.commit()` after mutations
- UUID primary keys on all models
- Structured logging: `get_logger(__name__)`, `logger.info("event_name", key=value)`

### Template (frontend)
- Strict TypeScript — no `any` without justifying comment
- Types auto-generated from OpenAPI spec via `make types`
- React Query for data fetching, React Router for routing

## Testing

```bash
node --test cli/test/cli.test.js    # CLI tests (Node built-in test runner)
make verify                          # Full suite: lint + typecheck + test (backend + frontend + CLI)
```

## Agent Skills

Skills are structured markdown files (`.skills/*/SKILL.md`) following the [Agent Skills open standard](https://agentskills.io/home). They work with Claude Code, Cursor, Copilot, Gemini CLI, and any tool that reads SKILL.md files.

Persistent agent configs live in `.openclaw/` (SOUL.md, config.json, agents/).
