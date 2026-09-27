# Claude Code Marketplace

[![npm version](https://img.shields.io/npm/v/claude-code-marketplace)](https://www.npmjs.com/package/claude-code-marketplace)
[![license](https://img.shields.io/npm/l/claude-code-marketplace)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/claude-code-marketplace)](https://www.npmjs.com/package/claude-code-marketplace)

A local web dashboard to browse, install, and manage [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins from all the marketplaces you use.

**[Documentation](https://nikiforovall.blog/claude-code-marketplace/)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="website/public/shots/themes/ember-marketplace-dark.webp">
  <img alt="Installed plugins grouped by marketplace in the tree, with frontend-design open in the detail panel and its user, project, and local scope rows" src="website/public/shots/themes/ember-marketplace-light.webp">
</picture>

## Getting started

You need Node.js 18 or later, and Claude Code on your `PATH`. The dashboard runs every install, uninstall, enable, disable, and update through the `claude plugin` CLI.

```bash
claude --version
npx claude-code-marketplace --open
```

The server listens on `http://localhost:3542` and reads the plugin registry in `~/.claude/plugins/`. If port 3542 is in use, it takes a free port and prints the address. For project and local scope, pick a project with the folder button in the top bar or <kbd>Shift</kbd>+<kbd>P</kbd>.

To run from a clone:

```bash
npm install
npm start        # start the server
npm run dev      # start the server and open the browser
```

See [Getting started](https://nikiforovall.blog/claude-code-marketplace/getting-started/).

## Features

- **One tree for all marketplaces.** Plugins from GitHub repos, git URLs, and local folders, installed or not. A scope filter shows installed, all, or one scope.
- **Search.** Matches plugin names, descriptions, categories, and tags. A query of three or more characters also matches skill, command, and agent names in every scope. <kbd>↓</kbd>/<kbd>↑</kbd> step through the matches while you type.
- **Scope management.** Install, enable, disable, remove, and update each plugin in user, project, or local scope. The **U**, **P**, and **L** badges in the tree show and toggle the state of each scope.
- **Update alerts.** The tree and the detail panel show when a plugin has a newer catalog version.
- **Component and file preview.** Read the skills, commands, agents, MCP servers, hooks, LSP servers, and monitors of a plugin, with syntax highlighting, before you install it.
- **Marketplace management.** Add, update, and remove marketplace sources from the app.
- **Your own customizations.** The skills, commands, agents, hooks, settings, and `CLAUDE.md` files in your config dir and in the project's `.claude` folder show as two read-only entries.
- **Usage heatmap.** Colors plugins and skills by how often you used them, from `skillUsage` and `pluginUsage` in `.claude.json`.
- **Shareable views.** The URL keeps the search query, scope filter, and selected plugin.
- **Open in your editor.** <kbd>E</kbd> and the **Open in VS Code** buttons open plugin files in `$EDITOR` (default `code`).
- **17 color themes**, each in light and dark.
- **Keyboard-first.** Vim-style tree keys. Press <kbd>?</kbd> for the full list.
- **Installable app (PWA)**, and a tab in [Claude Code Hub](https://nikiforovall.blog/claude-code-marketplace/reference/claude-code-hub/).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="website/public/shots/themes/ember-h1d-hub-marketplace-search-dark.webp">
  <img alt="A search for &quot;review&quot; with the matches highlighted in the tree and the code-review plugin open in the detail panel" src="website/public/shots/themes/ember-h1d-hub-marketplace-search-light.webp">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="website/public/shots/themes/ember-h1b-hub-marketplace-plugin-dark.webp">
  <img alt="The engineering plugin, not installed, with Install buttons for user, project, and local scope and its skills and MCP servers" src="website/public/shots/themes/ember-h1b-hub-marketplace-plugin-light.webp">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="website/public/shots/themes/ember-h1c-hub-marketplace-skill-dark.webp">
  <img alt="The file preview with the skill-creator folder on the left and its SKILL.md open with syntax highlighting" src="website/public/shots/themes/ember-h1c-hub-marketplace-skill-light.webp">
</picture>

## Configuration

| Flag | Env var | Default | What it does |
| --- | --- | --- | --- |
| `--port <n>` | `PORT` | `3542` | Port to listen on. Falls back to a free port if busy. |
| `--dir <path>` | `CLAUDE_CONFIG_DIR`, then `CLAUDE_DIR` | `~/.claude` | Claude config dir to read and write. |
| `--project <path>` | none | current directory | Starting project for project and local scope. |
| `--open` | none | off | Open the browser when the server is ready. |
| `--host <addr>` | `HOST` | `127.0.0.1` | Address to bind. |
| `--allowed-hosts <list>` | `ALLOWED_HOSTS` | empty | Comma-separated extra `Host` names to accept. |

With a custom config dir, the `claude plugin` commands run against that dir, and usage counts come from `<dir>/.claude.json`. The server has no authentication and binds to loopback by default. Bind another address only on a network you trust.

See [Configuration and CLI](https://nikiforovall.blog/claude-code-marketplace/reference/configuration/).

## Documentation

- [Browse and search plugins](https://nikiforovall.blog/claude-code-marketplace/guides/browse-and-search/)
- [Preview plugins and skills](https://nikiforovall.blog/claude-code-marketplace/guides/preview-plugins-and-skills/)
- [Install, enable, and remove plugins](https://nikiforovall.blog/claude-code-marketplace/guides/install-and-manage-plugins/)
- [Add and manage marketplaces](https://nikiforovall.blog/claude-code-marketplace/guides/add-a-marketplace/)
- [Keyboard shortcuts](https://nikiforovall.blog/claude-code-marketplace/reference/keyboard-shortcuts/)
- [Troubleshooting](https://nikiforovall.blog/claude-code-marketplace/reference/troubleshooting/)

## License

MIT
