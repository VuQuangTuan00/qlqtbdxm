# Unified SQL Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two startup SQL Server forms with one mode-aware `db-setup.js` form.

**Architecture:** Main emits only `app:db-setup` with a `first-run` or `recovery` mode. Renderer derives headings and error visibility from that mode while sharing the existing form actions.

**Tech Stack:** Electron 29, renderer JavaScript, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-17-unified-sql-setup-design.md`

## Global Constraints

- Keep the Settings database tab unchanged.
- Do not add endpoint defaults or expose credentials.
- Do not change database schema or business logic.
- Do not commit or merge.

## Review Focus

- Missing payload fields must safely default to first-run values.
- First-run must not display a false connection error.
- Recovery must retain the error and salvageable server/port/database/user fields.
- Save/test failure handling must remain available in both modes.
- Removed channel/script references must not remain in preload or HTML.

---

### Task 1: Enforce the unified startup contract

**Files:**
- Create: `tests/security/unified-db-setup.test.js`
- Modify: `main/index.js`
- Modify: `main/preload.js`
- Modify: `renderer/index.html`
- Modify: `renderer/js/db-setup.js`
- Delete: `renderer/js/first-run.js`
- Modify: `tests/security/runtime-environment-contract.test.js`

**Interfaces:**
- Consumes: startup result `{ mode: 'first-run' | 'recovery', error?, config? }`.
- Produces: renderer event `app:db-setup` with `{ mode, error, config }`.

- [ ] **Step 1: Write failing contract tests**

Assert that `app:first-run` and `first-run.js` are absent; both startup branches emit `app:db-setup`; `db-setup.js` distinguishes `first-run` from `recovery`, hides error details for first-run, and retains save/test failure handling.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/security/unified-db-setup.test.js tests/security/runtime-environment-contract.test.js`

Expected: failures because the legacy channel/file and dual script tags still exist.

- [ ] **Step 3: Implement the single mode-aware screen**

Send `app:db-setup` for first-run, remove the legacy receive channel and script, delete `first-run.js`, and make `db-setup.js` render first-run/recovery copy and error visibility from its payload.

- [ ] **Step 4: Run focused and full verification**

Run the focused command, then `npm test`, `npm run build`, inspect `app.asar`, and smoke-test packaged first-run with isolated `userData`.

Expected: all tests pass; package contains only `db-setup.js`; first-run opens without creating `db-config.json`.
