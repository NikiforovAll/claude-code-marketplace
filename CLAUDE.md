## Project

Claude Code Marketplace — a web dashboard for browsing, installing, and managing Claude Code plugins across multiple marketplaces. Vanilla JS SPA frontend + Express.js backend.

## Commands

```bash
npm start                # Start server at http://localhost:3542
npm run dev              # Start with auto-open browser
npm run lint             # Check with Biome
npm run lint:fix         # Auto-fix linting issues
npm test                 # node --test test/*.test.js
```

CLI flags: `--port <number>`, `--project <path>`, `--open`

## Architecture

**Two main files** compose the entire app:

- **`server.js`** — Express backend. Reads plugin registry from `~/.claude/plugins/`, scans filesystem for components, delegates install/uninstall/enable/disable to `claude plugin` CLI commands. All API routes under `/api/`.
- **`public/app.js`** — SPA client. Tree view (left panel) shows marketplaces→plugins hierarchy. Detail panel (right) shows plugin info, components, file browser. State managed via globals (`marketplaces`, `selectedPluginId`, `searchFilter`, `scopeFilter`).
- **`public/style.css`** — Dark/light theme via CSS custom properties.
- **`public/index.html`** — HTML shell with modals.

No build step. No framework. Static files served directly by Express.

## Key Concepts

**Plugin Scopes**: user (`~/.claude/plugins/`), project (`./<project>/.claude/`), local (`.claude/settings.local.json`). Each scope has independent install/enable state.

**Components**: scanned by `countComponents` in `lib/components.js`, driven by two tables — `DIR_COMPONENTS` (skills `skills/`, commands `commands/`, agents `agents/`) and `JSON_COMPONENTS` (MCP servers `.mcp.json`, hooks `hooks/hooks.json`, LSP servers `.lsp.json`, monitors `monitors/monitors.json`).

Resolution follows the [plugin manifest schema](https://www.schemastore.org/claude-code-plugin-manifest.json): a key is declared by the marketplace entry, else the plugin manifest's top level, else its `experimental` block (the older spelling for `monitors`). A declaration takes an inline value, a `./x.json` path, or an array mixing both, and is **additive** to the conventional file or directory rather than replacing it. Declared paths are containment-checked; the table's own defaults are literals and are not. A component declared inline gets `INLINE_PREFIX` in `_configFiles` so the preview route renders the declared block instead of opening a file.

**Virtual Marketplaces**: User and project customizations shown as synthetic marketplace entries from local filesystem.

**Caching**: In-memory marketplace cache invalidated on plugin operations.

## Linting

Biome 2.4.7 — enforced via Husky pre-commit hook on `public/app.js` and `public/style.css`. Config: 2-space indent, 120 char width, single quotes.
