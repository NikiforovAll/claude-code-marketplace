# Claude Code Marketplace

A web-based dashboard for browsing, installing, and managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins across multiple marketplaces.

![marketplace-screenshot](https://img.shields.io/badge/status-alpha-orange)

## Features

- **Multi-marketplace browser** — aggregate plugins from GitHub repos, git URLs, and local directories
- **Scope management** — install, enable, and disable plugins per scope (user / project / local)
- **Component inspection** — browse skills, commands, agents, MCP servers, hooks, and LSP servers inside each plugin
- **File preview** — read plugin source files directly in the browser
- **Marketplace actions** — add, update, and remove marketplace sources
- **PWA support** — installable as a standalone desktop app with offline caching
- **Dark / light theme** — styled with IBM Plex Mono, orange accent palette

## Quick Start

```bash
npm install
npm start
# opens http://localhost:3457
```

Or with auto-open:

```bash
npm run dev
```

### Options

```
--port <number>   Custom port (default: 3457)
--project <path>  Project directory for project-scoped plugins
--open            Open browser on start
```

## How It Works

The server reads `~/.claude/plugins/` to discover installed marketplaces and plugin registries. Each marketplace points to a directory containing a `.claude-plugin/marketplace.json` manifest listing available plugins.

The UI renders a tree of marketplaces with their plugins. Clicking a plugin opens its detail panel showing description, version, scope installation matrix, and filesystem-based component breakdown.

All plugin management operations (install, uninstall, enable, disable) delegate to `claude plugin` CLI commands.

## Tech Stack

- **Frontend** — vanilla JS single-page app, no framework dependencies
- **Backend** — Express.js serving static files + REST API
- **Styling** — CSS custom properties with dark/light theme support
- **Icons** — inline SVG (Feather-style, 24x24 viewBox)
- **Linter** — Biome with husky pre-commit hook

## Development

```bash
npm run lint        # check with biome
npm run lint:fix    # auto-fix
```

## License

MIT
