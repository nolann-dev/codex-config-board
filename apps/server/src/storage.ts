import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...values: unknown[]): void;
      all(): unknown[];
    };
  };
};

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

export function createStorage(databasePath: string): Storage {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS recent_projects (
      path TEXT PRIMARY KEY,
      last_opened_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_path TEXT NOT NULL,
      backup_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  return {
    rememberProject(projectPath: string) {
      db.prepare(
        `INSERT INTO recent_projects (path, last_opened_at)
         VALUES (?, ?)
         ON CONFLICT(path) DO UPDATE SET last_opened_at = excluded.last_opened_at`,
      ).run(projectPath, new Date().toISOString());
    },

    recordBackup(input: { targetPath: string; backupPath: string }) {
      db.prepare(
        `INSERT INTO backups (target_path, backup_path, created_at)
         VALUES (?, ?, ?)`,
      ).run(input.targetPath, input.backupPath, new Date().toISOString());
    },

    listBackups(): BackupRecord[] {
      return db
        .prepare(`SELECT id, target_path, backup_path, created_at FROM backups ORDER BY created_at DESC`)
        .all()
        .map((row) => {
          const record = row as Record<string, unknown>;
          return {
            id: Number(record.id),
            targetPath: String(record.target_path),
            backupPath: String(record.backup_path),
            createdAt: String(record.created_at),
          };
        });
    },
  };
}
