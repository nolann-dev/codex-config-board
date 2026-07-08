# cxcg

A local web board for inspecting and editing Codex configuration files.

cxcg runs a local API and React UI for managing `config.toml` files used by Codex. It is designed for fast local workflows: scan config files, inspect effective values, edit common fields through forms, keep raw TOML available, and restore from backups when needed.

## Quick Start

Run the app without cloning this repo:

```bash
npx cxcg
```

The command prints a local URL with a generated token:

```text
Codex Config Board: http://127.0.0.1:1455/?token=...
```

Open that URL in your browser. Keep the token in the URL because API requests are token-protected.

Useful CLI options:

```bash
npx cxcg --open
npx cxcg --codex-home ~/.codex
npx cxcg --api-port 1455
npx cxcg --host 127.0.0.1
npx cxcg --no-open
npx cxcg --help
```

The package name is short for Codex config. The primary executable is `cxcg`, and the package also installs a `cxconfig` alias for readability.

```bash
npm install -g cxcg
cxcg
```

The app is local-first and binds to `127.0.0.1` by default.

## Features

- Scan for Codex config files, including user config, profile configs, system config, and project `.codex/config.toml`.
- Inspect loaded config layers and effective merged values.
- Search across board config files, layers, and effective values.
- Edit common Codex settings with form controls backed by TOML output.
- Search fields on the Edit config page.
- Manage TUI settings, status-line items, terminal title items, notifications, theme, and keymap bindings.
- Validate keymap conflicts within a context.
- Preview TOML changes before writing.
- Save with automatic backups.
- View backup history and restore older config versions.
- Keep a raw TOML editor for unknown or future Codex config keys.

## Stack

- TypeScript
- React 19
- Vite
- Radix Themes
- React Hook Form
- Zod
- TanStack Table
- Monaco Editor
- Hono API server
- pnpm workspaces
- Vitest

## Project Layout

```text
apps/
  server/              Local Hono API for config discovery, writes, backups, and restore
  web/                 React UI
packages/
  codex-schema/        Field metadata, descriptions, groups, examples, and risk labels
  config-core/         TOML parsing, merge, scan, preview, backup, restore, and write helpers
  ui/                  Shared UI wrappers
docs/
  plans/               Implementation and migration notes
```

## Requirements

- Node.js 22 or newer
- Codex config files under `~/.codex` or project `.codex/config.toml`

Development also requires pnpm 10.

## Development Install

```bash
pnpm install
```

## Run Locally

```bash
pnpm dev
```

The server prints a URL like:

```text
Codex Config Board UI: http://127.0.0.1:5173/?token=...
```

Open that URL in your browser. Keep the token in the URL because API requests are token-protected.

For the production CLI build:

```bash
pnpm build
pnpm start -- --open
```

## Useful Environment Variables

```bash
CODEX_HOME=/path/to/.codex
CODEX_CONFIG_BOARD_API_PORT=1455
CODEX_CONFIG_BOARD_WEB_PORT=5173
CODEX_CONFIG_BOARD_START_WEB=0
CODEX_CONFIG_BOARD_OPEN=1
```

## Development Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
npm pack --dry-run
```

## Publish

```bash
npm login
pnpm build
npm pack --dry-run
npm publish --access public
```

## Safety Notes

- Writes are limited to Codex config locations such as `CODEX_HOME/config.toml` and project `.codex/config.toml`.
- Every save creates a backup before writing.
- Restore creates another backup before applying the selected old version.
- The UI is intended for local use only. Do not expose the API port publicly.
- Some Codex settings, especially TUI display settings, may require starting a new Codex session before the running CLI reflects file edits. The Codex `/statusline` command can update the active TUI session interactively.

## Current Scope

This is an early local tool. It focuses on common Codex config fields and preserves unknown TOML so future Codex settings are not discarded. The schema package should be updated as Codex adds new documented config options.
