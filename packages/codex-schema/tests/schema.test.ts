import { describe, expect, test } from "vitest";
import {
  getConfigField,
  getConfigEntry,
  listConfigFields,
  listConfigGroups,
  listConfigEntries,
  projectDisallowedKeys,
  validateKnownConfig,
} from "../src/index";

describe("codex schema registry", () => {
  test("lists common Codex config keys with risk metadata", () => {
    const entries = listConfigEntries();

    expect(entries.map((entry) => entry.key)).toContain("sandbox_mode");
    expect(getConfigEntry("sandbox_mode")).toMatchObject({
      type: "enum",
      risk: "high",
      uiGroup: "Security",
    });
  });

  test("exposes docs-aligned form metadata for common fields", () => {
    const fields = listConfigFields();
    const sandbox = getConfigField("sandbox_mode");

    expect(fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "model",
        "model_provider",
        "review_model",
        "oss_provider",
        "service_tier",
        "model_reasoning_effort",
        "plan_mode_reasoning_effort",
        "model_reasoning_summary",
        "model_verbosity",
        "approval_policy",
        "sandbox_mode",
        "allow_login_shell",
        "web_search",
        "personality",
        "file_opener",
        "log_dir",
        "project_doc_max_bytes",
        "project_doc_fallback_filenames",
        "project_root_markers",
        "features",
        "sandbox_workspace_write",
        "shell_environment_policy",
        "history",
        "tui",
      ]),
    );
    expect(sandbox).toMatchObject({
      label: "Sandbox mode",
      inputKind: "select",
      group: "Security",
      tab: "security",
      risk: "high",
      docsUrl: expect.stringContaining("developers.openai.com/codex"),
      exampleToml: expect.stringContaining('sandbox_mode = "workspace-write"'),
    });
    expect(sandbox?.description.length).toBeGreaterThan(20);
    expect(sandbox?.purpose.length).toBeGreaterThan(20);
  });

  test("exposes smart select option metadata", () => {
    const sandbox = getConfigField("sandbox_mode");

    expect(sandbox?.options).toContainEqual(
      expect.objectContaining({
        value: "workspace-write",
        label: "Workspace write",
        recommended: true,
        risk: "medium",
        description: expect.stringContaining("workspace"),
      }),
    );
    expect(sandbox?.options).toContainEqual(
      expect.objectContaining({
        value: "danger-full-access",
        risk: "high",
      }),
    );
  });

  test("marks edit-tab placement and custom-friendly fields", () => {
    expect(getConfigField("model")).toMatchObject({ tab: "model", allowCustom: true });
    expect(getConfigField("model_reasoning_effort")).toMatchObject({ tab: "model" });
    expect(getConfigField("model_verbosity")).toMatchObject({ tab: "model" });
    expect(getConfigField("model_provider")).toMatchObject({
      tab: "model",
      allowCustom: true,
      projectAllowed: false,
      projectDisabledReason: expect.stringContaining("user-level"),
    });
    expect(getConfigField("sandbox_mode")).toMatchObject({ tab: "security" });
    expect(getConfigField("approval_policy")).toMatchObject({ tab: "security" });
    expect(getConfigField("allow_login_shell")).toMatchObject({ tab: "security" });
    expect(getConfigField("sandbox_workspace_write")).toMatchObject({ tab: "security" });
    expect(getConfigField("web_search")).toMatchObject({ tab: "environment" });
    expect(getConfigField("shell_environment_policy")).toMatchObject({ tab: "environment" });
    expect(getConfigField("history")).toMatchObject({ tab: "environment" });
    expect(getConfigField("tui")).toMatchObject({ tab: "tui" });
    expect(getConfigField("project_root_markers")).toMatchObject({ tab: "project" });
    expect(getConfigField("features")).toMatchObject({ tab: "features" });
  });

  test("groups fields for form rendering", () => {
    expect(listConfigGroups()).toEqual(
      expect.arrayContaining(["Model", "Reasoning", "Security", "Tools", "Experience", "Project Docs"]),
    );
  });

  test("identifies keys that project config files cannot set", () => {
    expect(projectDisallowedKeys).toContain("model_provider");
    expect(projectDisallowedKeys).toContain("model_providers");
    expect(projectDisallowedKeys).toContain("openai_base_url");
  });

  test("validates known enum values and preserves unknown keys as warnings", () => {
    const diagnostics = validateKnownConfig({
      sandbox_mode: "planet-write",
      custom_future_key: true,
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        key: "sandbox_mode",
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "info",
        key: "custom_future_key",
      }),
    );
  });
});
