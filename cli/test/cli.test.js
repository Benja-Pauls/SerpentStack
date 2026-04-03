/**
 * CLI smoke tests — verifies all commands parse correctly and
 * produce expected output without crashing.
 *
 * Uses Node's built-in test runner (no dependencies needed).
 * Run: node --test cli/test/cli.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'serpentstack.js');

/**
 * Helper to run the CLI with args.
 * Returns { stdout, stderr, exitCode }.
 */
async function run(...args) {
  try {
    const { stdout, stderr } = await exec('node', [CLI, ...args], {
      timeout: 15_000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.code ?? 1,
    };
  }
}

// ── Help & version ──────────────────────────────────────────

describe('CLI basics', () => {
  it('shows help with no args', async () => {
    const { stdout, exitCode } = await run();
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('search'), 'Help should mention search command');
    assert.ok(stdout.includes('skills'), 'Help should mention skills command');
    assert.ok(stdout.includes('persistent'), 'Help should mention persistent command');
  });

  it('shows help with --help', async () => {
    const { stdout, exitCode } = await run('--help');
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('search'));
  });

  it('shows version with --version', async () => {
    const { stdout, exitCode } = await run('--version');
    assert.equal(exitCode, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('shows version with -v', async () => {
    const { stdout, exitCode } = await run('-v');
    assert.equal(exitCode, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  });
});

// ── Error handling ──────────────────────────────────────────

describe('Error handling', () => {
  it('errors on unknown command', async () => {
    const { exitCode, stderr } = await run('foobar');
    assert.notEqual(exitCode, 0);
  });

  it('suggests similar command on typo', async () => {
    const { stdout, stderr } = await run('searc');
    const output = stdout + stderr;
    assert.ok(output.includes('search'), 'Should suggest "search"');
  });

  it('errors when add has no argument', async () => {
    const { exitCode } = await run('add');
    assert.notEqual(exitCode, 0);
  });

  it('errors on unknown stack subcommand', async () => {
    const { exitCode, stderr } = await run('stack', 'foobar');
    assert.notEqual(exitCode, 0);
  });

  it('errors on unknown skills subcommand', async () => {
    const { exitCode, stderr } = await run('skills', 'foobar');
    assert.notEqual(exitCode, 0);
  });
});

// ── Argument parsing ────────────────────────────────────────

describe('Argument parsing', () => {
  it('parses short flags (-f)', async () => {
    // -h should show help
    const { stdout, exitCode } = await run('-h');
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('search'));
  });

  it('handles notifications alias (notifs)', async () => {
    // notifs without notifications dir should still not crash badly
    const { exitCode } = await run('notifs');
    assert.equal(exitCode, 0);
  });

  it('handles notifications --errors flag', async () => {
    const { exitCode } = await run('notifications', '--errors');
    assert.equal(exitCode, 0);
  });

  it('handles notifications --clear flag', async () => {
    const { exitCode } = await run('notifications', '--clear');
    assert.equal(exitCode, 0);
  });
});

// ── Command loading ─────────────────────────────────────────

describe('Command modules load', () => {
  it('search runs without crashing (empty query)', async () => {
    const { exitCode } = await run('search');
    // May exit 0 or 1 depending on "query required" check
    // Just verifying it doesn't crash with unhandled error
    assert.ok(exitCode === 0 || exitCode === 1);
  });

  it('discover runs without crashing', async () => {
    const { exitCode } = await run('discover');
    assert.ok(exitCode === 0 || exitCode === 1);
  });

  it('persistent runs without crashing', async () => {
    const { exitCode } = await run('persistent');
    assert.ok(exitCode === 0 || exitCode === 1);
  });
});
