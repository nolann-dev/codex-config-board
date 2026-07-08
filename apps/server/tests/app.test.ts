import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/app";

async function fixture(name: string) {
  const root = join(tmpdir(), `codex-config-board-server-${name}-${Date.now()}`);
  const codexHome = join(root, "codex-home");
  const projectPath = join(root, "project");
  const backupDir = join(root, "backups");
  const databasePath = join(root, "state.sqlite");
  await mkdir(join(projectPath, ".codex"), { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, "config.toml"), "model = \"gpt-5.4\"\n");
  await writeFile(join(projectPath, ".codex", "config.toml"), "sandbox_mode = \"workspace-write\"\n");

  return {
    root,
    codexHome,
    projectPath,
    backupDir,
    databasePath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

describe("server app", () => {
  test("requires a loopback token for API routes", async () => {
    const app = createApp({
      token: "secret",
      codexHome: "/tmp/missing",
      backupDir: "/tmp/backups",
      databasePath: ":memory:",
    });

    const response = await app.request("/api/session");

    expect(response.status).toBe(401);
  });

  test("returns layer and effective config data for an authorized request", async () => {
    const state = await fixture("layers");
    try {
      const app = createApp({
        token: "secret",
        codexHome: state.codexHome,
        backupDir: state.backupDir,
        databasePath: state.databasePath,
      });

      const layers = await app.request(`/api/config/layers?projectPath=${encodeURIComponent(state.projectPath)}`, {
        headers: { Authorization: "Bearer secret" },
      });
      const effective = await app.request(`/api/config/effective?projectPath=${encodeURIComponent(state.projectPath)}`, {
        headers: { Authorization: "Bearer secret" },
      });

      expect(layers.status).toBe(200);
      expect((await layers.json()).layers.map((layer: { kind: string }) => layer.kind)).toEqual(["project", "user"]);
      expect((await effective.json()).values).toMatchObject({
        model: "gpt-5.4",
        sandbox_mode: "workspace-write",
      });
    } finally {
      await state.cleanup();
    }
  });

  test("scans config files for an authorized root path", async () => {
    const state = await fixture("scan");
    try {
      const app = createApp({
        token: "secret",
        codexHome: state.codexHome,
        backupDir: state.backupDir,
        databasePath: state.databasePath,
      });

      const response = await app.request(`/api/config/scan?rootPath=${encodeURIComponent(state.projectPath)}`, {
        headers: { Authorization: "Bearer secret" },
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "project", projectPath: state.projectPath }),
          expect.objectContaining({ kind: "user", path: join(state.codexHome, "config.toml") }),
        ]),
      );
    } finally {
      await state.cleanup();
    }
  });

  test("allows token-protected API requests from any loopback web dev port", async () => {
    const state = await fixture("cors");
    try {
      const app = createApp({
        token: "secret",
        codexHome: state.codexHome,
        backupDir: state.backupDir,
        databasePath: state.databasePath,
      });

      const response = await app.request("/api/config/scan", {
        method: "OPTIONS",
        headers: {
          Origin: "http://127.0.0.1:5178",
          "Access-Control-Request-Headers": "authorization",
          "Access-Control-Request-Method": "GET",
        },
      });

      expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5178");
      expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    } finally {
      await state.cleanup();
    }
  });


  test("previews and writes config only with a matching preview hash", async () => {
    const state = await fixture("write");
    try {
      const targetPath = join(state.codexHome, "config.toml");
      const app = createApp({
        token: "secret",
        codexHome: state.codexHome,
        backupDir: state.backupDir,
        databasePath: state.databasePath,
      });

      const preview = await app.request("/api/config/preview", {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, nextText: "model = \"gpt-5.5\"\n" }),
      });
      const previewJson = await preview.json();

      expect(preview.status).toBe(200);
      expect(previewJson.ok).toBe(true);
      expect(previewJson.diff).toContain("-model = \"gpt-5.4\"");

      const rejected = await app.request("/api/config/write", {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, nextText: "model = \"gpt-5.6\"\n", previewHash: previewJson.previewHash }),
      });

      expect(rejected.status).toBe(409);

      const written = await app.request("/api/config/write", {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, nextText: "model = \"gpt-5.5\"\n", previewHash: previewJson.previewHash }),
      });

      expect(written.status).toBe(200);
      expect(await readFile(targetPath, "utf8")).toBe("model = \"gpt-5.5\"\n");
      expect((await written.json()).backupPath).toContain("config.toml.");
    } finally {
      await state.cleanup();
    }
  });

  test("restores a backup and records the pre-restore config as a new backup", async () => {
    const state = await fixture("restore");
    try {
      const targetPath = join(state.codexHome, "config.toml");
      const app = createApp({
        token: "secret",
        codexHome: state.codexHome,
        backupDir: state.backupDir,
        databasePath: state.databasePath,
      });

      const preview = await app.request("/api/config/preview", {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, nextText: "model = \"gpt-5.5\"\n" }),
      });
      const previewJson = await preview.json();
      const written = await app.request("/api/config/write", {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, nextText: "model = \"gpt-5.5\"\n", previewHash: previewJson.previewHash }),
      });
      const originalBackupPath = (await written.json()).backupPath;

      const restored = await app.request("/api/backups/restore", {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, backupPath: originalBackupPath }),
      });
      const restoredJson = await restored.json();
      const backups = await app.request("/api/backups", {
        headers: { Authorization: "Bearer secret" },
      });
      const backupsJson = await backups.json();

      expect(restored.status).toBe(200);
      expect(restoredJson.backupPath).toContain("config.toml.");
      expect(await readFile(targetPath, "utf8")).toBe("model = \"gpt-5.4\"\n");
      expect(backupsJson.backups).toHaveLength(2);
      expect(backupsJson.backups[0].backupPath).toBe(restoredJson.backupPath);
    } finally {
      await state.cleanup();
    }
  });
});
