# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in SerpentStack, please report it responsibly.

**Do not open a public issue.** Instead, email the maintainer directly at the email address listed on the [GitHub profile](https://github.com/Benja-Pauls).

You should receive a response within 72 hours. If the vulnerability is confirmed, a fix will be prioritized and released as soon as possible.

## Scope

SerpentStack is a CLI tool that:

- Fetches data from public skill registries and GitHub APIs
- Writes `SKILL.md` files to the local `.skills/` directory
- Manages local Ollama model configurations

It does not handle authentication credentials, payment information, or user data beyond what's stored locally on the user's machine.

## Supported Versions

Only the latest release is actively supported with security updates.
