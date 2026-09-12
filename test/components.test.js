const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { countComponents, INLINE_PREFIX } = require('../lib/components');
const { realpathDeepest } = require('../lib/contain');

let root;

// realpathDeepest for the same reason security.test.js does it: isContained canonicalises
// both sides, and os.tmpdir() is a symlink on macOS and an 8.3 name on Windows.
before(() => { root = realpathDeepest(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-components-'))); });
after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

function plugin(name, files) {
  const dir = path.join(root, name);
  for (const [rel, data] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data));
  }
  return dir;
}

describe('countComponents — manifest declarations', () => {
  it('lists a component declared inline and previews it as the declared block', () => {
    const dir = plugin('inline-mcp', {
      '.claude-plugin/plugin.json': { mcpServers: { redline: { command: 'node' } } },
    });
    const c = countComponents(dir);
    assert.deepEqual(c.mcpServers, ['redline']);
    assert.equal(c._configFiles.mcpServers, `${INLINE_PREFIX}mcpServers`);
    assert.deepEqual(c._inlineConfig.mcpServers, { redline: { command: 'node' } });
  });

  it('merges an inline declaration with the conventional file rather than replacing it', () => {
    const dir = plugin('merge-mcp', {
      '.claude-plugin/plugin.json': { mcpServers: { fromInline: { command: 'node' } } },
      '.mcp.json': { fromFile: { command: 'node' } },
    });
    assert.deepEqual(countComponents(dir).mcpServers.sort(), ['fromFile', 'fromInline']);
  });

  it('reads a manifest path declared at the top level, not only under experimental', () => {
    const dir = plugin('top-level-path', {
      '.claude-plugin/plugin.json': { hooks: './extra.json' },
      'extra.json': { PostToolUse: [] },
    });
    assert.deepEqual(countComponents(dir).hooks, ['PostToolUse']);
  });

  it('accepts monitors at the manifest top level', () => {
    const dir = plugin('mon-top', {
      '.claude-plugin/plugin.json': { monitors: [{ name: 'watch-a', command: 'x' }] },
    });
    assert.deepEqual(countComponents(dir).monitors, ['watch-a']);
  });

  it('accepts monitors under experimental, the spelling plugins still ship', () => {
    const dir = plugin('mon-exp', {
      '.claude-plugin/plugin.json': { experimental: { monitors: './monitors.json' } },
      'monitors.json': [{ name: 'watch-b', command: 'x' }],
    });
    assert.deepEqual(countComponents(dir).monitors, ['watch-b']);
  });

  it('takes an array of inline maps without falling back to array indices', () => {
    const dir = plugin('array-inline', {
      '.claude-plugin/plugin.json': { mcpServers: [{ one: { command: 'node' } }, { two: { command: 'node' } }] },
    });
    assert.deepEqual(countComponents(dir).mcpServers.sort(), ['one', 'two']);
  });

  it('takes an array mixing inline values and paths, keeping both', () => {
    const dir = plugin('array-mixed', {
      '.claude-plugin/plugin.json': { monitors: [{ name: 'inline-a', command: 'x' }, './more.json'] },
      'more.json': [{ name: 'from-file', command: 'x' }],
    });
    assert.deepEqual(countComponents(dir).monitors.sort(), ['from-file', 'inline-a']);
  });

  it('adds a declared skills directory to the conventional one without duplicating it', () => {
    const dir = plugin('extra-skills', {
      '.claude-plugin/plugin.json': { skills: ['./skills/', './vendor'] },
      'skills/alpha/SKILL.md': '# alpha',
      'vendor/beta/SKILL.md': '# beta',
    });
    assert.deepEqual(countComponents(dir).skills.sort(), ['alpha', 'beta']);
  });

  it('accepts an agent declared as a single .md file alongside the agents directory', () => {
    const dir = plugin('solo-agent', {
      '.claude-plugin/plugin.json': { agents: './solo.md' },
      'solo.md': '# solo',
      'agents/conventional.md': '# conv',
    });
    assert.deepEqual(countComponents(dir).agents.sort(), ['conventional.md', 'solo.md']);
  });

  it('ignores a declared path that escapes the plugin directory', () => {
    const dir = plugin('escape', {
      '.claude-plugin/plugin.json': { mcpServers: '../outside/servers.json' },
      '.mcp.json': { safe: { command: 'node' } },
    });
    plugin('outside', { 'servers.json': { leaked: { command: 'node' } } });
    assert.deepEqual(countComponents(dir).mcpServers, ['safe']);
  });

  it('reads a file named by both the declaration and the default only once', () => {
    const dir = plugin('same-path', {
      '.claude-plugin/plugin.json': { mcpServers: './.mcp.json' },
      '.mcp.json': { only: { command: 'node' } },
    });
    const c = countComponents(dir);
    assert.deepEqual(c.mcpServers, ['only']);
    assert.equal(c._configFiles.mcpServers, '.mcp.json');
  });

  it('the marketplace entry wins over the plugin manifest', () => {
    const dir = plugin('meta-wins', {
      '.claude-plugin/plugin.json': { mcpServers: { fromManifest: { command: 'node' } } },
      'entry.json': { fromEntry: { command: 'node' } },
    });
    assert.deepEqual(countComponents(dir, { mcpServers: './entry.json' }).mcpServers, ['fromEntry']);
  });
});
