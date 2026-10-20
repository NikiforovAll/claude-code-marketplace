const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { probeClaude, parseReload, scanDescriptions, isBuiltinId, createBuiltinRegistry } = require('../lib/builtins');

const FAKE = path.join(__dirname, 'fixtures', 'fake-claude.js');
const fake = (mode) => ({
  file: process.execPath,
  args: [FAKE],
  env: { ...process.env, FAKE_CLAUDE_MODE: mode },
});
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'ccm-builtin-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('isBuiltinId', () => {
  it('accepts <name>@builtin only', () => {
    assert.equal(isBuiltinId('cc-plugin-diff@builtin'), true);
    assert.equal(isBuiltinId('@builtin'), false);
    assert.equal(isBuiltinId('x@y@builtin'), false);
    assert.equal(isBuiltinId('x@market'), false);
    assert.equal(isBuiltinId(null), false);
  });
});

describe('parseReload', () => {
  it('ignores other events and other request ids', () => {
    assert.equal(parseReload({ type: 'system', subtype: 'init' }), null);
    assert.equal(parseReload(null), null);
    assert.equal(parseReload({ type: 'control_response', response: { request_id: 'x', subtype: 'success' } }), null);
  });
});

describe('scanDescriptions', () => {
  it('reads literal and variable descriptions out of the binary', async () => {
    assert.deepEqual(await scanDescriptions(FAKE), {
      'cc-plugin-alpha': 'Alpha: a skill and an agent',
      'cc-plugin-beta': 'Beta: an MCP server — for tests',
    });
  });

  it('finds a name defined in an earlier chunk and a definition split across chunks', async () => {
    const dir = tmp();
    try {
      const file = path.join(dir, 'claude.bin');
      const pad = (n) => Buffer.alloc(n, 'x');
      const head = 'var q9="cc-plugin-far";';
      const desc = 'var D="Far: named in the chunk before";';
      const def = '{name:q9,description:D,isAvailable:F}';
      const split = 16 * 1024 * 1024 - 10 - head.length;
      writeFileSync(file, Buffer.concat([Buffer.from(head), pad(split), Buffer.from(desc + def), pad(1024)]));
      assert.deepEqual(await scanDescriptions(file), { 'cc-plugin-far': 'Far: named in the chunk before' });
      assert.deepEqual(await scanDescriptions(path.join(dir, 'missing')), {});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('probeClaude', () => {
  it('returns the loaded built-ins, commands, agents and MCP servers', async () => {
    const result = await probeClaude({ ...fake('answer'), timeoutMs: 10000 });
    assert.deepEqual(result.plugins, ['cc-plugin-alpha', 'cc-plugin-beta']);
    assert.deepEqual(result.skills, ['help', 'other:skill', 'alpha-skill']);
    assert.deepEqual(result.agents, ['Explore', 'alpha-agent']);
    assert.deepEqual(result.mcpServers, ['plugin:other:mcp', 'beta-mcp']);
  });

  it('passes --settings', async () => {
    const settings = { enabledPlugins: { 'cc-plugin-alpha@builtin': false } };
    const result = await probeClaude({ ...fake('answer'), settings, timeoutMs: 10000 });
    assert.deepEqual(result.plugins, ['cc-plugin-beta']);
  });

  it('returns null when the child exits without an answer', async () => {
    assert.equal(await probeClaude({ ...fake('exit'), timeoutMs: 10000 }), null);
  });

  it('returns null on timeout', async () => {
    assert.equal(await probeClaude({ ...fake('hang'), timeoutMs: 500 }), null);
  });

  it('returns null when the binary cannot be spawned', async () => {
    assert.equal(await probeClaude({ file: path.join(os.tmpdir(), 'no-such-claude.exe'), timeoutMs: 1000 }), null);
  });
});

describe('createBuiltinRegistry', () => {
  it('finds each built-in by toggling it, including a disabled one', async () => {
    const cacheDir = tmp();
    try {
      const { file, args, env } = fake('answer');
      const reg = createBuiltinRegistry({
        claudeDir: cacheDir,
        userEnabled: () => ({ 'cc-plugin-off@builtin': false, 'x@market': false }),
        env,
        command: { file, args },
        cacheDir,
      });
      await reg.start();
      assert.deepEqual(reg.names(), ['cc-plugin-alpha', 'cc-plugin-beta']);
      assert.deepEqual(reg.components('cc-plugin-alpha'), {
        skills: ['alpha-skill'],
        agents: ['alpha-agent'],
        mcpServers: [],
        _descriptions: { skills: { 'alpha-skill': 'Does alpha things' }, agents: { 'alpha-agent': 'Runs alpha' } },
      });
      const { _descriptions, ...beta } = reg.components('cc-plugin-beta');
      assert.deepEqual(beta, { skills: [], agents: [], mcpServers: ['beta-mcp'] });
      assert.deepEqual(reg.components('cc-plugin-off').skills, ['off-skill']);
      assert.equal(reg.components('cc-plugin-none'), null);
      assert.equal(reg.description('cc-plugin-alpha'), 'Alpha: a skill and an agent');
      assert.equal(reg.description('cc-plugin-off'), '');
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('caches the probes on disk and reuses them while the binary is the same', async () => {
    const cacheDir = tmp();
    try {
      const { file, args, env } = fake('answer');
      const first = createBuiltinRegistry({ claudeDir: cacheDir, env, command: { file, args }, cacheDir });
      await first.start();
      assert.ok(existsSync(first.cacheFile));

      const second = createBuiltinRegistry({ claudeDir: cacheDir, env: fake('exit').env, command: { file, args }, cacheDir });
      await second.start();
      assert.deepEqual(second.names(), ['cc-plugin-alpha', 'cc-plugin-beta']);
      assert.deepEqual(second.components('cc-plugin-alpha').skills, ['alpha-skill']);
      assert.equal(second.description('cc-plugin-beta'), 'Beta: an MCP server — for tests');

      const stale = JSON.parse(readFileSync(first.cacheFile, 'utf8'));
      writeFileSync(first.cacheFile, JSON.stringify({ ...stale, key: 'other' }));
      const third = createBuiltinRegistry({ claudeDir: cacheDir, env: fake('exit').env, command: { file, args }, cacheDir });
      await third.start();
      assert.deepEqual(third.names(), []);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

function startServer(dir) {
  const env = { ...process.env, CCM_BUILTIN_PROBE_SCRIPT: FAKE, CCM_BUILTIN_CACHE_DIR: dir, FAKE_CLAUDE_MODE: 'answer' };
  delete env.HUB_SDK_SERVER;
  delete env.CLAUDE_CONFIG_DIR;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--dir', dir, '--port', '0'], {
    cwd: dir,
    env,
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/localhost:(\d+)/);
      if (m) resolve({ child, base: `http://localhost:${m[1]}` });
    });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
  });
}

describe('built-in marketplace', () => {
  let dir, server, group;

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ccm-builtin-srv-'));
    mkdirSync(path.join(dir, 'plugins'), { recursive: true });
    writeFileSync(path.join(dir, 'plugins', 'known_marketplaces.json'), '{}');
    writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'cc-plugin-beta@builtin': true, 'cc-plugin-off@builtin': false } }),
    );
    server = await startServer(dir);
    for (let i = 0; i < 100 && !group?.plugins.find((p) => p.name === 'cc-plugin-off')?.components.skills; i++) {
      await wait(100);
      group = (await (await fetch(`${server.base}/api/marketplaces`)).json()).find((m) => m.isBuiltin);
    }
  });

  after(async () => {
    if (server && server.child.exitCode === null) {
      const exited = new Promise((resolve) => server.child.once('exit', resolve));
      server.child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists probed built-ins and disabled ones from enabledPlugins', () => {
    assert.equal(group.source.type, 'builtin');
    assert.ok(group.isManaged);
    assert.deepEqual(
      group.plugins.map((p) => [p.fullId, p.isEnabled]),
      [
        ['cc-plugin-alpha@builtin', true],
        ['cc-plugin-beta@builtin', true],
        ['cc-plugin-off@builtin', false],
      ],
    );
  });

  it('answers the components found for each built-in', async () => {
    const res = await fetch(`${server.base}/api/plugins/cc-plugin-alpha%40builtin/components`);
    assert.equal(res.status, 200);
    const comps = await res.json();
    assert.equal(comps._pluginDir, undefined);
    assert.deepEqual(comps.skills, ['alpha-skill']);
    assert.deepEqual(comps.agents, ['alpha-agent']);
    assert.deepEqual(comps._descriptions.skills, { 'alpha-skill': 'Does alpha things' });
    const off = group.plugins.find((p) => p.name === 'cc-plugin-off');
    assert.deepEqual(off.components.skills, ['off-skill']);
    assert.equal(group.plugins.find((p) => p.name === 'cc-plugin-alpha').description, 'Alpha: a skill and an agent');
  });

  it('refuses verbs other than enable and disable, and unknown built-ins', async () => {
    const post = (verb, pluginId) =>
      fetch(`${server.base}/api/plugins/${verb}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId }),
      });
    for (const verb of ['install', 'uninstall', 'update']) {
      const res = await post(verb, 'cc-plugin-alpha@builtin');
      assert.equal(res.status, 400, verb);
    }
    const res = await post('disable', 'cc-plugin-nope@builtin');
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Unknown built-in/);
  });
});
