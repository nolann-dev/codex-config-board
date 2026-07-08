import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createBackup,
  discoverLayers,
  generatePreview,
  mergeLayers,
  restoreBackup,
  scanConfigFiles,
  writeWithPreview,
} from "@codex-config-board/config-core";
import { createStorage } from "./storage";

export type AppOptions = {
  token: string;
  codexHome: string;
  backupDir: string;
  databasePath: string;
  systemConfigPath?: string;
  defaultScanRoot?: string;
  staticRoot?: string;
};

type PreviewBody = {
  targetPath: string;
  nextText: string;
};

type WriteBody = PreviewBody & {
  previewHash: string;
};

type RestoreBody = {
  backupPath: string;
  targetPath: string;
};

export function createApp(options: AppOptions) {
  const app = new Hono();
  const storage = createStorage(options.databasePath);

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (isLoopbackOrigin(origin) ? origin : undefined),
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.use("/api/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      await next();
      return;
    }
    const authorization = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
    if (bearerToken !== options.token && queryToken !== options.token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  app.get("/api/session", (c) =>
    c.json({
      codexHome: options.codexHome,
      backupDir: options.backupDir,
      tokenRequired: true,
    }),
  );

  app.get("/api/config/layers", async (c) => {
    const projectPath = c.req.query("projectPath");
    if (projectPath) storage.rememberProject(projectPath);
    const layers = await discoverLayers({
      codexHome: options.codexHome,
      projectPath,
      systemConfigPath: options.systemConfigPath,
    });
    return c.json({ layers });
  });

  app.get("/api/config/effective", async (c) => {
    const projectPath = c.req.query("projectPath");
    if (projectPath) storage.rememberProject(projectPath);
    const layers = await discoverLayers({
      codexHome: options.codexHome,
      projectPath,
      systemConfigPath: options.systemConfigPath,
    });
    return c.json(mergeLayers(layers));
  });

  app.get("/api/config/scan", async (c) => {
    const rootPath = c.req.query("rootPath") || options.defaultScanRoot || process.cwd();
    if (rootPath) storage.rememberProject(rootPath);
    const files = await scanConfigFiles({
      codexHome: options.codexHome,
      rootPath,
      systemConfigPath: options.systemConfigPath,
    });
    return c.json({ files });
  });

  app.post("/api/config/preview", async (c) => {
    const body = await c.req.json<PreviewBody>();
    if (!isAllowedTarget(body.targetPath, options.codexHome)) {
      return c.json({ error: "Target path is outside allowed Codex config locations" }, 403);
    }
    const preview = await generatePreview(body);
    return c.json(preview);
  });

  app.post("/api/config/write", async (c) => {
    const body = await c.req.json<WriteBody>();
    if (!isAllowedTarget(body.targetPath, options.codexHome)) {
      return c.json({ error: "Target path is outside allowed Codex config locations" }, 403);
    }
    try {
      const result = await writeWithPreview({
        targetPath: body.targetPath,
        nextText: body.nextText,
        previewHash: body.previewHash,
        backupDir: options.backupDir,
      });
      storage.recordBackup({ targetPath: body.targetPath, backupPath: result.backupPath });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to write config";
      const status = message.includes("stale") ? 409 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.get("/api/backups", (c) => c.json({ backups: storage.listBackups() }));

  app.post("/api/backups/restore", async (c) => {
    const body = await c.req.json<RestoreBody>();
    if (!isAllowedTarget(body.targetPath, options.codexHome)) {
      return c.json({ error: "Target path is outside allowed Codex config locations" }, 403);
    }
    const backupPath = await createBackup(body.targetPath, options.backupDir);
    storage.recordBackup({ targetPath: body.targetPath, backupPath });
    await restoreBackup(body);
    return c.json({ ok: true, backupPath });
  });

  const staticRoot = options.staticRoot;
  if (staticRoot) {
    app.get("*", async (c) => {
      const url = new URL(c.req.url);
      if (url.pathname.startsWith("/api/")) {
        return c.notFound();
      }

      const filePath = resolveStaticPath(staticRoot, url.pathname);
      if (!filePath) {
        return c.notFound();
      }

      try {
        const bytes = await readFile(filePath);
        return c.body(bytes, 200, { "Content-Type": contentTypeFor(filePath) });
      } catch {
        const indexPath = join(staticRoot, "index.html");
        const bytes = await readFile(indexPath);
        return c.body(bytes, 200, { "Content-Type": "text/html; charset=utf-8" });
      }
    });
  }

  return app;
}

function resolveStaticPath(staticRoot: string, pathname: string): string | undefined {
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..") || isAbsolute(normalized)) {
    return undefined;
  }
  return join(staticRoot, normalized);
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".wasm":
      return "application/wasm";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

function isAllowedTarget(targetPath: string, codexHome: string): boolean {
  return targetPath.startsWith(codexHome) || targetPath.endsWith("/.codex/config.toml");
}
