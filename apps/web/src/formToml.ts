import type { ConfigFieldDefinition } from "@codex-config-board/codex-schema";

export type FormValues = Record<string, unknown>;

export function toFormValues(config: Record<string, unknown>, fields: ConfigFieldDefinition[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(config, field.key)) {
      values[field.key] = config[field.key];
    }
  }
  return values;
}

export function applyFormValuesToToml(
  currentText: string,
  formValues: FormValues,
  fields: ConfigFieldDefinition[],
): string {
  const knownKeys = new Set(fields.map((field) => field.key));
  const remaining = stripKnownFields(currentText, knownKeys);
  const serialized = fields
    .map((field) => serializeField(field, formValues[field.key]))
    .filter(Boolean)
    .join("\n");

  return [serialized, remaining].filter((part) => part.trim()).join("\n\n").trimEnd() + "\n";
}

function stripKnownFields(text: string, knownKeys: Set<string>): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const tableMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    const keyMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);

    if (tableMatch && knownKeys.has(tableMatch[1].split(".")[0])) {
      index += 1;
      while (index < lines.length && !/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
        index += 1;
      }
      index -= 1;
      continue;
    }

    if (keyMatch && knownKeys.has(keyMatch[1])) {
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}

function serializeField(field: ConfigFieldDefinition, value: unknown): string {
  if (isEmpty(value)) return "";

  if (field.inputKind === "key-value-table" || field.inputKind === "boolean-table") {
    if (!isPlainObject(value) || Object.keys(value).length === 0) return "";
    return serializeTable([field.key], value);
  }

  return `${field.key} = ${serializeValue(value)}`;
}

function serializeTable(path: string[], value: Record<string, unknown>): string {
  const scalarLines: string[] = [];
  const nestedTables: string[] = [];

  for (const [key, tableValue] of Object.entries(value)) {
    if (isEmpty(tableValue)) continue;
    if (isPlainObject(tableValue)) {
      nestedTables.push(serializeTable([...path, key], tableValue));
    } else {
      scalarLines.push(`${serializeKey(key)} = ${serializeValue(tableValue)}`);
    }
  }

  const currentTable = scalarLines.length > 0 ? [`[${path.map(serializeKey).join(".")}]`, ...scalarLines].join("\n") : "";
  return [currentTable, ...nestedTables].filter((part) => part.trim()).join("\n\n");
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[ ${value.map((item) => serializeValue(item)).join(", ")} ]`;
  if (isPlainObject(value)) {
    return `{ ${Object.entries(value).map(([key, item]) => `${serializeKey(key)} = ${serializeValue(item)}`).join(", ")} }`;
  }
  return JSON.stringify(String(value));
}

function serializeKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
