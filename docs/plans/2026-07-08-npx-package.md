# cxconfig npx Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish this local Codex config board as an npm package that can run with `npx cxconfig`.

**Architecture:** Keep the existing pnpm monorepo development flow, but add a production CLI entrypoint that starts the Hono API and serves the built React UI from package files. Bundle the server-side TypeScript into one npm binary so consumers do not need the workspace source layout.

**Tech Stack:** TypeScript, React/Vite static build, Hono, Node 22, esbuild, npm package `bin`.

---

### Task 1: Production Server Mode

**Files:**
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/src/cli.ts`

Add optional static UI serving to `createApp` and a production CLI that parses simple flags, creates the app, starts it on loopback, prints the tokenized URL, and optionally opens the browser.

### Task 2: Package Build Metadata

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

Rename the publish package to `cxconfig`, expose a `cxconfig` binary, build the web bundle, bundle the CLI with esbuild, and publish only the compiled CLI, UI assets, README, and package metadata.

### Task 3: README Quick Start

**Files:**
- Modify: `README.md`

Document `npx cxconfig`, CLI flags, npm login/publish flow, and keep local development commands separate from consumer quick start.

### Task 4: Verification

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `npm pack --dry-run`, install/run the packed tarball through `npx --yes ./cxconfig-*.tgz --no-open --api-port <port>`, verify the served page responds, then publish with `npm publish --access public`.
