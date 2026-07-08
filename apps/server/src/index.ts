import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { serve } from "@hono/node-server";
import open from "open";
import { createApp } from "./app";

const apiPort = Number(process.env.CODEX_CONFIG_BOARD_API_PORT ?? 1455);
const webPort = Number(process.env.CODEX_CONFIG_BOARD_WEB_PORT ?? 5173);
const host = "127.0.0.1";
const token = randomBytes(24).toString("base64url");
const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
const appHome = join(homedir(), ".codex-config-board");
const backupDir = join(appHome, "backups");
const databasePath = join(appHome, "state.json");

const app = createApp({
  token,
  codexHome,
  backupDir,
  databasePath,
});

serve({ fetch: app.fetch, hostname: host, port: apiPort }, () => {
  const webUrl = `http://${host}:${webPort}/?token=${encodeURIComponent(token)}`;
  console.log(`Codex Config Board API: http://${host}:${apiPort}`);
  console.log(`Codex Config Board UI:  ${webUrl}`);
  console.log(`CODEX_HOME: ${codexHome}`);

  if (process.env.CODEX_CONFIG_BOARD_START_WEB !== "0") {
    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@codex-config-board/web",
        "dev",
        "--",
        "--host",
        host,
        "--port",
        String(webPort),
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          VITE_API_BASE_URL: `http://${host}:${apiPort}`,
          VITE_API_TOKEN: token,
        },
      },
    );

    child.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`Web dev server exited with code ${code}`);
      }
    });

    if (process.env.CODEX_CONFIG_BOARD_OPEN === "1") {
      void open(webUrl);
    }
  }
});
