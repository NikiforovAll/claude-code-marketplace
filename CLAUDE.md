## Project

Claude Code Marketplace — a web dashboard for browsing, installing, and managing Claude Code plugins across multiple marketplaces. Vanilla JS SPA frontend + Express.js backend.

## Commands

```bash
npm start                # Start server at http://localhost:3457
npm run dev              # Start with auto-open browser
npm run lint             # Check with Biome
npm run lint:fix         # Auto-fix linting issues
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

**Components**: Skills (`skills/`), commands (`commands/`), agents (`agents/`), MCP servers (`.mcp.json`), hooks (`hooks.json`), LSP servers (`.lsp.json`).

**Virtual Marketplaces**: User and project customizations shown as synthetic marketplace entries from local filesystem.

**Caching**: In-memory marketplace cache invalidated on plugin operations.

## Linting

Biome 2.4.7 — enforced via Husky pre-commit hook on `public/app.js` and `public/style.css`. Config: 2-space indent, 120 char width, single quotes.
