# 00 — Source Inventory

Audit date: 2026-11-15  
Workspace: `C:\LuDoan279\QuanLyQuyTrinhBaoDuognXeMay`  
Branch / baseline commit: `testCN` / `af5129e`  
Reference: `docs/SOURCE_CODE_ANALYSIS.md` dated 2026-11-02

## 1. Safety baseline

- Git status was clean before this audit plan and report were created.
- No production database, `userData`, source media, `.git-backup`, or existing `dist` artifact has been changed.
- `.env` exists but its values were not printed or copied into fixtures/reports.
- Live SQL Server CRUD, migration, backup, and restore are prohibited until an explicitly isolated test instance is supplied.

## 2. Current architecture

The current production engine is **Microsoft SQL Server only**. `main/database/index.js` imports only `mssql.js`; there is no active SQLite adapter or SQLite migration path. The installed `better-sqlite3` package is extraneous and is not evidence of a hybrid production engine.

```text
Renderer (Vanilla HTML/CSS/JavaScript)
  → preload allowlist (65 invoke channels)
  → 10 IPC modules (65 handlers)
  → 7 business services / direct report IPC SQL
  → 11 repositories
  → main/database/mssql.js
  → Microsoft SQL Server
```

Startup path:

1. `main/index.js` obtains the single-instance lock.
2. `db-config.ipc.js` is registered before database initialization.
3. Missing `userData/db-config.json` opens the first-run database form without initializing business IPC.
4. Existing configuration initializes SQL Server and runs `main/database/migrations-mssql/*.sql`.
5. All business IPC handlers are registered even when DB initialization reports an error.
6. The SQL Server pool is closed during `before-quit`.

## 3. Source and dependency inventory

| Area | Files | Approx. lines | Notes |
|---|---:|---:|---|
| `main/` | 39 | 3,906 | Electron lifecycle, SQL Server, IPC, services, repositories |
| `renderer/` | 30 | 7,432 | SPA, pages, components, styles, 5 current test/fixture files |
| `scripts/` | 2 | 288 | SQL Server seed/reset utilities; unsafe for production testing |

Runtime observed: Node `v20.20.0`, npm `10.8.3`; installed Electron is `29.4.6` although `package.json` requests `^29.1.0`.

`npm ls --depth=0` is currently not clean:

- Declared top-level dependency `tedious@^19.2.2` is reported missing.
- `adm-zip`, `better-sqlite3`, their native/support dependencies, and several installer helpers are extraneous.
- `mssql@11.0.1` is installed and owns its own runtime dependency tree, but the declared top-level installation remains inconsistent.
- No dependency was installed, removed, upgraded, or audited automatically.

Package scripts currently expose `start`, `dev`, `build`, `seed`, `reset-db`, and `clean`. There is no `test`, `test:unit`, `test:integration`, `test:security`, `test:e2e`, or lint script.

## 4. Database and migration inventory

- Adapter: `main/database/mssql.js`.
- Configuration precedence: `userData/db-config.json` when `mode === "sqlserver"`, then environment variables, then hard-coded fallback values.
- The fallback contains a server/database/user/password combination in source (`main/database/mssql.js:24-29`). Values are intentionally omitted here.
- `db-config.json` is written as JSON including the password (`main/ipc/db-config.ipc.js:30-49`).
- One migration exists: `main/database/migrations-mssql/001_schema.sql`.
- Migration schema contains 14 business tables plus `_migrations` managed by the adapter.
- The migration includes PK/FK/unique/check constraints and indexes, but live referential/data integrity is **BLOCKED** pending an isolated SQL Server test database.
- Repository SQL is PostgreSQL-style and is transformed at runtime for `$n`, `ILIKE`, `CURRENT_DATE`, `RETURNING *`, and `LIMIT/OFFSET`.

Tables:

`units`, `roles`, `vehicle_type`, `vehicle`, `engine_maintenance`, `users`, `equipments`, `maintenance_steps`, `maintenance_plans`, `maintenance_logs`, `acceptance_records`, `attachments`, `qr_codes`, `audit_logs`.

## 5. Feature-to-code inventory

| Module | UI | IPC | Service | Repository / DB | Current automated evidence |
|---|---|---|---|---|---|
| Authentication | `renderer/js/auth.js` | `auth:*` | `auth.service.js` | `user.repository.js`, `audit_logs` | None |
| Users / Roles | Settings page | `user:*`, `role:list` | Direct IPC orchestration | `user.repository.js`, direct roles SQL | UI contract only |
| Units | Settings/equipment forms | `unit:*` | `unit.service.js` | `unit.repository.js` | None |
| Equipment | Equipment list/detail pages | `equipment:*` | `equipment.service.js` | `equipment.repository.js`, QR/audit tables | UI contract only |
| Vehicle Types | Maintenance/settings UI | `vehicleType:*` | `vehicle.service.js` | `vehicle-type.repository.js` | UI contract only |
| Vehicles | Maintenance list/detail UI | `vehicle:*` | `vehicle.service.js` | `vehicle.repository.js` | Card contract + layout runtime test |
| Engine Maintenance | Maintenance detail UI | `engineMaintenance:*` | `vehicle.service.js` | `engine-maintenance.repository.js` | PDF/UI contracts only |
| Maintenance Steps | Plan/detail UI | `plan:getSteps` | `maintenance-plan.service.js` | `maintenance-step.repository.js` | None |
| Maintenance Plans | Plan list/detail pages | `plan:*` | `maintenance-plan.service.js` | `maintenance-plan.repository.js` | UI permission contract only |
| Maintenance Logs | Plan detail page | `log:*` | `maintenance-log.service.js` | `maintenance-log.repository.js` | None |
| Acceptance | Plan detail page | `acceptance:*` | `acceptance.service.js` | `acceptance.repository.js` | None |
| Reports | Reports page | `report:*` | SQL is directly in IPC | SQL Server adapter | None |
| File Storage | Maintenance detail/PDF viewer | engine file IPC | `vehicle.service.js` | Filesystem + path columns | PDF contract only |
| Backup / Import | Settings page | `fileArchive:*` | `file-archive.service.js` | PowerShell ZIP + SQL `.bak` | None |
| DB Configuration | First-run, DB setup, settings | `dbconfig:*` | Direct IPC logic | JSON config + isolated connection test | None |
| System Settings | Settings page | Multiple groups | Multiple | Multiple | UI contract only |

Renderer routes registered: `equipment-list`, `equipment-detail`, `plan-list`, `plan-detail`, `reports`, `settings`, `maintenance-steps`, and `vehicle-detail`. The current visible sidebar exposes maintenance/equipment management and settings; several older menu entries remain commented in `renderer/index.html` while their scripts/routes are still loaded.

## 6. IPC inventory and current policy

The preload invoke allowlist and Main-process handler set both contain exactly **65 unique channels**; no allowlisted channel lacks a handler and no handler is absent from the allowlist. Literal renderer calls found are all allowlisted.

| IPC file | Channels | Current Main-process policy |
|---|---:|---|
| `auth.ipc.js` | 9 | Login/session public; password change authenticated; user writes admin; `user:list` authenticated; `role:list` public |
| `unit.ipc.js` | 6 | Reads public; writes any authenticated user |
| `equipment.ipc.js` | 7 | Reads/QR public; writes any authenticated user |
| `maintenance-plan.ipc.js` | 8 | Reads public; writes authenticated; approve admin/commander |
| `maintenance-log.ipc.js` | 5 | Reads public; writes authenticated |
| `acceptance.ipc.js` | 3 | Read public; create admin/commander/inspector; update any authenticated user |
| `report.ipc.js` | 4 | Authenticated |
| `vehicle.ipc.js` | 18 | Vehicle/type/maintenance reads and file read/open public; all writes admin |
| `file-archive.ipc.js` | 2 | Admin |
| `db-config.ipc.js` | 3 | Public for the full application lifetime |

This table records source behavior, not an approved RBAC policy. Public read/file/config channels remain security hypotheses for Tasks 4–5; they are not changed until expected policy is established and tests reproduce the risk.

## 7. File storage and backup inventory

- New vehicle images are stored below `userData/vehicle-images`.
- New maintenance documents are stored below `userData/maintenance-files`.
- `userData/uploads` remains a legacy read/import/export fallback.
- Database paths are normalized to relative paths for newly stored files, but existing absolute paths are accepted by `_resolveFilePath()` and `_deleteFile()`.
- Transfer export contains `manifest.json`, at most one `database/*.bak`, and files from all three file folders.
- Import checks top-level folder structure, supported extensions, and duplicate names, then stages extraction in a temporary folder.
- Transfer import force-copies staged files into live `userData`; there is no quota, checksum verification, full rollback, or overwrite preview.
- The app extracts `.bak` to Documents and does not automatically restore it.
- SQL Server backup directory has a machine-specific fallback in `main/ipc/file-archive.ipc.js:40-43`.

## 8. Frontend, CSP, and offline inventory

- Renderer remains a single HTML shell with global scripts loaded in order.
- `nodeIntegration` is false and `contextIsolation` true; `sandbox` remains false.
- CSP still permits `cdnjs.cloudflare.com`, `fonts.googleapis.com`, and `fonts.gstatic.com` (`renderer/index.html:6-12`).
- `layout.css` still imports Oswald/Barlow from Google Fonts (`renderer/assets/css/layout.css:1`).
- PDF viewer still downloads pdf.js and its worker from cdnjs (`renderer/js/components/pdf-preview-modal.js:7-8`).
- No local font or pdf.js vendor directory is present in current source.
- Offline font/PDF dependencies were confirmed, then replaced with local WOFF2 and PDF.js 3.11.174 assets. Status: **FIXED**; see `08_OFFLINE_TEST.md`.
- Window icon pointed to missing `renderer/assets/icon.png`; it now uses `logo_app.png` and the Windows build uses a derived multi-size ICO. Status: **FIXED**; see `10_WINDOWS_DEPLOYMENT_TEST.md`.
- `electron-builder.yml` expects `build/icon.ico`, but no tracked `build/` directory is present. `package.json` also contains a separate build block without a Windows icon. Packaging configuration needs runtime verification before changing it.

## 9. Existing test baseline

Existing files:

- `renderer/tests/ui-theme.contract.test.js`
- `renderer/tests/pdf-preview.contract.test.js`
- `renderer/tests/maintenance-layout.electron.test.js` + fixture
- `renderer/tests/login-background.electron.test.js` + fixture

Evidence on 2026-11-15:

- JavaScript syntax: **62/62 files passed** `node --check`.
- `pdf-preview.contract.test.js`: **3/3 passed**.
- `ui-theme.contract.test.js`: **8 passed, 5 failed**. Failures are stale byte-hash/style constraints after approved UI changes; this test also explicitly preserves external CDN URLs and is unsuitable as an offline safety test.
- Combined `node --test file1 file2` was blocked by the managed Windows sandbox with `spawn EPERM`; direct execution works and exposes real assertions.
- Electron runtime tests are inventoried but will be run under their GUI permission gate in the renderer audit phase.

## 10. Delta from the 2026-11-02 analysis

| Earlier finding | Current status | Evidence |
|---|---|---|
| SQL Server is the sole engine | CONFIRMED | `main/database/index.js` imports only MSSQL |
| Default DB credentials in source | CONFIRMED | fallback object in `mssql.js` |
| DB config IPC lacks authorization | CONFIRMED | all three handlers are public |
| Google Fonts/pdf.js depend on Internet | CONFIRMED | CSS import, CDN URLs, CSP allowlist |
| CSP permits external domains | CONFIRMED | `renderer/index.html` meta CSP |
| Electron sandbox disabled | CONFIRMED | both window definitions |
| Preload `off()` may not remove wrapped listener | Pending runtime test | Task 4 |
| Upload lacks strict validation | Static concern confirmed; behavior pending tests | `vehicle.service.js` |
| File path may escape allowed roots | Static concern confirmed; exploitability pending tests | absolute path handling in `vehicle.service.js` |
| ZIP lacks quota/checksum/rollback | CONFIRMED | import/export implementation |
| No automated tests | PARTIALLY RESOLVED | 4 renderer test programs exist, but no npm suite/backend/security tests |
| BrowserWindow icon path missing | CONFIRMED | configured path does not exist |
| Images and PDFs mixed together | ALREADY RESOLVED for new data | separate active folders; `uploads` is legacy fallback |

## 11. Immediate test priorities

1. Establish package scripts and an isolated test harness that cannot select production DB implicitly.
2. Export/test SQL transformation without opening a real pool.
3. Reproduce file path escape and upload tab/type/size failures in a temporary filesystem.
4. Reproduce DB config and unauthenticated file-read IPC policy at the Main-process boundary.
5. Reproduce preload listener cleanup and async router rejection.
6. Replace stale change-detector UI assertions with behavior-level checks only when the owning audit task is reached.

No release-readiness conclusion is made at this phase.
