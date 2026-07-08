export type ConfigRisk = "low" | "medium" | "high";
export type ConfigGroup =
  | "Model"
  | "Reasoning"
  | "Security"
  | "Tools"
  | "Experience"
  | "Project Docs"
  | "Features"
  | "Advanced Tables";

export type ConfigInputKind =
  | "text"
  | "select"
  | "boolean"
  | "number"
  | "string-array"
  | "key-value-table"
  | "boolean-table";

export type ConfigTab = "model" | "security" | "environment" | "tui" | "project" | "features";

export type ConfigOption = {
  value: string;
  label: string;
  description: string;
  recommended?: boolean;
  risk?: ConfigRisk;
  exampleToml?: string;
};

export type ConfigFieldDefinition = {
  key: string;
  label: string;
  group: ConfigGroup;
  tab: ConfigTab;
  inputKind: ConfigInputKind;
  description: string;
  purpose: string;
  exampleToml: string;
  defaultHint?: string;
  options?: ConfigOption[];
  allowCustom?: boolean;
  risk: ConfigRisk;
  projectAllowed: boolean;
  projectDisabledReason?: string;
  docsUrl: string;
};

export type ConfigEntry = ConfigFieldDefinition & {
  type: "string" | "enum" | "boolean" | "number" | "array" | "table";
  uiGroup: ConfigGroup;
};

export type SchemaDiagnostic = {
  severity: "error" | "warning" | "info";
  key: string;
  message: string;
};

const DOCS_BASE = "https://developers.openai.com/codex";

const fields: ConfigFieldDefinition[] = [
  field({
    key: "model",
    label: "Default model",
    group: "Model",
    inputKind: "text",
    description: "Choose the model Codex uses by default in the CLI and IDE.",
    purpose: "Use this when you want every new Codex session to start from a specific model instead of the recommended default.",
    exampleToml: 'model = "gpt-5.5"',
    defaultHint: "Unset uses the recommended Codex default model.",
    tab: "model",
    allowCustom: true,
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-basic#default-model`,
  }),
  field({
    key: "model_provider",
    label: "Model provider",
    group: "Model",
    inputKind: "text",
    description: "Select the provider id Codex uses to connect to models.",
    purpose: "Use this to switch from the built-in OpenAI provider to a configured local, proxy, Azure, Bedrock, or other provider.",
    exampleToml: 'model_provider = "openai"',
    defaultHint: "Defaults to openai.",
    tab: "model",
    allowCustom: true,
    risk: "medium",
    projectAllowed: false,
    projectDisabledReason: "Set this in user-level config because Codex ignores provider selection in project config.",
    docsUrl: `${DOCS_BASE}/config-advanced#custom-model-providers`,
  }),
  field({
    key: "review_model",
    label: "Review model",
    group: "Model",
    inputKind: "text",
    description: "Optional model override used by Codex review flows.",
    purpose: "Use this when review should use a different model from normal interactive sessions.",
    exampleToml: 'review_model = "gpt-5.5"',
    defaultHint: "Unset uses the current session model.",
    tab: "model",
    allowCustom: true,
    risk: "low",
    docsUrl: `${DOCS_BASE}/cli/features#review`,
  }),
  field({
    key: "oss_provider",
    label: "OSS provider",
    group: "Model",
    inputKind: "select",
    options: [
      option("ollama", "Ollama", "Use a local Ollama-compatible provider.", true, "medium", 'oss_provider = "ollama"'),
      option("lmstudio", "LM Studio", "Use a local LM Studio-compatible provider.", false, "medium", 'oss_provider = "lmstudio"'),
    ],
    description: "Set the default local provider for Codex sessions launched with --oss.",
    purpose: "Use this when you regularly run Codex against a local open source model provider.",
    exampleToml: 'oss_provider = "ollama"',
    defaultHint: "Unset lets Codex prompt or use its runtime default.",
    tab: "model",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-advanced#oss-mode-local-providers`,
  }),
  field({
    key: "service_tier",
    label: "Service tier",
    group: "Model",
    inputKind: "select",
    options: [
      option("fast", "Fast", "Prefer the fast service tier when supported.", true, "low", 'service_tier = "fast"'),
      option("flex", "Flex", "Prefer flexible capacity where supported.", false, "low", 'service_tier = "flex"'),
    ],
    description: "Set the preferred service tier Codex should use when supported.",
    purpose: "Use this to bias Codex toward faster or flexible execution paths where the selected model/provider supports them.",
    exampleToml: 'service_tier = "fast"',
    defaultHint: "Unset uses model and feature defaults.",
    tab: "model",
    risk: "low",
    docsUrl: `${DOCS_BASE}/speed`,
  }),
  field({
    key: "model_reasoning_effort",
    label: "Reasoning effort",
    group: "Reasoning",
    inputKind: "select",
    options: [
      option("minimal", "Minimal", "Fastest responses for simple edits.", false, "low"),
      option("low", "Low", "Light reasoning for routine work.", false, "low"),
      option("medium", "Medium", "Balanced reasoning and speed.", true, "low"),
      option("high", "High", "More reasoning for debugging, design, or risky changes.", false, "low"),
      option("xhigh", "Extra high", "Maximum available reasoning effort for difficult work.", false, "medium"),
    ],
    description: "Tune how much reasoning effort the model applies when supported.",
    purpose: "Use higher effort for harder planning or debugging; use lower effort for faster routine tasks.",
    exampleToml: 'model_reasoning_effort = "high"',
    defaultHint: "Unset uses the model default.",
    tab: "model",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-basic#reasoning-effort`,
  }),
  field({
    key: "plan_mode_reasoning_effort",
    label: "Plan mode reasoning effort",
    group: "Reasoning",
    inputKind: "select",
    options: [
      option("none", "None", "Disable a plan-mode-specific reasoning override.", false, "low"),
      option("minimal", "Minimal", "Fastest planning for small changes.", false, "low"),
      option("low", "Low", "Light planning effort.", false, "low"),
      option("medium", "Medium", "Balanced planning effort.", false, "low"),
      option("high", "High", "More deliberate planning for multi-step work.", true, "low"),
      option("xhigh", "Extra high", "Maximum planning effort for difficult or ambiguous work.", false, "medium"),
    ],
    description: "Optional reasoning effort override used when Codex is in plan mode.",
    purpose: "Use this when planning should be more deliberate than normal implementation turns.",
    exampleToml: 'plan_mode_reasoning_effort = "high"',
    defaultHint: "Unset falls back to normal reasoning effort.",
    tab: "model",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-sample`,
  }),
  field({
    key: "model_reasoning_summary",
    label: "Reasoning summary",
    group: "Reasoning",
    inputKind: "select",
    options: [
      option("auto", "Auto", "Let Codex choose the summary style.", true, "low"),
      option("concise", "Concise", "Show shorter reasoning summaries.", false, "low"),
      option("detailed", "Detailed", "Show more detailed reasoning summaries.", false, "low"),
      option("none", "None", "Disable reasoning summaries where supported.", false, "low"),
    ],
    description: "Control how Codex requests reasoning summaries from supported models.",
    purpose: "Use this to reduce or expand visible reasoning summaries without changing the model itself.",
    exampleToml: 'model_reasoning_summary = "auto"',
    defaultHint: "Unset uses model/provider defaults.",
    tab: "model",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-advanced#model-reasoning-verbosity-and-limits`,
  }),
  field({
    key: "model_verbosity",
    label: "Model verbosity",
    group: "Reasoning",
    inputKind: "select",
    options: [
      option("low", "Low", "Prefer shorter responses.", false, "low"),
      option("medium", "Medium", "Balanced response detail.", true, "low"),
      option("high", "High", "Prefer more detailed responses.", false, "low"),
    ],
    description: "Set text verbosity for Responses API capable GPT-5 family models.",
    purpose: "Use this to make Codex responses shorter or more detailed by default.",
    exampleToml: 'model_verbosity = "medium"',
    defaultHint: "Unset uses the model default.",
    tab: "model",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-advanced#model-reasoning-verbosity-and-limits`,
  }),
  field({
    key: "approval_policy",
    label: "Approval policy",
    group: "Security",
    inputKind: "select",
    options: [
      option("untrusted", "Untrusted", "Only known-safe read-only commands run automatically.", false, "low", 'approval_policy = "untrusted"'),
      option("on-request", "On request", "Codex decides when to ask for approval.", true, "medium", 'approval_policy = "on-request"'),
      option("never", "Never", "Never ask for approval; use only when your environment already isolates commands.", false, "high", 'approval_policy = "never"'),
    ],
    description: "Control when Codex pauses to ask before running generated commands.",
    purpose: "Use this to tune how much approval friction you want for local command execution.",
    exampleToml: 'approval_policy = "on-request"',
    defaultHint: "on-request is the normal interactive default.",
    tab: "security",
    risk: "high",
    docsUrl: `${DOCS_BASE}/config-basic#approval-prompts`,
  }),
  field({
    key: "sandbox_mode",
    label: "Sandbox mode",
    group: "Security",
    inputKind: "select",
    options: [
      option("read-only", "Read only", "Can inspect files but cannot write to the workspace.", false, "low", 'sandbox_mode = "read-only"'),
      option("workspace-write", "Workspace write", "Can read files and write inside the current workspace.", true, "medium", 'sandbox_mode = "workspace-write"'),
      option("danger-full-access", "Danger full access", "Runs without sandboxing. Use only in already-isolated environments.", false, "high", 'sandbox_mode = "danger-full-access"'),
    ],
    description: "Adjust how much filesystem and network access Codex has while executing commands.",
    purpose: "Use this to decide the default isolation boundary for local tool calls and command execution.",
    exampleToml: 'sandbox_mode = "workspace-write"',
    defaultHint: "read-only is safest; danger-full-access removes sandboxing.",
    tab: "security",
    risk: "high",
    docsUrl: `${DOCS_BASE}/config-basic#sandbox-level`,
  }),
  field({
    key: "allow_login_shell",
    label: "Allow login shell",
    group: "Security",
    inputKind: "boolean",
    description: "Allow shell tools to use login-shell semantics when requested.",
    purpose: "Disable this if you want stricter command execution that avoids shell profile side effects.",
    exampleToml: "allow_login_shell = false",
    defaultHint: "Defaults to true.",
    tab: "security",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-sample`,
  }),
  field({
    key: "web_search",
    label: "Web search mode",
    group: "Tools",
    inputKind: "select",
    options: [
      option("cached", "Cached", "Use OpenAI-maintained cached web results with reduced live-page exposure.", true, "low", 'web_search = "cached"'),
      option("live", "Live", "Fetch the most recent data from the web.", false, "medium", 'web_search = "live"'),
      option("disabled", "Disabled", "Turn off web search.", false, "low", 'web_search = "disabled"'),
    ],
    description: "Choose whether Codex uses cached web search, live web fetches, or no web search.",
    purpose: "Use cached for lower prompt-injection exposure, live for freshest data, or disabled for offline/private workflows.",
    exampleToml: 'web_search = "cached"',
    defaultHint: "cached is the default for local tasks.",
    tab: "environment",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-basic#web-search-mode`,
  }),
  field({
    key: "personality",
    label: "Communication style",
    group: "Experience",
    inputKind: "select",
    options: [
      option("friendly", "Friendly", "Use a warmer conversational style.", false, "low"),
      option("pragmatic", "Pragmatic", "Use a direct, work-focused style.", true, "low"),
      option("none", "None", "Disable personality styling where supported.", false, "low"),
    ],
    description: "Set a default communication style for supported models.",
    purpose: "Use this to make Codex default to a preferred response tone across sessions.",
    exampleToml: 'personality = "pragmatic"',
    defaultHint: "Unset uses the product default.",
    tab: "environment",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-basic#communication-style`,
  }),
  field({
    key: "file_opener",
    label: "File opener",
    group: "Experience",
    inputKind: "select",
    options: [
      option("vscode", "VS Code", "Open file links in Visual Studio Code.", true, "low"),
      option("vscode-insiders", "VS Code Insiders", "Open file links in VS Code Insiders.", false, "low"),
      option("windsurf", "Windsurf", "Open file links in Windsurf.", false, "low"),
      option("cursor", "Cursor", "Open file links in Cursor.", false, "low"),
      option("none", "None", "Render file paths without editor deep links.", false, "low"),
    ],
    description: "Set the URI scheme used for clickable file citations.",
    purpose: "Use this to make Codex links open in your preferred editor.",
    exampleToml: 'file_opener = "vscode"',
    defaultHint: "Defaults to vscode.",
    tab: "environment",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-sample`,
  }),
  field({
    key: "log_dir",
    label: "Log directory",
    group: "Experience",
    inputKind: "text",
    description: "Override where Codex writes local log files.",
    purpose: "Use this when you want logs outside the default CODEX_HOME log location.",
    exampleToml: 'log_dir = "/absolute/path/to/codex-logs"',
    defaultHint: "Unset uses the default Codex log directory.",
    tab: "environment",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-basic#log-directory`,
  }),
  field({
    key: "project_doc_max_bytes",
    label: "Project doc max bytes",
    group: "Project Docs",
    inputKind: "number",
    description: "Limit how many bytes Codex reads from AGENTS.md into first-turn instructions.",
    purpose: "Use this to prevent very large project guidance files from consuming too much context.",
    exampleToml: "project_doc_max_bytes = 32768",
    defaultHint: "Default is 32768.",
    tab: "project",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-sample`,
  }),
  field({
    key: "project_doc_fallback_filenames",
    label: "Project doc fallback filenames",
    group: "Project Docs",
    inputKind: "string-array",
    description: "Ordered fallback files Codex can read when AGENTS.md is missing.",
    purpose: "Use this to support alternate repo guidance filenames while keeping AGENTS.md as the default.",
    exampleToml: 'project_doc_fallback_filenames = ["CLAUDE.md", "GEMINI.md"]',
    defaultHint: "Defaults to an empty list.",
    tab: "project",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-sample`,
  }),
  field({
    key: "project_root_markers",
    label: "Project root markers",
    group: "Project Docs",
    inputKind: "string-array",
    description: "Customize which files or folders identify a project root.",
    purpose: "Use this when your repositories use root markers other than .git.",
    exampleToml: 'project_root_markers = [".git", ".hg", ".sl"]',
    defaultHint: 'Defaults to [".git"].',
    tab: "project",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-advanced#project-root-detection`,
  }),
  field({
    key: "features",
    label: "Feature flags",
    group: "Features",
    inputKind: "boolean-table",
    description: "Toggle optional and experimental Codex capabilities.",
    purpose: "Use this to explicitly enable or disable feature flags while leaving omitted flags at their defaults.",
    exampleToml: "[features]\nshell_snapshot = true",
    defaultHint: "Omit feature keys to keep defaults.",
    tab: "features",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-basic#feature-flags`,
  }),
  field({
    key: "sandbox_workspace_write",
    label: "Workspace-write sandbox settings",
    group: "Advanced Tables",
    inputKind: "key-value-table",
    description: "Extra filesystem and network options used when sandbox_mode is workspace-write.",
    purpose: "Use this to add writable roots or opt into sandboxed network access for workspace-write sessions.",
    exampleToml: "[sandbox_workspace_write]\nnetwork_access = false\nwritable_roots = []",
    defaultHint: "Only applies when sandbox_mode is workspace-write.",
    tab: "security",
    risk: "high",
    docsUrl: `${DOCS_BASE}/config-advanced#approval-policies-and-sandbox-modes`,
  }),
  field({
    key: "shell_environment_policy",
    label: "Shell environment policy",
    group: "Advanced Tables",
    inputKind: "key-value-table",
    description: "Control which environment variables Codex forwards to spawned commands.",
    purpose: "Use this to avoid leaking secrets while keeping required command environment variables available.",
    exampleToml: '[shell_environment_policy]\ninclude_only = ["PATH", "HOME"]',
    defaultHint: "Unset inherits the default policy.",
    tab: "environment",
    risk: "high",
    docsUrl: `${DOCS_BASE}/config-basic#command-environment`,
  }),
  field({
    key: "history",
    label: "History",
    group: "Advanced Tables",
    inputKind: "key-value-table",
    description: "Configure local Codex history persistence.",
    purpose: "Use this to disable history or set storage limits for local conversation history.",
    exampleToml: '[history]\npersistence = "save-all"',
    defaultHint: "Default persistence is save-all.",
    tab: "environment",
    risk: "medium",
    docsUrl: `${DOCS_BASE}/config-sample`,
  }),
  field({
    key: "tui",
    label: "TUI settings",
    group: "Advanced Tables",
    inputKind: "key-value-table",
    description: "Customize terminal UI behavior such as notifications, animations, status lines, and keymaps.",
    purpose: "Use this for terminal-specific Codex presentation and keyboard behavior.",
    exampleToml: "[tui]\nnotifications = false\nanimations = true",
    defaultHint: "Unset uses TUI defaults.",
    tab: "tui",
    risk: "low",
    docsUrl: `${DOCS_BASE}/config-basic#tui-keymap`,
  }),
];

export const projectDisallowedKeys = [
  "openai_base_url",
  "chatgpt_base_url",
  "apps_mcp_product_sku",
  "model_provider",
  "model_providers",
  "notify",
  "profile",
  "profiles",
  "experimental_realtime_ws_base_url",
  "otel",
];

const byKey = new Map(fields.map((entry) => [entry.key, entry]));

export function listConfigFields(): ConfigFieldDefinition[] {
  return [...fields];
}

export function getConfigField(key: string): ConfigFieldDefinition | undefined {
  return byKey.get(key);
}

export function listConfigGroups(): ConfigGroup[] {
  return [...new Set(fields.map((field) => field.group))];
}

export function listConfigEntries(): ConfigEntry[] {
  return fields.map(toLegacyEntry);
}

export function getConfigEntry(key: string): ConfigEntry | undefined {
  const entry = byKey.get(key);
  return entry ? toLegacyEntry(entry) : undefined;
}

export function validateKnownConfig(config: Record<string, unknown>): SchemaDiagnostic[] {
  const diagnostics: SchemaDiagnostic[] = [];

  for (const [key, value] of Object.entries(config)) {
    const entry = byKey.get(key);

    if (!entry) {
      diagnostics.push({
        severity: "info",
        key,
        message: `Unknown Codex config key "${key}" will be preserved.`,
      });
      continue;
    }

    const optionValues = entry.options?.map((option) => option.value);

    if (entry.inputKind === "select" && typeof value === "string" && optionValues && !optionValues.includes(value)) {
      diagnostics.push({
        severity: "error",
        key,
        message: `"${value}" is not a supported value for ${key}.`,
      });
    }

    if (entry.inputKind === "select" && typeof value !== "string") {
      diagnostics.push({
        severity: "error",
        key,
        message: `${key} must be a string enum value.`,
      });
    }
  }

  return diagnostics;
}

function field(input: Omit<ConfigFieldDefinition, "projectAllowed"> & { projectAllowed?: boolean }): ConfigFieldDefinition {
  return { projectAllowed: true, ...input };
}

function option(
  value: string,
  label: string,
  description: string,
  recommended = false,
  risk: ConfigRisk = "low",
  exampleToml?: string,
): ConfigOption {
  return { value, label, description, recommended, risk, exampleToml };
}

function toLegacyEntry(entry: ConfigFieldDefinition): ConfigEntry {
  return {
    ...entry,
    uiGroup: entry.group,
    type: legacyType(entry),
  };
}

function legacyType(entry: ConfigFieldDefinition): ConfigEntry["type"] {
  switch (entry.inputKind) {
    case "select":
      return "enum";
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string-array":
      return "array";
    case "key-value-table":
    case "boolean-table":
      return "table";
    case "text":
      return "string";
  }
}
