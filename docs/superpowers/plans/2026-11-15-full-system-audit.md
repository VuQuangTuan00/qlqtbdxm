# Full System Audit and Bug Fixing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the current Electron application end-to-end, reproduce and safely fix confirmed defects, add repeatable automated tests, and produce evidence-based release-readiness reports.

**Architecture:** Treat the production SQL Server and user files as read-only unless an isolated test environment is explicitly available. Build a lightweight Node.js test harness around existing CommonJS modules, inject controlled test doubles only at external boundaries, and use hidden Electron windows for renderer behavior. Record every untestable production-dependent scenario as `BLOCKED` or `NOT TESTED` rather than inferring a pass.

**Tech Stack:** Electron 29.1.0, Node.js built-in test runner, CommonJS, SQL Server through `mssql`/`tedious`, vanilla HTML/CSS/JavaScript, PowerShell ZIP integration, electron-builder/NSIS.

**Spec:** User-provided `MASTER PROMPT V4 — FULL SYSTEM AUDIT, DEEP TESTING & BUG FIXING` attached on 2026-11-15; baseline reference `docs/SOURCE_CODE_ANALYSIS.md`.

## Global Constraints

- Never reset, seed, migrate, drop, truncate, restore over, or run CRUD against a production database.
- Never delete or overwrite original images, PDFs, archives, userData, `.git-backup`, `dist`, or uncommitted user changes.
- Do not expose credentials in test output, fixtures, or reports and do not introduce new hard-coded passwords.
- Do not change the database engine, business rules, RBAC policy, application architecture, logo, fonts, colors, background, or layout without a reproduced bug and clear existing policy.
- Use a failing regression test before every safe production fix when practical; verify the focused test and related regression suite afterward.
- Distinguish static inspection, isolated automated tests, live SQL Server integration, Electron runtime tests, packaged-app tests, and installer tests in all reports.
- Do not report `PASS`, `FIXED`, or release readiness without fresh evidence from the corresponding command or runtime scenario.

## Review Focus

- A malicious or stale absolute file path must never allow read, open, overwrite, or delete outside approved userData folders; covered by Task 5 path-boundary tests.
- Unauthenticated or non-admin renderer code must not read/change database configuration after first-run; covered by Task 4 IPC authorization tests.
- Failed multi-record maintenance operations must rollback completely and remain retry-safe; covered by Task 3 transaction tests and live integration only when an isolated SQL Server exists.
- ZIP import must reject traversal, duplicate entries, unsupported structure, excessive size/count, and checksum mismatch before touching live files; covered by Task 5 archive tests.
- Async route failure, repeated render, and double submit must not leave stale UI or duplicate listeners/records; covered by Task 6 Electron renderer tests.

---

### Task 1: Establish the Current-Source Baseline and Test Inventory

**Files:**
- Create: `docs/audit/00_SOURCE_INVENTORY.md`
- Modify: `docs/superpowers/plans/2026-11-15-full-system-audit.md`

**Interfaces:**
- Consumes: Current Git worktree, `docs/SOURCE_CODE_ANALYSIS.md`, package/build config, all files under `main/`, `renderer/`, and `scripts/`.
- Produces: Verified architecture map, active database engine, module/UI/IPC/service/repository/DB matrix, dependency/test inventory, and protected dirty-file list.

- [ ] Record `git status`, branch, current commit, installed dependencies, scripts, and build configuration without changing them.
- [ ] Map every preload channel to its IPC handler, service, repository, DB/file side effect, renderer caller, and existing test.
- [ ] Compare the 2026-11-02 analysis with current source and label each previous finding `CONFIRMED`, `ALREADY RESOLVED`, `NOT REPRODUCED`, `BLOCKED`, or `NOT TESTED` with file/line evidence.
- [ ] Identify production engine, migration set, configuration precedence, backup format, file roots, offline assets, and active legacy paths.
- [ ] Write `00_SOURCE_INVENTORY.md` with no empty placeholder sections.

### Task 2: Add a Safe, Repeatable Test Harness

**Files:**
- Create: `tests/helpers/`, `tests/fixtures/`, `tests/unit/`, `tests/integration/`, `tests/security/`, `tests/e2e/`
- Modify: `package.json`

**Interfaces:**
- Consumes: Node.js built-in `node:test`, existing CommonJS exports, hidden Electron test pattern in `renderer/tests/`.
- Produces: Real commands `npm test`, `npm run test:unit`, `npm run test:integration`, `npm run test:security`, and `npm run test:e2e` that never connect to production implicitly.

- [ ] Write a failing harness smoke test that proves test discovery, fixture isolation, and cleanup behavior.
- [ ] Implement only the minimum helpers needed to create temporary directories, load modules with controlled external boundaries, and refuse live integration unless explicit test-only configuration is present.
- [ ] Add npm scripts only after each underlying command exists and has been observed passing.
- [ ] Document environment gates and cleanup behavior in the source inventory and final summary.

### Task 3: Audit Database Adapter, Schema, Repositories, and Transactions

**Files:**
- Test: `tests/unit/database/sql-transformer.test.js`
- Test: `tests/unit/repositories/*.test.js`
- Test: `tests/integration/database/*.test.js`
- Create: `docs/audit/01_DATABASE_AUDIT.md`
- Modify only after a reproduced defect: `main/database/mssql.js`, `main/repositories/*.js`, `main/services/*.js`

**Interfaces:**
- Consumes: `initDatabase()`, `getDb()`, adapter `query(sql, params)`, adapter `connect()`, repository and service APIs.
- Produces: Verified transformer cases, schema/constraint inventory, transaction/rollback evidence, CRUD/query evidence or explicit SQL Server `BLOCKED` status.

- [ ] Characterize placeholder, `ILIKE`, `RETURNING`, `LIMIT/OFFSET`, comments, literals, nested queries, boolean/date, and order/pagination transformations with literal expected SQL and parameters.
- [ ] Run migration parsing/idempotency checks without connecting to production; run real migrations/CRUD only against an explicitly isolated SQL Server test database.
- [ ] Test repository parameter binding, PK overrides, pagination, invalid IDs, duplicates, missing FKs, Unicode, null/empty boundaries, and dynamic sort whitelists at the closest real boundary available.
- [ ] Exercise rollback and retry behavior for equipment/QR/audit, plan/steps/logs, status completion, and acceptance workflows; mark live-only gaps `BLOCKED`.
- [ ] For each confirmed bug, run red → minimal fix → green → related regression tests and record evidence in the bug register.
- [ ] Write `01_DATABASE_AUDIT.md` with tested, blocked, and not-tested scenarios separated.

### Task 4: Audit Authentication, RBAC, IPC, and Electron Security

**Files:**
- Test: `tests/unit/auth/*.test.js`
- Test: `tests/security/ipc/*.test.js`
- Test: `tests/security/authorization/*.test.js`
- Create: `docs/audit/02_AUTH_RBAC_AUDIT.md`
- Create: `docs/audit/03_IPC_ELECTRON_SECURITY.md`
- Modify only after reproduction: `main/preload.js`, `main/ipc/*.js`, `main/services/auth.service.js`, `main/window-manager.js`

**Interfaces:**
- Consumes: auth service session API, IPC `register()` functions, preload channel policy, BrowserWindow options.
- Produces: Evidence-backed permission matrix and tests for unauthenticated, unauthorized, authorized, disabled/stale-session, duplicate registration, listener cleanup, and navigation/window policy.

- [ ] Test login success/failure/inactive user, logout, password change ownership, session lifecycle, and account disable-after-login with controlled repositories.
- [ ] Inventory every IPC handler and assert the existing policy at Main process—not merely renderer visibility.
- [ ] Reproduce database-config authorization and first-run behavior before proposing a fix; do not invent an RBAC rule where policy is undefined.
- [ ] Test preload allowlists and `on/off` listener identity with the real wrapper behavior.
- [ ] Inspect sandbox, navigation, external URL, devtools, CSP, and IPC payload validation; use hidden Electron windows where runtime behavior matters.
- [ ] Fix only policy-preserving, reproduced defects and write both audit documents.

### Task 5: Audit File Storage, PDF/Image Handling, Backup, and Import

**Files:**
- Test: `tests/security/file-path/*.test.js`
- Test: `tests/integration/files/*.test.js`
- Test: `tests/integration/backup/*.test.js`
- Create: `docs/audit/04_FILE_STORAGE_AUDIT.md`
- Create: `docs/audit/05_BACKUP_IMPORT_TEST.md`
- Modify only after reproduction: `main/services/vehicle.service.js`, `main/services/file-archive.service.js`, related IPC modules.

**Interfaces:**
- Consumes: current userData folder policy, image/PDF service APIs, archive export/import APIs, manifest format.
- Produces: Temporary-directory-only evidence for file type/size/path validation, missing/corrupt files, ZIP structure/quota/checksum/staging/rollback, and legacy folder handling.

- [ ] Test canonical path containment for relative, absolute, traversal, symlink/reparse-point where supported, wrong-root, missing, and valid legacy paths.
- [ ] Test upload tab, extension, MIME/magic bytes, size, filename sanitation, collisions, interrupted copies, cleanup, and PDF/image read/open/delete behavior.
- [ ] Test archive structure, traversal, duplicate entries, entry count/size quota, corrupted ZIP, manifest/version/checksum, overwrite preview, staging, rollback, and temporary-file cleanup without touching live userData.
- [ ] Confirm `.bak` export/import/restore semantics and mark SQL Server service-account scenarios `BLOCKED` unless a disposable instance exists.
- [ ] Apply minimal verified fixes and write both audit documents.

### Task 6: Audit Business Logic, Renderer Interaction, Offline Operation, and Performance

**Files:**
- Test: `tests/unit/services/*.test.js`
- Test: `tests/e2e/*.electron.test.js`
- Create: `docs/audit/06_BUSINESS_LOGIC_AUDIT.md`
- Create: `docs/audit/07_UI_REGRESSION_TEST.md`
- Create: `docs/audit/08_OFFLINE_TEST.md`
- Create: `docs/audit/09_PERFORMANCE_FAILURE_TEST.md`
- Modify only after reproduction: affected renderer page/component or business-service files.

**Interfaces:**
- Consumes: current service workflows, router/components/pages, local font/PDF/assets, supported desktop sizes.
- Produces: Workflow state-transition evidence, renderer interaction evidence, offline dependency inventory, CSP results, and bounded performance/failure results using synthetic fixtures.

- [ ] Verify equipment, vehicle/type, maintenance steps/plans/logs, acceptance, and reporting rules against source-defined transitions and independent expected values.
- [ ] Test async router rejection, repeated navigation/listeners, form validation, double submit, modal focus/close/error, cards, filters, empty/null/long/large lists, and PDF preview/delete behavior.
- [ ] Search and runtime-test dynamic HTML/attributes/URLs/styles with harmless injection fixtures and verify CSP console output.
- [ ] Run responsive Electron checks at 1259×751, 1366×768, 1600×900, and 1920×1080 without redesigning UI.
- [ ] Verify all required fonts, icons, images, scripts, workers, and PDF assets are local and run an offline-equivalent smoke test.
- [ ] Run synthetic 100/1,000/10,000-record measurements only where isolation is real; record hardware/environment and avoid production data.
- [ ] Inject safe failures for unavailable DB boundary, timeout/query error, file denied/missing, corrupt archive, interrupted operation, renderer reload, and cleanup recovery.
- [ ] Fix confirmed bugs independently and write all four documents.

### Task 7: Verify Windows Build and Packaged Application

**Files:**
- Create: `docs/audit/10_WINDOWS_DEPLOYMENT_TEST.md`
- Modify only after reproduction: `electron-builder.yml`, `package.json`, `main/window-manager.js`, exact asset paths.

**Interfaces:**
- Consumes: current electron-builder configuration, local assets, test results, clean output path policy.
- Produces: Development startup, package/build, icon/shortcut/asset/CSP/offline evidence; installer execution explicitly `NOT TESTED` if no clean machine is available.

- [ ] Validate every configured icon and packaged asset path before invoking a build.
- [ ] Run syntax/module-load checks and a development Electron smoke test without production DB mutation.
- [ ] Build Windows artifacts only after recording output-directory impact; do not delete existing `dist` without explicit safe handling.
- [ ] Inspect packaged contents and launch behavior; distinguish built artifact from installed/clean-machine evidence.
- [ ] Record NSIS install/shortcut/first-run/CRUD/upload/backup/restart/offline scenarios as `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED` individually.

### Task 8: Consolidate Bugs, Fix Evidence, and Release Readiness

**Files:**
- Create: `docs/audit/BUG_REGISTER.md`
- Create: `docs/audit/BUG_FIX_REPORT.md`
- Create: `docs/audit/FINAL_TEST_SUMMARY.md`
- Modify: `docs/superpowers/plans/2026-11-15-full-system-audit.md`

**Interfaces:**
- Consumes: All audit documents, test output, Git diff, build/runtime evidence.
- Produces: Complete bug register, fix-by-fix red/green evidence, coverage counts, remaining risk, and one allowed readiness conclusion.

- [x] Assign stable IDs and severity to every confirmed issue; detailed reproduction/root-cause evidence is kept in the component audit documents and summarized in `BUG_REGISTER.md`.
- [x] Run the complete automated suite and record exact totals for passed, failed, blocked, skipped, and not tested.
- [x] Recheck Git diff for secrets, accidental UI changes, production data/config changes, generated artifacts, and unrelated user files.
- [x] Reconcile every P0/P1/P2 hypothesis from the master prompt with a final evidence-based status.
- [x] Write `BUG_FIX_REPORT.md` and `FINAL_TEST_SUMMARY.md`, with the final conclusion `NOT READY - HIGH RISK ISSUES`.

Execution status (2026-11-15): Tasks 1-8 are complete. Scenarios requiring disposable SQL Server infrastructure or a clean Windows VM remain explicitly `BLOCKED` or `NOT TESTED`; they are not counted as passing.
