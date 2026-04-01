let marketplaces = [];
let selectedPluginId = null;
let searchFilter = '';
let scopeFilter = 'installed';
const expandedNodes = new Set();
let componentCache = {};
const detailHistory = [];
let focusedRowId = null;
let _focusedRowEl = null;

function matchKey(e, ...keys) {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  return keys.some((k) => e.key === k || e.code === k);
}

const SVG = (d, w = 14) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  marketplace: SVG(
    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  ),
  plugin: SVG(
    '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  ),
  skills: SVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  commands: SVG('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'),
  agents: SVG(
    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  ),
  mcpServers: SVG(
    '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  ),
  hooks: SVG('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/>'),
  lspServers: SVG(
    '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
  ),
  folder: SVG('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
  file: SVG('<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>'),
  gear: SVG(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  ),
  kebab:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>',
};
ICONS.readme = SVG(
  '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
);
ICONS.settings = ICONS.gear;
ICONS.openEditor =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.583 2.207a1.1 1.1 0 0 1 1.541.033l2.636 2.636a1.1 1.1 0 0 1 .033 1.541L10.68 17.53a1.1 1.1 0 0 1-.345.247l-4.56 1.903a.55.55 0 0 1-.725-.725l1.903-4.56a1.1 1.1 0 0 1 .247-.345zm.902 1.87-8.794 8.793-.946 2.268 2.268-.946 8.794-8.793z"/></svg>';
ICONS.copyPath =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const COMP_HAS_DIR = new Set(['skills', 'commands', 'agents']);
const COMP_LABELS = {
  skills: 'Skills',
  commands: 'Commands',
  agents: 'Agents',
  mcpServers: 'MCP Servers',
  hooks: 'Hooks',
  lspServers: 'LSP Servers',
  settings: 'Settings',
  readme: 'README',
};

function updateArrow(p) {
  if (!p.hasUpdate) return '';
  const title =
    p.version && p.availableVersion
      ? `Update available: v${esc(p.version)} \u2192 v${esc(p.availableVersion)}`
      : 'Update available';
  return `<span class="update-indicator" title="${title}">\u2191</span>`;
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('contentOpenEditor').innerHTML = ICONS.openEditor;
  document.getElementById('contentCopyPath').innerHTML = ICONS.copyPath;
  restoreAppState();
  loadProject();
  loadData();

  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchFilter = e.target.value.toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTree, 150);
  });

  document.getElementById('scopeFilter').addEventListener('change', (e) => {
    scopeFilter = e.target.value;
    renderTree();
  });

  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);

  document.getElementById('projectBtn').addEventListener('click', changeProject);
  document.getElementById('addMarketplaceBtn').addEventListener('click', openAddMarketplace);
  document.getElementById('helpBtn').addEventListener('click', showHelpModal);

  function bindModalKeys(inputId, modalId, onSubmit) {
    document.getElementById(inputId).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(modalId);
      }
    });
  }
  bindModalKeys('marketplaceSource', 'addMarketplaceModal', submitAddMarketplace);
  bindModalKeys('projectPathInput', 'projectPickerModal', submitProjectPicker);

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-forced');
  } else {
    document.body.classList.add('light');
  }
  syncHljsTheme();
  updateThemeColor(savedTheme !== 'dark');

  document.addEventListener('keydown', handleKeydown);

  document.getElementById('treeContainer').addEventListener('click', (e) => {
    const row = e.target.closest('.tree-row');
    if (!row?.dataset.rowId) return;
    const rowId = row.dataset.rowId;
    const rows = getVisibleRows();
    const idx = rows.findIndex((r) => r.dataset.rowId === rowId);
    if (idx >= 0) setFocusedRow(idx, rows);
  });
});

function syncHljsTheme() {
  const light = document.body.classList.contains('light');
  const darkSheet = document.getElementById('hljsDark');
  const lightSheet = document.getElementById('hljsLight');
  if (darkSheet) darkSheet.disabled = light;
  if (lightSheet) lightSheet.disabled = !light;
}

function updateThemeColor(isLight) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', isLight ? '#e8e6e3' : '#101114');
  });
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  document.body.classList.remove('light', 'dark-forced');
  if (isLight) {
    document.body.classList.add('dark-forced');
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.add('light');
    localStorage.setItem('theme', 'light');
  }
  syncHljsTheme();
  updateThemeColor(!isLight);
}

async function loadProject() {
  try {
    const res = await fetch('/api/project');
    const data = await res.json();
    document.getElementById('projectPath').textContent = shortenPath(data.path);
    document.getElementById('projectBtn').title = data.path;
    saveRecentProject(data.path);
  } catch {}
}

async function loadData() {
  try {
    componentCache = {};
    const res = await fetch('/api/marketplaces');
    marketplaces = await res.json();
    for (const m of marketplaces) {
      m.updateCount = m.plugins.filter((p) => p.hasUpdate).length;
    }

    renderTree();
    if (selectedPluginId) showDetail(selectedPluginId);

    // Prefetch components for all plugins in background
    for (const m of marketplaces) {
      for (const p of m.plugins) {
        if (!componentCache[p.fullId]) {
          fetchComponents(p.fullId);
        }
      }
    }
  } catch (err) {
    document.getElementById('treeContainer').innerHTML =
      `<div class="loading" style="color:var(--error)">Failed to load: ${err.message}</div>`;
  }
}

async function refresh() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.disabled = true;
  await fetch('/api/refresh', { method: 'POST' });
  await loadData();
  btn.classList.remove('loading');
  btn.disabled = false;
  toast('Data refreshed', 'success');
}

function getRecentProjects() {
  try {
    return JSON.parse(localStorage.getItem('recentProjects') || '[]');
  } catch {
    return [];
  }
}

function saveRecentProject(projectPath) {
  const recent = getRecentProjects().filter((p) => p !== projectPath);
  recent.unshift(projectPath);
  localStorage.setItem('recentProjects', JSON.stringify(recent.slice(0, 10)));
}

function removeRecentProject(projectPath, e) {
  e.stopPropagation();
  const recent = getRecentProjects().filter((p) => p !== projectPath);
  localStorage.setItem('recentProjects', JSON.stringify(recent));
  renderRecentProjects();
}

function renderRecentProjects() {
  const container = document.getElementById('recentProjectsList');
  const current = document.getElementById('projectBtn').title;
  const recent = getRecentProjects().filter((p) => p !== current);
  if (!recent.length) {
    container.innerHTML = '';
    return;
  }
  const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const escJs = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  container.innerHTML =
    '<div class="recent-projects-label">Recent</div>' +
    recent
      .map(
        (p) =>
          `<div class="recent-project-item" onclick="selectRecentProject('${escJs(p)}')">` +
          `<span>${escAttr(p)}</span>` +
          `<button class="recent-project-remove" onclick="removeRecentProject('${escJs(p)}', event)" title="Remove">&#10005;</button>` +
          `</div>`,
      )
      .join('');
}

function selectRecentProject(projectPath) {
  document.getElementById('projectPathInput').value = projectPath;
}

function changeProject() {
  const current = document.getElementById('projectBtn').title;
  document.getElementById('projectPathInput').value = current;
  renderRecentProjects();
  document.getElementById('projectPickerModal').classList.add('open');
  setTimeout(() => document.getElementById('projectPathInput').focus(), 100);
}

async function submitProjectPicker() {
  const dirPath = document.getElementById('projectPathInput').value.trim();
  if (!dirPath) return;
  const btn = document.getElementById('projectPickerSubmit');
  btn.disabled = true;
  btn.textContent = 'Switching...';
  try {
    const res = await fetch('/api/project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast(err.error, 'error');
      return;
    }
    closeModal('projectPickerModal');
    await loadProject();
    await loadData();
    toast('Project switched', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Switch';
  }
}

// --- Render Tree ---

function renderTree() {
  const container = document.getElementById('treeContainer');
  if (!marketplaces.length) {
    container.innerHTML = '<div class="loading">No marketplaces found</div>';
    return;
  }

  const allIds = marketplaces.map((m) => `m_${safeId(m.name)}`);
  const allExpanded = allIds.length > 0 && allIds.every((id) => expandedNodes.has(id));
  let html = `<div class="tree-expand-toggle" id="toggleExpandBtn" onclick="toggleExpandAll()">${allExpanded ? 'Collapse All' : 'Expand All'}</div>`;

  for (const m of marketplaces) {
    const mid = safeId(m.name);
    const plugins = filterPlugins(m.plugins);
    if (plugins.length === 0 && (searchFilter || scopeFilter !== 'all')) continue;

    const srcBadge = m.isVirtual ? '' : sourceBadge(m.source.type);
    const updateBadge =
      m.updateCount > 0
        ? `<span class="update-badge">${m.updateCount} update${m.updateCount !== 1 ? 's' : ''}</span>`
        : '';
    const pluginCount = m.isVirtual
      ? ''
      : `<span class="badge-count">${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}</span>`;

    const mExpanded = expandedNodes.has(`m_${mid}`) || !!searchFilter;
    const mIcon = m.isVirtual ? ICONS.gear : ICONS.marketplace;
    const kebabBtn = m.isVirtual
      ? ''
      : `<button class="mkt-info-btn" onclick="event.stopPropagation(); showMarketplaceDetail('${esc(m.name)}')" title="Marketplace info">${ICONS.kebab}</button>`;

    html += `<div class="tree-row marketplace-row${m.isVirtual ? ' virtual' : ''}" data-row-type="marketplace" data-row-id="m_${mid}" onclick="toggleChildren('m_${mid}')">
      <span class="tree-chevron${mExpanded ? ' expanded' : ''}" id="chev_m_${mid}">\u25B6</span>
      <span class="tree-icon">${mIcon}</span>
      <span class="tree-label"><span class="mkt-name">${esc(m.name)}</span> ${m.version ? `<span class="version">v${esc(m.version)}</span>` : ''}</span>
      ${srcBadge}
      ${pluginCount}
      ${updateBadge}
      ${kebabBtn}
    </div>`;

    html += `<div class="tree-children${mExpanded ? ' open' : ''}" id="children_m_${mid}">`;
    for (const p of plugins) {
      html += renderPluginRow(p);
    }
    html += `</div>`;
  }

  const scrollTop = container.scrollTop;
  container.innerHTML = html;
  container.scrollTop = scrollTop;
  updateUrl();
  if (focusedRowId) {
    const row = container.querySelector(`.tree-row[data-row-id="${CSS.escape(focusedRowId)}"]`);
    if (row && row.offsetParent !== null) {
      _focusedRowEl = row;
      row.classList.add('focused');
    } else {
      focusedRowId = null;
      _focusedRowEl = null;
    }
  }
}

function renderPluginRow(p) {
  const selected = selectedPluginId === p.fullId ? ' selected' : '';
  const scopes = p.isVirtual ? '' : renderScopeToggles(p);
  const summary = renderCompSummary(p);
  const ver = p.version ? `<span class="version">v${esc(p.version)}</span>` : '';
  const updateIndicator = updateArrow(p);
  const virtualCls = p.isVirtual ? ' virtual' : '';
  const icon = p.isVirtual ? ICONS.gear : ICONS.plugin;

  const desc = `<span class="tree-desc-inline">${p.description ? esc(p.description) : ''}</span>`;

  const html = `<div class="tree-row${selected}${virtualCls}" data-row-type="plugin" data-row-id="${esc(p.fullId)}" onclick="showDetail('${esc(p.fullId)}')">
    <span class="tree-indent" style="width:40px"></span>
    <span class="tree-icon">${icon}</span>
    <span class="tree-label">${esc(p.name)} ${ver} ${updateIndicator}</span>
    ${desc}
    ${scopes}
    ${summary}
  </div>`;

  return html;
}

function renderScopeToggles(plugin) {
  const scopes = ['user', 'project', 'local'];
  const toggles = scopes
    .map((s) => {
      const detail = plugin.scopeDetails[s];
      let cls = `scope-toggle ${s}`;
      let title;
      if (detail.installed && detail.enabled) {
        cls += ' active';
        title = `${s}: enabled (v${detail.version || '?'})`;
      } else if (detail.installed && !detail.enabled) {
        cls += ' disabled';
        title = `${s}: disabled (v${detail.version || '?'})`;
      } else {
        title = `${s}: not installed`;
      }
      return `<div class="${cls}" title="${title}" onclick="event.stopPropagation(); scopeAction('${esc(plugin.fullId)}', '${s}')">${s[0].toUpperCase()}</div>`;
    })
    .join('');
  return `<div class="scope-toggles">${toggles}</div>`;
}

function renderCompSummary(plugin) {
  if (!plugin.components) return '';
  const parts = [];
  for (const [k, v] of Object.entries(plugin.components)) {
    if (k === 'settings' || k.startsWith('_')) continue;
    const count = Array.isArray(v) ? v.length : v;
    if (count > 0) parts.push(`${count} ${COMP_LABELS[k]?.toLowerCase() || k}`);
  }
  return parts.length ? `<span class="tree-meta">${parts.join(' \u00B7 ')}</span>` : '';
}

// --- Detail Panel ---

async function showDetail(pluginId) {
  selectedPluginId = pluginId;
  updateUrl();
  const plugin = findPlugin(pluginId);
  if (!plugin) return;

  // Highlight in tree
  document.querySelectorAll('.tree-row.selected').forEach((r) => r.classList.remove('selected'));
  const row = document.querySelector(`.tree-row[data-row-id="${CSS.escape(pluginId)}"]`);
  if (row) row.classList.add('selected');

  const panel = document.getElementById('detailPanel');
  const marketplace = marketplaces.find((m) => m.plugins.some((p) => p.fullId === pluginId));
  const mName = marketplace?.name || '?';
  const isVirtual = plugin.isVirtual;

  const componentsHtml = '<div style="color:var(--text-dim);font-size:12px">Loading components...</div>';
  const headerIcon = isVirtual ? ICONS.gear : ICONS.plugin;

  const updateBanner = plugin.hasUpdate
    ? `<div class="update-banner">
        <span>Update available: <strong>v${esc(plugin.version)}</strong> \u2192 <strong>v${esc(plugin.availableVersion)}</strong></span>
        <button class="action-btn primary" onclick="runAction('update', '${esc(plugin.fullId)}')">Update Plugin</button>
      </div>`
    : '';

  const scopeSection = isVirtual
    ? `<div class="detail-section">
        <span class="badge badge-virtual">Custom</span>
        <span class="detail-meta-item" style="margin-left:8px">${esc(plugin.installedScopes?.[0] || '')} scope</span>
      </div>`
    : `<div class="detail-section">
        <h4>Scope Installation</h4>
        ${renderScopeMatrix(plugin)}
      </div>`;

  const metaRow = isVirtual
    ? `<div class="detail-meta-row">
        <span class="detail-meta-item">${esc(shortenPath(plugin._pluginDir || ''))}</span>
      </div>`
    : `<div class="detail-meta-row">
        <span class="detail-meta-item">from ${esc(mName)}</span>
        ${sourceBadge(marketplace?.source?.type)}
      </div>`;

  panel.innerHTML = `
    <div class="detail-header">
      <h3>${headerIcon} ${esc(plugin.name)} ${plugin.version ? `<span class="version">v${esc(plugin.version)}</span>` : ''}</h3>
      <div class="detail-header-actions">
        ${plugin._pluginDir ? `<button class="modal-action-btn" title="${esc(plugin._pluginDir)}" onclick="copyPluginPath('${escJs(plugin._pluginDir)}', event)">${ICONS.copyPath}</button><button class="modal-action-btn" title="Open in VS Code" onclick="openFolderInEditor({pluginId:'${esc(plugin.fullId)}',event})">${ICONS.openEditor}</button>` : ''}
        <button class="detail-close" onclick="closeDetail()">\u2715</button>
      </div>
    </div>
    <div class="detail-body">
      ${updateBanner}
      <div class="detail-section">
        <p class="detail-desc">${esc(plugin.description || 'No description')}</p>
        ${metaRow}
        ${renderPluginMetadata(plugin)}
      </div>
      ${scopeSection}
      <div class="detail-section">
        <h4>Components</h4>
        <div id="detailComponents">${componentsHtml}</div>
      </div>
    </div>
  `;

  const comps = (await fetchComponents(pluginId)) || plugin.components || {};
  const hasDirAccess = !!comps._pluginDir;
  const el = document.getElementById('detailComponents');
  if (el) el.innerHTML = renderDetailComponents(pluginId, comps, hasDirAccess);
}

function renderScopeMatrix(plugin) {
  const scopes = ['user', 'project', 'local'];
  return `<div class="scope-matrix">${scopes
    .map((s) => {
      const d = plugin.scopeDetails[s];
      let status, actions;

      if (d.installed && d.enabled) {
        status = `Enabled${d.version ? ` \u00B7 v${esc(d.version)}` : ''}`;
        actions = `
        <button class="action-btn" onclick="runAction('disable', '${esc(plugin.fullId)}', '${s}')">Disable</button>
        <button class="action-btn danger" onclick="runAction('uninstall', '${esc(plugin.fullId)}', '${s}')">Remove</button>
      `;
      } else if (d.installed && !d.enabled) {
        status = `Disabled${d.version ? ` \u00B7 v${esc(d.version)}` : ''}`;
        actions = `
        <button class="action-btn primary" onclick="runAction('enable', '${esc(plugin.fullId)}', '${s}')">Enable</button>
        <button class="action-btn danger" onclick="runAction('uninstall', '${esc(plugin.fullId)}', '${s}')">Remove</button>
      `;
      } else {
        status = 'Not installed';
        actions = `<button class="action-btn primary" onclick="runAction('install', '${esc(plugin.fullId)}', '${s}')">Install</button>`;
      }

      return `<div class="scope-matrix-row">
      <span class="scope-matrix-label ${s}">${s}</span>
      <span class="scope-matrix-status">${status}</span>
      <div class="scope-matrix-actions">${actions}</div>
    </div>`;
    })
    .join('')}</div>`;
}

function shortUrl(url) {
  return url
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

function renderPluginMetadata(plugin) {
  const meta = plugin.metadata || {};
  const chips = [];
  if (meta.category) chips.push(`<span class="meta-tag">${esc(meta.category)}</span>`);
  if (meta.author) {
    const name = typeof meta.author === 'object' ? meta.author.name : meta.author;
    if (name) chips.push(`<span class="meta-chip">${esc(name)}</span>`);
  }
  if (meta.tags?.length) {
    for (const t of meta.tags) chips.push(`<span class="meta-tag">${esc(t)}</span>`);
  }
  const links = [];
  if (meta.homepage) {
    links.push(
      `<a class="meta-link" href="${esc(meta.homepage)}" target="_blank" rel="noopener">${esc(shortUrl(meta.homepage))}</a>`,
    );
  }
  if (plugin.source && typeof plugin.source === 'string' && plugin.source.startsWith('http')) {
    const href = plugin.source.replace(/\.git$/, '');
    if (!meta.homepage || !plugin.source.includes(meta.homepage)) {
      links.push(
        `<a class="meta-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(shortUrl(plugin.source))}</a>`,
      );
    }
  }
  if (!chips.length && !links.length) return '';
  return `<div class="plugin-meta-bar">${chips.join('')}${links.join('')}</div>`;
}

function renderDetailComponents(pluginId, comps, hasDirAccess) {
  const configFiles = comps._configFiles || {};
  const entries = Object.entries(comps).filter(
    ([k, v]) => !k.startsWith('_') && (Array.isArray(v) ? v.length > 0 : v > 0),
  );
  if (!entries.length && !comps._readmePath)
    return '<div style="color:var(--text-dim);font-size:12px">No components found</div>';

  let readmeHtml = '';
  if (comps._readmePath && hasDirAccess) {
    readmeHtml = `<div class="readme-comp-item" onclick="openContentModal('${esc(pluginId)}', '${esc(comps._readmePath)}', 'readme')">
      <span class="icon">${ICONS.readme}</span> ${esc(comps._readmePath)}
    </div>`;
  }

  return (
    readmeHtml +
    entries
      .map(([type, items]) => {
        const names = Array.isArray(items) ? items : [];
        const count = names.length || items;
        let html = `<div class="detail-comp-group">
      <div class="detail-comp-header">
        <span class="comp-icon">${ICONS[type] || ''}</span>
        ${COMP_LABELS[type] || type}
        <span class="count">${count}</span>
      </div>`;

        if (names.length) {
          const configFile = configFiles[type];
          const dir = COMP_HAS_DIR.has(type) ? type : null;
          html += '<div class="detail-comp-items">';
          for (const name of names) {
            const clickPath = configFile || (dir ? `${dir}/${name}` : name);
            const cls = hasDirAccess ? '' : ' disabled';
            const click = hasDirAccess
              ? ` onclick="openContentModal('${esc(pluginId)}', '${esc(clickPath)}', '${esc(type)}')"`
              : '';
            html += `<div class="detail-comp-item${cls}"${click}>
            <span class="icon">${type === 'skills' ? ICONS.folder : ICONS.file}</span>
            ${esc(name)}
          </div>`;
          }
          html += '</div>';
        }

        html += '</div>';
        return html;
      })
      .join('')
  );
}

const EXT_TO_LANG = {
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  toml: 'ini',
};

const PREFERRED_FILE = 'SKILL.MD';
let _contentCodeEl = null;
let _contentPluginId = null;
let _contentPluginDir = null;

function highlightSource(text, fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (typeof hljs === 'undefined' || !lang) return esc(text);
  try {
    if (lang === 'markdown') {
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (fm) {
        const fmHtml = hljs.highlight(fm[1], { language: 'yaml' }).value;
        const bodyHtml = hljs.highlight(fm[2], { language: 'markdown' }).value;
        return `<span class="hl-frontmatter">---</span>\n${fmHtml}\n<span class="hl-frontmatter">---</span>\n${bodyHtml}`;
      }
    }
    return hljs.highlight(text, { language: lang }).value;
  } catch {}
  return esc(text);
}

function getContentCodeEl() {
  if (!_contentCodeEl) {
    const pre = document.getElementById('contentViewerCode');
    _contentCodeEl = pre.querySelector('code') || pre;
  }
  return _contentCodeEl;
}

async function postAndFlash(endpoint, data, btn) {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (btn) flashButton(btn);
  } catch {}
}

async function openInEditor(event) {
  if (!_contentPluginId) return;
  const relativePath = document.getElementById('contentViewerPath').textContent || '';
  await postAndFlash('/api/open-in-editor', { pluginId: _contentPluginId, relativePath }, event?.currentTarget);
}

const CHECKMARK_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

function flashButton(btn) {
  if (btn._flashTimeout) clearTimeout(btn._flashTimeout);
  if (!btn._flashOrig) btn._flashOrig = btn.innerHTML;
  btn.innerHTML = CHECKMARK_SVG;
  btn.classList.add('copy-success');
  btn._flashTimeout = setTimeout(() => {
    btn.innerHTML = btn._flashOrig;
    btn.classList.remove('copy-success');
    btn._flashOrig = null;
    btn._flashTimeout = null;
  }, 1000);
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  if (btn) flashButton(btn);
}

async function copyContentPath(event) {
  if (!_contentPluginDir) return;
  const relativePath = document.getElementById('contentViewerPath').textContent || '';
  const full = relativePath ? `${_contentPluginDir}/${relativePath}` : _contentPluginDir;
  await copyToClipboard(full, event?.currentTarget);
}

async function copyPluginPath(pluginDir, event) {
  if (pluginDir) await copyToClipboard(pluginDir, event?.currentTarget);
}

async function openFolderInEditor({ pluginId, marketplaceName, event } = {}) {
  if (!pluginId && !marketplaceName) return;
  await postAndFlash('/api/open-folder-in-editor', { pluginId, marketplaceName }, event?.currentTarget);
}

async function openReadmeModal(title, fetchUrl) {
  _contentPluginId = null;
  _contentPluginDir = null;
  document.getElementById('contentModalTitle').textContent = `${title} \u2014 README`;
  const tree = document.getElementById('contentTree');
  const codeEl = getContentCodeEl();
  const pathEl = document.getElementById('contentViewerPath');
  tree.innerHTML = '';
  pathEl.textContent = 'README.md';
  codeEl.innerHTML = '<span style="color:var(--text-dim)">Loading...</span>';
  document.getElementById('contentModal').classList.add('open');
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    codeEl.innerHTML = highlightSource(data.content || '', data.name || 'README.md');
  } catch {
    codeEl.innerHTML = '<span style="color:var(--error)">Failed to load README</span>';
  }
}

async function openContentModal(pluginId, initialPath, componentType) {
  _contentPluginId = pluginId;
  const comps = await fetchComponents(pluginId);
  _contentPluginDir = comps?._pluginDir || null;
  const plugin = findPlugin(pluginId);
  const label = COMP_LABELS[componentType] || componentType;
  document.getElementById('contentModalTitle').textContent = `${plugin?.name || pluginId} \u2014 ${label}`;

  const tree = document.getElementById('contentTree');
  const codeEl = getContentCodeEl();
  const pathEl = document.getElementById('contentViewerPath');
  tree.innerHTML = '';
  codeEl.innerHTML = '';
  pathEl.textContent = '';

  document.getElementById('contentModal').classList.add('open');
  await loadContentTree(pluginId, initialPath, tree, 0, true);
}

async function loadContentTree(pluginId, treePath, container, depth, autoSelect) {
  try {
    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/preview/${treePath}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    if (data.type === 'directory') {
      let firstFile = null;
      let preferredFile = null;
      for (const entry of data.entries) {
        const subPath = `${treePath}/${entry.name}`;
        const item = document.createElement('div');
        item.className = 'content-tree-item';
        item.style.paddingLeft = `${12 + depth * 14}px`;
        item.dataset.path = subPath;
        item.innerHTML = `<span class="icon">${entry.isDirectory ? ICONS.folder : ICONS.file}</span>${esc(entry.name)}`;

        if (entry.isDirectory) {
          let expanded = false;
          const childContainer = document.createElement('div');
          childContainer.className = 'content-tree-children';
          childContainer.style.display = 'none';
          item.addEventListener('click', async () => {
            expanded = !expanded;
            if (expanded && !childContainer.children.length) {
              await loadContentTree(pluginId, subPath, childContainer, depth + 1, false);
            }
            childContainer.style.display = expanded ? 'block' : 'none';
          });
          container.appendChild(item);
          container.appendChild(childContainer);
        } else {
          if (!firstFile) firstFile = subPath;
          if (entry.name.toUpperCase() === PREFERRED_FILE) preferredFile = subPath;
          item.addEventListener('click', () => loadContentFile(pluginId, subPath));
          container.appendChild(item);
        }
      }
      if (autoSelect && (preferredFile || firstFile)) {
        await loadContentFile(pluginId, preferredFile || firstFile);
      }
    } else {
      await loadContentFile(pluginId, treePath);
    }
  } catch {
    container.innerHTML = '<div style="color:var(--error);font-size:11px;padding:8px 12px">Failed to load</div>';
  }
}

async function loadContentFile(pluginId, filePath) {
  const codeEl = getContentCodeEl();
  const pathEl = document.getElementById('contentViewerPath');
  pathEl.textContent = filePath;
  codeEl.innerHTML = '<span style="color:var(--text-dim)">Loading...</span>';

  document.querySelectorAll('#contentTree .content-tree-item.active').forEach((el) => el.classList.remove('active'));
  const activeItem = document.querySelector(`#contentTree .content-tree-item[data-path="${CSS.escape(filePath)}"]`);
  if (activeItem) activeItem.classList.add('active');

  try {
    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/preview/${filePath}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    if (data.type === 'directory') {
      codeEl.innerHTML = `<span style="color:var(--text-dim)">(directory with ${data.entries.length} entries)</span>`;
      return;
    }

    if (!data.content) {
      codeEl.innerHTML = '<span style="color:var(--text-dim)">(empty file)</span>';
      return;
    }

    if (data.content.length > 100000) {
      codeEl.innerHTML = `${highlightSource(data.content.slice(0, 100000), data.name)}\n\n--- truncated (100KB limit) ---`;
      return;
    }

    codeEl.innerHTML = highlightSource(data.content, data.name);
  } catch {
    codeEl.innerHTML = '<span style="color:var(--error)">Failed to load file</span>';
  }
}

function showMarketplaceDetail(name) {
  selectedPluginId = null;
  updateUrl();
  document.querySelectorAll('.tree-row.selected').forEach((r) => r.classList.remove('selected'));

  const m = marketplaces.find((m) => m.name === name);
  if (!m) return;

  const panel = document.getElementById('detailPanel');
  const installed = m.plugins.filter((p) => p.isInstalled).length;
  const total = m.plugins.length;
  const srcType = m.source.type || 'unknown';
  const srcDetail = m.source.repo || m.source.path || m.source.url || '';
  const updated = m.lastUpdated ? timeAgo(new Date(m.lastUpdated)) : 'unknown';

  panel.innerHTML = `
    <div class="detail-header">
      <h3>${ICONS.marketplace} ${esc(m.name)} ${m.version ? `<span class="version">v${esc(m.version)}</span>` : ''}</h3>
      <div class="detail-header-actions">
        ${m.installLocation ? `<button class="modal-action-btn" title="${esc(m.installLocation)}" onclick="copyPluginPath('${escJs(m.installLocation)}', event)">${ICONS.copyPath}</button><button class="modal-action-btn" title="Open in VS Code" onclick="openFolderInEditor({marketplaceName:'${esc(m.name)}',event})">${ICONS.openEditor}</button>` : ''}
        <button class="detail-close" onclick="closeDetail()">\u2715</button>
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-section">
        <div class="detail-meta-grid">
          <span class="meta-label">Source</span>
          <span class="meta-value">${sourceBadge(srcType)} ${esc(srcDetail)}</span>
          ${m.version ? `<span class="meta-label">Version</span><span class="meta-value">v${esc(m.version)}</span>` : ''}
          ${m.owner?.name ? `<span class="meta-label">Owner</span><span class="meta-value">${esc(m.owner.name)}${m.owner.email ? ` &lt;${esc(m.owner.email)}&gt;` : ''}${m.owner.url ? ` \u00B7 ${esc(m.owner.url)}` : ''}</span>` : ''}
          ${m.description ? `<span class="meta-label">Description</span><span class="meta-value">${esc(m.description)}</span>` : ''}
          <span class="meta-label">Location</span>
          <span class="meta-value" style="word-break:break-all;font-size:11px">${esc(m.installLocation || '?')}</span>
          <span class="meta-label">Last updated</span>
          <span class="meta-value">${esc(updated)}</span>
          <span class="meta-label">Plugins</span>
          <span class="meta-value">${installed} installed / ${total} total</span>
        </div>
      </div>
      ${m.readmeFile ? `<div class="detail-section"><h4>Documentation</h4><div class="readme-comp-item" onclick="openReadmeModal('${esc(m.name)}', '/api/marketplaces/${encodeURIComponent(m.name)}/readme')">${ICONS.readme} ${esc(m.readmeFile)}</div></div>` : ''}
      <div class="detail-section">
        <h4>Actions</h4>
        <div class="mkt-actions">
          <button class="action-btn primary" onclick="runMarketplaceAction('update', '${esc(m.name)}')">Update</button>
          <button class="action-btn danger" onclick="runMarketplaceAction('remove', '${esc(m.name)}')">Remove</button>
        </div>
      </div>
      <div class="detail-section">
        <h4>Plugins</h4>
        ${m.plugins
          .map((p) => {
            const status = p.isInstalled
              ? p.isEnabled
                ? '<span style="color:var(--success)">enabled</span>'
                : '<span style="color:var(--warning)">disabled</span>'
              : '<span style="color:var(--text-muted)">not installed</span>';
            const updateTag = updateArrow(p);
            return `<div class="mkt-plugin-item" onclick="if(detailHistory.length<20)detailHistory.push({type:'marketplace',name:'${esc(m.name)}'}); showDetail('${esc(p.fullId)}')">${esc(p.name)} ${status}${updateTag}</div>`;
          })
          .join('')}
      </div>
    </div>
  `;
}

async function runMarketplaceAction(action, name) {
  await postAndReload(`/api/marketplace/${action}`, { name }, action);
}

function closeDetail() {
  const prev = detailHistory.pop();
  if (prev) {
    if (prev.type === 'marketplace') {
      showMarketplaceDetail(prev.name);
      return;
    }
  }
  selectedPluginId = null;
  updateUrl();
  document.querySelectorAll('.tree-row.selected').forEach((r) => r.classList.remove('selected'));
  document.getElementById('detailPanel').innerHTML = `
    <div class="detail-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      <span>Select a plugin to view details</span>
    </div>`;
}

// --- Actions ---

async function scopeAction(pluginId, scope) {
  const plugin = findPlugin(pluginId);
  if (!plugin) return;

  const detail = plugin.scopeDetails[scope];
  if (!detail.installed) {
    await runAction('install', pluginId, scope);
  } else if (detail.enabled) {
    await runAction('disable', pluginId, scope);
  } else {
    await runAction('enable', pluginId, scope);
  }
}

async function runAction(action, pluginId, scope) {
  await postAndReload(`/api/plugins/${action}`, { pluginId, scope }, action);
}

async function postAndReload(url, body, label) {
  toast(`Running ${label}...`, 'info');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Action failed', 'error');
      return;
    }
    toast(`${label} successful`, 'success');
    await loadData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- URL State ---

function updateUrl() {
  const params = new URLSearchParams();
  if (searchFilter) params.set('q', searchFilter);
  if (scopeFilter !== 'installed') params.set('scope', scopeFilter);
  if (selectedPluginId) params.set('plugin', selectedPluginId);
  const qs = params.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  history.replaceState(null, '', url);
}

function restoreAppState() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) {
    searchFilter = params.get('q');
    document.getElementById('searchInput').value = searchFilter;
  }
  if (params.has('scope')) {
    scopeFilter = params.get('scope');
    const sel = document.getElementById('scopeFilter');
    if (sel) sel.value = scopeFilter;
  }
  if (params.has('plugin')) {
    selectedPluginId = params.get('plugin');
  }
  if (params.has('project')) {
    const projectPath = params.get('project');
    fetch('/api/project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath }),
    })
      .then((r) => {
        if (r.ok) {
          loadProject();
          loadData();
        }
      })
      .catch(() => {});
    const cleanParams = new URLSearchParams(window.location.search);
    cleanParams.delete('project');
    const qs = cleanParams.toString();
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }
  try {
    const saved = JSON.parse(localStorage.getItem('expandedNodes') || '[]');
    saved.forEach((n) => expandedNodes.add(n));
  } catch {}
}

async function fetchComponents(pluginId) {
  if (componentCache[pluginId]) return componentCache[pluginId];
  try {
    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/components`);
    if (res.ok) {
      componentCache[pluginId] = await res.json();
      return componentCache[pluginId];
    }
  } catch {}
  return null;
}

// --- Helpers ---

function toggleChildren(id) {
  const el = document.getElementById(`children_${id}`);
  const ch = document.getElementById(`chev_${id}`);
  if (el) {
    const isOpen = el.classList.toggle('open');
    ch?.classList.toggle('expanded', isOpen);
    if (isOpen) expandedNodes.add(id);
    else expandedNodes.delete(id);
    saveExpandedNodes();
  }
}

function toggleExpandAll() {
  const allIds = marketplaces.map((m) => `m_${safeId(m.name)}`);
  const collapse = allIds.length > 0 && allIds.every((id) => expandedNodes.has(id));
  for (const id of allIds) {
    if (collapse) expandedNodes.delete(id);
    else expandedNodes.add(id);
  }
  saveExpandedNodes();
  renderTree();
}

function findPlugin(id) {
  for (const m of marketplaces) {
    const p = m.plugins.find((p) => p.fullId === id);
    if (p) return p;
  }
  return null;
}

function filterPlugins(plugins) {
  let result = plugins;
  if (scopeFilter === 'installed') {
    result = result.filter((p) => p.isInstalled);
  } else if (scopeFilter !== 'all') {
    result = result.filter((p) => p.scopeDetails[scopeFilter]?.installed);
  }
  if (searchFilter) {
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(searchFilter) ||
        (p.description || '').toLowerCase().includes(searchFilter) ||
        (p.metadata?.category || '').toLowerCase().includes(searchFilter) ||
        (p.metadata?.tags || []).some((t) => t.toLowerCase().includes(searchFilter)),
    );
  }
  return result;
}

function sourceBadge(type) {
  if (type === 'github') return '<span class="badge badge-github">GitHub</span>';
  if (type === 'directory') return '<span class="badge badge-directory">Local</span>';
  if (type === 'git') return '<span class="badge badge-git">Git</span>';
  return `<span class="badge" style="background:var(--accent-dim);color:var(--accent)">${esc(type || '?')}</span>`;
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

function saveExpandedNodes() {
  localStorage.setItem('expandedNodes', JSON.stringify([...expandedNodes]));
}

function safeId(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function shortenPath(p) {
  if (!p) return '';
  const home = '~';
  return p
    .replace(/\\/g, '/')
    .replace(/^[A-Z]:\//i, '/')
    .replace(/^\/Users\/[^/]+/i, home)
    .replace(/^\/home\/[^/]+/i, home);
}

let toastTimeout;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3000);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function openAddMarketplace() {
  document.getElementById('marketplaceSource').value = '';
  document.getElementById('addMarketplaceModal').classList.add('open');
  setTimeout(() => document.getElementById('marketplaceSource').focus(), 100);
}

async function submitAddMarketplace() {
  const source = document.getElementById('marketplaceSource').value.trim();
  if (!source) return;
  const btn = document.getElementById('addMarketplaceSubmit');
  btn.disabled = true;
  btn.textContent = 'Adding...';
  try {
    const res = await fetch('/api/marketplace/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Failed to add marketplace', 'error');
    } else {
      toast('Marketplace added', 'success');
      closeModal('addMarketplaceModal');
      await loadData();
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add';
  }
}

// --- Keyboard Navigation ---

function getVisibleRows() {
  return [...document.querySelectorAll('#treeContainer .tree-row')].filter((r) => r.offsetParent !== null);
}

function setFocusedRow(index, rows) {
  rows = rows || getVisibleRows();
  if (_focusedRowEl) _focusedRowEl.classList.remove('focused');
  if (!rows.length) {
    focusedRowId = null;
    _focusedRowEl = null;
    return;
  }
  index = Math.max(0, Math.min(index, rows.length - 1));
  const row = rows[index];
  row.classList.add('focused');
  row.scrollIntoView({ block: 'nearest' });
  focusedRowId = row.dataset.rowId;
  _focusedRowEl = row;
}

function getFocusedIndex(rows) {
  if (!focusedRowId) return -1;
  return rows.findIndex((r) => r.dataset.rowId === focusedRowId);
}

function handleKeydown(e) {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') {
      e.target.blur();
      e.preventDefault();
    }
    return;
  }
  if ((tag === 'BUTTON' || tag === 'A') && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('#treeContainer'))
    return;

  const openModal = document.querySelector('.modal-overlay.open');
  if (openModal) {
    if (e.key === 'Escape') {
      openModal.classList.remove('open');
      e.preventDefault();
    }
    return;
  }

  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    e.preventDefault();
    showHelpModal();
    return;
  }

  if (e.key === '/') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
    return;
  }

  if (matchKey(e, 'Escape')) {
    e.preventDefault();
    if (selectedPluginId) closeDetail();
    return;
  }

  if (matchKey(e, 's')) {
    e.preventDefault();
    document.getElementById('scopeFilter').focus();
    return;
  }

  if (matchKey(e, 'e')) {
    e.preventDefault();
    toggleExpandAll();
    return;
  }

  if (matchKey(e, 'r')) {
    e.preventDefault();
    refresh();
    return;
  }

  const rows = getVisibleRows();
  const idx = getFocusedIndex(rows);

  if (matchKey(e, 'ArrowDown', 'j')) {
    e.preventDefault();
    if (idx < 0) {
      const selIdx = selectedPluginId ? rows.findIndex((r) => r.dataset.rowId === selectedPluginId) : -1;
      setFocusedRow(selIdx >= 0 ? selIdx : 0, rows);
    } else {
      setFocusedRow(idx + 1, rows);
    }
    return;
  }

  if (matchKey(e, 'ArrowUp', 'k')) {
    e.preventDefault();
    if (idx < 0) {
      const selIdx = selectedPluginId ? rows.findIndex((r) => r.dataset.rowId === selectedPluginId) : -1;
      setFocusedRow(selIdx >= 0 ? selIdx : 0, rows);
    } else {
      setFocusedRow(idx - 1, rows);
    }
    return;
  }

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (idx < 0) return;
    const row = rows[idx];
    if (row.dataset.rowType === 'marketplace') toggleChildren(row.dataset.rowId);
    else if (row.dataset.rowType === 'plugin') showDetail(row.dataset.rowId);
    return;
  }

  if (matchKey(e, 'ArrowRight', 'l')) {
    e.preventDefault();
    if (idx < 0) return;
    const row = rows[idx];
    if (row.dataset.rowType === 'marketplace' && !expandedNodes.has(row.dataset.rowId)) {
      toggleChildren(row.dataset.rowId);
    }
    return;
  }

  if (matchKey(e, 'ArrowLeft', 'h')) {
    e.preventDefault();
    if (idx < 0) return;
    const row = rows[idx];
    if (row.dataset.rowType === 'marketplace' && expandedNodes.has(row.dataset.rowId)) {
      toggleChildren(row.dataset.rowId);
    } else if (row.dataset.rowType === 'plugin') {
      for (let i = idx - 1; i >= 0; i--) {
        if (rows[i].dataset.rowType === 'marketplace') {
          setFocusedRow(i, rows);
          break;
        }
      }
    }
    return;
  }
}

let _helpModalHandler = null;

function showHelpModal() {
  document.getElementById('helpModal').classList.add('open');
  if (_helpModalHandler) document.removeEventListener('keydown', _helpModalHandler, true);
  _helpModalHandler = (e) => {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      e.stopPropagation();
      closeModal('helpModal');
      document.removeEventListener('keydown', _helpModalHandler, true);
      _helpModalHandler = null;
    }
  };
  document.addEventListener('keydown', _helpModalHandler, true);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// #region HUB_INTEGRATION
(async function initHub() {
  const cfg = await fetch('/hub-config')
    .then((r) => r.json())
    .catch(() => ({}));
  if (!cfg.enabled) return;
  window.__HUB__ = cfg;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      window.parent?.postMessage({ type: 'hub:keydown', key: e.key }, '*');
    }
  });
})();

function hubNavigate(app, url) {
  if (!window.__HUB__?.enabled) return;
  window.parent?.postMessage({ type: 'hub:navigate', app, url }, '*');
}
// #endregion HUB_INTEGRATION
