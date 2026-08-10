// Argument validators. These run before anything reaches the `claude` CLI. The
// leading-dash rejection matters as much as the character allowlist: without it
// a value like "--dangerously-skip-permissions" becomes a flag rather than an
// operand, which no amount of quoting would prevent.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ID_PART = '[A-Za-z0-9][A-Za-z0-9._-]{0,127}';
const PLUGIN_ID_RE = new RegExp(`^${ID_PART}(@${ID_PART})?$`);
const NAME_RE = new RegExp(`^${ID_PART}$`);
const OWNER_REPO_RE = new RegExp(`^${ID_PART}/${ID_PART}$`);
const SCOPES = new Set(['user', 'project', 'local']);

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function isExistingDir(target) {
  if (typeof target !== 'string' || !target) return false;
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function assertPluginId(value) {
  if (typeof value !== 'string' || !PLUGIN_ID_RE.test(value)) throw badRequest('Invalid pluginId');
  return value;
}

function assertName(value) {
  if (typeof value !== 'string' || !NAME_RE.test(value)) throw badRequest('Invalid name');
  return value;
}

function assertScope(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !SCOPES.has(value)) throw badRequest('Invalid scope');
  return value;
}

// A marketplace source is owner/repo, an http(s)/git URL, or an existing local
// directory — much wider than the other operands, hence the explicit shapes.
function assertSource(value) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest('Invalid source');
  const v = value.trim();
  if (v.startsWith('-')) throw badRequest('Invalid source');
  if (/[\r\n\0"'`$%|&;<>^()]/.test(v)) throw badRequest('Invalid source');
  if (OWNER_REPO_RE.test(v)) return v;
  if (/^https?:\/\//.test(v)) {
    try { new URL(v); return v; } catch { throw badRequest('Invalid source URL'); }
  }
  if (/^git@[A-Za-z0-9.-]+:/.test(v)) return v;
  const resolved = path.resolve(v.startsWith('~') ? v.replace('~', os.homedir()) : v);
  if (isExistingDir(resolved)) return resolved;
  throw badRequest('Invalid source: expected owner/repo, a git URL, or an existing directory');
}

module.exports = { assertPluginId, assertName, assertScope, assertSource, badRequest, isExistingDir };
