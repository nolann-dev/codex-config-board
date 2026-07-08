#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import open from "open";

type CliOptions = {
  apiPort: number;
  codexHome: string;
  host: string;
  openBrowser: boolean;
  showHelp: boolean;
  showVersion: boolean;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticRoot = join(packageRoot, "apps", "web", "dist");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.showHelp) {
    printHelp();
    return;
  }
  if (options.showVersion) {
    console.log(await readVersion());
    return;
  }

  await assertStaticBuildExists();

  const token = randomBytes(24).toString("base64url");
  const appHome = join(homedir(), ".codex-config-board");
  const backupDir = join(appHome, "backups");
  const databasePath = join(appHome, "state.sqlite");
  const { createApp } = await import("./app");
  const app = createApp({
    token,
    codexHome: options.codexHome,
    backupDir,
    databasePath,
    staticRoot,
  });

  const server = serve({ fetch: app.fetch, hostname: options.host, port: options.apiPort }, () => {
    const webUrl = `http://${options.host}:${options.apiPort}/?token=${encodeURIComponent(token)}`;
    console.log(`Codex Config Board: ${webUrl}`);
    console.log(`CODEX_HOME: ${options.codexHome}`);
    console.log("Press Ctrl+C to stop.");

    if (options.openBrowser) {
      void open(webUrl);
    }
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    apiPort: Number(process.env.CODEX_CONFIG_BOARD_API_PORT ?? 1455),
    codexHome: process.env.CODEX_HOME ?? join(homedir(), ".codex"),
    host: process.env.CODEX_CONFIG_BOARD_HOST ?? "127.0.0.1",
    openBrowser: process.env.CODEX_CONFIG_BOARD_OPEN === "1",
    showHelp: false,
    showVersion: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--api-port":
      case "-p":
        options.apiPort = parsePort(readValue(args, index, arg), arg);
        index += 1;
        break;
      case "--codex-home":
        options.codexHome = resolve(readValue(args, index, arg));
        index += 1;
        break;
      case "--host":
        options.host = readValue(args, index, arg);
        index += 1;
        break;
      case "--open":
        options.openBrowser = true;
        break;
      case "--no-open":
        options.openBrowser = false;
        break;
      case "--help":
      case "-h":
        options.showHelp = true;
        break;
      case "--version":
      case "-v":
        options.showVersion = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePort(value: string, flag: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${flag} must be a port between 1 and 65535`);
  }
  return port;
}

async function assertStaticBuildExists() {
  try {
    await access(join(staticRoot, "index.html"));
  } catch {
    throw new Error(`Web build not found at ${staticRoot}. Run pnpm build before starting the packaged CLI.`);
  }
}

async function readVersion(): Promise<string> {
  try {
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp() {
  console.log(`cxconfig

Run Codex Config Board locally.

Usage:
  cxconfig [options]

Options:
  -p, --api-port <port>   API and UI port. Defaults to 1455.
      --codex-home <dir>  Codex home directory. Defaults to ~/.codex.
      --host <host>       Host to bind. Defaults to 127.0.0.1.
      --open              Open the browser after startup.
      --no-open           Do not open the browser.
  -v, --version           Print version.
  -h, --help              Print help.
`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unable to start cxconfig";
  console.error(`cxconfig: ${message}`);
  process.exit(1);
});
