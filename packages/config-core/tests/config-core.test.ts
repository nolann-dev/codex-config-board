import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import {
  createBackup,
  discoverLayers,
  generatePreview,
  applyFormValuesToToml,
  scanConfigFiles,
  mergeLayers,
  parseTomlLayer,
  toFormValues,
  restoreBackup,
  writeWithPreview,
} from "../src/index";
import { listConfigFields } from "@codex-config-board/codex-schema";

async function tempFixture(name: string) {
  const root = join(tmpdir(), `codex-config-board-${name}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

describe("config core", () => {
  test("parses TOML and reports project-disallowed keys", () => {
    const layer = parseTomlLayer("project", "model = \"gpt-5.5\"\nmodel_provider = \"proxy\"\n");

    expect(layer.ok).toBe(true);
    expect(layer.data).toMatchObject({ model: "gpt-5.5", model_provider: "proxy" });
    expect(layer.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        key: "model_provider",
      }),
    );
  });

  test("returns parse diagnostics for invalid TOML", () => {
    const layer = parseTomlLayer("user", "model = ");

    expect(layer.ok).toBe(false);
    expect(layer.diagnostics[0]).toMatchObject({ severity: "error" });
  });

  test("discovers user, profile, project, and system layers", async () => {
    const fixture = await tempFixture("discover");
    try {
      const codexHome = join(fixture.root, ".codex-home");
      const projectPath = join(fixture.root, "repo");
      await mkdir(join(projectPath, ".codex"), { recursive: true });
      await writeFile(join(codexHome, "config.toml"), "model = \"gpt-5.4\"\n", { flag: "wx" }).catch(async () => {
        await mkdir(codexHome, { recursive: true });
        await writeFile(join(codexHome, "config.toml"), "model = \"gpt-5.4\"\n");
      });
      await writeFile(join(codexHome, "review.config.toml"), "model_reasoning_effort = \"high\"\n");
      await writeFile(join(projectPath, ".codex", "config.toml"), "sandbox_mode = \"workspace-write\"\n");

      const layers = await discoverLayers({ codexHome, projectPath, systemConfigPath: join(fixture.root, "etc.toml") });

      expect(layers.map((layer) => layer.kind)).toEqual(["project", "profile", "user"]);
      expect(layers.find((layer) => layer.kind === "profile")?.name).toBe("review");
    } finally {
      await fixture.cleanup();
    }
  });

  test("scans Codex config files across user, profile, system, and project roots", async () => {
    const fixture = await tempFixture("scan");
    try {
      const codexHome = join(fixture.root, ".codex-home");
      const projectRoot = join(fixture.root, "workspace");
      const nestedProject = join(projectRoot, "packages", "app");
      const systemConfigPath = join(fixture.root, "etc", "codex", "config.toml");
      await mkdir(codexHome, { recursive: true });
      await mkdir(join(nestedProject, ".codex"), { recursive: true });
      await mkdir(join(projectRoot, "node_modules", "ignored", ".codex"), { recursive: true });
      await mkdir(join(fixture.root, "etc", "codex"), { recursive: true });
      await writeFile(join(codexHome, "config.toml"), "model = \"gpt-5.5\"\n");
      await writeFile(join(codexHome, "review.config.toml"), "model_reasoning_effort = \"high\"\n");
      await writeFile(join(nestedProject, ".codex", "config.toml"), "sandbox_mode = \"workspace-write\"\n");
      await writeFile(join(projectRoot, "node_modules", "ignored", ".codex", "config.toml"), "model = \"ignored\"\n");
      await writeFile(systemConfigPath, "web_search = \"cached\"\n");

      const files = await scanConfigFiles({ codexHome, rootPath: projectRoot, systemConfigPath });

      expect(files.map((file) => file.kind)).toEqual(["project", "profile", "user", "system"]);
      expect(files.find((file) => file.kind === "project")).toMatchObject({
        path: join(nestedProject, ".codex", "config.toml"),
        projectPath: nestedProject,
      });
      expect(files.some((file) => file.path.includes("node_modules"))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  test("merges layers with project overriding profile, user, and system", () => {
    const merged = mergeLayers([
      { kind: "system", path: "/etc/codex/config.toml", data: { model: "system", sandbox_mode: "read-only" } },
      { kind: "user", path: "~/.codex/config.toml", data: { model: "user", web_search: "cached" } },
      { kind: "profile", name: "review", path: "~/.codex/review.config.toml", data: { model: "profile" } },
      { kind: "project", path: "/repo/.codex/config.toml", data: { model: "project" } },
    ]);

    expect(merged.values).toMatchObject({
      model: "project",
      sandbox_mode: "read-only",
      web_search: "cached",
    });
    expect(merged.sources.model).toMatchObject({ kind: "project" });
  });

  test("previews diffs and rejects stale writes", async () => {
    const fixture = await tempFixture("write");
    try {
      const targetPath = join(fixture.root, "config.toml");
      const backupDir = join(fixture.root, "backups");
      await writeFile(targetPath, "model = \"old\"\n");

      const preview = await generatePreview({
        targetPath,
        nextText: "model = \"new\"\n",
      });

      expect(preview.ok).toBe(true);
      expect(preview.diff).toContain("-model = \"old\"");
      await expect(
        writeWithPreview({
          targetPath,
          nextText: "model = \"newer\"\n",
          backupDir,
          previewHash: preview.previewHash,
        }),
      ).rejects.toThrow("Preview hash is stale");

      const result = await writeWithPreview({
        targetPath,
        nextText: "model = \"new\"\n",
        backupDir,
        previewHash: preview.previewHash,
      });

      expect(await readFile(targetPath, "utf8")).toBe("model = \"new\"\n");
      expect(result.backupPath).toContain("config.toml.");
    } finally {
      await fixture.cleanup();
    }
  });

  test("creates and restores backups", async () => {
    const fixture = await tempFixture("backup");
    try {
      const targetPath = join(fixture.root, "config.toml");
      const backupDir = join(fixture.root, "backups");
      await writeFile(targetPath, "model = \"before\"\n");

      const backupPath = await createBackup(targetPath, backupDir);
      await writeFile(targetPath, "model = \"after\"\n");
      await restoreBackup({ backupPath, targetPath });

      expect(await readFile(targetPath, "utf8")).toBe("model = \"before\"\n");
    } finally {
      await fixture.cleanup();
    }
  });

  test("converts config into form values for known fields", () => {
    const values = toFormValues(
      {
        model: "gpt-5.5",
        sandbox_mode: "workspace-write",
        features: { shell_snapshot: true },
        custom_future_key: true,
      },
      listConfigFields(),
    );

    expect(values).toMatchObject({
      model: "gpt-5.5",
      sandbox_mode: "workspace-write",
      features: { shell_snapshot: true },
    });
    expect(values).not.toHaveProperty("custom_future_key");
  });

  test("applies form values to TOML while preserving unknown keys and tables", () => {
    const currentText = [
      'model = "gpt-5.4"',
      'custom_future_key = true',
      "",
      "[unknown_table]",
      'value = "keep"',
      "",
    ].join("\n");

    const nextText = applyFormValuesToToml(
      currentText,
      {
        model: "gpt-5.5",
        sandbox_mode: "workspace-write",
        web_search: "",
        project_root_markers: [".git", ".hg"],
        allow_login_shell: false,
        features: { shell_snapshot: true, apps: false },
      },
      listConfigFields(),
    );

    expect(nextText).toContain('model = "gpt-5.5"');
    expect(nextText).toContain('sandbox_mode = "workspace-write"');
    expect(nextText).not.toContain("web_search");
    expect(nextText).toContain('project_root_markers = [ ".git", ".hg" ]');
    expect(nextText).toContain("allow_login_shell = false");
    expect(nextText).toContain("custom_future_key = true");
    expect(nextText).toContain("[unknown_table]");
    expect(nextText).toContain("[features]");
    expect(nextText).toContain("shell_snapshot = true");
    expect(nextText).toContain("apps = false");
  });
});
