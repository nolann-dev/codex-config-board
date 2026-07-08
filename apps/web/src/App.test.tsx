import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  test("renders board overview with edit actions", async () => {
    mockApi();

    renderApp();

    expect(await screen.findByText("Codex Config Board")).toBeInTheDocument();
    expect(await screen.findByText("Scanned config files")).toBeInTheDocument();
    expect(screen.getByText("/repo/service/.codex/config.toml")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load /repo/service/.codex/config.toml" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "gpt-5.5" })).toBeInTheDocument();
    expect((await screen.findAllByRole("cell", { name: "workspace-write" })).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /edit user config/i })).toHaveAttribute("href", expect.stringContaining("/edit"));
    expect(screen.getByRole("link", { name: /edit project config/i })).toHaveAttribute("href", expect.stringContaining("/edit"));
  });

  test("shows backup history and restores a selected backup", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi();

    renderApp();

    expect(await screen.findByText("Backup history")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/.codex/backups/config.toml.20260705.bak")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore backup from Jul 5, 2026, 10:30 AM" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/backups/restore"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            targetPath: "/Users/me/.codex/config.toml",
            backupPath: "/Users/me/.codex/backups/config.toml.20260705.bak",
          }),
        }),
      );
    });
  });

  test("renders edit page tabs and smart select descriptions", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    expect(await screen.findByRole("heading", { name: "Edit config" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Model" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Environment" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "TUI" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Features" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(await screen.findByLabelText("Sandbox mode")).toBeInTheDocument();
    expect(screen.getByText("Workspace write")).toBeInTheDocument();
    expect(screen.getByText(/Can read files and write inside the current workspace/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Sandbox mode"));
    await user.click(await screen.findByRole("option", { name: "Workspace write" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/sandbox_mode = "workspace-write"/)).toBeInTheDocument();
    });
  });

  test("searches fields on the edit config page", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    expect(await screen.findByRole("heading", { name: "Edit config" })).toBeInTheDocument();
    expect(screen.getByLabelText("Default model")).toBeInTheDocument();
    expect(screen.getByLabelText("Model provider")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search config fields"), "configured local");

    expect(screen.queryByLabelText("Default model")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Model provider")).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });

  test("model tab disables project-disallowed fields for project config", async () => {
    window.history.pushState({}, "", "/edit?target=project");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });

    expect(screen.getByLabelText("Model provider")).toBeDisabled();
    expect(screen.getByText(/Set this in user-level config/)).toBeInTheDocument();
  });

  test("renders rich TUI settings with editable keymap bindings", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "TUI" }));

    expect(screen.getByText("TUI settings").closest(".field-card")).toHaveClass("field-card-rich");
    expect(screen.getAllByText("TUI settings")).toHaveLength(1);
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    expect(screen.getByLabelText("Notification method")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: model")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: context-used")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: five-hour-limit")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: weekly-limit")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: used-tokens")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: thread-id")).toBeInTheDocument();
    expect(screen.getByLabelText("Status line: fast-mode")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status line: token-limit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status line: tokens-used")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status line: session-duration")).not.toBeInTheDocument();
    expect(screen.getByText("Keymap shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Open transcript")).toBeInTheDocument();
    expect(screen.getByText("Delete previous word")).toBeInTheDocument();
    expect(screen.getByLabelText("Notification method").tagName).not.toBe("SELECT");

    await user.click(screen.getByLabelText("Notification method"));
    await user.click(await screen.findByRole("option", { name: "BEL" }));
    await user.clear(screen.getByLabelText("Open transcript binding"));
    await user.type(screen.getByLabelText("Open transcript binding"), "ctrl-y");

    await waitFor(() => {
      expect(screen.getByDisplayValue(/notification_method = "bel"/)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/open_transcript = "ctrl-y"/)).toBeInTheDocument();
    });
  });

  test("adds custom keymap bindings and blocks same-context conflicts", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "TUI" }));

    expect(screen.getByLabelText("Custom keymap context").tagName).not.toBe("SELECT");
    await user.type(screen.getByLabelText("Custom keymap action"), "open_notes");
    await user.type(screen.getByLabelText("Custom keymap binding"), "ctrl-t");
    await user.click(screen.getByRole("button", { name: "Add custom keymap binding" }));

    expect(await screen.findByText(/ctrl-t is already used by Open transcript in Global/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/open_notes = "ctrl-t"/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Custom keymap binding"));
    await user.type(screen.getByLabelText("Custom keymap binding"), "ctrl-y");
    await user.click(screen.getByRole("button", { name: "Add custom keymap binding" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/open_notes = "ctrl-y"/)).toBeInTheDocument();
    });
  });

  test("records a keyboard combo into an empty built-in keymap binding", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "TUI" }));
    await user.clear(screen.getByLabelText("Open transcript binding"));
    await user.click(screen.getByRole("button", { name: "Record Open transcript binding" }));
    await user.keyboard("{Control>}y{/Control}");

    await waitFor(() => {
      expect(screen.getByDisplayValue(/open_transcript = "ctrl-y"/)).toBeInTheDocument();
    });
  });

  test("appends recorded combos as binding chips without duplicating existing bindings", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "TUI" }));
    await user.click(screen.getByRole("button", { name: "Record Open transcript binding" }));
    await user.keyboard("{Alt>}b{/Alt}");

    await waitFor(() => {
      expect(screen.getByDisplayValue(/open_transcript = \[ "ctrl-t", "alt-b" \]/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Record Open transcript binding" }));
    await user.keyboard("{Control>}t{/Control}");

    await waitFor(() => {
      expect(screen.getByDisplayValue(/open_transcript = \[ "ctrl-t", "alt-b" \]/)).toBeInTheDocument();
    });
  });

  test("rejects Cmd key recordings because Codex keymap does not support Cmd modifiers", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "TUI" }));
    await user.click(screen.getByRole("button", { name: "Record Open transcript binding" }));
    await user.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByText("Cmd is not a Codex keymap modifier.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/open_transcript = \[ "ctrl-t", "meta-k" \]/)).not.toBeInTheDocument();
  });

  test("filters effective config values from the table search", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    mockApi();

    renderApp();

    expect(await screen.findByRole("cell", { name: "gpt-5.5" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "workspace-write" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Filter effective values"), "sandbox");

    expect(screen.queryByRole("cell", { name: "gpt-5.5" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "workspace-write" })).toBeInTheDocument();
  });

  test("searches config across files, layers, and effective values", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    mockApi();

    renderApp();
    const board = within(screen.getByRole("main"));

    expect(await board.findByText("/repo/service/.codex/config.toml")).toBeInTheDocument();
    expect(board.getAllByText("/Users/me/.codex/config.toml").length).toBeGreaterThan(0);
    expect(board.getByText("Project config")).toBeInTheDocument();
    expect(board.getByRole("cell", { name: "gpt-5.5" })).toBeInTheDocument();

    await user.type(board.getByLabelText("Search config"), "workspace-write");

    expect(board.getByRole("cell", { name: "workspace-write" })).toBeInTheDocument();
    expect(board.queryByRole("cell", { name: "gpt-5.5" })).not.toBeInTheDocument();
    expect(board.getByText("Project config")).toBeInTheDocument();
    expect(board.queryAllByText("/Users/me/.codex/config.toml")).toHaveLength(0);
    expect(board.getByText("2 matches")).toBeInTheDocument();
  });

  test("shows validation feedback for invalid object field JSON", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "Environment" }));

    const historyField = await screen.findByLabelText("History");
    await user.clear(historyField);
    await user.type(historyField, "{{");

    expect(await screen.findByText("Enter valid JSON for history.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/history =/)).not.toBeInTheDocument();
  });

  test("project tab groups project root and project document settings", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });
    await user.click(screen.getByRole("tab", { name: "Project" }));

    expect(screen.getByLabelText("Project root markers")).toBeInTheDocument();
    expect(screen.getByLabelText("Project doc max bytes")).toBeInTheDocument();
    expect(screen.getByLabelText("Project doc fallback filenames")).toBeInTheDocument();
  });

  test("renders fields as two-column setting rows", async () => {
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });

    const field = screen.getByLabelText("Default model").closest(".field-card");
    expect(field?.querySelector(".field-info")).toBeInTheDocument();
    expect(field?.querySelector(".field-editor")).toBeInTheDocument();
    expect(field).not.toHaveClass("field-card-rich");
  });

  test("uses Radix select trigger for target layer", async () => {
    window.history.pushState({}, "", "/edit?target=user");
    mockApi();

    renderApp();

    await screen.findByRole("heading", { name: "Edit config" });

    expect(screen.getByLabelText("Target layer").tagName).not.toBe("SELECT");
  });

  test("toggles navigation and inspector drawers", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    mockApi();

    renderApp();

    await screen.findByText("Codex Config Board");

    const shell = screen.getByTestId("app-shell");
    expect(shell).toHaveClass("nav-open");
    expect(shell).toHaveClass("inspector-open");

    await user.click(screen.getByRole("button", { name: "Hide navigation" }));
    expect(shell).not.toHaveClass("nav-open");
    expect(screen.getByRole("button", { name: "Show navigation" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide inspector" }));
    expect(shell).not.toHaveClass("inspector-open");
    expect(screen.getByRole("button", { name: "Show inspector" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show navigation" }));
    await user.click(screen.getByRole("button", { name: "Show inspector" }));
    expect(shell).toHaveClass("nav-open");
    expect(shell).toHaveClass("inspector-open");
  });
});

function renderApp() {
  return render(
    <Theme accentColor="green" grayColor="sage" radius="small" scaling="95%">
      <App />
    </Theme>,
  );
}

function mockApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        return jsonResponse({ codexHome: "/Users/me/.codex", backupDir: "/Users/me/.codex/backups" });
      }
      if (url.includes("/api/backups/restore")) {
        return jsonResponse({ ok: true, backupPath: "/Users/me/.codex/backups/config.toml.restore-point.bak" });
      }
      if (url.includes("/api/backups")) {
        return jsonResponse({
          backups: [
            {
              id: 1,
              targetPath: "/Users/me/.codex/config.toml",
              backupPath: "/Users/me/.codex/backups/config.toml.20260705.bak",
              createdAt: "2026-07-05T10:30:00.000Z",
            },
          ],
        });
      }
      if (url.includes("/api/config/scan")) {
        return jsonResponse({
          files: [
            {
              kind: "project",
              path: "/repo/service/.codex/config.toml",
              projectPath: "/repo/service",
            },
            {
              kind: "user",
              path: "/Users/me/.codex/config.toml",
            },
          ],
        });
      }
      if (url.includes("/api/config/layers")) {
        return jsonResponse({
          layers: [
            {
              kind: "project",
              path: "/repo/.codex/config.toml",
              data: { sandbox_mode: "workspace-write" },
              text: 'sandbox_mode = "workspace-write"\n',
            },
            {
              kind: "user",
              path: "/Users/me/.codex/config.toml",
              data: {
                model: "gpt-5.5",
                sandbox_mode: "read-only",
                model_provider: "openai",
                tui: {
                  animations: true,
                  keymap: {
                    global: {
                      open_transcript: "ctrl-t",
                    },
                  },
                },
              },
              text: 'model = "gpt-5.5"\nsandbox_mode = "read-only"\nmodel_provider = "openai"\n\n[tui]\nanimations = true\n\n[tui.keymap.global]\nopen_transcript = "ctrl-t"\n',
            },
          ],
        });
      }
      if (url.includes("/api/config/effective")) {
        return jsonResponse({
          values: { model: "gpt-5.5", sandbox_mode: "workspace-write", model_provider: "openai" },
          sources: {},
        });
      }
      return jsonResponse({});
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
