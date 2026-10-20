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

**Components**: scanned by `countComponents` in `lib/components.js`, driven by two tables — `DIR_COMPONENTS` (skills `skills/`, commands `commands/`, agents `agents/`) and `JSON_COMPONENTS` (MCP servers `.mcp.json`, hooks `hooks/hooks.json`, LSP servers `.lsp.json`, monitors `monitors/monitors.json`). Mods are the files a hooks file names in its `modules` array, resolved against that file's folder and containment-checked; `modules` is never a hook event. Mods are derived, not declared, so they stay out of `COMPONENT_KEYS`.

Resolution follows the [plugin manifest schema](https://www.schemastore.org/claude-code-plugin-manifest.json): a key is declared by the marketplace entry, else the plugin manifest's top level, else its `experimental` block (the older spelling for `monitors`). A declaration takes an inline value, a `./x.json` path, or an array mixing both, and is **additive** to the conventional file or directory rather than replacing it. Declared paths are containment-checked; the table's own defaults are literals and are not. A component declared inline gets `INLINE_PREFIX` in `_configFiles` so the preview route renders the declared block instead of opening a file.

**Virtual Marketplaces**: User and project customizations shown as synthetic marketplace entries from local filesystem. User customizations also list `skills/synced/<org>_<user>/<name>/` (skills synced from the claude.ai account) as `syncedSkills`; `_syncedSkills` maps each name to its relative path for the preview.

**Built-in plugins** (`<name>@builtin`) ship inside the Claude Code binary; no file and no `claude plugin list` lists them. `lib/builtins.js` spawns the real `claude` binary (never through a shell, so the kill reaches it) with `-p --output-format stream-json --input-format stream-json --verbose`, sends a `reload_plugins` control request, reads the loaded built-ins, commands, agents and MCP servers from the answer and kills the child; no user message, so no model request. The answer names no plugin per command, so each built-in's components come from one more probe with that built-in toggled through `--settings '{"enabledPlugins":{...}}'`: what changes is its own. Built-ins that are only mods (hook modules) show no components, because no answer lists mods. The answer carries each skill's and agent's description (`_descriptions` in the components). No answer carries a plugin's description, so `scanDescriptions` reads it out of the binary: it streams the file in 16 MB chunks and matches the bundle's `{name:N,description:D,...}`, resolving minified variables to their string values (about 0.5 s). Skill bodies are zstd files in Bun's embedded file system, so they are not shown. The probes run one after another in the background after listen, from `os.tmpdir()` (about 1 s each), and the result is cached in `<tmpdir>/claude-code-marketplace/builtins-<hash of config dir>.json`, keyed by the binary's path, size and mtime; `POST /api/refresh` probes again. A disabled built-in is not loaded, so the "Built-in" group adds the `@builtin` keys of user `enabledPlugins`. The CLI can only enable or disable one, and reports success for any `<name>@builtin`, so the plugin routes accept only enable and disable of a listed built-in. An npm `.cmd` shim on Windows has no `.exe` to spawn, so the probe is skipped there. Tests set `CCM_BUILTIN_PROBE_SCRIPT` (a node script run in place of `claude`, `test/fixtures/fake-claude.js`) and `CCM_BUILTIN_CACHE_DIR`.

**Caching**: In-memory marketplace cache invalidated on plugin operations.

## Linting

Biome 2.4.7 — enforced via Husky pre-commit hook on the files in `biome.json` (`public/app.js`, `public/style.css`, `server.js`, `lib/`). Config: 2-space indent, 120 char width, single quotes. The server files are lint-only: the formatter is off for them. `package.json` sets `"type": "commonjs"` so Biome parses `.js` as script and does not flag `'use strict'`.
