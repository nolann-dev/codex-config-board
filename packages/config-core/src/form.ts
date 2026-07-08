import TOML from "@iarna/toml";
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
  const config = parseConfig(currentText);
  const fieldKeys = new Set(fields.map((field) => field.key));

  for (const [key, value] of Object.entries(formValues)) {
    if (!fieldKeys.has(key)) continue;

    if (isEmptyOptionalValue(value)) {
      delete config[key];
      continue;
    }

    config[key] = value;
  }

  return TOML.stringify(config as never).trimEnd() + "\n";
}

function parseConfig(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  return TOML.parse(text) as Record<string, unknown>;
}

function isEmptyOptionalValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}
