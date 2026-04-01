#!/usr/bin/env node
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const app = express();
app.use(express.json());

app.get('/hub-config', (_req, res) => {
  res.json({ enabled: !!process.env.CLAUDE_HUB, url: process.env.HUB_URL || null });
});

app.use(express.static(path.join(__dirname, 'public')));

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');

let _marketplaceCache = null;
function getCachedMarketplaces() {
  if (!_marketplaceCache) _marketplaceCache = loadMarketplaces();
  return _marketplaceCache;
}
function invalidateCache() { _marketplaceCache = null; }

function getArg(name) {
  const idx = process.argv.findIndex(a => a.startsWith(`--${name}`));
  if (idx === -1) return null;
  const arg = process.argv[idx];
  if (arg.includes('=')) return arg.split('=').slice(1).join('=');
  return process.argv[idx + 1] || null;
}

let projectPath = getArg('project') || process.cwd();
if (projectPath.startsWith('~')) projectPath = projectPath.replace('~', os.homedir());
const PORT = parseInt(getArg('port') || process.env.PORT || '3457', 10);

function toUnixPath(p) {
  return p ? p.replace(/\\/g, '/') : p;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function findReadmeFile(dirPath) {
  try {
    return fs.readdirSync(dirPath).find(f => f.toLowerCase() === 'readme.md') || null;
  } catch { return null; }
}

function readJsonKey(filePath, key) {
  const data = readJsonSafe(filePath);
  return data ? (data[key] || {}) : {};
}

// --- Data loading (ported from lazyclaude) ---

function loadRegistry() {
  const v2File = path.join(PLUGINS_DIR, 'installed_plugins.json');
  const v2Data = readJsonSafe(v2File);
  const installed = {};
  if (v2Data && v2Data.plugins) {
    for (const [pluginId, installations] of Object.entries(v2Data.plugins)) {
      installed[pluginId] = installations.map(inst => ({
        scope: inst.scope || 'user',
        installPath: inst.installPath || '',
        version: inst.version || 'unknown',
        isLocal: inst.isLocal || false,
        projectPath: inst.projectPath || null,
      }));
    }
  }

  const userEnabled = readJsonKey(path.join(CLAUDE_DIR, 'settings.json'), 'enabledPlugins');

  const projectConfigPath = projectPath ? path.join(projectPath, '.claude') : null;
  const projectEnabled = projectConfigPath
    ? readJsonKey(path.join(projectConfigPath, 'settings.json'), 'enabledPlugins')
    : {};
  const localEnabled = projectConfigPath
    ? readJsonKey(path.join(projectConfigPath, 'settings.local.json'), 'enabledPlugins')
    : {};

  return { installed, userEnabled, projectEnabled, localEnabled };
}

function buildScopeData(registry) {
  const installedScopes = {};
  const scopeInstallPaths = {};
  const scopeVersions = {};
  const userInstalledIds = new Set();
  const projectInstalledIds = new Set();

  const resolvedRoot = projectPath ? path.resolve(projectPath) : null;

  for (const [pid, installations] of Object.entries(registry.installed)) {
    const scopes = [];
    if (!scopeInstallPaths[pid]) {
      scopeInstallPaths[pid] = {};
      scopeVersions[pid] = {};
    }
    for (const inst of installations) {
      const scope = inst.scope;
      if (scope === 'user') {
        userInstalledIds.add(pid);
        scopes.push('user');
      } else if (scope === 'project' || scope === 'local') {
        if (resolvedRoot && inst.projectPath) {
          try {
            if (path.resolve(inst.projectPath) === resolvedRoot) {
              projectInstalledIds.add(pid);
              scopes.push(scope);
            }
          } catch {}
        } else {
          scopes.push(scope);
        }
      }
      if (inst.installPath) {
        scopeInstallPaths[pid][scope] = inst.installPath;
        scopeVersions[pid][scope] = inst.version;
      }
    }
    if (scopes.length) {
      installedScopes[pid] = [...new Set(scopes)];
    }
  }

  const enabledIds = new Set();
  const allEnabled = { ...registry.userEnabled, ...registry.projectEnabled, ...registry.localEnabled };
  const allInstalled = new Set(Object.keys(registry.installed));
  for (const pid of allInstalled) {
    if (allEnabled[pid] === false) continue;
    enabledIds.add(pid);
  }
  for (const [pid, enabled] of Object.entries(allEnabled)) {
    if (enabled) enabledIds.add(pid);
  }

  return { installedScopes, scopeInstallPaths, scopeVersions, userInstalledIds, projectInstalledIds, enabledIds };
}

function loadMarketplaces() {
  const knownFile = path.join(PLUGINS_DIR, 'known_marketplaces.json');
  const known = readJsonSafe(knownFile);
  if (!known) return [];

  const registry = loadRegistry();
  const scope = buildScopeData(registry);

  const marketplaces = [];
  for (const [name, entryData] of Object.entries(known)) {
    const sourceData = entryData.source || {};
    const installLocation = entryData.installLocation;
    if (!installLocation) continue;

    const marketplace = {
      name,
      source: {
        type: sourceData.source || 'unknown',
        repo: sourceData.repo || null,
        path: sourceData.path || null,
        url: sourceData.url || null,
      },
      installLocation: toUnixPath(installLocation),
      lastUpdated: entryData.lastUpdated || null,
      version: null,
      plugins: [],
      error: null,
    };

    const marketplaceJson = path.join(installLocation, '.claude-plugin', 'marketplace.json');
    const mData = readJsonSafe(marketplaceJson);
    if (!mData) {
      marketplace.error = `marketplace.json not found at ${marketplaceJson}`;
      marketplaces.push(marketplace);
      continue;
    }
    marketplace.version = mData.version || null;
    marketplace.owner = mData.owner || null;
    marketplace.description = mData.description || null;
    const mktReadme = findReadmeFile(installLocation);
    if (mktReadme) marketplace.readmeFile = mktReadme;

    for (const pd of (mData.plugins || [])) {
      if (!pd.name) continue;
      const fullId = `${pd.name}@${name}`;
      const installedScopes = scope.installedScopes[fullId] || [];
      const isInstalled = installedScopes.length > 0;
      const isEnabled = scope.enabledIds.has(fullId);

      const paths = scope.scopeInstallPaths[fullId] || {};
      const versions = scope.scopeVersions[fullId] || {};

      const scopeDetails = {};
      for (const s of ['user', 'project', 'local']) {
        if (installedScopes.includes(s)) {
          const enabledMap = s === 'user' ? registry.userEnabled
            : s === 'project' ? registry.projectEnabled
            : registry.localEnabled;
          const explicitlyDisabled = enabledMap[fullId] === false;
          scopeDetails[s] = {
            installed: true,
            enabled: !explicitlyDisabled,
            version: versions[s] || null,
            installPath: paths[s] || null,
          };
        } else {
          scopeDetails[s] = { installed: false, enabled: false, version: null, installPath: null };
        }
      }

      let source = pd.source || '';
      if (typeof source === 'object') source = source.url || JSON.stringify(source);

      const compKeys = ['skills', 'commands', 'agents', 'mcpServers', 'hooks', 'lspServers'];

      // Resolve origin dir from marketplace source
      let originDir = null;
      if (installLocation) {
        const rawSource = pd.source;
        if (typeof rawSource === 'string' && rawSource) {
          const srcDir = path.resolve(installLocation, rawSource);
          if (fs.existsSync(srcDir)) originDir = srcDir;
        }
        if (!originDir && typeof rawSource === 'object' && rawSource?.path) {
          const srcDir = path.resolve(installLocation, rawSource.path);
          if (fs.existsSync(srcDir)) originDir = srcDir;
        }
        if (!originDir) {
          const pluginSubdir = path.join(installLocation, 'plugins', pd.name);
          if (fs.existsSync(pluginSubdir)) originDir = pluginSubdir;
          else if ((mData.plugins || []).length === 1) originDir = installLocation;
        }
        if (!originDir) {
          const cacheDir = path.join(PLUGINS_DIR, 'cache', name, pd.name);
          if (fs.existsSync(cacheDir)) {
            const latest = findLatestVersionDir(cacheDir);
            if (latest) originDir = latest;
          }
        }
      }

      // Resolve plugin dir for filesystem-based component counts
      let pluginDir = null;
      for (const s of ['user', 'project', 'local']) {
        const ip = scopeDetails[s]?.installPath;
        const resolved = resolveInstallPath(ip);
        if (resolved) { pluginDir = resolved; break; }
      }
      if (!pluginDir) pluginDir = originDir;

      const fsComps = pluginDir ? countComponents(pluginDir) : null;
      const components = {};
      for (const k of compKeys) {
        if (fsComps && Array.isArray(fsComps[k]) && fsComps[k].length > 0) {
          components[k] = fsComps[k];
        } else if (Array.isArray(pd[k]) && pd[k].length > 0) {
          components[k] = pd[k].map(p => typeof p === 'string' ? path.basename(p) : (p.name || String(p)));
        } else if (pd[k]) {
          components[k] = Array.isArray(pd[k]) ? [] : [String(pd[k])];
        }
      }

      const installedVersion = [scopeDetails.user, scopeDetails.project, scopeDetails.local]
        .find(d => d?.version && d.version !== 'unknown')?.version || null;

      let availableVersion = pd.version || null;
      if (!availableVersion) {
        // Use originDir (source copy) for available version, not pluginDir (installed/cached copy)
        const versionDir = originDir || pluginDir;
        if (versionDir) {
          const pluginJson = path.join(versionDir, '.claude-plugin', 'plugin.json');
          const pjData = readJsonSafe(pluginJson);
          if (pjData?.version) availableVersion = pjData.version;
        }
      }
      const hasUpdate = isInstalled && semverNewer(availableVersion, installedVersion);

      marketplace.plugins.push({
        name: pd.name,
        fullId,
        description: pd.description || '',
        source,
        version: installedVersion || availableVersion,
        availableVersion,
        hasUpdate,
        isInstalled,
        isEnabled: isInstalled ? isEnabled : true,
        scopeDetails,
        installedScopes,
        components,
        _pluginDir: toUnixPath(pluginDir),
        _originDir: toUnixPath(originDir),
        _fsComps: fsComps,
        metadata: Object.fromEntries(
          Object.entries(pd).filter(([k]) => !['name', 'description', 'source', 'version', ...compKeys].includes(k))
        ),
      });
    }

    marketplaces.push(marketplace);
  }

  // Virtual marketplaces for user/project customizations
  const userCustom = scanCustomizations(CLAUDE_DIR, 'user');
  if (userCustom) marketplaces.unshift(userCustom);

  if (projectPath) {
    const projectClaudeDir = path.join(projectPath, '.claude');
    if (fs.existsSync(projectClaudeDir)) {
      const projectCustom = scanCustomizations(projectClaudeDir, 'project');
      if (projectCustom) {
        const insertIdx = userCustom ? 1 : 0;
        marketplaces.splice(insertIdx, 0, projectCustom);
      }
    }
  }

  return marketplaces;
}

function countComponents(pluginDir, meta = {}) {
  const result = { skills: [], commands: [], agents: [], mcpServers: [], hooks: [], lspServers: [] };
  if (!pluginDir || !fs.existsSync(pluginDir)) return result;

  // Skills: check custom paths from metadata, then default
  const skillPaths = meta.skills
    ? (Array.isArray(meta.skills) ? meta.skills : [meta.skills])
    : ['skills'];
  for (const sp of skillPaths) {
    const skillsDir = path.resolve(pluginDir, sp);
    if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
      try {
        // If the path points to a skill dir (has SKILL.md), it's a single skill
        if (fs.existsSync(path.join(skillsDir, 'SKILL.md'))) {
          result.skills.push(path.basename(skillsDir));
        } else {
          const dirs = fs.readdirSync(skillsDir).filter(d =>
            fs.statSync(path.join(skillsDir, d)).isDirectory()
          );
          result.skills.push(...dirs);
        }
      } catch {}
    }
  }

  // Commands: check custom path then default
  const cmdPath = meta.commands || 'commands';
  const cmdsDir = path.resolve(pluginDir, cmdPath);
  if (fs.existsSync(cmdsDir) && fs.statSync(cmdsDir).isDirectory()) {
    try { result.commands = findFiles(cmdsDir, '.md'); } catch {}
  }

  // Agents: check custom path then default
  const agentPath = meta.agents || 'agents';
  const agentsDir = path.resolve(pluginDir, agentPath);
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    try {
      result.agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    } catch {}
  }

  const configFiles = {};

  // MCPs
  const mcpPath = meta.mcpServers || '.mcp.json';
  const mcpFile = path.resolve(pluginDir, mcpPath);
  if (fs.existsSync(mcpFile) && fs.statSync(mcpFile).isFile()) {
    const data = readJsonSafe(mcpFile);
    if (data) {
      result.mcpServers = Object.keys(data.mcpServers || data);
      if (result.mcpServers.length) configFiles.mcpServers = mcpPath;
    }
  }

  // Hooks
  const hooksPath = meta.hooks || path.join('hooks', 'hooks.json');
  const hooksFile = path.resolve(pluginDir, hooksPath);
  if (fs.existsSync(hooksFile) && fs.statSync(hooksFile).isFile()) {
    const data = readJsonSafe(hooksFile);
    if (data) {
      const hooksObj = data.hooks || data;
      result.hooks = Object.keys(hooksObj).filter(k => k !== 'description');
      if (result.hooks.length) configFiles.hooks = hooksPath;
    }
  }

  // LSP
  const lspPath = meta.lspServers || '.lsp.json';
  const lspFile = path.resolve(pluginDir, lspPath);
  if (fs.existsSync(lspFile) && fs.statSync(lspFile).isFile()) {
    const data = readJsonSafe(lspFile);
    if (data) {
      result.lspServers = Object.keys(data.lspServers || data);
      if (result.lspServers.length) configFiles.lspServers = lspPath;
    }
  }

  const readmeFile = findReadmeFile(pluginDir);
  if (readmeFile) result._readmePath = readmeFile;

  result._configFiles = configFiles;
  return result;
}

function findFiles(dir, ext) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFiles(full, ext));
      } else if (entry.name.endsWith(ext)) {
        results.push(entry.name);
      }
    }
  } catch {}
  return results;
}

const VIRTUAL_PREFIX = '_custom/';
const SCOPE_LABELS = { user: 'User Customizations', project: 'Project Customizations' };
const EMPTY_SCOPE = { installed: false, enabled: false, version: null, installPath: null };

function scanCustomizations(basePath, scope) {
  const components = countComponents(basePath);

  // Strip .md extensions from command/agent names for cleaner display
  components.commands = components.commands.map(n => n.replace(/\.md$/, ''));
  components.agents = components.agents.map(n => n.replace(/\.md$/, ''));

  // Fallback: read hooks from settings.json if hooks.json didn't have any
  if (!components.hooks.length) {
    const settings = readJsonSafe(path.join(basePath, 'settings.json'));
    if (settings?.hooks) {
      components.hooks = Object.keys(settings.hooks);
      if (components.hooks.length) {
        if (!components._configFiles) components._configFiles = {};
        components._configFiles.hooks = 'settings.json';
      }
    }
  }

  // Add settings files as browsable entries
  const settingsFiles = [];
  if (fs.existsSync(path.join(basePath, 'settings.json'))) settingsFiles.push('settings.json');
  if (fs.existsSync(path.join(basePath, 'settings.local.json'))) settingsFiles.push('settings.local.json');
  if (settingsFiles.length) components.settings = settingsFiles;

  const hasAny = Object.values(components).some(v => Array.isArray(v) && v.length > 0);
  if (!hasAny) return null;

  const label = SCOPE_LABELS[scope];
  const activeScope = { installed: true, enabled: true, version: null, installPath: null };
  const scopeDetails = {
    user: scope === 'user' ? activeScope : EMPTY_SCOPE,
    project: scope === 'project' ? activeScope : EMPTY_SCOPE,
    local: EMPTY_SCOPE,
  };

  return {
    name: label,
    source: { type: 'directory', repo: null, path: basePath, url: null },
    installLocation: basePath,
    lastUpdated: null,
    isVirtual: true,
    error: null,
    plugins: [{
      name: label,
      fullId: `${VIRTUAL_PREFIX}${scope}`,
      description: `Custom skills, commands, agents, hooks, and servers from ${scope === 'user' ? '~/.claude/' : '.claude/'}`,
      source: '',
      version: null,
      isInstalled: true,
      isEnabled: true,
      isVirtual: true,
      scopeDetails,
      installedScopes: [scope],
      components,
      _pluginDir: toUnixPath(basePath),
      _fsComps: components,
      metadata: {},
    }],
  };
}

function parseVer(v) {
  const parts = String(v).split('.').map(Number);
  return parts.some(isNaN) ? null : parts;
}

function semverCompare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function semverNewer(available, installed) {
  if (!available || !installed) return false;
  const a = parseVer(available), b = parseVer(installed);
  if (!a || !b) return false;
  return semverCompare(a, b) > 0;
}

function findLatestVersionDir(parentDir) {
  try {
    const subdirs = fs.readdirSync(parentDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    if (!subdirs.length) return null;
    subdirs.sort((a, b) => {
      const pa = parseVer(a), pb = parseVer(b);
      if (!pa || !pb) return 0;
      return semverCompare(pb, pa);
    });
    return path.join(parentDir, subdirs[0]);
  } catch { return null; }
}

function resolveInstallPath(ip) {
  if (!ip) return null;
  if (fs.existsSync(ip)) {
    try {
      if (fs.statSync(ip).isDirectory()) return ip;
    } catch {}
  }
  // Try parent with version subdirectories (lazyclaude pattern)
  const parent = path.dirname(ip);
  if (fs.existsSync(parent)) {
    const latest = findLatestVersionDir(parent);
    if (latest) return latest;
  }
  return null;
}

function findPlugin(fullId, marketplaces) {
  for (const m of marketplaces) {
    const p = m.plugins?.find(p => p.fullId === fullId);
    if (p) return p;
  }
  return null;
}

function resolvePluginDir(fullId, marketplaces) {
  return findPlugin(fullId, marketplaces)?._pluginDir || null;
}

// --- API Routes ---

app.get('/api/marketplaces', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json(getCachedMarketplaces());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/marketplaces/:name/readme', (req, res) => {
  const mktData = getCachedMarketplaces();
  const m = mktData.find(m => m.name === req.params.name);
  if (!m?.readmeFile) return res.status(404).json({ error: 'No README found' });
  try {
    const content = fs.readFileSync(path.join(m.installLocation, m.readmeFile), 'utf-8');
    res.json({ type: 'file', content, name: m.readmeFile });
  } catch {
    res.status(404).json({ error: 'Failed to read README' });
  }
});

app.get('/api/plugins/:pluginId/components', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pluginId = decodeURIComponent(req.params.pluginId);
  const mktData = getCachedMarketplaces();
  const plugin = findPlugin(pluginId, mktData);

  if (plugin?.isVirtual) {
    return res.json({ ...plugin.components, _pluginDir: plugin._pluginDir });
  }
  if (!plugin?._pluginDir) return res.status(404).json({ error: 'Plugin directory not found', pluginId });

  const comps = plugin._fsComps || countComponents(plugin._pluginDir, plugin.metadata);
  comps._pluginDir = plugin._pluginDir;
  res.json(comps);
});

app.get('/api/plugins/:pluginId/preview/*', (req, res) => {
  const pluginId = decodeURIComponent(req.params.pluginId);
  const relPath = req.params[0];
  const marketplaces = getCachedMarketplaces();
  const pluginDir = resolvePluginDir(pluginId, marketplaces);
  if (!pluginDir) return res.status(404).json({ error: 'Plugin not found' });

  let fullPath = path.resolve(pluginDir, relPath);
  if (!fullPath.startsWith(path.resolve(pluginDir))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!fs.existsSync(fullPath) && fs.existsSync(fullPath + '.md')) fullPath += '.md';

  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true }).map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
      }));
      res.json({ type: 'directory', entries });
    } else {
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.json({ type: 'file', content, name: path.basename(fullPath) });
    }
  } catch {
    res.status(404).json({ error: 'Path not found' });
  }
});

function openVSCode(args, res) {
  execFile('code', args, { shell: true }, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to open editor' });
    res.json({ ok: true });
  });
}

app.post('/api/open-in-editor', (req, res) => {
  const { pluginId, relativePath } = req.body;
  if (!pluginId) return res.status(400).json({ error: 'pluginId required' });

  const marketplaces = getCachedMarketplaces();
  const pluginDir = resolvePluginDir(pluginId, marketplaces);
  if (!pluginDir) return res.status(404).json({ error: 'Plugin not found' });

  const args = ['-n', pluginDir];

  const pluginJson = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(pluginJson)) args.push(pluginJson);

  if (relativePath) {
    const fullPath = path.resolve(pluginDir, relativePath);
    if (fullPath.startsWith(path.resolve(pluginDir))) {
      args.push(fullPath);
    }
  }

  openVSCode(args, res);
});

app.post('/api/open-folder-in-editor', (req, res) => {
  const { pluginId, marketplaceName } = req.body;
  const marketplaces = getCachedMarketplaces();
  let folder;

  if (pluginId) {
    const plugin = findPlugin(pluginId, marketplaces);
    folder = plugin?._originDir || plugin?._pluginDir || null;
  } else if (marketplaceName) {
    const m = marketplaces.find(m => m.name === marketplaceName);
    folder = m?.installLocation || null;
  }

  if (!folder) return res.status(404).json({ error: 'Directory not found' });

  openVSCode(['-n', folder], res);
});

app.get('/api/project', (req, res) => {
  res.json({ path: projectPath });
});

app.put('/api/project', (req, res) => {
  const newPath = req.body.path;
  if (!newPath) return res.status(400).json({ error: 'path required' });
  const expanded = newPath.startsWith('~') ? newPath.replace('~', os.homedir()) : newPath;
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) return res.status(400).json({ error: 'Directory does not exist' });
  projectPath = resolved;
  invalidateCache();
  res.json({ path: projectPath });
});

app.post('/api/refresh', (req, res) => {
  invalidateCache();
  res.json({ ok: true });
});

function runClaudePlugin(args) {
  return new Promise((resolve, reject) => {
    execFile('claude', ['plugin', ...args], { timeout: 30000, shell: true, cwd: projectPath || undefined }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

function rejectVirtual(pluginId, res) {
  if (pluginId?.startsWith(VIRTUAL_PREFIX)) {
    res.status(400).json({ error: 'Cannot modify virtual customization entries' });
    return true;
  }
  return false;
}

app.post('/api/plugins/install', async (req, res) => {
  const { pluginId, scope } = req.body;
  if (!pluginId) return res.status(400).json({ error: 'pluginId required' });
  if (rejectVirtual(pluginId, res)) return;
  try {
    const args = ['install', pluginId];
    if (scope) args.push('--scope', scope);
    const output = await runClaudePlugin(args);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/uninstall', async (req, res) => {
  const { pluginId, scope } = req.body;
  if (!pluginId) return res.status(400).json({ error: 'pluginId required' });
  if (rejectVirtual(pluginId, res)) return;
  try {
    const args = ['uninstall', pluginId];
    if (scope) args.push('--scope', scope);
    const output = await runClaudePlugin(args);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/enable', async (req, res) => {
  const { pluginId, scope } = req.body;
  if (!pluginId) return res.status(400).json({ error: 'pluginId required' });
  if (rejectVirtual(pluginId, res)) return;
  try {
    const args = ['enable', pluginId];
    if (scope) args.push('--scope', scope);
    const output = await runClaudePlugin(args);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/disable', async (req, res) => {
  const { pluginId, scope } = req.body;
  if (!pluginId) return res.status(400).json({ error: 'pluginId required' });
  if (rejectVirtual(pluginId, res)) return;
  try {
    const args = ['disable', pluginId];
    if (scope) args.push('--scope', scope);
    const output = await runClaudePlugin(args);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/update', async (req, res) => {
  const { pluginId, scope } = req.body;
  if (!pluginId) return res.status(400).json({ error: 'pluginId required' });
  try {
    const args = ['update', pluginId];
    if (scope) args.push('--scope', scope);
    const output = await runClaudePlugin(args);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marketplace/add', async (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: 'source required' });
  try {
    const output = await runClaudePlugin(['marketplace', 'add', source]);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marketplace/remove', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const output = await runClaudePlugin(['marketplace', 'remove', name]);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marketplace/update', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const output = await runClaudePlugin(['marketplace', 'update', name]);
    invalidateCache();
    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start ---

const server = app.listen(PORT, () => {
  const actual = server.address().port;
  console.log(`Claude Code Marketplace running at http://localhost:${actual}`);
  if (process.argv.includes('--open')) {
    import('open').then(m => m.default(`http://localhost:${actual}`));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, trying random port...`);
    const fallback = app.listen(0, () => {
      const actual = fallback.address().port;
      console.log(`Claude Code Marketplace running at http://localhost:${actual}`);
      if (process.argv.includes('--open')) {
        import('open').then(m => m.default(`http://localhost:${actual}`));
      }
    });
  } else {
    throw err;
  }
});
