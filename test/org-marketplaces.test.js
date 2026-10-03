const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { realpathDeepest } = require('../lib/contain');

function write(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
}

function makeConfigDir({ known = true } = {}) {
  const dir = realpathDeepest(mkdtempSync(path.join(os.tmpdir(), 'ccm-org-')));
  const bucket = path.join(dir, 'plugins', 'synced', 'org_user');
  write(path.join(bucket, 'manifest.json'), {
    plugins: [
      { name: 'team', description: 'Team context', version: '0005', marketplaceName: 'acme/cockpit' },
      { name: 'harness', description: 'Harness', version: '0001', marketplaceName: 'acme/dev-tools' },
      { name: '../escape', marketplaceName: 'acme/cockpit' },
    ],
  });
  write(path.join(bucket, 'team', '.claude-plugin', 'plugin.json'), { name: 'team', version: '0.7.0' });
  write(path.join(bucket, 'team', 'skills', 'team-context', 'SKILL.md'), '---\nname: team-context\n---\n');
  write(path.join(bucket, 'harness', '.claude-plugin', 'plugin.json'), { name: 'harness' });
  mkdirSync(path.join(dir, 'plugins', 'synced', '.staging'), { recursive: true });
  write(path.join(dir, 'settings.json'), { enabledPlugins: { 'harness@synced': false } });
  write(path.join(dir, 'plugins', 'installed_plugins.json'), {
    plugins: { 'harness@other': [{ scope: 'user', installPath: '', version: '1.0.0' }] },
  });
  if (known) write(path.join(dir, 'plugins', 'known_marketplaces.json'), {});
  return dir;
}

function startServer(dir) {
  const env = { ...process.env };
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

async function stopServer(server, dir) {
  if (server && server.child.exitCode === null) {
    const exited = new Promise((resolve) => server.child.once('exit', resolve));
    server.child.kill();
    await exited;
  }
  rmSync(dir, { recursive: true, force: true });
}

describe('org marketplaces synced from claude.ai', () => {
  let dir, server, marketplaces;

  before(async () => {
    dir = makeConfigDir();
    server = await startServer(dir);
    marketplaces = await (await fetch(`${server.base}/api/marketplaces`)).json();
  });

  after(() => stopServer(server, dir));

  it('lists each org marketplace with its plugins as <name>@synced', () => {
    const cockpit = marketplaces.find((m) => m.name === 'acme/cockpit');
    assert.ok(cockpit?.isManaged);
    assert.equal(cockpit.source.type, 'org');
    assert.deepEqual(cockpit.plugins.map((p) => p.fullId), ['team@synced']);
    const team = cockpit.plugins[0];
    assert.equal(team.version, '0.7.0');
    assert.equal(team.isEnabled, true);
    assert.deepEqual(team.components.skills, ['team-context']);
  });

  it('reads enabled state from user enabledPlugins and notes a shadowing plugin', () => {
    const harness = marketplaces.find((m) => m.name === 'acme/dev-tools')?.plugins[0];
    assert.equal(harness.fullId, 'harness@synced');
    assert.equal(harness.isEnabled, false);
    assert.equal(harness.version, '0001');
    assert.equal(harness.shadowedBy, 'harness@other');
  });

  it('skips a manifest entry whose name leaves the bucket', () => {
    const ids = marketplaces.flatMap((m) => m.plugins.map((p) => p.fullId));
    assert.ok(!ids.some((id) => id.includes('escape')));
  });

  it('previews files of a synced plugin', async () => {
    const res = await fetch(`${server.base}/api/plugins/team%40synced/preview/skills/team-context/SKILL.md`);
    assert.equal(res.status, 200);
    assert.match((await res.json()).content, /team-context/);
  });
});

describe('org marketplaces without known_marketplaces.json', () => {
  it('still lists the org marketplaces', async () => {
    const dir = makeConfigDir({ known: false });
    const server = await startServer(dir);
    try {
      const marketplaces = await (await fetch(`${server.base}/api/marketplaces`)).json();
      assert.deepEqual(marketplaces.map((m) => m.name).sort(), ['acme/cockpit', 'acme/dev-tools']);
    } finally {
      await stopServer(server, dir);
    }
  });
});
