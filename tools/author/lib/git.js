'use strict';

/**
 * Thin wrapper around git for the explicit, Charlie-confirmed "Publish to
 * GitHub" flow. Saving/editing/deleting an article NEVER calls anything in
 * this module - only the dedicated /api/git/status and /api/git/publish
 * routes do, and only when Charlie clicks the publish button.
 *
 * SECURITY: always execFile() with an argv array, NEVER exec()/string-
 * concatenated shell commands, NEVER { shell: true }. Never auto `--force`
 * anything.
 */

const path = require('path');
const { execFile } = require('child_process');
const util = require('util');

const { ROOT_DIR, CONTENT_DIR } = require('./paths');

const execFileAsync = util.promisify(execFile);

const GIT_EXEC_OPTS = { cwd: ROOT_DIR, windowsHide: true, maxBuffer: 10 * 1024 * 1024 };

async function runGit(args) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, GIT_EXEC_OPTS);
    return { ok: true, stdout: stdout || '', stderr: stderr || '' };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : '',
    };
  }
}

async function isGitRepo() {
  const result = await runGit(['rev-parse', '--is-inside-work-tree']);
  return result.ok && result.stdout.trim() === 'true';
}

async function hasRemote() {
  const result = await runGit(['remote', '-v']);
  return result.ok && result.stdout.trim().length > 0;
}

function parsePorcelainStatus(output) {
  return output
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3).trim(),
    }));
}

const SETUP_HINT =
  'Run one-time setup yourself first: "git init", add a GitHub remote (e.g. "git remote add origin <url>"), ' +
  'and do a first "git push" from a terminal. This tool will never do that setup automatically.';

/**
 * @returns {Promise<{ ok: true, files: {status:string,path:string}[] } | { ok: false, code: string, errors: string[] }>}
 */
async function getStatus() {
  const repoOk = await isGitRepo();
  if (!repoOk) {
    return {
      ok: false,
      code: 'NOT_A_REPO',
      errors: [`This folder is not a git repository yet. ${SETUP_HINT}`],
    };
  }

  const remoteOk = await hasRemote();
  if (!remoteOk) {
    return {
      ok: false,
      code: 'NO_REMOTE',
      errors: [`No git remote is configured. ${SETUP_HINT}`],
    };
  }

  const statusResult = await runGit(['status', '--porcelain']);
  if (!statusResult.ok) {
    return { ok: false, code: 'GIT_ERROR', errors: [`git status failed: ${statusResult.error}`] };
  }

  return { ok: true, files: parsePorcelainStatus(statusResult.stdout) };
}

const MESSAGE_MAX_LENGTH = 200;

// Strips newlines and any other C0/DEL control character (code points 0-31
// and 127) from the commit message before it is ever passed - as a single
// argv element, never interpolated into a shell string - to execFile.
// Implemented as an explicit char-code filter rather than a regex literal
// containing raw control-character ranges (keeps this source file plain
// printable text throughout).
function stripControlChars(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    out += code < 32 || code === 127 ? ' ' : value[i];
  }
  return out;
}

function sanitizeCommitMessage(message, fallback) {
  const cleaned = stripControlChars(String(message || '')).trim();
  const safeFallback = fallback && fallback.trim() ? fallback.trim() : 'Publish article';
  if (!cleaned) return safeFallback;
  return cleaned.length > MESSAGE_MAX_LENGTH ? cleaned.slice(0, MESSAGE_MAX_LENGTH) : cleaned;
}

/**
 * Resolves and validates that every given path (relative to repo root, or
 * absolute) is inside content/. Throws on the first path that escapes it.
 *
 * @returns {string[]} absolute, resolved paths
 */
function resolvePathsWithinContent(paths) {
  const resolved = [];
  for (const p of paths) {
    if (typeof p !== 'string' || !p.trim()) {
      throw new Error('Every publish path must be a non-empty string.');
    }
    const abs = path.resolve(ROOT_DIR, p);
    const rel = path.relative(CONTENT_DIR, abs);
    const escapesContentDir = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
    if (escapesContentDir) {
      throw new Error(`Path "${p}" is outside content/ and cannot be published from this tool.`);
    }
    resolved.push(abs);
  }
  return resolved;
}

/**
 * Stages exactly the given paths, commits, and pushes. Never `git add -A`,
 * never `--force`. Stops and reports the exact error at whichever step
 * fails.
 *
 * @param {{ paths: string[], message: string, fallbackMessage?: string }} args
 * @returns {Promise<{ ok: true, commit: string, pushOutput: string } | { ok: false, errors: string[] }>}
 */
async function publish({ paths, message, fallbackMessage }) {
  let resolvedPaths;
  try {
    resolvedPaths = resolvePathsWithinContent(Array.isArray(paths) ? paths : []);
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }
  if (resolvedPaths.length === 0) {
    return { ok: false, errors: ['No paths given to publish.'] };
  }

  const repoOk = await isGitRepo();
  if (!repoOk) {
    return { ok: false, errors: [`This folder is not a git repository yet. ${SETUP_HINT}`] };
  }
  const remoteOk = await hasRemote();
  if (!remoteOk) {
    return { ok: false, errors: [`No git remote is configured. ${SETUP_HINT}`] };
  }

  const safeMessage = sanitizeCommitMessage(message, fallbackMessage);

  const addResult = await runGit(['add', '--', ...resolvedPaths]);
  if (!addResult.ok) {
    return { ok: false, errors: [`git add failed: ${(addResult.stderr || addResult.error || '').trim()}`] };
  }

  const commitResult = await runGit(['commit', '-m', safeMessage]);
  if (!commitResult.ok) {
    const output = `${commitResult.stdout || ''}${commitResult.stderr || ''}`.trim();
    return { ok: false, errors: [`git commit failed: ${output || commitResult.error}`] };
  }

  const pushResult = await runGit(['push']);
  if (!pushResult.ok) {
    const output = `${pushResult.stdout || ''}${pushResult.stderr || ''}`.trim();
    return {
      ok: false,
      errors: [
        `git push failed: ${output || pushResult.error}. The commit was made locally but NOT pushed. ` +
          'Pull/resolve manually from a terminal, then push yourself - this tool will never force-push.',
      ],
    };
  }

  return {
    ok: true,
    commit: (commitResult.stdout || '').trim() || `Committed: ${safeMessage}`,
    pushOutput: (pushResult.stdout || pushResult.stderr || '').trim() || 'Pushed successfully.',
  };
}

module.exports = {
  isGitRepo,
  hasRemote,
  getStatus,
  publish,
  sanitizeCommitMessage,
  resolvePathsWithinContent,
};