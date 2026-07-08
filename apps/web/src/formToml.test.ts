import { describe, expect, test } from "vitest";
import { applyFormValuesToToml, toFormValues } from "./formToml";
import { listConfigFields } from "@codex-config-board/codex-schema";

describe("browser form TOML helper", () => {
  test("maps config data to known form values", () => {
    expect(
      toFormValues(
        {
          model: "gpt-5.5",
          sandbox_mode: "workspace-write",
          custom_future_key: true,
        },
        listConfigFields(),
      ),
    ).toMatchObject({
      model: "gpt-5.5",
      sandbox_mode: "workspace-write",
    });
  });

  test("updates known values while preserving unknown keys and tables", () => {
    const nextText = applyFormValuesToToml(
      'model = "gpt-5.4"\ncustom_future_key = true\n\n[unknown_table]\nvalue = "keep"\n',
      {
        model: "gpt-5.5",
        sandbox_mode: "workspace-write",
        web_search: "",
        features: { shell_snapshot: true },
      },
      listConfigFields(),
    );

    expect(nextText).toContain('model = "gpt-5.5"');
    expect(nextText).toContain('sandbox_mode = "workspace-write"');
    expect(nextText).not.toContain("web_search");
    expect(nextText).toContain("custom_future_key = true");
    expect(nextText).toContain("[unknown_table]");
    expect(nextText).toContain('value = "keep"');
    expect(nextText).toContain("[features]");
    expect(nextText).toContain("shell_snapshot = true");
  });

  test("serializes nested tui settings and replaces old nested tui tables", () => {
    const nextText = applyFormValuesToToml(
      '[tui]\nanimations = true\n\n[tui.keymap.global]\nopen_transcript = "ctrl-x"\n\n[unknown_table]\nvalue = "keep"\n',
      {
        tui: {
          animations: false,
          status_line: ["model", "git-branch"],
          keymap: {
            global: {
              open_transcript: "ctrl-t",
            },
            composer: {
              submit: ["enter", "ctrl-m"],
            },
          },
        },
      },
      listConfigFields(),
    );

    expect(nextText).toContain("[tui]");
    expect(nextText).toContain("animations = false");
    expect(nextText).toContain('status_line = [ "model", "git-branch" ]');
    expect(nextText).toContain("[tui.keymap.global]");
    expect(nextText).toContain('open_transcript = "ctrl-t"');
    expect(nextText).toContain("[tui.keymap.composer]");
    expect(nextText).toContain('submit = [ "enter", "ctrl-m" ]');
    expect(nextText).not.toContain("ctrl-x");
    expect(nextText).toContain("[unknown_table]");
  });

  test("quotes dotted table keys when serializing TUI model availability", () => {
    const nextText = applyFormValuesToToml(
      '[tui.model_availability_nux]\n"gpt-5.5" = 1\n',
      {
        tui: {
          model_availability_nux: {
            "gpt-5.5": 2,
          },
        },
      },
      listConfigFields(),
    );

    expect(nextText).toContain("[tui.model_availability_nux]");
    expect(nextText).toContain('"gpt-5.5" = 2');
    expect(nextText).not.toContain("\ngpt-5.5 = 2");
  });
});
