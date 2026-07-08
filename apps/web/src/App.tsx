import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Editor from "@monaco-editor/react";
import { Checkbox, Select, Switch, Table, Tabs, TextArea, TextField } from "@radix-ui/themes";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCode2,
  History,
  Layers3,
  Menu,
  PanelRight,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, InlineCode, MutedText, PageHeader, Panel, SectionTitle, TextLink, Toolbar } from "@codex-config-board/ui";
import {
  getConfigEntry,
  listConfigFields,
  listConfigGroups,
  type ConfigTab,
  type ConfigFieldDefinition,
  type ConfigGroup,
} from "@codex-config-board/codex-schema";
import { applyFormValuesToToml, toFormValues, type FormValues } from "./formToml";

type ConfigLayer = {
  kind: "system" | "user" | "profile" | "project";
  path: string;
  name?: string;
  data: Record<string, unknown>;
  text?: string;
  diagnostics?: Diagnostic[];
};

type Diagnostic = {
  severity: "error" | "warning" | "info";
  key?: string;
  message: string;
};

type SessionInfo = {
  codexHome: string;
  backupDir: string;
};

type EffectiveConfig = {
  values: Record<string, unknown>;
  sources: Record<string, ConfigLayer>;
};

type PreviewResult = {
  ok: boolean;
  diff: string;
  previewHash: string;
  diagnostics: Diagnostic[];
};

type BackupRecord = {
  id: number;
  targetPath: string;
  backupPath: string;
  createdAt: string;
};

type ScannedConfigFile = {
  kind: ConfigLayer["kind"];
  path: string;
  name?: string;
  projectPath?: string;
};

type EffectiveValueRow = {
  key: string;
  value: unknown;
  formattedValue: string;
  group: string;
  risk: "low" | "medium" | "high" | "unknown";
};

type FormErrorMap = Record<string, string | undefined>;

const jsonObjectSchema = z.record(z.string(), z.unknown());

const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin;
const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
const apiToken = tokenFromUrl || import.meta.env.VITE_API_TOKEN || "";
const configTabs: { key: ConfigTab; label: string }[] = [
  { key: "model", label: "Model" },
  { key: "security", label: "Security" },
  { key: "environment", label: "Environment" },
  { key: "tui", label: "TUI" },
  { key: "project", label: "Project" },
  { key: "features", label: "Features" },
];
const emptySelectValue = "__unset";

type KeymapActionDescriptor = {
  context: string;
  contextLabel: string;
  action: string;
  label: string;
  description: string;
  defaultBinding: string;
};

const booleanSelectOptions = [
  { value: "", label: "Default" },
  { value: "true", label: "Enabled" },
  { value: "false", label: "Disabled" },
];

const notificationOptions = [
  { value: "", label: "Default" },
  { value: "true", label: "All TUI notifications" },
  { value: "false", label: "Disabled" },
  { value: "agent-turn-complete", label: "Agent turn complete" },
  { value: "approval-requested", label: "Approval requested" },
  { value: "agent-turn-complete,approval-requested", label: "Turn complete and approvals" },
];

const statusLineItems = [
  "model-with-reasoning",
  "model",
  "reasoning",
  "context-remaining",
  "context-used",
  "context-window-size",
  "used-tokens",
  "total-input-tokens",
  "total-output-tokens",
  "current-dir",
  "project-name",
  "git-branch",
  "branch-changes",
  "pull-request-number",
  "run-state",
  "permissions",
  "approval-mode",
  "five-hour-limit",
  "weekly-limit",
  "codex-version",
  "fast-mode",
  "raw-output",
  "thread-title",
  "thread-id",
  "workspace-headline",
  "task-progress",
];

const terminalTitleItems = ["app-name", "project", "spinner", "status", "thread", "git-branch", "model", "task-progress"];

const commonKeySpecs = [
  "enter",
  "tab",
  "esc",
  "backspace",
  "delete",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  "ctrl-a",
  "ctrl-b",
  "ctrl-c",
  "ctrl-d",
  "ctrl-e",
  "ctrl-f",
  "ctrl-g",
  "ctrl-h",
  "ctrl-j",
  "ctrl-k",
  "ctrl-l",
  "ctrl-m",
  "ctrl-n",
  "ctrl-o",
  "ctrl-p",
  "ctrl-r",
  "ctrl-s",
  "ctrl-t",
  "ctrl-u",
  "ctrl-w",
  "ctrl-y",
  "alt-b",
  "alt-d",
  "alt-f",
  "alt-r",
  "f12",
];

const keymapActions: KeymapActionDescriptor[] = [
  km("global", "Global", "open_transcript", "Open the transcript overlay.", "ctrl-t"),
  km("global", "Global", "open_external_editor", "Open the current draft in an external editor.", "ctrl-g"),
  km("global", "Global", "copy", "Copy the last agent response to the clipboard.", "ctrl-o"),
  km("global", "Global", "clear_terminal", "Clear the terminal UI.", "ctrl-l"),
  km("global", "Global", "toggle_vim_mode", "Turn Vim composer mode on or off.", ""),
  km("global", "Global", "toggle_fast_mode", "Turn Fast mode on or off.", ""),
  km("global", "Global", "toggle_raw_output", "Toggle raw scrollback mode.", "alt-r"),
  km("chat", "Chat", "interrupt_turn", "Interrupt the active turn.", "esc"),
  km("chat", "Chat", "decrease_reasoning_effort", "Decrease reasoning effort.", "alt-,"),
  km("chat", "Chat", "increase_reasoning_effort", "Increase reasoning effort.", "alt-."),
  km("chat", "Chat", "edit_queued_message", "Edit the most recently queued message.", "alt-up"),
  km("composer", "Composer", "submit", "Submit the current composer draft.", "enter"),
  km("composer", "Composer", "queue", "Queue the draft while a task is running.", "tab"),
  km("composer", "Composer", "toggle_shortcuts", "Show or hide the composer shortcut overlay.", "?, shift-?"),
  km("composer", "Composer", "history_search_previous", "Open history search or move to the previous match.", "ctrl-r"),
  km("composer", "Composer", "history_search_next", "Move to the next history search match.", "ctrl-s"),
  km("editor", "Editor", "insert_newline", "Insert a newline in the editor.", "ctrl-j, ctrl-m, enter, shift-enter, alt-enter"),
  km("editor", "Editor", "move_left", "Move the cursor left.", "left, ctrl-b"),
  km("editor", "Editor", "move_right", "Move the cursor right.", "right, ctrl-f"),
  km("editor", "Editor", "move_up", "Move the cursor up.", "up, ctrl-p"),
  km("editor", "Editor", "move_down", "Move the cursor down.", "down, ctrl-n"),
  km("editor", "Editor", "move_word_left", "Move to the beginning of the previous word.", "alt-b, alt-left, ctrl-left"),
  km("editor", "Editor", "move_word_right", "Move to the end of the next word.", "alt-f, alt-right, ctrl-right"),
  km("editor", "Editor", "move_line_start", "Move to the beginning of the line.", "home, ctrl-a"),
  km("editor", "Editor", "move_line_end", "Move to the end of the line.", "end, ctrl-e"),
  km("editor", "Editor", "delete_backward", "Delete one grapheme to the left.", "backspace, shift-backspace, ctrl-h"),
  km("editor", "Editor", "delete_forward", "Delete one grapheme to the right.", "delete, shift-delete, ctrl-d"),
  km("editor", "Editor", "delete_backward_word", "Delete the previous word.", "alt-backspace, ctrl-backspace, ctrl-w"),
  km("editor", "Editor", "delete_forward_word", "Delete the next word.", "alt-delete, ctrl-delete, alt-d"),
  km("editor", "Editor", "kill_line_start", "Delete from cursor to line start.", "ctrl-u"),
  km("editor", "Editor", "kill_whole_line", "Delete the current line.", ""),
  km("editor", "Editor", "kill_line_end", "Delete from cursor to line end.", "ctrl-k"),
  km("editor", "Editor", "yank", "Paste the kill buffer.", "ctrl-y"),
  km("vim_normal", "Vim normal", "enter_insert", "Enter insert mode at the cursor.", "i, insert"),
  km("vim_normal", "Vim normal", "append_after_cursor", "Enter insert mode after the cursor.", "a"),
  km("vim_normal", "Vim normal", "append_line_end", "Enter insert mode at end of line.", "shift-a, A"),
  km("vim_normal", "Vim normal", "insert_line_start", "Enter insert mode at the first non-blank character.", "shift-i, I"),
  km("vim_normal", "Vim normal", "open_line_below", "Open a new line below and enter insert mode.", "o"),
  km("vim_normal", "Vim normal", "open_line_above", "Open a new line above and enter insert mode.", "shift-o, O"),
  km("vim_normal", "Vim normal", "move_left", "Move left in Vim normal mode.", "h, left"),
  km("vim_normal", "Vim normal", "move_right", "Move right in Vim normal mode.", "l, right"),
  km("vim_normal", "Vim normal", "move_up", "Move up or recall older history in Vim normal mode.", "k, up"),
  km("vim_normal", "Vim normal", "move_down", "Move down or recall newer history in Vim normal mode.", "j, down"),
  km("vim_normal", "Vim normal", "move_word_forward", "Move to the start of the next word.", "w"),
  km("vim_normal", "Vim normal", "move_word_backward", "Move to the start of the previous word.", "b"),
  km("vim_normal", "Vim normal", "move_word_end", "Move to the end of the current or next word.", "e"),
  km("vim_normal", "Vim normal", "move_line_start", "Move to the start of the line.", "0"),
  km("vim_normal", "Vim normal", "move_line_end", "Move to the end of the line.", "$, shift-$"),
  km("vim_normal", "Vim normal", "delete_char", "Delete the character under the cursor.", "x"),
  km("vim_normal", "Vim normal", "substitute_char", "Delete the character under the cursor and enter insert mode.", "s"),
  km("vim_normal", "Vim normal", "delete_to_line_end", "Delete from cursor to end of line.", "shift-d, D"),
  km("vim_normal", "Vim normal", "change_to_line_end", "Change from cursor to end of line and enter insert mode.", "shift-c, C"),
  km("vim_normal", "Vim normal", "yank_line", "Yank the entire line.", "shift-y, Y"),
  km("vim_normal", "Vim normal", "paste_after", "Paste after the cursor.", "p"),
  km("vim_normal", "Vim normal", "start_delete_operator", "Begin a delete operator and wait for a motion.", "d"),
  km("vim_normal", "Vim normal", "start_yank_operator", "Begin a yank operator and wait for a motion.", "y"),
  km("vim_normal", "Vim normal", "start_change_operator", "Begin a change operator and wait for a text object.", "c"),
  km("vim_normal", "Vim normal", "cancel_operator", "Cancel a pending Vim operator.", "esc"),
  km("vim_operator", "Vim operator", "delete_line", "Repeat delete operator to delete the whole line.", "d"),
  km("vim_operator", "Vim operator", "yank_line", "Repeat yank operator to yank the whole line.", "y"),
  km("vim_operator", "Vim operator", "motion_left", "Operator motion left.", "h"),
  km("vim_operator", "Vim operator", "motion_right", "Operator motion right.", "l"),
  km("vim_operator", "Vim operator", "motion_up", "Operator motion up.", "k"),
  km("vim_operator", "Vim operator", "motion_down", "Operator motion down.", "j"),
  km("vim_operator", "Vim operator", "motion_word_forward", "Operator motion to start of next word.", "w"),
  km("vim_operator", "Vim operator", "motion_word_backward", "Operator motion to start of previous word.", "b"),
  km("vim_operator", "Vim operator", "motion_word_end", "Operator motion to end of word.", "e"),
  km("vim_operator", "Vim operator", "motion_line_start", "Operator motion to line start.", "0"),
  km("vim_operator", "Vim operator", "motion_line_end", "Operator motion to line end.", "$, shift-$"),
  km("vim_operator", "Vim operator", "select_inner_text_object", "Select an inner text object.", "i"),
  km("vim_operator", "Vim operator", "select_around_text_object", "Select an around text object.", "a"),
  km("vim_operator", "Vim operator", "cancel", "Cancel the pending operator.", "esc"),
  km("vim_text_object", "Vim text object", "word", "Target the current word.", "w"),
  km("vim_text_object", "Vim text object", "big_word", "Target the current WORD.", "shift-w, W"),
  km("vim_text_object", "Vim text object", "parentheses", "Target enclosing parentheses.", "(, ), b"),
  km("vim_text_object", "Vim text object", "brackets", "Target enclosing brackets.", "[, ]"),
  km("vim_text_object", "Vim text object", "braces", "Target enclosing braces.", "{, }, shift-b, B"),
  km("vim_text_object", "Vim text object", "double_quote", "Target enclosing double quotes.", "double-quote"),
  km("vim_text_object", "Vim text object", "single_quote", "Target enclosing single quotes.", "single-quote"),
  km("vim_text_object", "Vim text object", "backtick", "Target enclosing backticks.", "backtick"),
  km("vim_text_object", "Vim text object", "cancel", "Cancel the pending text object.", "esc"),
  km("pager", "Pager", "scroll_up", "Scroll up by one row.", "up, k"),
  km("pager", "Pager", "scroll_down", "Scroll down by one row.", "down, j"),
  km("pager", "Pager", "page_up", "Scroll up by one page.", "pageup, shift-space, ctrl-b"),
  km("pager", "Pager", "page_down", "Scroll down by one page.", "pagedown, space, ctrl-f"),
  km("pager", "Pager", "half_page_up", "Scroll up by half a page.", "ctrl-u"),
  km("pager", "Pager", "half_page_down", "Scroll down by half a page.", "ctrl-d"),
  km("pager", "Pager", "jump_top", "Jump to the beginning.", "home"),
  km("pager", "Pager", "jump_bottom", "Jump to the end.", "end"),
  km("pager", "Pager", "close", "Close the pager overlay.", "q, ctrl-c"),
  km("pager", "Pager", "close_transcript", "Close the transcript overlay.", "ctrl-t"),
  km("list", "List", "move_up", "Move list selection up.", "up, ctrl-p, ctrl-k, k"),
  km("list", "List", "move_down", "Move list selection down.", "down, ctrl-n, ctrl-j, j"),
  km("list", "List", "move_left", "Move horizontally left in list pickers.", "left, ctrl-h"),
  km("list", "List", "move_right", "Move horizontally right in list pickers.", "right, ctrl-l"),
  km("list", "List", "page_up", "Move list selection up by one page.", "pageup, ctrl-b"),
  km("list", "List", "page_down", "Move list selection down by one page.", "pagedown, ctrl-f"),
  km("list", "List", "jump_top", "Jump to the first list item.", "home"),
  km("list", "List", "jump_bottom", "Jump to the last list item.", "end"),
  km("list", "List", "accept", "Accept the current list selection.", "enter"),
  km("list", "List", "cancel", "Cancel and close selection views.", "esc"),
  km("approval", "Approval", "open_fullscreen", "Open approval details fullscreen.", "ctrl-a, ctrl-shift-a"),
  km("approval", "Approval", "open_thread", "Open the approval source thread when available.", "o"),
  km("approval", "Approval", "approve", "Approve the primary option.", "y"),
  km("approval", "Approval", "approve_for_session", "Approve for the session when available.", "a"),
  km("approval", "Approval", "approve_for_prefix", "Approve with an exec-policy prefix when available.", "p"),
  km("approval", "Approval", "deny", "Choose the explicit deny option when available.", "d"),
  km("approval", "Approval", "decline", "Decline and provide corrective guidance.", "esc, n"),
  km("approval", "Approval", "cancel", "Cancel an elicitation request.", "c"),
];

const keymapContextOptions = [...new Map(keymapActions.map((action) => [action.context, action.contextLabel])).entries()].map(
  ([value, label]) => ({ value, label }),
);

export function App() {
  const route = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const isEditPage = route === "/edit";
  const requestedTarget = searchParams.get("target") === "project" ? "project" : "user";
  const [projectPath, setProjectPath] = useState("");
  const [session, setSession] = useState<SessionInfo | undefined>();
  const [layers, setLayers] = useState<ConfigLayer[]>([]);
  const [effective, setEffective] = useState<EffectiveConfig>({ values: {}, sources: {} });
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [scannedConfigs, setScannedConfigs] = useState<ScannedConfigFile[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [editorText, setEditorText] = useState("");
  const [formValues, setFormValues] = useState<FormValues>({});
  const [formErrors, setFormErrors] = useState<FormErrorMap>({});
  const [preview, setPreview] = useState<PreviewResult | undefined>();
  const [status, setStatus] = useState("Loading local Codex config");
  const [activeTab, setActiveTab] = useState<ConfigTab>("model");
  const [navOpen, setNavOpen] = useState(() => defaultSidePanelsOpen());
  const [inspectorOpen, setInspectorOpen] = useState(() => defaultSidePanelsOpen());

  useEffect(() => {
    void loadBoard(projectPath);
  }, []);

  const diagnostics = useMemo(() => layers.flatMap((layer) => layer.diagnostics ?? []), [layers]);
  const fields = useMemo(() => listConfigFields(), []);
  const groups = useMemo(() => listConfigGroups(), []);
  const selectedLayer = layers.find((layer) => layer.path === selectedPath);

  async function loadBoard(nextProjectPath: string) {
    setStatus("Loading local Codex config");
    const query = nextProjectPath ? `?projectPath=${encodeURIComponent(nextProjectPath)}` : "";
    const scanQuery = nextProjectPath ? `?rootPath=${encodeURIComponent(nextProjectPath)}` : "";
    const [sessionJson, layersJson, effectiveJson, backupsJson, scanJson] = await Promise.all([
      apiGet<SessionInfo>("/api/session"),
      apiGet<{ layers: ConfigLayer[] }>(`/api/config/layers${query}`),
      apiGet<EffectiveConfig>(`/api/config/effective${query}`),
      apiGet<{ backups: BackupRecord[] }>("/api/backups"),
      apiGet<{ files: ScannedConfigFile[] }>(`/api/config/scan${scanQuery}`),
    ]);
    setSession(sessionJson);
    setLayers(layersJson.layers);
    setEffective(effectiveJson);
    setBackups(backupsJson.backups);
    setScannedConfigs(scanJson.files);
    const requestedLayer = layersJson.layers.find((layer) => layer.kind === requestedTarget);
    const firstEditable = requestedLayer ?? layersJson.layers.find((layer) => layer.kind === "project" || layer.kind === "user");
    setSelectedPath(firstEditable?.path ?? "");
    setEditorText(firstEditable?.text ?? "");
    setFormValues(toFormValues(firstEditable?.data ?? {}, fields));
    setFormErrors({});
    setPreview(undefined);
    setStatus("Ready");
  }

  function selectLayer(path: string) {
    const nextLayer = layers.find((layer) => layer.path === path);
    setSelectedPath(path);
    setEditorText(nextLayer?.text ?? "");
    setFormValues(toFormValues(nextLayer?.data ?? {}, fields));
    setFormErrors({});
    setPreview(undefined);
  }

  function updateFormValue(field: ConfigFieldDefinition, value: unknown) {
    const nextValues = { ...formValues, [field.key]: value };
    setFormValues(nextValues);

    const validationError = validateFieldValue(field, value);
    setFormErrors((current) => ({ ...current, [field.key]: validationError }));
    if (validationError) {
      setPreview(undefined);
      setStatus("Fix validation errors");
      return;
    }

    try {
      setEditorText(applyFormValuesToToml(editorText, nextValues, fields));
      setPreview(undefined);
      setStatus("Form changed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update TOML from form");
    }
  }

  async function previewChange() {
    const result = await apiPost<PreviewResult>("/api/config/preview", {
      targetPath: selectedPath,
      nextText: editorText,
    });
    setPreview(result);
    setStatus(result.ok ? "Preview ready" : "Preview has diagnostics");
  }

  async function writeChange() {
    if (!preview?.ok) return;
    await apiPost<{ backupPath: string }>("/api/config/write", {
      targetPath: selectedPath,
      nextText: editorText,
      previewHash: preview.previewHash,
    });
    setStatus("Saved with backup");
    await loadBoard(projectPath);
  }

  async function restoreConfigBackup(backup: BackupRecord) {
    await apiPost<{ ok: boolean; backupPath: string }>("/api/backups/restore", {
      targetPath: backup.targetPath,
      backupPath: backup.backupPath,
    });
    setStatus("Restored backup");
    await loadBoard(projectPath);
  }

  async function loadScannedProjectConfig(file: ScannedConfigFile) {
    if (!file.projectPath) return;
    setProjectPath(file.projectPath);
    await loadBoard(file.projectPath);
  }

  const shellClassName = [
    "app-shell",
    navOpen ? "nav-open" : "",
    inspectorOpen ? "inspector-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName} data-testid="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">
            <Database size={16} />
          </div>
          <span>Config Board</span>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <TextLink className={`nav-item ${!isEditPage ? "active" : ""}`} href={withToken("/")}>
            <Layers3 size={16} /> Board
          </TextLink>
          <TextLink className={`nav-item ${isEditPage ? "active" : ""}`} href={editHref(requestedTarget)}>
            <Settings2 size={16} /> Editor
          </TextLink>
          <TextLink className="nav-item" href="#diagnostics">
            <ShieldCheck size={16} /> Diagnostics
          </TextLink>
        </nav>
      </aside>

      <main className="main">
        <div className="shell-controls" aria-label="Layout controls">
          <Button
            aria-label={navOpen ? "Hide navigation" : "Show navigation"}
            className="button-secondary shell-toggle"
            onClick={() => setNavOpen((current) => !current)}
          >
            <Menu size={16} /> Navigation
          </Button>
          <Button
            aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
            className="button-secondary shell-toggle"
            onClick={() => setInspectorOpen((current) => !current)}
          >
            <PanelRight size={16} /> Inspector
          </Button>
        </div>
        {isEditPage ? (
          <EditPage
            activeTab={activeTab}
            editorText={editorText}
            fields={fields}
            formErrors={formErrors}
            formValues={formValues}
            groups={groups}
            layers={layers}
            previewOk={preview?.ok ?? false}
            selectedLayer={selectedLayer}
            selectedPath={selectedPath}
            status={status}
            onChangeField={updateFormValue}
            onChangeRaw={(value) => {
              setEditorText(value);
              setPreview(undefined);
              setFormErrors({});
            }}
            onPreview={() => void previewChange()}
            onSave={() => void writeChange()}
            onSelectLayer={selectLayer}
            onSetActiveTab={setActiveTab}
          />
        ) : (
          <BoardPage
            effective={effective}
            layers={layers}
            projectPath={projectPath}
            scannedConfigs={scannedConfigs}
            status={status}
            onChangeProjectPath={setProjectPath}
            onLoad={() => void loadBoard(projectPath)}
            onLoadScannedConfig={(file) => void loadScannedProjectConfig(file)}
          />
        )}
      </main>

      <aside className="inspector" id="diagnostics" aria-label="Diagnostics inspector">
        <Panel>
          <SectionTitle>Session</SectionTitle>
          <InlineCode className="muted">{session?.codexHome ?? "No session"}</InlineCode>
        </Panel>

        <Panel>
          <SectionTitle>Schema controls</SectionTitle>
          {fields.slice(0, 8).map((entry) => (
            <Toolbar key={entry.key}>
              <Badge tone={entry.risk === "high" ? "danger" : entry.risk === "medium" ? "warning" : "neutral"}>{entry.risk}</Badge>
              <InlineCode>{entry.key}</InlineCode>
            </Toolbar>
          ))}
        </Panel>

        <Panel>
          <SectionTitle>Diagnostics</SectionTitle>
          {diagnostics.length === 0 ? (
            <MutedText>
              <CheckCircle2 size={16} /> No diagnostics from loaded layers.
            </MutedText>
          ) : (
            <div className="diagnostic-list">
              {diagnostics.map((diagnostic, index) => (
                <p key={`${diagnostic.key ?? "config"}-${index}`}>
                  <AlertTriangle size={14} /> <strong>{diagnostic.severity}</strong>{" "}
                  {diagnostic.key ? <InlineCode>{diagnostic.key}</InlineCode> : null} {diagnostic.message}
                </p>
              ))}
            </div>
          )}
        </Panel>

        <BackupHistoryPanel backups={backups} onRestore={(backup) => void restoreConfigBackup(backup)} />

        <Panel>
          <SectionTitle>Diff preview</SectionTitle>
          <pre className="diff-box code">{preview?.diff ?? "Preview a change before saving."}</pre>
        </Panel>
      </aside>
      {navOpen || inspectorOpen ? (
        <button
          aria-label="Close side panels"
          className="shell-backdrop"
          type="button"
          onClick={() => {
            setNavOpen(false);
            setInspectorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function BoardPage({
  effective,
  layers,
  projectPath,
  scannedConfigs,
  status,
  onChangeProjectPath,
  onLoad,
  onLoadScannedConfig,
}: {
  effective: EffectiveConfig;
  layers: ConfigLayer[];
  projectPath: string;
  scannedConfigs: ScannedConfigFile[];
  status: string;
  onChangeProjectPath: (path: string) => void;
  onLoad: () => void;
  onLoadScannedConfig: (file: ScannedConfigFile) => void;
}) {
  const [configSearch, setConfigSearch] = useState("");
  const normalizedSearch = normalizeSearchQuery(configSearch);
  const effectiveRows = useMemo(() => createEffectiveRows(effective), [effective]);
  const filteredScannedConfigs = useMemo(
    () => scannedConfigs.filter((file) => matchesScannedConfigFile(file, normalizedSearch)),
    [normalizedSearch, scannedConfigs],
  );
  const filteredLayers = useMemo(
    () => layers.filter((layer) => matchesConfigLayer(layer, normalizedSearch)),
    [layers, normalizedSearch],
  );
  const filteredEffectiveRows = useMemo(
    () => effectiveRows.filter((row) => matchesEffectiveRow(row, normalizedSearch)),
    [effectiveRows, normalizedSearch],
  );
  const searchMatchCount = filteredScannedConfigs.length + filteredLayers.length + filteredEffectiveRows.length;

  return (
    <>
      <PageHeader
        action={<Badge tone={status.includes("Saved") || status === "Ready" ? "success" : "neutral"}>{status}</Badge>}
        description="Inspect effective settings, source layers, diagnostics, and editor entry points."
        title="Codex Config Board"
      />

      <div className="board-controls">
        <label className="search-control">
          <span>Search config</span>
          <TextField.Root
            aria-label="Search config"
            className="input"
            placeholder="Search keys, values, layers, and paths"
            value={configSearch}
            onChange={(event) => setConfigSearch(event.target.value)}
          >
            <TextField.Slot>
              <Search size={15} />
            </TextField.Slot>
          </TextField.Root>
        </label>
        {normalizedSearch ? <Badge tone="neutral">{formatMatchCount(searchMatchCount)}</Badge> : null}
      </div>

      <Toolbar>
        <TextField.Root
          className="input"
          placeholder="Optional project path for .codex/config.toml"
          value={projectPath}
          onChange={(event) => onChangeProjectPath(event.target.value)}
        />
        <Button className="button-secondary" onClick={onLoad}>
          <Layers3 size={16} /> Load
        </Button>
      </Toolbar>

      <ScannedConfigFilesPanel files={filteredScannedConfigs} onLoad={onLoadScannedConfig} />

      <div className="grid">
        {filteredLayers.map((layer) => (
          <Panel key={layer.path}>
            <div className="layer-card-header">
              <SectionTitle>{layerLabel(layer)}</SectionTitle>
              {(layer.kind === "user" || layer.kind === "project") && (
                <TextLink className="edit-link" href={editHref(layer.kind)}>
                  <Settings2 size={15} /> Edit {layer.kind} config
                </TextLink>
              )}
            </div>
            <InlineCode className="muted">{layer.path}</InlineCode>
            <Toolbar>
              <Badge tone={layer.kind === "project" ? "warning" : "neutral"}>{layer.kind}</Badge>
              <Badge tone={(layer.diagnostics ?? []).some((item) => item.severity === "error") ? "danger" : "success"}>
                {(layer.diagnostics ?? []).length} diagnostics
              </Badge>
            </Toolbar>
          </Panel>
        ))}
      </div>
      {filteredLayers.length === 0 ? <MutedText>No loaded config layers match this search.</MutedText> : null}

      <SectionTitle>Effective values</SectionTitle>
      <EffectiveValuesTable rows={filteredEffectiveRows} />
    </>
  );
}

function ScannedConfigFilesPanel({ files, onLoad }: { files: ScannedConfigFile[]; onLoad: (file: ScannedConfigFile) => void }) {
  return (
    <Panel className="scan-panel">
      <div className="section-heading">
        <SectionTitle>Scanned config files</SectionTitle>
        <Badge tone="neutral">{files.length} files</Badge>
      </div>
      {files.length === 0 ? (
        <MutedText>No Codex config files found for this scan root.</MutedText>
      ) : (
        <div className="scan-file-list">
          {files.map((file) => (
            <div className="scan-file-row" key={file.path}>
              <div className="scan-file-meta">
                <Toolbar>
                  <Badge tone={file.kind === "project" ? "warning" : "neutral"}>{file.kind}</Badge>
                  {file.name ? <Badge tone="neutral">{file.name}</Badge> : null}
                </Toolbar>
                <InlineCode>{file.path}</InlineCode>
                {file.projectPath ? <MutedText>{file.projectPath}</MutedText> : null}
              </div>
              {file.projectPath ? (
                <Button className="button-secondary" aria-label={`Load ${file.path}`} onClick={() => onLoad(file)}>
                  <FileCode2 size={14} /> Load
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function BackupHistoryPanel({ backups, onRestore }: { backups: BackupRecord[]; onRestore: (backup: BackupRecord) => void }) {
  return (
    <Panel>
      <SectionTitle>Backup history</SectionTitle>
      {backups.length === 0 ? (
        <MutedText>No backups recorded yet.</MutedText>
      ) : (
        <div className="backup-history-list">
          {backups.map((backup) => {
            const createdAt = formatBackupDate(backup.createdAt);
            return (
              <div className="backup-history-item" key={backup.id}>
                <div className="backup-history-meta">
                  <Badge tone="neutral">
                    <History size={12} /> {createdAt}
                  </Badge>
                  <InlineCode>{backup.backupPath}</InlineCode>
                  <MutedText>{backup.targetPath}</MutedText>
                </div>
                <Button
                  aria-label={`Restore backup from ${createdAt}`}
                  className="button-secondary backup-restore-button"
                  onClick={() => onRestore(backup)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function EditPage({
  activeTab,
  editorText,
  fields,
  formErrors,
  formValues,
  groups,
  layers,
  previewOk,
  selectedLayer,
  selectedPath,
  status,
  onChangeField,
  onChangeRaw,
  onPreview,
  onSave,
  onSelectLayer,
  onSetActiveTab,
}: {
  activeTab: ConfigTab;
  editorText: string;
  fields: ConfigFieldDefinition[];
  formErrors: FormErrorMap;
  formValues: FormValues;
  groups: ConfigGroup[];
  layers: ConfigLayer[];
  previewOk: boolean;
  selectedLayer: ConfigLayer | undefined;
  selectedPath: string;
  status: string;
  onChangeField: (field: ConfigFieldDefinition, value: unknown) => void;
  onChangeRaw: (value: string) => void;
  onPreview: () => void;
  onSave: () => void;
  onSelectLayer: (path: string) => void;
  onSetActiveTab: (tab: ConfigTab) => void;
}) {
  const [fieldSearch, setFieldSearch] = useState("");
  const normalizedFieldSearch = normalizeSearchQuery(fieldSearch);
  const tabFields = fields.filter((field) => field.tab === activeTab);
  const filteredTabFields = tabFields.filter((field) => matchesConfigField(field, formValues[field.key], normalizedFieldSearch));
  const editableLayers = layers.filter((layer) => layer.kind === "user" || layer.kind === "project");

  return (
    <>
      <PageHeader
        action={<Badge tone={status.includes("Saved") || status === "Ready" ? "success" : "neutral"}>{status}</Badge>}
        className="edit-header"
        description="Form controls write TOML, while the raw editor keeps unknown keys available."
        title="Edit config"
      />

      <div className="edit-toolbar">
        <label className="select-stack">
          <span>Target layer</span>
          <Select.Root
            disabled={editableLayers.length === 0}
            value={selectedPath || emptySelectValue}
            onValueChange={(value) => {
              if (value !== emptySelectValue) onSelectLayer(value);
            }}
          >
            <Select.Trigger aria-label="Target layer" className="input radix-select-trigger" />
            <Select.Content position="popper">
              {editableLayers.length === 0 ? <Select.Item value={emptySelectValue}>No editable layers</Select.Item> : null}
              {editableLayers.map((layer) => (
                <Select.Item key={layer.path} value={layer.path}>
                  {layerLabel(layer)} - {layer.path}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>
        <label className="search-control edit-search-control">
          <span>Search config fields</span>
          <TextField.Root
            aria-label="Search config fields"
            className="input"
            placeholder="Search field names, keys, values, and examples"
            value={fieldSearch}
            onChange={(event) => setFieldSearch(event.target.value)}
          >
            <TextField.Slot>
              <Search size={15} />
            </TextField.Slot>
          </TextField.Root>
        </label>
        {normalizedFieldSearch ? <Badge tone="neutral">{formatMatchCount(filteredTabFields.length)}</Badge> : null}
        {selectedLayer ? <Badge tone={selectedLayer.kind === "project" ? "warning" : "neutral"}>{selectedLayer.kind}</Badge> : null}
      </div>

      <Tabs.Root value={activeTab} onValueChange={(value) => onSetActiveTab(value as ConfigTab)}>
        <Tabs.List className="tab-list" aria-label="Config sections">
          {configTabs.map((tab) => (
            <Tabs.Trigger key={tab.key} aria-label={tab.label} value={tab.key}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      <div className="edit-layout">
        <section className="edit-form-pane">
          <ConfigForm
            fields={filteredTabFields}
            formErrors={formErrors}
            groups={groups}
            layerKind={selectedLayer?.kind}
            values={formValues}
            onChange={onChangeField}
          />
          {filteredTabFields.length === 0 ? <MutedText>No config fields match this search in the current tab.</MutedText> : null}
        </section>

        <Panel className="raw-editor-pane" aria-label="Raw TOML editor">
          <div className="section-heading">
            <SectionTitle>Raw TOML editor</SectionTitle>
            <Toolbar>
              <Button className="button-secondary" onClick={onPreview} disabled={!selectedLayer}>
                <FileCode2 size={16} /> Preview diff
              </Button>
              <Button onClick={onSave} disabled={!previewOk}>
                <Save size={16} /> Save with backup
              </Button>
            </Toolbar>
          </div>
          <div className="editor-shell">
            {import.meta.env.MODE === "test" ? (
              <textarea className="editor-fallback" value={editorText} onChange={(event) => onChangeRaw(event.target.value)} />
            ) : (
              <Editor
                height="360px"
                defaultLanguage="toml"
                theme="vs-light"
                value={editorText}
                onChange={(value) => onChangeRaw(value ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
              />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function EffectiveValuesTable({ rows }: { rows: EffectiveValueRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const columnHelper = createColumnHelper<EffectiveValueRow>();
  const columns = useMemo(
    () => [
      columnHelper.accessor("key", {
        header: "Key",
        cell: (info) => <span className="code">{info.getValue()}</span>,
      }),
      columnHelper.accessor("formattedValue", {
        header: "Value",
        cell: (info) => <span className="code">{info.getValue()}</span>,
      }),
      columnHelper.accessor("group", {
        header: "Group",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("risk", {
        header: "Risk",
        cell: (info) => (
          <Badge tone={info.getValue() === "high" ? "danger" : info.getValue() === "medium" ? "warning" : "neutral"}>
            {info.getValue()}
          </Badge>
        ),
      }),
    ],
    [columnHelper],
  );
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, columnId, filterValue) => {
      return String(row.getValue(columnId)).toLowerCase().includes(String(filterValue).toLowerCase());
    },
  });

  return (
    <Panel className="table-panel">
      <label className="table-filter">
        <span>Filter effective values</span>
        <TextField.Root
          aria-label="Filter effective values"
          className="input"
          placeholder="Search key, value, group, or risk"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
        />
      </label>

      <Table.Root className="config-table" variant="surface">
        <Table.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.ColumnHeaderCell key={header.id}>
                  <Button className="table-heading-button" type="button" onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </Button>
                </Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {table.getRowModel().rows.map((row) => (
            <Table.Row key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
              ))}
            </Table.Row>
          ))}
          {table.getRowModel().rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={columns.length}>No effective values match the filter.</Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
    </Panel>
  );
}

function ConfigForm({
  fields,
  formErrors,
  groups,
  layerKind,
  values,
  onChange,
}: {
  fields: ConfigFieldDefinition[];
  formErrors: FormErrorMap;
  groups: ConfigGroup[];
  layerKind?: ConfigLayer["kind"];
  values: FormValues;
  onChange: (field: ConfigFieldDefinition, value: unknown) => void;
}) {
  const { control, reset } = useForm<FormValues>({ defaultValues: values });

  useEffect(() => {
    reset(values);
  }, [reset, values]);

  return (
    <div className="form-groups">
      {groups.map((group) => {
        const groupFields = fields.filter((field) => field.group === group);
        if (groupFields.length === 0) return null;

        return (
          <Panel key={group} className="form-group-panel">
            <SectionTitle as="h3">{group}</SectionTitle>
            <div className="field-grid">
              {groupFields.map((field) => (
                <Controller
                  key={field.key}
                  control={control}
                  name={field.key}
                  render={({ field: formField }) => (
                    <ConfigFieldControl
                      disabled={layerKind === "project" && !field.projectAllowed}
                      error={formErrors[field.key]}
                      field={field}
                      value={formField.value}
                      onChange={(value) => {
                        formField.onChange(value);
                        onChange(field, value);
                      }}
                    />
                  )}
                />
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function ConfigFieldControl({
  disabled,
  error,
  field,
  value,
  onChange,
}: {
  disabled: boolean;
  error?: string;
  field: ConfigFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const inputId = `config-field-${field.key}`;
  const richField = field.key === "tui";
  return (
    <article className={`field-card ${richField ? "field-card-rich" : ""}`}>
      <div className="field-info">
        <div className="field-card-header">
          <div>
            <label className="field-label" htmlFor={inputId}>
              {field.label}
            </label>
            <div className="code muted">{field.key}</div>
          </div>
          <Badge tone={field.risk === "high" ? "danger" : field.risk === "medium" ? "warning" : "neutral"}>{field.risk}</Badge>
        </div>
        <p className="field-description">{field.description}</p>
        <p className="field-purpose">{field.purpose}</p>
        <TextLink className="docs-link" href={field.docsUrl} target="_blank" rel="noreferrer">
          Open Codex docs
        </TextLink>
      </div>

      <div className="field-editor">
        {renderInput(inputId, field, value, disabled, onChange)}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {disabled && field.projectDisabledReason ? <p className="field-disabled-reason">{field.projectDisabledReason}</p> : null}
        {field.inputKind === "select" && field.options ? <SmartOptionDetails options={field.options} value={value} /> : null}
        <pre className="field-example code">{field.exampleToml}</pre>
      </div>
    </article>
  );
}

function renderInput(
  inputId: string,
  field: ConfigFieldDefinition,
  value: unknown,
  disabled: boolean,
  onChange: (value: unknown) => void,
) {
  if (field.key === "tui") {
    return <TuiSettingsControl disabled={disabled} value={value} onChange={onChange} />;
  }

  if (field.inputKind === "select") {
    const selectedValue = typeof value === "string" && value ? value : "__unset";
    return (
      <Select.Root disabled={disabled} value={selectedValue} onValueChange={(next) => onChange(next === "__unset" ? "" : next)}>
        <Select.Trigger id={inputId} aria-label={field.label} className="input radix-select-trigger" />
        <Select.Content position="popper">
          <Select.Item value="__unset">Unset</Select.Item>
          {(field.options ?? []).map((option) => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    );
  }

  if (field.inputKind === "boolean") {
    return (
      <label className="toggle-row" htmlFor={inputId}>
        <Switch
          id={inputId}
          disabled={disabled}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
        Enabled
      </label>
    );
  }

  if (field.inputKind === "number") {
    return (
      <TextField.Root
        id={inputId}
        className="input"
        type="number"
        disabled={disabled}
        value={typeof value === "number" ? String(value) : ""}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      />
    );
  }

  if (field.inputKind === "string-array") {
    return (
      <TextField.Root
        id={inputId}
        className="input"
        disabled={disabled}
        value={Array.isArray(value) ? value.join(", ") : ""}
        placeholder="Comma-separated values"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }

  if (field.inputKind === "key-value-table" || field.inputKind === "boolean-table") {
    return (
      <TextArea
        id={inputId}
        className="input field-json"
        disabled={disabled}
        value={value && typeof value === "object" ? JSON.stringify(value, null, 2) : ""}
        placeholder='{"key": "value"}'
        onChange={(event) => {
          try {
            onChange(event.target.value.trim() ? JSON.parse(event.target.value) : "");
          } catch {
            onChange(event.target.value);
          }
        }}
      />
    );
  }

  return (
    <>
      <TextField.Root
        id={inputId}
        className="input"
        disabled={disabled}
        list={field.allowCustom ? `${inputId}-suggestions` : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.allowCustom ? (
        <datalist id={`${inputId}-suggestions`}>
          {textSuggestions(field).map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function TuiSettingsControl({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const tui = asRecord(value);

  function update(key: string, nextValue: unknown) {
    const next = { ...tui };
    if (nextValue === undefined || nextValue === "") {
      delete next[key];
    } else {
      next[key] = nextValue;
    }
    onChange(next);
  }

  function updateKeymap(context: string, action: string, bindingText: string) {
    const keymap = asRecord(tui.keymap);
    const contextConfig = { ...asRecord(keymap[context]) };
    const parsed = parseBindingText(bindingText);
    if (parsed === undefined) {
      delete contextConfig[action];
    } else {
      contextConfig[action] = parsed;
    }

    const nextKeymap = { ...keymap };
    if (Object.keys(contextConfig).length === 0) {
      delete nextKeymap[context];
    } else {
      nextKeymap[context] = contextConfig;
    }

    update("keymap", Object.keys(nextKeymap).length === 0 ? undefined : nextKeymap);
  }

  return (
    <div className="tui-settings">
      <div className="tui-control-grid">
        <LabeledSelect
          disabled={disabled}
          label="Notifications"
          value={notificationValue(tui.notifications)}
          options={notificationOptions}
          onChange={(next) => update("notifications", parseNotificationValue(next))}
        />
        <LabeledSelect
          disabled={disabled}
          label="Notification method"
          value={stringValue(tui.notification_method)}
          options={[
            { value: "", label: "Default" },
            { value: "auto", label: "Auto" },
            { value: "osc9", label: "OSC 9" },
            { value: "bel", label: "BEL" },
          ]}
          onChange={(next) => update("notification_method", next)}
        />
        <LabeledSelect
          disabled={disabled}
          label="Notification condition"
          value={stringValue(tui.notification_condition)}
          options={[
            { value: "", label: "Default" },
            { value: "unfocused", label: "Unfocused" },
            { value: "always", label: "Always" },
          ]}
          onChange={(next) => update("notification_condition", next)}
        />
        <LabeledSelect
          disabled={disabled}
          label="Animations"
          value={booleanValue(tui.animations)}
          options={booleanSelectOptions}
          onChange={(next) => update("animations", parseBooleanSelect(next))}
        />
        <LabeledSelect
          disabled={disabled}
          label="Show tooltips"
          value={booleanValue(tui.show_tooltips)}
          options={booleanSelectOptions}
          onChange={(next) => update("show_tooltips", parseBooleanSelect(next))}
        />
        <LabeledSelect
          disabled={disabled}
          label="Alternate screen"
          value={primitiveSelectValue(tui.alternate_screen)}
          options={[
            { value: "", label: "Default" },
            { value: "auto", label: "Auto" },
            { value: "true", label: "Enabled" },
            { value: "false", label: "Disabled" },
          ]}
          onChange={(next) => update("alternate_screen", parseAutoBooleanSelect(next))}
        />
        <TextField.Root
          className="input"
          disabled={disabled}
          aria-label="Theme"
          placeholder="Theme, for example catppuccin-mocha"
          value={stringValue(tui.theme)}
          onChange={(event) => update("theme", event.target.value)}
        />
      </div>

      <SelectionGroup
        disabled={disabled}
        items={statusLineItems}
        labelPrefix="Status line"
        selected={arrayValue(tui.status_line)}
        onChange={(next) => update("status_line", next)}
      />
      <SelectionGroup
        disabled={disabled}
        items={terminalTitleItems}
        labelPrefix="Terminal title"
        selected={arrayValue(tui.terminal_title)}
        onChange={(next) => update("terminal_title", next)}
      />

      <div className="keymap-editor">
        <div className="keymap-heading">
          <h5>Keymap shortcuts</h5>
          <p>Use Codex key specs such as ctrl-t, alt-b, enter, esc, f12. Cmd is not a Codex keymap modifier.</p>
        </div>
        <CustomKeymapBindingForm disabled={disabled} onAdd={updateKeymap} />
        <datalist id="common-key-specs">
          {commonKeySpecs.map((spec) => (
            <option key={spec} value={spec} />
          ))}
        </datalist>
        {groupKeymapActions().map(([contextLabel, actions]) => (
          <details className="keymap-context" key={contextLabel} open={contextLabel === "Global" || contextLabel === "Editor"}>
            <summary>{contextLabel}</summary>
            <div className="keymap-table">
              {actions.map((action) => {
                const customBinding = keymapBindingText(tui, action.context, action.action);
                return (
                  <div className="keymap-row" key={`${action.context}.${action.action}`}>
                    <div>
                      <strong>{action.label}</strong>
                      <p>{action.description}</p>
                      <code>tui.keymap.{action.context}.{action.action}</code>
                    </div>
                    <label>
                      <span>Binding</span>
                      <KeyBindingInput
                        disabled={disabled}
                        label={`${action.label} binding`}
                        placeholder={action.defaultBinding ? `Default: ${action.defaultBinding}` : "Unbound by default"}
                        value={customBinding}
                        onChange={(next) => updateKeymap(action.context, action.action, next)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function CustomKeymapBindingForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (context: string, action: string, bindingText: string) => void;
}) {
  const [context, setContext] = useState(keymapContextOptions[0]?.value ?? "global");
  const [action, setAction] = useState("");
  const [binding, setBinding] = useState("");

  function addBinding() {
    if (!action.trim() || !binding.trim()) return;
    onAdd(context, action.trim(), binding.trim());
  }

  return (
    <div className="custom-keymap-form">
      <LabeledSelect
        disabled={disabled}
        label="Custom keymap context"
        value={context}
        options={keymapContextOptions}
        onChange={setContext}
      />
      <label className="select-stack">
        <span>Custom keymap action</span>
        <TextField.Root
          aria-label="Custom keymap action"
          className="input"
          disabled={disabled}
          placeholder="future_action_name"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
      </label>
      <label className="select-stack">
        <span>Custom keymap binding</span>
        <KeyBindingInput
          disabled={disabled}
          label="Custom keymap binding"
          placeholder="ctrl-y"
          value={binding}
          onChange={setBinding}
        />
      </label>
      <Button className="button-secondary custom-keymap-button" disabled={disabled || !action.trim() || !binding.trim()} onClick={addBinding}>
        Add custom keymap binding
      </Button>
    </div>
  );
}

function KeyBindingInput({
  disabled,
  label,
  placeholder,
  value,
  onChange,
}: {
  disabled: boolean;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const bindings = bindingTextParts(value);

  function updateBindingParts(nextBindings: string[]) {
    onChange(nextBindings.join(", "));
  }

  function appendBinding(binding: string) {
    const normalizedBinding = normalizeBinding(binding);
    if (!normalizedBinding || bindings.map(normalizeBinding).includes(normalizedBinding)) return;
    updateBindingParts([...bindings, normalizedBinding]);
  }

  function recordKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    const result = keySpecFromKeyboardEvent(event);
    if (result.ignored) return;

    setRecording(false);
    if (result.error) {
      setRecordingError(result.error);
      return;
    }

    if (result.spec) {
      setRecordingError("");
      appendBinding(result.spec);
    }
  }

  return (
    <div className="key-binding-input">
      <div className="key-binding-row">
        <TextField.Root
          aria-label={label}
          className="input keymap-input"
          disabled={disabled}
          list="common-key-specs"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setRecordingError("");
            onChange(event.target.value);
          }}
        />
        <Button
          aria-label={`Record ${label}`}
          className={`button-secondary key-record-button ${recording ? "recording" : ""}`}
          disabled={disabled}
          onClick={() => {
            setRecordingError("");
            setRecording(true);
          }}
          onKeyDown={recordKey}
        >
          {recording ? "Press keys" : "Record"}
        </Button>
        {recording ? (
          <Button
            aria-label={`Cancel ${label} recording`}
            className="button-secondary key-record-cancel"
            onClick={() => setRecording(false)}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {bindings.length > 0 ? (
        <div className="binding-chip-list" aria-label={`${label} bindings`}>
          {bindings.map((binding) => (
            <Button
              aria-label={`Remove ${binding} from ${label}`}
              className="binding-chip"
              disabled={disabled}
              key={binding}
              onClick={() => updateBindingParts(bindings.filter((item) => item !== binding))}
            >
              {binding} x
            </Button>
          ))}
        </div>
      ) : null}
      {recordingError ? (
        <p className="field-error key-binding-error" role="alert">
          {recordingError}
        </p>
      ) : null}
    </div>
  );
}

function LabeledSelect({
  disabled,
  label,
  value,
  options,
  onChange,
}: {
  disabled: boolean;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const radixValue = value === "" ? emptySelectValue : value;

  return (
    <label className="select-stack tui-select">
      <span>{label}</span>
      <Select.Root
        disabled={disabled}
        value={radixValue}
        onValueChange={(next) => onChange(next === emptySelectValue ? "" : next)}
      >
        <Select.Trigger aria-label={label} className="input radix-select-trigger" />
        <Select.Content position="popper">
          {options.map((option) => (
            <Select.Item key={option.value || emptySelectValue} value={option.value || emptySelectValue}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>
  );
}

function SelectionGroup({
  disabled,
  items,
  labelPrefix,
  selected,
  onChange,
}: {
  disabled: boolean;
  items: string[];
  labelPrefix: string;
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="selection-group">
      <legend>{labelPrefix}</legend>
      {items.map((item) => (
        <label className="selection-chip" key={item}>
          <Checkbox
            aria-label={`${labelPrefix}: ${item}`}
            checked={selected.includes(item)}
            disabled={disabled}
            onCheckedChange={(checked) => {
              const next = checked === true ? [...selected, item] : selected.filter((selectedItem) => selectedItem !== item);
              onChange(next);
            }}
          />
          {item}
        </label>
      ))}
    </fieldset>
  );
}

function SmartOptionDetails({ options, value }: { options: NonNullable<ConfigFieldDefinition["options"]>; value: unknown }) {
  return (
    <div className="option-details">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <div className={`option-detail-row ${selected ? "selected" : ""}`} key={option.value}>
            <div className="option-details-header">
              <strong>{option.label}</strong>
              {selected ? <Badge tone="success">selected</Badge> : null}
              {option.recommended ? <Badge tone="success">recommended</Badge> : null}
              {option.risk ? <Badge tone={option.risk === "high" ? "danger" : option.risk === "medium" ? "warning" : "neutral"}>{option.risk}</Badge> : null}
            </div>
            <p>{option.description}</p>
            {option.exampleToml ? <code>{option.exampleToml}</code> : null}
          </div>
        );
      })}
    </div>
  );
}

function textSuggestions(field: ConfigFieldDefinition): string[] {
  if (field.key === "model") return ["gpt-5.5", "gpt-5.1", "gpt-5", "gpt-4.1"];
  if (field.key === "review_model") return ["gpt-5.5", "gpt-5.1", "gpt-5"];
  if (field.key === "model_provider") return ["openai", "ollama", "lmstudio", "amazon-bedrock", "azure", "openrouter"];
  return [];
}

function validateFieldValue(field: ConfigFieldDefinition, value: unknown): string | undefined {
  if (field.key === "tui") {
    return validateTuiValue(value);
  }

  if ((field.inputKind === "key-value-table" || field.inputKind === "boolean-table") && typeof value === "string" && value.trim()) {
    return `Enter valid JSON for ${field.key}.`;
  }

  if (field.inputKind === "key-value-table" || field.inputKind === "boolean-table") {
    const result = jsonObjectSchema.safeParse(value && typeof value === "object" ? value : {});
    return result.success ? undefined : `Enter a JSON object for ${field.key}.`;
  }

  return undefined;
}

function validateTuiValue(value: unknown): string | undefined {
  const keymap = asRecord(asRecord(value).keymap);
  for (const [context, rawContextConfig] of Object.entries(keymap)) {
    const contextConfig = asRecord(rawContextConfig);
    const seen = new Map<string, string>();
    for (const [action, bindingValue] of Object.entries(contextConfig)) {
      for (const binding of bindingList(bindingValue)) {
        const normalizedBinding = normalizeBinding(binding);
        if (!normalizedBinding) continue;
        const existingAction = seen.get(normalizedBinding);
        if (existingAction) {
          const contextLabel = keymapContextLabel(context);
          return `${normalizedBinding} is already used by ${keymapActionLabel(context, existingAction)} in ${contextLabel}.`;
        }
        seen.set(normalizedBinding, action);
      }
    }
  }
  return undefined;
}

function km(
  context: string,
  contextLabel: string,
  action: string,
  description: string,
  defaultBinding: string,
): KeymapActionDescriptor {
  return {
    context,
    contextLabel,
    action,
    description,
    defaultBinding,
    label: formatActionLabel(action),
  };
}

function groupKeymapActions(): [string, KeymapActionDescriptor[]][] {
  const groups = new Map<string, KeymapActionDescriptor[]>();
  for (const action of keymapActions) {
    groups.set(action.contextLabel, [...(groups.get(action.contextLabel) ?? []), action]);
  }
  return [...groups.entries()];
}

function formatActionLabel(action: string): string {
  const friendlyLabels: Record<string, string> = {
    delete_backward_word: "Delete previous word",
    delete_forward_word: "Delete next word",
  };
  if (friendlyLabels[action]) return friendlyLabels[action];
  const words = action.split("_");
  return words.map((word, index) => (index === 0 ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : word)).join(" ");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function booleanValue(value: unknown): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

function primitiveSelectValue(value: unknown): string {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  return "";
}

function parseBooleanSelect(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseAutoBooleanSelect(value: string): boolean | string | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "auto") return "auto";
  return undefined;
}

function notificationValue(value: unknown): string {
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(",");
  return "";
}

function parseNotificationValue(value: string): boolean | string[] | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value) return value.split(",").filter(Boolean);
  return undefined;
}

function keymapBindingText(tui: Record<string, unknown>, context: string, action: string): string {
  const keymap = asRecord(tui.keymap);
  const contextConfig = asRecord(keymap[context]);
  const binding = contextConfig[action];
  if (Array.isArray(binding)) return binding.filter((item): item is string => typeof item === "string").join(", ");
  if (typeof binding === "string") return binding;
  return "";
}

function parseBindingText(value: string): string | string[] | undefined {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return parts;
}

function bindingTextParts(value: string): string[] {
  return bindingList(parseBindingText(value));
}

function bindingList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function normalizeBinding(value: string): string {
  return value.trim().toLowerCase();
}

function keySpecFromKeyboardEvent(event: KeyboardEvent): { spec?: string; error?: string; ignored?: boolean } {
  const key = normalizeKeyboardKey(event.key);
  if (!key || key === "control" || key === "alt" || key === "shift" || key === "meta") {
    return { ignored: true };
  }

  if (event.metaKey) {
    return { error: "Cmd is not a Codex keymap modifier." };
  }

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("ctrl");
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey && shouldRecordShift(key)) modifiers.push("shift");

  return { spec: [...modifiers, key].join("-") };
}

function normalizeKeyboardKey(key: string): string {
  const namedKeys: Record<string, string> = {
    " ": "space",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    Backspace: "backspace",
    Delete: "delete",
    End: "end",
    Enter: "enter",
    Escape: "esc",
    Home: "home",
    Insert: "insert",
    PageDown: "pagedown",
    PageUp: "pageup",
    Tab: "tab",
  };

  if (namedKeys[key]) return namedKeys[key];
  if (/^F\d{1,2}$/.test(key)) return key.toLowerCase();
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}

function shouldRecordShift(key: string): boolean {
  return key.length > 1;
}

function keymapContextLabel(context: string): string {
  return keymapContextOptions.find((option) => option.value === context)?.label ?? context;
}

function keymapActionLabel(context: string, action: string): string {
  return keymapActions.find((descriptor) => descriptor.context === context && descriptor.action === action)?.label ?? formatActionLabel(action);
}

function layerLabel(layer: ConfigLayer) {
  if (layer.kind === "profile") return `Profile ${layer.name}`;
  return `${layer.kind[0].toUpperCase()}${layer.kind.slice(1)} config`;
}

function createEffectiveRows(effective: EffectiveConfig): EffectiveValueRow[] {
  return Object.entries(effective.values).map(([key, value]) => {
    const entry = getConfigEntry(key);
    return {
      key,
      value,
      formattedValue: formatValue(value),
      group: entry?.uiGroup ?? "Unknown",
      risk: entry?.risk ?? "unknown",
    };
  });
}

function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesScannedConfigFile(file: ScannedConfigFile, query: string): boolean {
  return matchesSearch(query, file.kind, file.name, file.path, file.projectPath);
}

function matchesConfigLayer(layer: ConfigLayer, query: string): boolean {
  return matchesSearch(
    query,
    layerLabel(layer),
    layer.kind,
    layer.name,
    layer.path,
    layer.data,
    layer.text,
    layer.diagnostics,
  );
}

function matchesEffectiveRow(row: EffectiveValueRow, query: string): boolean {
  return matchesSearch(query, row.key, row.formattedValue, row.group, row.risk);
}

function matchesConfigField(field: ConfigFieldDefinition, value: unknown, query: string): boolean {
  return matchesSearch(
    query,
    field.key,
    field.label,
    field.group,
    field.description,
    field.purpose,
    field.exampleToml,
    field.defaultHint,
    field.risk,
    field.options,
    value,
  );
}

function matchesSearch(query: string, ...values: unknown[]): boolean {
  if (!query) return true;
  return values.some((value) => searchableText(value).includes(query));
}

function searchableText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase();
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function editHref(target: "user" | "project") {
  return withToken(`/edit?target=${target}`);
}

function defaultSidePanelsOpen(): boolean {
  return typeof window.matchMedia === "function" ? !window.matchMedia("(max-width: 980px)").matches : true;
}

function formatBackupDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function withToken(path: string) {
  if (!tokenFromUrl) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}token=${encodeURIComponent(tokenFromUrl)}`;
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatMatchCount(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${path} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  return apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
}
