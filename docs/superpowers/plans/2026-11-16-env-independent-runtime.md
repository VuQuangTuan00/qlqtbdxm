# Env-Independent Electron Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SQL Server configuration, startup, backup, logging, and authentication work in development and packaged Electron builds without a `.env` file.

**Architecture:** Move all persisted SQL Server settings behind a focused `userData/db-config.json` module, and make database/IPC/startup code consume that module instead of environment variables. Derive development state from Electron `app.isPackaged`, use stable internal defaults for logging and bcrypt, and resolve the SQL Server backup folder from preserved config or the connected SQL Server instance.

**Tech Stack:** Electron 29, Node.js CommonJS, `mssql`, `electron-log`, `bcryptjs`, Node `node:test`, electron-builder.

**Spec:** `docs/superpowers/specs/2026-11-16-env-independent-runtime-design.md`

## Global Constraints

- Do not change UI markup/layout, database schema, migrations, or business logic.
- Do not delete, truncate, or silently replace an existing `db-config.json`.
- Preserve the user's existing uncommitted edits in `main/database/mssql.js` and `renderer/pages/settings/settings.js`.
- Never log or return the stored SQL password to the renderer.
- Production runtime must not read `DB_SERVER`, `DB_HOST`, `DB_PORT`, `DB_INSTANCE`, `DB_NAME`, `DB_USER`, or `DB_PASSWORD`.
- `TEST_DB_*` remains test-only and must never be imported by application runtime modules.
- Do not commit changes unless the user explicitly requests a commit; verify each task using tests and `git diff` instead.

## Review Focus

- A missing config file must open first-run setup without attempting any database connection; covered by Task 4 startup tests.
- Invalid/truncated JSON must remain untouched and lead to recovery instead of a crash or overwrite; covered by Tasks 1 and 4.
- Saving from the existing form must retain an omitted password and unknown keys such as `backupDirectory`; covered by Task 3 IPC tests.
- A remote SQL Server default backup path may be unreadable by Electron; covered by Task 2 resolver/error tests.
- A packaged build must not enable DevTools or require `.env`; covered by Tasks 5–7.

---

### Task 1: Centralize persisted SQL Server configuration

**Files:**
- Create: `main/config/db-config.js`
- Create: `tests/unit/config/db-config.test.js`
- Modify: `main/database/mssql.js`
- Modify: `main/database/index.js`

**Interfaces:**
- Produces: `getDbConfigPath(): string`, `readDbConfig(): object|null`, `readDbConfigForRecovery(): object|null`, `writeDbConfig(patch: object): object`, and `validateDbConfig(config: object): object`.
- Consumes: Electron `app.getPath('userData')` and the existing JSON shape (`mode`, `server`, optional `port`/`instanceName`, `database`, `user`, `password`, optional `backupDirectory`).

- [ ] **Step 1: Write failing configuration tests**

  Add tests proving: a missing file returns `null`; valid JSON is returned unchanged; malformed JSON throws a configuration-specific error without changing the file bytes; missing required fields are rejected; values in production `DB_*` environment variables are ignored; and `writeDbConfig` merges unknown keys/password and uses a same-directory temporary file.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node tests/unit/config/db-config.test.js`

  Expected: FAIL because `main/config/db-config.js` does not exist.

- [ ] **Step 3: Implement the configuration module**

  Implement the five exported functions with strict required-field/port validation, recovery-safe parsing, merge semantics, and atomic temp-file rename. Do not add defaults for connection credentials.

- [ ] **Step 4: Make database exports consume the module**

  Remove environment fallback logic from `main/database/mssql.js`, import `readDbConfig` as `getDbConfig`, and re-export it through `main/database/index.js`. Make `initMssqlDatabase()` throw a clear “chưa cấu hình” error when it receives `null`.

- [ ] **Step 5: Run focused and existing database tests**

  Run: `node tests/unit/config/db-config.test.js`

  Run: `node tests/unit/database/sql-transformer.test.js`

  Expected: PASS with no source read of production `DB_*` variables.

### Task 2: Resolve connection endpoint and backup directory without environment variables

**Files:**
- Modify: `main/database/mssql.js`
- Modify: `main/database/index.js`
- Modify: `main/ipc/file-archive.ipc.js`
- Create: `tests/unit/database/mssql-runtime-config.test.js`
- Create: `tests/unit/database/backup-directory.test.js`

**Interfaces:**
- Produces: `getMssqlBackupDirectory(): Promise<string>` from `main/database/mssql.js` and `main/database/index.js`.
- Consumes: optional `db-config.json.backupDirectory`; otherwise the active pool query `SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultBackupPath')) AS backup_directory`.

- [ ] **Step 1: Write failing SQL connection configuration tests**

  Test that an explicit numeric `port` is passed without a fabricated instance name, an explicit `instanceName` is passed without a fabricated port, and server/database/user/password come only from the persisted config object.

- [ ] **Step 2: Write failing backup directory tests**

  Test configured `backupDirectory` precedence, SQL Server property fallback, trimmed/empty values, missing server property, and an unreadable/nonexistent directory error that explains the local/UNC requirement.

- [ ] **Step 3: Run both tests and verify RED**

  Run: `node tests/unit/database/mssql-runtime-config.test.js`

  Run: `node tests/unit/database/backup-directory.test.js`

  Expected: FAIL because the resolver/export does not exist and current IPC reads `SQLSERVER_BACKUP_DIR`.

- [ ] **Step 4: Implement endpoint and backup resolution**

  Build the `mssql` connection object without hard-coded server/instance credentials. Implement `getMssqlBackupDirectory()` and update export IPC to await it before constructing the temporary `.bak` path. Keep existing ZIP, cleanup, and restore behavior unchanged.

- [ ] **Step 5: Run focused backup tests**

  Run the two Task 2 files and `node tests/integration/backup/transfer-package-validation.test.js`.

  Expected: focused tests PASS; integration skips caused by sandbox must be reported rather than counted as passes.

### Task 3: Preserve configuration through DB setup IPC

**Files:**
- Modify: `main/ipc/db-config.ipc.js`
- Modify: `tests/security/authorization/db-config-ipc.test.js`

**Interfaces:**
- Consumes: Task 1 `readDbConfig`, `readDbConfigForRecovery`, and `writeDbConfig`.
- Produces: existing `dbconfig:get`, `dbconfig:set`, and `dbconfig:test` IPC contracts with password always redacted.

- [ ] **Step 1: Add failing IPC persistence tests**

  Cover first-run `get` when config is `null`, preserving an old password when omitted, preserving `backupDirectory` and unknown keys, rejecting invalid required fields, not returning password, and leaving the original file unchanged when atomic replacement fails.

- [ ] **Step 2: Run and verify RED**

  Run: `node tests/security/authorization/db-config-ipc.test.js`

  Expected: at least the null-config and unknown-key preservation cases FAIL against current code.

- [ ] **Step 3: Update IPC handlers**

  Replace direct JSON writes with Task 1 functions, keep setup/admin authorization unchanged, and return an empty config shape during first-run without dereferencing `null`.

- [ ] **Step 4: Run authorization tests**

  Run: `node tests/security/authorization/db-config-ipc.test.js`

  Run: `node tests/run-tests.js security`

  Expected: PASS, with no password in response assertions.

### Task 4: Make startup select first-run or recovery from config state

**Files:**
- Modify: `main/index.js`
- Create: `tests/unit/app/startup-config-routing.test.js`

**Interfaces:**
- Consumes: Task 1 `readDbConfig()` and `readDbConfigForRecovery()`.
- Produces: existing renderer events `app:first-run` and `app:db-setup`; no UI contract changes.

- [ ] **Step 1: Add failing startup routing tests**

  Isolate startup decision logic and prove: missing file selects first-run without calling `initDatabase`; valid config attempts initialization; invalid JSON/shape selects recovery without modifying the file; connection error selects recovery with only server/port/database/user fields.

- [ ] **Step 2: Run and verify RED**

  Run: `node tests/unit/app/startup-config-routing.test.js`

  Expected: FAIL because startup currently branches only on file existence and the decision is not independently testable.

- [ ] **Step 3: Implement testable startup routing**

  Extract the minimal decision helper if needed, remove `fs.existsSync` as the source of truth, retain existing IPC registration order, and ensure no invalid config is automatically overwritten.

- [ ] **Step 4: Run startup and renderer contract tests**

  Run the Task 4 test and `node tests/unit/renderer/markup-contract.test.js`.

  Expected: PASS with unchanged renderer markup.

### Task 5: Replace operational environment variables with runtime-safe defaults

**Files:**
- Modify: `main/window-manager.js`
- Modify: `main/utils/logger.js`
- Modify: `main/utils/hash.js`
- Modify: `tests/security/ipc/window-manager-security.test.js`
- Create: `tests/unit/utils/runtime-defaults.test.js`

**Interfaces:**
- Consumes: Electron `app.isPackaged`.
- Produces: DevTools enabled/opened only when `app.isPackaged === false`; file log level `info`; console level `debug` in development and `warn` when packaged; bcrypt rounds fixed at `10`.

- [ ] **Step 1: Add failing packaged/development tests**

  Test both values of `app.isPackaged`, logger transport levels without `NODE_ENV`/`LOG_LEVEL`, and bcrypt hash cost remaining 10 even when `BCRYPT_ROUNDS` is present.

- [ ] **Step 2: Run and verify RED**

  Run: `node tests/unit/utils/runtime-defaults.test.js`

  Run: `node tests/security/ipc/window-manager-security.test.js`

  Expected: new assertions FAIL because current code reads environment variables.

- [ ] **Step 3: Implement runtime defaults**

  Use `app.isPackaged` in window/logger code and a module constant in hash code. Keep login/session services and hash comparison behavior unchanged.

- [ ] **Step 4: Run runtime and auth tests**

  Run Task 5 tests plus `node tests/unit/auth/auth-service.test.js` and `node tests/security/authorization/auth-ipc.test.js`.

  Expected: PASS.

### Task 6: Remove dotenv and enforce a source-level environment contract

**Files:**
- Modify: `main/index.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `.env.example`
- Modify: `docs/HUONG_DAN_CHUYEN_MAY.txt`
- Create: `tests/security/runtime-environment-contract.test.js`

**Interfaces:**
- Produces: a packaged/runtime source tree with no direct `dotenv` dependency and no application reads of removed variables.
- Preserves: test-only `TEST_DB_*` configuration.

- [ ] **Step 1: Write the failing static contract test**

  Assert that `main` and `renderer` contain no `require('dotenv')`, `dotenv.config`, production `DB_*`, `NODE_ENV`, `LOG_LEVEL`, `BCRYPT_ROUNDS`, `SESSION_SECRET`, or `SQLSERVER_BACKUP_DIR`; package manifests have no direct `dotenv` dependency; build files omit `.env`; and `TEST_DB_*` is confined to tests/docs.

- [ ] **Step 2: Run and verify RED**

  Run: `node tests/security/runtime-environment-contract.test.js`

  Expected: FAIL against current runtime sources and package manifest.

- [ ] **Step 3: Remove direct dotenv use/dependency and stale instructions**

  Delete the load call and `.env.example`, remove only the top-level dependency using npm's lockfile-aware uninstall/update mechanism, and update backup documentation to describe `db-config.json.backupDirectory` plus SQL Server automatic discovery.

- [ ] **Step 4: Run the contract and full security suites**

  Run Task 6 test and `npm run test:security`.

  Expected: PASS. Transitive build-tool copies of dotenv under `node_modules`/lockfile are allowed only when no top-level application dependency remains.

### Task 7: Full regression, packaging, and no-.env smoke verification

**Files:**
- Verify only; do not change product code unless a preceding test exposes a regression.

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: evidence for development tests and packaged Windows artifact behavior.

- [ ] **Step 1: Confirm no real `.env` is needed**

  Run the test suite with the project `.env` temporarily moved to a uniquely named path outside app lookup, restore it in a `finally` block, and verify `npm test` exits 0. Never print the file contents.

- [ ] **Step 2: Run full automated verification**

  Run: `npm test`

  Run: `npm run build`

  Expected: both exit 0; record pass/fail/skip counts and build artifact paths.

- [ ] **Step 3: Inspect the packaged application**

  Verify the packaged `app.asar`/resources do not include `.env` or `.env.example`, direct `dotenv` application code, or hard-coded credentials.

- [ ] **Step 4: Smoke-test packaged first run with isolated userData**

  Launch the unpacked packaged executable with a newly created temporary `--user-data-dir`, no `.env`, and no production database access. Confirm the existing SQL Server first-run screen is displayed and no automatic connection is attempted; close it and retain logs/screenshots only as test evidence.

- [ ] **Step 5: Verify final diff and requirement matrix**

  Run `git diff --check`, `git status --short`, and a final `rg` audit. Report every removed/retained environment variable, reasons, test skips/limitations, modified files, and confirm existing user changes were preserved.
