import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createTwoFilesPatch } from "diff";
import TOML from "@iarna/toml";
import { projectDisallowedKeys, validateKnownConfig } from "@codex-config-board/codex-schema";
export { applyFormValuesToToml, toFormValues } from "./form";

export type ConfigLayerKind = "system" | "user" | "profile" | "project";
export type ConfigDiagnostic = {
  severity: "error" | "warning" | "info";
  key?: string;
  message: string;
};
export type ConfigLayer = {
  kind: ConfigLayerKind;
  path: string;
  name?: string;
  data: Record<string, unknown>;
  text?: string;
  diagnostics?: ConfigDiagnostic[];
};

export type ScannedConfigFile = {
  kind: ConfigLayerKind;
  path: string;
  name?: string;
  projectPath?: string;
};

export type ParsedTomlLayer = {
  ok: boolean;
  data: Record<string, unknown>;
  diagnostics: ConfigDiagnostic[];
};

export function parseTomlLayer(kind: ConfigLayerKind, text: string): ParsedTomlLayer {
  try {
    const data = TOML.parse(text) as Record<string, unknown>;
    const diagnostics: ConfigDiagnostic[] = validateKnownConfig(data);

    if (kind === "project") {
      for (const key of Object.keys(data)) {
        if (projectDisallowedKeys.includes(key)) {
          diagnostics.push({
            severity: "warning",
            key,
            message: `${key} is ignored in project .codex/config.toml files by Codex.`,
          });
        }
      }
    }

    return { ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"), data, diagnostics };
  } catch (error) {
    return {
      ok: false,
      data: {},
      diagnostics: [
        {
          severity: "error",
          message: error instanceof Error ? error.message : "Unable to parse TOML.",
        },
      ],
    };
  }
}

export async function discoverLayers(options: {
  codexHome: string;
  projectPath?: string;
  systemConfigPath?: string;
}): Promise<ConfigLayer[]> {
  const layers: ConfigLayer[] = [];
  const systemPath = options.systemConfigPath ?? "/etc/codex/config.toml";
  const userPath = join(options.codexHome, "config.toml");
  const profileFiles = await listProfileFiles(options.codexHome);
  const projectConfigPath = options.projectPath ? join(options.projectPath, ".codex", "config.toml") : undefined;

  if (projectConfigPath) {
    const projectLayer = await readLayerIfExists("project", projectConfigPath);
    if (projectLayer) layers.push(projectLayer);
  }

  for (const profilePath of profileFiles) {
    const profileName = basename(profilePath).replace(/\.config\.toml$/, "");
    const profileLayer = await readLayerIfExists("profile", profilePath, profileName);
    if (profileLayer) layers.push(profileLayer);
  }

  const userLayer = await readLayerIfExists("user", userPath);
  if (userLayer) layers.push(userLayer);

  const systemLayer = await readLayerIfExists("system", systemPath);
  if (systemLayer) layers.push(systemLayer);

  return layers;
}

export function mergeLayers(layers: ConfigLayer[]): {
  values: Record<string, unknown>;
  sources: Record<string, ConfigLayer>;
} {
  const precedence: ConfigLayerKind[] = ["system", "user", "profile", "project"];
  const sorted = [...layers].sort((left, right) => precedence.indexOf(left.kind) - precedence.indexOf(right.kind));
  const values: Record<string, unknown> = {};
  const sources: Record<string, ConfigLayer> = {};

  for (const layer of sorted) {
    for (const [key, value] of Object.entries(layer.data)) {
      values[key] = value;
      sources[key] = layer;
    }
  }

  return { values, sources };
}

export async function scanConfigFiles(options: {
  codexHome: string;
  rootPath?: string;
  systemConfigPath?: string;
  maxDepth?: number;
}): Promise<ScannedConfigFile[]> {
  const files: ScannedConfigFile[] = [];
  const systemPath = options.systemConfigPath ?? "/etc/codex/config.toml";
  const projectRoot = options.rootPath;

  if (projectRoot) {
    for (const path of await findProjectConfigFiles(projectRoot, options.maxDepth ?? 6)) {
      files.push({
        kind: "project",
        path,
        projectPath: dirname(dirname(path)),
      });
    }
  }

  for (const profilePath of await listProfileFiles(options.codexHome)) {
    files.push({
      kind: "profile",
      name: basename(profilePath).replace(/\.config\.toml$/, ""),
      path: profilePath,
    });
  }

  const userPath = join(options.codexHome, "config.toml");
  if (await fileExists(userPath)) {
    files.push({ kind: "user", path: userPath });
  }

  if (await fileExists(systemPath)) {
    files.push({ kind: "system", path: systemPath });
  }

  return files;
}

export async function generatePreview(options: { targetPath: string; nextText: string }): Promise<{
  ok: boolean;
  diff: string;
  previewHash: string;
  diagnostics: ConfigDiagnostic[];
}> {
  const currentText = await readTextIfExists(options.targetPath);
  const parsed = parseTomlLayer("user", options.nextText);
  const diff = createTwoFilesPatch(options.targetPath, options.targetPath, currentText, options.nextText, "current", "next");
  return {
    ok: parsed.ok,
    diff,
    previewHash: hashPreview(options.targetPath, currentText, options.nextText),
    diagnostics: parsed.diagnostics,
  };
}

export async function createBackup(targetPath: string, backupDir: string): Promise<string> {
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `${basename(targetPath)}.${stamp}.bak`);
  await copyFile(targetPath, backupPath);
  return backupPath;
}

export async function writeWithPreview(options: {
  targetPath: string;
  nextText: string;
  backupDir: string;
  previewHash: string;
}): Promise<{ backupPath: string }> {
  const currentText = await readTextIfExists(options.targetPath);
  const expectedHash = hashPreview(options.targetPath, currentText, options.nextText);
  if (expectedHash !== options.previewHash) {
    throw new Error("Preview hash is stale");
  }

  const parsed = parseTomlLayer("user", options.nextText);
  if (!parsed.ok) {
    throw new Error("Cannot write invalid TOML");
  }

  await mkdir(dirname(options.targetPath), { recursive: true });
  const backupPath = await createBackup(options.targetPath, options.backupDir);
  const tempPath = `${options.targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, options.nextText, "utf8");
  await rename(tempPath, options.targetPath);
  return { backupPath };
}

export async function restoreBackup(options: { backupPath: string; targetPath: string }): Promise<void> {
  await mkdir(dirname(options.targetPath), { recursive: true });
  await copyFile(options.backupPath, options.targetPath);
}

async function listProfileFiles(codexHome: string): Promise<string[]> {
  try {
    const entries = await readdir(codexHome);
    return entries
      .filter((entry) => entry.endsWith(".config.toml") && entry !== "config.toml")
      .sort()
      .map((entry) => join(codexHome, entry));
  } catch {
    return [];
  }
}

async function findProjectConfigFiles(rootPath: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];
  const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo"]);

  async function walk(currentPath: string, depth: number) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isDirectory() && entry.name === ".codex")) {
      const configPath = join(currentPath, ".codex", "config.toml");
      if (await fileExists(configPath)) {
        results.push(configPath);
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ignoredDirectories.has(entry.name)) continue;
      await walk(join(currentPath, entry.name), depth + 1);
    }
  }

  await walk(rootPath, 0);
  return results.sort();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readLayerIfExists(
  kind: ConfigLayerKind,
  path: string,
  name?: string,
): Promise<ConfigLayer | undefined> {
  try {
    await access(path, constants.R_OK);
    const text = await readFile(path, "utf8");
    const parsed = parseTomlLayer(kind, text);
    return { kind, path, name, data: parsed.data, text, diagnostics: parsed.diagnostics };
  } catch {
    return undefined;
  }
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function hashPreview(targetPath: string, currentText: string, nextText: string): string {
  return createHash("sha256").update(targetPath).update("\0").update(currentText).update("\0").update(nextText).digest("hex");
}
