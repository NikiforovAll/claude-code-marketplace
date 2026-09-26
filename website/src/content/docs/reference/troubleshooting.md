---
title: Troubleshooting
description: Find the cause and the fix for common errors and symptoms in Claude Code Marketplace.
---

Find the message or symptom you see, then apply the fix.

## The tree says "No marketplaces found"

Claude Code Marketplace reads the marketplace registry from `<config dir>/plugins/known_marketplaces.json`. If that file does not exist or is not valid JSON, the tree is empty. If the file has no entries, the tree still shows your user and project customizations, when you have them.

- Check that you use the correct config dir. The server takes it from `--dir`, then `CLAUDE_CONFIG_DIR`, then `CLAUDE_DIR`, then `~/.claude`. If Claude Code uses a different dir, start the server with `--dir <path>`.
- If the file is missing, add a marketplace. See [Add and manage marketplaces](/claude-code-marketplace/guides/add-a-marketplace/).

## The tree says "Failed to load: <message>"

The page could not get the marketplace data from the server. The server may have stopped, or it may run on a different port now. Check the terminal where you started it, read the real address from the startup line, and reload the page. See [The server runs on a port you did not expect](#the-server-runs-on-a-port-you-did-not-expect).

## A marketplace shows no plugins

Each marketplace lists its plugins from `<installLocation>/.claude-plugin/marketplace.json`. If that file is missing or is not valid JSON, the marketplace has no plugins, and the `/api/marketplaces` response carries the error `marketplace.json not found at <path>`.

With the default Installed filter, a marketplace with no plugins does not show in the tree. Set the scope filter to All to see it.

To fix it, update the marketplace from its info panel (the **Marketplace info** button on the marketplace row, then **Update**). If the source has no `.claude-plugin/marketplace.json`, it is not a valid marketplace. Remove it and add the correct source.

## Install, enable, or remove fails

Every plugin and marketplace action runs the `claude plugin` CLI. The server runs it without a shell, with the current project as the working directory, and stops it after 30 seconds.

- `Command not found on PATH: claude` means the server cannot find Claude Code. Install Claude Code, check that `claude --version` works in the same terminal, then start the server again from that terminal.
- `Command terminated by <signal>` means the CLI did not finish in 30 seconds. This can happen when a large marketplace clones or updates over a slow network. Run the same command in a terminal, for example `claude plugin install <name@marketplace> --scope user`, to see the full output. Then press <kbd>R</kbd>.
- Any other error toast shows the message from the CLI. Fix the cause it names, then try again.

## "Invalid source: expected owner/repo, a git URL, or an existing directory"

The source does not match an accepted form. The most common cause is the `github:` prefix that the field placeholder shows. Remove it and type `owner/repo`, for example `anthropics/skills`. For the full list of accepted sources, see [Accepted sources](/claude-code-marketplace/guides/add-a-marketplace/#accepted-sources).

## A warning appears after you add a marketplace

The CLI names a marketplace from the `marketplace.json` in its source. After an add, Claude Code Marketplace compares the registry before and after.

- `"<name>" already existed and now points at <to> (was <from>)` means the new source declares a name that is already registered. The CLI changed the existing entry to point at the new source. To keep both, give one source a different name in its `marketplace.json`. To go back, add the old source again.
- `Registry unchanged: <config dir>` means the add did not change the registry. The CLI message above it tells you why, for example that the marketplace is already on disk. If you expected a change, check that the config dir in the message is the one Claude Code uses. See [Configuration and CLI](/claude-code-marketplace/reference/configuration/).

## A project or local install does not show

Project and local installs count only for the project they were installed in. If the current project is a different directory, the P and L badges show "not installed".

Open the project picker with the folder button in the top bar or <kbd>Shift+P</kbd>, and select the project you installed into. The path must be an existing directory, or you get `Directory does not exist`. See [Install, enable, and remove plugins](/claude-code-marketplace/guides/install-and-manage-plugins/).

## Component items are disabled in the detail panel

The plugin was never fetched, so it has no local directory. The panel shows the components that the marketplace or the plugin manifest declares, but it has no files to open.

Install the plugin in any scope to fetch its files, then open the items again. See [Preview plugins and skills](/claude-code-marketplace/guides/preview-plugins-and-skills/).

## "Editor not found on PATH"

<kbd>E</kbd> and the Open in VS Code buttons start the editor in the `EDITOR` environment variable. If `EDITOR` is not set, the server uses `code`. The error means that command is not on PATH.

- Install the `code` command from VS Code, or
- Set `EDITOR` to an editor on your PATH, for example `EDITOR=cursor`, and start the server again.

## A 403 page says "unrecognized Host header"

The server answers only requests addressed to a loopback name such as `localhost` or `127.0.0.1`. This blocks DNS rebinding. A request with any other `Host` header gets this 403 page.

To reach the server by another name, start it with the bind address and the name to accept:

```bash
npx claude-code-marketplace --host 0.0.0.0 --allowed-hosts=<your-hostname>
```

You can also set the `HOST` and `ALLOWED_HOSTS` environment variables. The server has no authentication, so do this only on a network you trust.

## The server runs on a port you did not expect

The default port is 3542. You can change it with `--port` or the `PORT` environment variable. If the port is in use, the server logs `Port <n> in use, trying random port...` and listens on a random free port.

Read the startup line for the real address:

```text
Claude Code Marketplace running at http://localhost:<port>
```

With `--open`, the browser opens at the real port.

## The data is out of date

The server keeps marketplace data in memory. It clears that cache after each action from the UI and after a project switch. It does not see changes that you make outside the UI, for example with `claude plugin` in a terminal.

Press <kbd>R</kbd> or click Refresh in the top bar. The toast `Data refreshed` confirms the reload.
