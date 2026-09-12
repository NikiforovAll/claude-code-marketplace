const fs = require('node:fs');
const path = require('node:path');
const { isContained } = require('./contain');

// A component whose config is declared inline gets this in place of a file path; the preview
// route renders the declared block itself rather than opening a file.
const INLINE_PREFIX = '__inline__/';

const MANIFEST_REL = path.join('.claude-plugin', 'plugin.json');

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

function findFiles(dir, ext) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findFiles(full, ext));
      else if (entry.name.endsWith(ext)) results.push(entry.name);
    }
  } catch {}
  return results;
}

// A directory is a skill if it carries a SKILL.md; a path pointing straight at one is a
// single skill rather than a directory of them.
function skillDirsIn(dir) {
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return [path.basename(dir)];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map(e => e.name);
}

const mdFile = f => (f.endsWith('.md') ? [path.basename(f)] : []);

// Components that live in a directory. `scan` lists a directory; `file` handles a
// declaration that names a single file instead.
const DIR_COMPONENTS = [
  { key: 'skills', def: 'skills', scan: skillDirsIn, file: () => [] },
  { key: 'commands', def: 'commands', scan: d => findFiles(d, '.md'), file: mdFile },
  { key: 'agents', def: 'agents', scan: d => fs.readdirSync(d).filter(f => f.endsWith('.md')), file: mdFile },
];

// Components that live in a JSON file or inline in the manifest. `items` unwraps a parsed
// file into the same object list an inline declaration yields, so `names` handles both.
const JSON_COMPONENTS = [
  {
    key: 'mcpServers',
    def: '.mcp.json',
    items: d => [d.mcpServers || d],
    names: objs => objs.flatMap(o => Object.keys(o)),
  },
  {
    key: 'hooks',
    def: path.join('hooks', 'hooks.json'),
    items: d => [d.hooks || d],
    names: objs => objs.flatMap(o => Object.keys(o)).filter(k => k !== 'description'),
  },
  {
    key: 'lspServers',
    def: '.lsp.json',
    items: d => [d.lspServers || d],
    names: objs => objs.flatMap(o => Object.keys(o)),
  },
  {
    key: 'monitors',
    def: path.join('monitors', 'monitors.json'),
    items: d => (Array.isArray(d) ? d : []),
    names: objs => objs.map(m => m?.name).filter(Boolean),
  },
];

const COMPONENT_KEYS = [...DIR_COMPONENTS, ...JSON_COMPONENTS].map(c => c.key);

// A declaration is one value, a list, or absent. Strings are paths to read; objects are the
// component itself. Flattening a list one level lets an array of inline objects and an array
// mixing objects with paths fall out of the same rule.
function splitDeclaration(declared) {
  const paths = [];
  const inline = [];
  for (const entry of (Array.isArray(declared) ? declared : [declared])) {
    if (typeof entry === 'string' && entry) paths.push(entry);
    else if (entry && typeof entry === 'object') inline.push(entry);
  }
  return { paths, inline };
}

const normRel = p => path.normalize(p).replace(/[\\/]+$/, '');

// A manifest declaration is additive to the conventional path, so both are scanned. The
// declared ones carry `trusted: false` -- they come from the plugin's manifest or from the
// marketplace entry, so they need a containment check the hardcoded defaults do not.
function candidates(paths, def) {
  const out = new Map();
  for (const p of paths) out.set(normRel(p), false);
  if (!out.has(normRel(def))) out.set(normRel(def), true);
  return out;
}

function resolveIn(pluginDir, rel, trusted) {
  const full = path.resolve(pluginDir, rel);
  if (!trusted && !isContained(full, pluginDir)) return null;
  return full;
}

/**
 * List the components a plugin ships, following the plugin manifest schema: a component key
 * takes an inline value, a "./x.json" path, or an array mixing both, and whatever it names is
 * additive to the conventional file or directory.
 * https://www.schemastore.org/claude-code-plugin-manifest.json
 *
 * `meta` is the marketplace entry's own declaration, which wins over the plugin's manifest.
 */
function countComponents(pluginDir, meta = {}) {
  const result = Object.fromEntries(COMPONENT_KEYS.map(k => [k, []]));
  if (!pluginDir || !fs.existsSync(pluginDir)) return result;

  // existsSync first: the virtual-marketplace dirs (~/.claude, <project>/.claude) carry no
  // manifest at all. `monitors` sits at the manifest top level in the schema but shipped
  // under `experimental` first, and plugins still spell it that way.
  const manifest = readJsonSafe(path.join(pluginDir, MANIFEST_REL)) || {};
  const declarationOf = key => meta[key] ?? manifest[key] ?? manifest.experimental?.[key];

  const configFiles = {};
  const inlineConfig = {};

  for (const { key, def, scan, file } of DIR_COMPONENTS) {
    const { paths } = splitDeclaration(declarationOf(key));
    for (const [rel, trusted] of candidates(paths, def)) {
      const full = resolveIn(pluginDir, rel, trusted);
      if (!full) continue;
      try {
        result[key].push(...(fs.statSync(full).isDirectory() ? scan(full) : file(full)));
      } catch {}
    }
  }

  for (const { key, def, items, names } of JSON_COMPONENTS) {
    const declared = declarationOf(key);
    const { paths, inline } = splitDeclaration(declared);

    const inlineNames = names(inline);
    if (inlineNames.length) {
      result[key].push(...inlineNames);
      inlineConfig[key] = declared;
      configFiles[key] = `${INLINE_PREFIX}${key}`;
    }

    for (const [rel, trusted] of candidates(paths, def)) {
      const full = resolveIn(pluginDir, rel, trusted);
      // No stat: readJsonSafe already returns null for a missing path or a directory.
      const data = full && readJsonSafe(full);
      if (!data) continue;
      const found = names(items(data));
      if (!found.length) continue;
      result[key].push(...found);
      if (!configFiles[key]) configFiles[key] = toUnixPath(rel);
    }
  }

  for (const key of COMPONENT_KEYS) result[key] = [...new Set(result[key])];

  const readmeFile = findReadmeFile(pluginDir);
  if (readmeFile) result._readmePath = readmeFile;
  result._configFiles = configFiles;
  result._inlineConfig = inlineConfig;
  return result;
}

module.exports = {
  countComponents,
  COMPONENT_KEYS,
  INLINE_PREFIX,
  findFiles,
  findReadmeFile,
  readJsonSafe,
  toUnixPath,
};
