let marketplaces = [];
let selectedPluginId = null;
let searchFilter = '';
let showInstalledOnly = true;
const expandedNodes = new Set();

const COMP_ICONS = {
  skills: '\u26A1', commands: '\u25B6', agents: '\uD83E\uDD16',
  mcpServers: '\uD83D\uDD0C', hooks: '\u2693', lspServers: '\uD83D\uDD27',
};
const COMP_LABELS = {
  skills: 'Skills', commands: 'Commands', agents: 'Agents',
  mcpServers: 'MCP Servers', hooks: 'Hooks', lspServers: 'LSP Servers',
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  restoreFromUrl();
  loadProject();
  loadData();

  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchFilter = e.target.value.toLowerCase();
    renderTree();
  });

  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);

  document.getElementById('projectBtn').addEventListener('click', changeProject);
  document.getElementById('addMarketplaceBtn').addEventListener('click', openAddMarketplace);

  // Enter key in modal
  document.getElementById('marketplaceSource').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAddMarketplace();
    if (e.key === 'Escape') closeModal('addMarketplaceModal');
  });

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
  } else if (savedTheme === 'dark') {
    document.body.classList.add('dark-forced');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });
});

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
}

async function loadProject() {
  try {
    const res = await fetch('/api/project');
    const data = await res.json();
    document.getElementById('projectPath').textContent = shortenPath(data.path);
    document.getElementById('projectBtn').title = data.path;
  } catch {}
}

async function loadData() {
  try {
    const res = await fetch('/api/marketplaces');
    marketplaces = await res.json();

    // Auto-expand to selected plugin if set
    if (selectedPluginId) {
      for (const m of marketplaces) {
        const mid = safeId(m.name);
        const plugin = m.plugins.find(p => p.fullId === selectedPluginId);
        if (plugin) {
          expandedNodes.add('m_' + mid);
          expandedNodes.add('p_' + safeId(plugin.fullId));
          break;
        }
      }
    }

    renderTree();
    if (selectedPluginId) showDetail(selectedPluginId);
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

async function changeProject() {
  // Try native directory picker API first, fall back to prompt
  let dirPath = null;
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      dirPath = handle.name;
      // showDirectoryPicker doesn't give full path — fall back to prompt with the name as hint
      dirPath = prompt('Confirm project directory (browser cannot read full path):', dirPath);
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  if (!dirPath) {
    const current = document.getElementById('projectBtn').title;
    dirPath = prompt('Project directory:', current);
  }
  if (!dirPath) return;

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
    await loadProject();
    await loadData();
    toast('Project switched', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- Render Tree ---

function renderTree() {
  const container = document.getElementById('treeContainer');
  if (!marketplaces.length) {
    container.innerHTML = '<div class="loading">No marketplaces found</div>';
    return;
  }

  let html = `<div class="tree-toolbar">
    <label class="filter-toggle">
      <input type="checkbox" ${showInstalledOnly ? 'checked' : ''} onchange="showInstalledOnly=this.checked; renderTree()">
      <span>Installed only</span>
    </label>
  </div>`;

  let hasVisiblePlugins = false;
  for (const m of marketplaces) {
    const mid = safeId(m.name);
    const plugins = filterPlugins(m.plugins);
    if (plugins.length === 0 && (searchFilter || showInstalledOnly)) continue;

    const srcBadge = sourceBadge(m.source.type);
    const pluginCount = `<span class="badge-count">${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}</span>`;

    const mExpanded = expandedNodes.has('m_' + mid) || !!searchFilter;
    hasVisiblePlugins = hasVisiblePlugins || plugins.length > 0;

    html += `<div class="tree-row marketplace-row" onclick="toggleChildren('m_${mid}')">
      <span class="tree-chevron${mExpanded ? ' expanded' : ''}" id="chev_m_${mid}">\u25B6</span>
      <span class="tree-icon">\uD83C\uDFEB</span>
      <span class="tree-label"><span class="mkt-name">${esc(m.name)}</span></span>
      ${srcBadge}
      ${pluginCount}
    </div>`;

    html += `<div class="tree-children${mExpanded ? ' open' : ''}" id="children_m_${mid}">`;
    for (const p of plugins) {
      html += renderPluginRow(p, m);
    }
    html += `</div>`;
  }

  const scrollTop = container.scrollTop;
  container.innerHTML = html;
  container.scrollTop = scrollTop;
  updateUrl();
}

function renderPluginRow(p, m) {
  const pid = safeId(p.fullId);
  const selected = selectedPluginId === p.fullId ? ' selected' : '';
  const scopes = renderScopeToggles(p);
  const summary = renderCompSummary(p);
  const ver = p.version ? `<span class="version">v${esc(p.version)}</span>` : '';

  const pExpanded = expandedNodes.has('p_' + pid);

  let html = `<div class="tree-row${selected}" onclick="toggleChildren('p_${pid}'); showDetail('${esc(p.fullId)}')">
    <span class="tree-indent" style="width:20px"></span>
    <span class="tree-chevron${pExpanded ? ' expanded' : ''}" id="chev_p_${pid}">\u25B6</span>
    <span class="tree-icon">\uD83D\uDCE6</span>
    <span class="tree-label">${esc(p.name)} ${ver}</span>
    ${scopes}
    ${summary}
  </div>`;

  if (p.description) {
    html += `<div class="tree-desc">${esc(p.description)}</div>`;
  }

  html += `<div class="tree-children${pExpanded ? ' open' : ''}" id="children_p_${pid}">`;
  if (p.components) {
    for (const [type, count] of Object.entries(p.components)) {
      if (count > 0) {
        html += `<div class="comp-row" onclick="event.stopPropagation(); showDetail('${esc(p.fullId)}', '${type}')">
          <span class="comp-icon">${COMP_ICONS[type] || ''}</span>
          <span>${COMP_LABELS[type] || type}</span>
          <span class="comp-count">${count}</span>
        </div>`;
      }
    }
  }
  html += `</div>`;

  return html;
}

function renderScopeToggles(plugin) {
  const scopes = ['user', 'project', 'local'];
  const toggles = scopes.map(s => {
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
  }).join('');
  return `<div class="scope-toggles">${toggles}</div>`;
}

function renderCompSummary(plugin) {
  if (!plugin.components) return '';
  const parts = [];
  for (const [k, v] of Object.entries(plugin.components)) {
    if (v > 0) parts.push(`${v} ${COMP_LABELS[k]?.toLowerCase() || k}`);
  }
  return parts.length ? `<span class="tree-meta">${parts.join(' \u00B7 ')}</span>` : '';
}

// --- Detail Panel ---

async function showDetail(pluginId, focusComponent) {
  selectedPluginId = pluginId;
  updateUrl();
  const plugin = findPlugin(pluginId);
  if (!plugin) return;

  // Highlight in tree
  document.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
  const rows = document.querySelectorAll('.tree-row');
  for (const r of rows) {
    if (r.onclick?.toString().includes(pluginId)) r.classList.add('selected');
  }

  const panel = document.getElementById('detailPanel');
  const marketplace = marketplaces.find(m => m.plugins.some(p => p.fullId === pluginId));
  const mName = marketplace?.name || '?';

  let componentsHtml = '<div style="color:var(--text-dim);font-size:12px">Loading components...</div>';
  let previewHtml = '';

  panel.innerHTML = `
    <div class="detail-header">
      <h3>\uD83D\uDCE6 ${esc(plugin.name)}</h3>
      <button class="detail-close" onclick="closeDetail()">\u2715</button>
    </div>
    <div class="detail-body">
      <div class="detail-section">
        <p class="detail-desc">${esc(plugin.description || 'No description')}</p>
        <div class="detail-meta-row">
          ${plugin.version ? `<span class="detail-meta-item">v${esc(plugin.version)}</span>` : ''}
          <span class="detail-meta-item">from ${esc(mName)}</span>
          ${sourceBadge(marketplace?.source?.type)}
        </div>
      </div>
      <div class="detail-section">
        <h4>Scope Installation</h4>
        ${renderScopeMatrix(plugin)}
      </div>
      <div class="detail-section">
        <h4>Components</h4>
        <div id="detailComponents">${componentsHtml}</div>
      </div>
      <div class="detail-section" id="detailPreview" style="display:none">
        <h4>Preview</h4>
        <div id="detailPreviewContent"></div>
      </div>
    </div>
  `;

  // Load actual components from filesystem
  try {
    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/components`);
    if (res.ok) {
      const comps = await res.json();
      const el = document.getElementById('detailComponents');
      if (el) el.innerHTML = renderDetailComponents(pluginId, comps);
    }
  } catch {}
}

function renderScopeMatrix(plugin) {
  const scopes = ['user', 'project', 'local'];
  return `<div class="scope-matrix">${scopes.map(s => {
    const d = plugin.scopeDetails[s];
    let status, actions;

    if (d.installed && d.enabled) {
      status = `Enabled${d.version ? ' \u00B7 v' + esc(d.version) : ''}`;
      actions = `
        <button class="action-btn" onclick="runAction('disable', '${esc(plugin.fullId)}', '${s}')">Disable</button>
        <button class="action-btn danger" onclick="runAction('uninstall', '${esc(plugin.fullId)}', '${s}')">Remove</button>
      `;
    } else if (d.installed && !d.enabled) {
      status = `Disabled${d.version ? ' \u00B7 v' + esc(d.version) : ''}`;
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
  }).join('')}</div>`;
}

function renderDetailComponents(pluginId, comps) {
  const entries = Object.entries(comps).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v > 0
  );
  if (!entries.length) return '<div style="color:var(--text-dim);font-size:12px">No components found</div>';

  return entries.map(([type, items]) => {
    const count = Array.isArray(items) ? items.length : items;
    const names = Array.isArray(items) ? items : [];
    return `<div class="detail-comp-row" onclick="previewComponent('${esc(pluginId)}', '${type}', ${JSON.stringify(names)})">
      <span style="font-size:14px">${COMP_ICONS[type] || ''}</span>
      ${COMP_LABELS[type] || type}
      <span class="count">${count}</span>
    </div>`;
  }).join('');
}

async function previewComponent(pluginId, type, names) {
  const section = document.getElementById('detailPreview');
  const content = document.getElementById('detailPreviewContent');
  if (!section || !content) return;

  section.style.display = 'block';

  const dirMap = { skills: 'skills', commands: 'commands', agents: 'agents' };
  const dir = dirMap[type];

  if (dir && names.length) {
    let html = '';
    for (const name of names) {
      html += `<div class="file-tree-item" onclick="loadFilePreview('${esc(pluginId)}', '${dir}/${name}')">
        <span class="icon">${type === 'skills' ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
        ${esc(name)}
      </div>`;
    }
    content.innerHTML = html;
  } else {
    content.innerHTML = `<div class="code-preview">${esc(type)}: ${names.length || '?'} items</div>`;
  }
}

async function loadFilePreview(pluginId, filePath) {
  const content = document.getElementById('detailPreviewContent');
  if (!content) return;
  content.innerHTML = '<div style="color:var(--text-dim);font-size:12px">Loading...</div>';

  try {
    const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/preview/${filePath}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    if (data.type === 'directory') {
      let html = `<div style="margin-bottom:8px;font-size:11px;color:var(--text-dim)">${esc(filePath)}/</div>`;
      for (const entry of data.entries) {
        const icon = entry.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4';
        const subPath = filePath + '/' + entry.name;
        html += `<div class="file-tree-item" onclick="loadFilePreview('${esc(pluginId)}', '${esc(subPath)}')">
          <span class="icon">${icon}</span>
          ${esc(entry.name)}
        </div>`;
      }
      content.innerHTML = html;
    } else {
      content.innerHTML = `<div style="margin-bottom:8px;font-size:11px;color:var(--text-dim)">${esc(data.name)}</div>
        <div class="code-preview">${esc(data.content)}</div>`;
    }
  } catch {
    content.innerHTML = '<div style="color:var(--error);font-size:12px">Failed to load preview</div>';
  }
}

function closeDetail() {
  selectedPluginId = null;
  updateUrl();
  document.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
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
  toast(`Running ${action}...`, 'info');
  try {
    const res = await fetch(`/api/plugins/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId, scope }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Action failed', 'error');
      return;
    }
    toast(`${action} successful`, 'success');
    await loadData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- URL State ---

function updateUrl() {
  const params = new URLSearchParams();
  if (searchFilter) params.set('q', searchFilter);
  if (!showInstalledOnly) params.set('all', '1');
  if (selectedPluginId) params.set('plugin', selectedPluginId);
  const qs = params.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  history.replaceState(null, '', url);
}

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) {
    searchFilter = params.get('q');
    document.getElementById('searchInput').value = searchFilter;
  }
  if (params.get('all') === '1') {
    showInstalledOnly = false;
  }
  if (params.has('plugin')) {
    selectedPluginId = params.get('plugin');
  }
}

// --- Helpers ---

function toggleChildren(id) {
  const el = document.getElementById('children_' + id);
  const ch = document.getElementById('chev_' + id);
  if (el) {
    const isOpen = el.classList.toggle('open');
    ch?.classList.toggle('expanded', isOpen);
    if (isOpen) expandedNodes.add(id);
    else expandedNodes.delete(id);
  }
}

function findPlugin(id) {
  for (const m of marketplaces) {
    const p = m.plugins.find(p => p.fullId === id);
    if (p) return p;
  }
  return null;
}

function filterPlugins(plugins) {
  let result = plugins;
  if (showInstalledOnly) {
    result = result.filter(p => p.isInstalled);
  }
  if (searchFilter) {
    result = result.filter(p =>
      p.name.toLowerCase().includes(searchFilter) ||
      (p.description || '').toLowerCase().includes(searchFilter)
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

function safeId(str) { return str.replace(/[^a-zA-Z0-9_-]/g, '_'); }

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function shortenPath(p) {
  if (!p) return '';
  const home = '~';
  return p.replace(/\\/g, '/').replace(/^[A-Z]:\//i, '/').replace(/^\/Users\/[^/]+/i, home).replace(/^\/home\/[^/]+/i, home);
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
