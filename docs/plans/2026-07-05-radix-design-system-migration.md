# Radix Design System Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the Codex Config Board UI to a Radix Themes-based component system while preserving current config behavior, tests, and responsive shell controls.

**Architecture:** Treat `packages/ui` as the app design-system boundary. Radix Themes components provide visual primitives, layout primitives, and accessible controls; app CSS remains only for product-specific composition such as shell drawers, editor sizing, and Monaco integration.

**Tech Stack:** React 19, TypeScript, Radix Themes, lucide-react, react-hook-form, TanStack Table, Vitest, Testing Library.

---

## Current Analysis

The app is partially migrated already:

- `apps/web/src/main.tsx` wraps the app with Radix `Theme`.
- `apps/web/src/App.tsx` uses Radix `Checkbox`, `Select`, `Switch`, `Table`, `Tabs`, `TextArea`, and `TextField`.
- `packages/ui/src/index.tsx` wraps Radix `Button`, `Badge`, and `Card`.

The remaining non-Radix surface is broad:

- App shell, sidebar, inspector, drawer backdrop, nav links, page headers, toolbars, field cards, option details, keymap rows, and selection chips are hand-built with `div`, `button`, `input`, `select`, `a`, and custom CSS.
- Form controls are mixed: some use Radix, while target layer, board project path, TUI theme, custom keymap fields, and `LabeledSelect` still use native controls.
- CSS duplicates Radix concerns: button borders, badges, panels, table chrome, tab active state, input chrome, card backgrounds, and text scale.

Radix docs support this direction:

- Use Radix layout components such as `Box`, `Flex`, `Grid`, and `Container` for spacing and responsive display.
- Use theme tokens and CSS variables for app-specific styling.
- Radix Themes does not impose an `sx` or CSS-in-JS system, so keeping small app CSS for product layout is appropriate.

## Migration Principles

- Do not migrate everything in one patch.
- Preserve behavior first; visual polish comes after passing tests.
- Prefer `packages/ui` wrappers for repeated app patterns.
- Prefer Radix Themes layout primitives over raw `div` when layout intent is local to a component.
- Keep CSS classes for app shell, Monaco editor, drawer positioning, and complex TUI/keymap tables.
- Avoid using Radix `Card` inside Radix `Card` repeatedly; keep repeated item cards flat.

---

### Task 1: Expand UI Package Foundations

**Files:**
- Modify: `packages/ui/src/index.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/App.test.tsx`

**Step 1: Write failing tests**

Add assertions that app-level repeated UI uses semantic wrappers without relying on custom button/panel classes:

```tsx
expect(screen.getByRole("button", { name: "Hide navigation" })).toBeInTheDocument();
expect(screen.getByText("Session").closest("section")).toBeInTheDocument();
```

Run:

```bash
pnpm --filter @codex-config-board/web test
```

Expected: existing tests pass; new tests may fail if wrapper semantics change during implementation.

**Step 2: Add design-system exports**

In `packages/ui/src/index.tsx`, add wrappers around Radix:

- `AppButton` or keep `Button`, but remove custom visual class dependency.
- `Surface` wrapping `Card`.
- `SectionTitle` using Radix `Heading`.
- `MutedText` using Radix `Text`.
- `InlineCode` using Radix `Code`.
- `StatusBadge` or keep `Badge`, backed by Radix `Badge`.

Example:

```tsx
import {
  Badge as RadixBadge,
  Box,
  Button as RadixButton,
  Card,
  Code,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
```

**Step 3: Run verification**

Run:

```bash
pnpm --filter @codex-config-board/ui typecheck
pnpm --filter @codex-config-board/web test
```

Expected: both pass.

---

### Task 2: Migrate App Shell and Navigation

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Step 1: Write failing tests**

Add tests for Radix-backed shell controls:

```tsx
expect(screen.getByRole("button", { name: "Hide navigation" })).toBeInTheDocument();
expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
expect(screen.getByRole("complementary", { name: "Diagnostics inspector" })).toBeInTheDocument();
```

Run:

```bash
pnpm --filter @codex-config-board/web test
```

Expected: tests document current behavior before migration.

**Step 2: Replace shell layout internals**

Use Radix `Box`, `Flex`, `Text`, `IconButton` or `Button` for:

- Brand row
- Navigation toggle controls
- Navigation items where they are buttons; keep anchors for actual links
- Inspector panel stack

Keep CSS for:

- `.app-shell`
- `.sidebar`
- `.inspector`
- `.shell-backdrop`
- responsive drawer transforms

**Step 3: Remove duplicated CSS**

Delete or reduce:

- `.brand-mark` borders if replaced by Radix `Box`
- `.shell-toggle` visual styles if Radix handles button style
- excess manual colors where Radix tokens apply

**Step 4: Verify**

Run:

```bash
pnpm --filter @codex-config-board/web test
pnpm typecheck
```

Expected: all pass.

---

### Task 3: Migrate Page Headers, Panels, Toolbars

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `packages/ui/src/index.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Step 1: Add wrapper components**

In `packages/ui/src/index.tsx`, add:

- `PageHeader`
- `Toolbar`
- `FieldLabel`
- `FieldHelp`

Use Radix `Flex`, `Grid`, `Heading`, `Text`, and `Box`.

**Step 2: Migrate headers**

Replace raw page header markup in:

- `BoardPage`
- `EditPage`

Use:

```tsx
<PageHeader title="Edit config" description="Form controls write TOML..." action={<Badge ... />} />
```

**Step 3: Migrate toolbar surfaces**

Replace raw `.toolbar` usage where it is layout-only with Radix `Flex`.

Keep `.toolbar` only if it remains necessary for legacy layout during migration.

**Step 4: Verify**

Run:

```bash
pnpm --filter @codex-config-board/web test
pnpm typecheck
```

Expected: all pass.

---

### Task 4: Migrate Forms to Radix Field Rows

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Step 1: Write failing tests for form layout classes**

Keep the existing tests:

```tsx
expect(field?.querySelector(".field-info")).toBeInTheDocument();
expect(field?.querySelector(".field-editor")).toBeInTheDocument();
expect(screen.getByText("TUI settings").closest(".field-card")).toHaveClass("field-card-rich");
```

Add a test that native target-layer select becomes a Radix select or equivalent accessible combobox:

```tsx
expect(screen.getByLabelText("Target layer")).toBeInTheDocument();
```

**Step 2: Replace native inputs**

Replace:

- Board project path `<input>` -> `TextField.Root`
- Target layer `<select>` -> Radix `Select`
- TUI theme `<input>` -> `TextField.Root`
- Custom keymap action/binding `<input>` -> `TextField.Root`
- `LabeledSelect` native `<select>` -> Radix `Select`

**Step 3: Preserve form behavior**

Do not change `updateFormValue`, `validateFieldValue`, `applyFormValuesToToml`, or keymap validation logic.

**Step 4: Verify**

Run:

```bash
pnpm --filter @codex-config-board/web test
pnpm typecheck
```

Expected: all tests pass, especially TUI editing and keymap conflict tests.

---

### Task 5: Migrate Data Display and Effective Table Polish

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Step 1: Preserve TanStack behavior**

Do not replace TanStack Table. Keep it as table state/sorting/filtering engine.

**Step 2: Use Radix display primitives**

Migrate cells and labels to:

- Radix `Code`
- Radix `Text`
- Radix `Badge`
- Radix `Table` already in use

Replace raw table heading buttons with Radix `Button` variant where possible, or keep native button if it remains the best semantic table sorting control.

**Step 3: Verify filter and sort**

Run:

```bash
pnpm --filter @codex-config-board/web test -- --run
```

Expected: effective values filter test still passes.

---

### Task 6: Reduce Custom CSS to Product Layout Only

**Files:**
- Modify: `apps/web/src/styles.css`

**Step 1: Inventory removable selectors**

Check which selectors are purely visual duplicates of Radix:

- `.ccb-button`
- `.ccb-badge*`
- `.ccb-panel`
- `.input`
- `.tab-list` visual overrides
- `.config-table` visual overrides

**Step 2: Remove in small groups**

Remove only selectors whose component has been migrated to Radix props/tokens.

Keep:

- `.app-shell`
- `.sidebar`
- `.inspector`
- `.shell-backdrop`
- `.field-card`
- `.field-card-rich`
- `.editor-shell`
- `.editor-fallback`
- `.tui-settings`
- `.keymap-*`

**Step 3: Verify after every group**

Run:

```bash
pnpm --filter @codex-config-board/web test
```

Expected: all pass.

---

### Task 7: Final Visual and Regression Verification

**Files:**
- Modify only if a verified issue appears.

**Step 1: Full automated checks**

Run:

```bash
pnpm --filter @codex-config-board/web test
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- All tests pass.
- Typecheck passes.
- Build passes.
- Existing Vite chunk-size warning may remain unless separately addressed.

**Step 2: Manual browser checks**

Open the local app and verify:

- Board page
- Edit page Model tab
- Edit page TUI tab
- TUI keymap custom binding
- Conflict validation
- Sidebar hide/show
- Inspector hide/show
- Mobile-width responsive behavior

**Step 3: Optional screenshot verification**

If Playwright or a browser harness is added later, capture:

- Desktop edit TUI tab
- Tablet edit TUI tab
- Mobile edit TUI tab with drawers closed/open

---

## Migration Order Summary

1. Expand `packages/ui` wrappers.
2. Migrate shell/navigation.
3. Migrate headers, panels, toolbars.
4. Migrate form controls.
5. Polish data display.
6. Remove redundant custom CSS.
7. Full verification.

## Non-goals

- Do not replace Monaco.
- Do not replace TanStack Table state management.
- Do not change config parsing, TOML writing, or keymap validation behavior.
- Do not add a new CSS framework.
- Do not redesign the information architecture again.

