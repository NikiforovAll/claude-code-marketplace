'use strict';

// Built-in plugins ship inside the Claude Code binary: no file on disk lists them
// and `claude plugin list --json` leaves them out. A running claude reports them:
// the `reload_plugins` control request of `--input-format stream-json` answers with
// the loaded plugins (built-ins have `path: "builtin"`), commands, agents and MCP
// servers. It answers without a user message, so no model request is made. Its
// commands and agents carry no plugin name, so a built-in's components are found
// by probing again with that one built-in toggled through `--settings` and taking
// what changes. A disabled built-in is not loaded, so it is missing from the
// answer. Undocumented; verified against Claude Code 2.1.304.

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { whichSync, exeBehindShim } = require('./open-editor');
const { readJsonSafe } = require('./components');

const IS_WIN = process.platform === 'win32';
const PROBE_TIMEOUT_MS = 15000;
const BUILTIN_SUFFIX = '@builtin';
const PROBE_ARGS = [
  '-p',
  '--no-session-persistence',
  '--output-format',
  'stream-json',
  '--input-format',
  'stream-json',
  '--verbose',
];
const REQUEST_ID = 'ccm-builtins';
const CACHE_VERSION = 2;

function isBuiltinId(id) {
  return (
    typeof id === 'string' &&
    id.length > BUILTIN_SUFFIX.length &&
    id.endsWith(BUILTIN_SUFFIX) &&
    id.indexOf('@') === id.length - BUILTIN_SUFFIX.length
  );
}

const builtinName = (id) => id.slice(0, -BUILTIN_SUFFIX.length);
const builtinId = (name) => `${name}${BUILTIN_SUFFIX}`;

// null when claude cannot be spawned without a shell (an npm .cmd shim on Windows).
function resolveClaudeBinary() {
  const resolved = whichSync('claude');
  if (!resolved) return null;
  const ext = path.extname(resolved).toLowerCase();
  if (IS_WIN && (ext === '.cmd' || ext === '.bat')) return exeBehindShim(resolved);
  return resolved;
}

const named = (list) => (Array.isArray(list) ? list.filter((x) => typeof x?.name === 'string') : []);
const names = (list) => named(list).map((x) => x.name);
const descriptions = (list) =>
  Object.fromEntries(named(list).flatMap((x) => (typeof x.description === 'string' ? [[x.name, x.description]] : [])));

function parseReload(event) {
  if (event?.type !== 'control_response' || event.response?.request_id !== REQUEST_ID) return null;
  const r = event.response.response;
  if (event.response.subtype !== 'success' || !r || !Array.isArray(r.plugins)) return null;
  return {
    plugins: r.plugins
      .filter((p) => p?.path === 'builtin' && isBuiltinId(p.source))
      .map((p) => builtinName(p.source)),
    skills: names(r.commands),
    agents: names(r.agents),
    mcpServers: names(r.mcpServers),
    descriptions: { skills: descriptions(r.commands), agents: descriptions(r.agents) },
  };
}

// Each built-in is defined in the bundled JS as `{name:N,description:D,...}`, where N
// and D are string literals or minified variables: the name's `var N="cc-plugin-x"`
// can sit in a shared chunk megabytes earlier, the description's within the chunk.
// Undocumented; verified against Claude Code 2.1.304. A miss leaves a built-in
// without a description.
const ID = '[A-Za-z_$][\\w$]*';
const STR = '"((?:[^"\\\\\\n]|\\\\.)*)"';
const PLUGIN_RE = new RegExp(`\\{name:(${ID}|"cc-plugin-[a-z0-9-]+"),description:(?:(${ID})|${STR})[,}]`, 'g');
const NAME_DEF_RE = new RegExp(`[\\s,;{](${ID})="(cc-plugin-[a-z0-9-]+)"`, 'g');
const SCAN_CHUNK = 16 * 1024 * 1024;
const SCAN_LOOKBACK = 256 * 1024;

function jsString(raw) {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  try {
    return JSON.parse(`"${utf8.replace(/\\'/g, "'")}"`);
  } catch {
    return utf8;
  }
}

/**
 * Read the built-in plugins' descriptions out of the claude binary, in chunks.
 * @returns {Promise<Record<string, string>>}
 */
async function scanDescriptions(file) {
  const found = {};
  const nameDefs = new Map();
  let handle;
  try {
    handle = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(SCAN_CHUNK + SCAN_LOOKBACK);
    let carry = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, carry, SCAN_CHUNK, null);
      if (!bytesRead) break;
      const total = carry + bytesRead;
      const text = buf.toString('latin1', 0, total);
      const fresh = (m) => m.index + m[0].length > carry;
      const localDefs = [...text.matchAll(NAME_DEF_RE)].filter(fresh);
      const nameOf = (id, at) => localDefs.findLast((d) => d[1] === id && d.index < at)?.[2] ?? nameDefs.get(id);
      for (const m of text.matchAll(PLUGIN_RE)) {
        if (!fresh(m)) continue;
        const name = m[1].startsWith('"') ? m[1].slice(1, -1) : nameOf(m[1], m.index);
        if (!name?.startsWith('cc-plugin-') || found[name]) continue;
        let raw = m[3];
        if (raw === undefined) {
          const def = new RegExp(`[\\s,;{]${m[2].replace(/\$/g, '\\$')}=${STR}`, 'g');
          for (const d of text.slice(Math.max(0, m.index - SCAN_LOOKBACK), m.index).matchAll(def)) raw = d[1];
        }
        if (raw) found[name] = jsString(raw);
      }
      for (const d of localDefs) nameDefs.set(d[1], d[2]);
      carry = Math.min(SCAN_LOOKBACK, total);
      buf.copy(buf, 0, total - carry, total);
    }
  } catch {
    return {};
  } finally {
    await handle?.close();
  }
  return found;
}

/**
 * Spawn claude, send `reload_plugins`, and resolve with what it loaded, or null on
 * timeout, exit or a missing answer.
 * @param {{file: string, args?: string[], cwd?: string, env?: object, settings?: object, timeoutMs?: number}} opts
 * @returns {Promise<{plugins: string[], skills: string[], agents: string[], mcpServers: string[]}|null>}
 */
function probeClaude({ file, args = [], cwd, env, settings, timeoutMs = PROBE_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const argv = [...args, ...PROBE_ARGS];
    if (settings) argv.push('--settings', JSON.stringify(settings));
    let child;
    try {
      child = spawn(file, argv, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      return resolve(null);
    }
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));
    child.stdin.on('error', () => {});
    child.stdin.write(
      `${JSON.stringify({ type: 'control_request', request_id: REQUEST_ID, request: { subtype: 'reload_plugins' } })}\n`,
    );

    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let event = null;
        try {
          event = JSON.parse(line);
        } catch {}
        const result = parseReload(event);
        if (result) return finish(result);
        nl = buf.indexOf('\n');
      }
    });
  });
}

const minus = (a, b) => a.filter((x) => !b.includes(x));
const pick = (map, keys) => Object.fromEntries(keys.flatMap((k) => (map?.[k] ? [[k, map[k]]] : [])));

/**
 * Keeps the built-in plugins of one config dir and their components. The probes
 * run in the background, one after another, and the result is cached on disk,
 * keyed by the binary's path, size and mtime, so a later start with the same
 * Claude Code runs none.
 * @param {{claudeDir: string, userEnabled: () => object, env?: object, cwd?: string,
 *   command?: {file: string, args?: string[]}|null, cacheDir?: string|null,
 *   onChange?: () => void, log?: (msg: string) => void}} opts
 */
function createBuiltinRegistry({ claudeDir, userEnabled, env, cwd, command, cacheDir, onChange, log = () => {} }) {
  const hash = crypto.createHash('sha1').update(path.resolve(claudeDir)).digest('hex').slice(0, 16);
  const cacheFile = path.join(cacheDir || path.join(os.tmpdir(), 'claude-code-marketplace'), `builtins-${hash}.json`);
  let state = { names: [], components: {}, descriptions: {} };
  let inFlight = null;

  // `binary` is the file the probe runs: the script when a test runs node.
  function target() {
    const t = command || { file: resolveClaudeBinary() };
    return { ...t, binary: t.args?.[0] || t.file };
  }

  function binaryKey(t) {
    try {
      const st = fs.statSync(t.binary);
      return `${CACHE_VERSION}|${t.binary}|${st.size}|${st.mtimeMs}`;
    } catch {
      return null;
    }
  }

  function readCache(key) {
    const data = readJsonSafe(cacheFile);
    if (data?.key !== key || !Array.isArray(data.names) || !data.components) return null;
    return { names: data.names, components: data.components, descriptions: data.descriptions || {} };
  }

  function writeCache(key) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify({ key, ...state }));
    } catch {}
  }

  function set(next) {
    state = next;
    onChange?.();
  }

  async function probeAll(t) {
    const opts = { ...t, cwd, env };
    const [base, descriptions] = await Promise.all([probeClaude(opts), scanDescriptions(t.binary)]);
    if (!base) return null;
    const enabled = userEnabled?.() || {};
    const disabled = Object.keys(enabled)
      .filter((id) => isBuiltinId(id) && enabled[id] === false)
      .map(builtinName);
    const components = {};
    for (const name of [...new Set([...base.plugins, ...disabled])]) {
      const loaded = base.plugins.includes(name);
      const toggled = await probeClaude({ ...opts, settings: { enabledPlugins: { [builtinId(name)]: !loaded } } });
      if (!toggled) continue;
      const [on, off] = loaded ? [base, toggled] : [toggled, base];
      const skills = minus(on.skills, off.skills);
      const agents = minus(on.agents, off.agents);
      components[name] = {
        skills,
        agents,
        mcpServers: minus(on.mcpServers, off.mcpServers),
        _descriptions: { skills: pick(on.descriptions.skills, skills), agents: pick(on.descriptions.agents, agents) },
      };
    }
    return { names: base.plugins, components, descriptions };
  }

  function refresh() {
    if (inFlight) return inFlight;
    const t = target();
    if (!t.file) {
      log('built-in plugins: claude binary not found, skipping probe');
      return Promise.resolve(state);
    }
    inFlight = probeAll(t).then((next) => {
      inFlight = null;
      if (!next) {
        log('built-in plugins: claude gave no reload_plugins answer');
        return state;
      }
      set(next);
      const key = binaryKey(t);
      if (key) writeCache(key);
      return state;
    });
    return inFlight;
  }

  function start() {
    const t = target();
    const key = binaryKey(t);
    const cached = key ? readCache(key) : null;
    if (cached) {
      set(cached);
      return Promise.resolve(state);
    }
    return refresh();
  }

  return {
    names: () => state.names,
    components: (name) => state.components[name] || null,
    description: (name) => state.descriptions[name] || '',
    refresh,
    start,
    cacheFile,
  };
}

module.exports = {
  createBuiltinRegistry,
  probeClaude,
  parseReload,
  scanDescriptions,
  isBuiltinId,
  builtinName,
  builtinId,
};
