import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type BackupRecord = {
  id: number;
  targetPath: string;
  backupPath: string;
  createdAt: string;
};

export type Storage = {
  rememberProject(projectPath: string): void;
  recordBackup(input: { targetPath: string; backupPath: string }): void;
  listBackups(): BackupRecord[];
};

type StorageState = {
  recentProjects: Record<string, { lastOpenedAt: string }>;
  backups: BackupRecord[];
  nextBackupId: number;
};

export function createStorage(databasePath: string): Storage {
  let state = readState(databasePath);

  function save() {
    if (databasePath === ":memory:") return;
    mkdirSync(dirname(databasePath), { recursive: true });
    const tempPath = `${databasePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(tempPath, databasePath);
  }

  return {
    rememberProject(projectPath: string) {
      state.recentProjects[projectPath] = { lastOpenedAt: new Date().toISOString() };
      save();
    },

    recordBackup(input: { targetPath: string; backupPath: string }) {
      state.backups.unshift({
        id: state.nextBackupId,
        targetPath: input.targetPath,
        backupPath: input.backupPath,
        createdAt: new Date().toISOString(),
      });
      state.nextBackupId += 1;
      save();
    },

    listBackups(): BackupRecord[] {
      return [...state.backups].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

function readState(databasePath: string): StorageState {
  if (databasePath === ":memory:") {
    return emptyState();
  }

  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  if (!existsSync(databasePath)) {
    return emptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(databasePath, "utf8")) as Partial<StorageState>;
    const backups = Array.isArray(parsed.backups) ? parsed.backups.filter(isBackupRecord) : [];
    const maxBackupId = backups.reduce((maxId, backup) => Math.max(maxId, backup.id), 0);
    return {
      recentProjects: isRecord(parsed.recentProjects) ? normalizeRecentProjects(parsed.recentProjects) : {},
      backups,
      nextBackupId: Math.max(Number(parsed.nextBackupId) || 1, maxBackupId + 1),
    };
  } catch {
    return emptyState();
  }
}

function emptyState(): StorageState {
  return {
    recentProjects: {},
    backups: [],
    nextBackupId: 1,
  };
}

function normalizeRecentProjects(input: Record<string, unknown>): StorageState["recentProjects"] {
  const output: StorageState["recentProjects"] = {};
  for (const [path, value] of Object.entries(input)) {
    const record = isRecord(value) ? value : {};
    output[path] = { lastOpenedAt: typeof record.lastOpenedAt === "string" ? record.lastOpenedAt : new Date().toISOString() };
  }
  return output;
}

function isBackupRecord(value: unknown): value is BackupRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.targetPath === "string" &&
    typeof value.backupPath === "string" &&
    typeof value.createdAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
