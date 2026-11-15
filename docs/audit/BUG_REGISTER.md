# Bug Register

Audit date: 2026-11-15. `FIXED` means a reproduced/static-confirmed defect has a focused regression test and a passing related suite. Live SQL and installer claims are never inferred from source inspection.

| ID | Severity | Status | Defect / root cause | Resolution and evidence |
|---|---|---|---|---|
| DB-001 | P1 | FIXED | Regex SQL conversion rewrote literals/comments and mishandled CTE `LIMIT` | Token protection and outer-select detection; 6 transformer tests |
| DB-002 | P1 | FIXED | Equipment/QR create-delete were separate writes | Single transaction; rollback tests |
| DB-003 | P1 | FIXED | Plan/log create-delete could leave partial state | Single transaction; injected-failure tests |
| DB-004 | P1 | FIXED | Final log and plan completion were not atomic | Shared transaction; rollback test |
| AUTH-001 | P1 | FIXED | Business read IPC trusted renderer route guard | Main-process authentication policy test |
| AUTH-002 | P1 | FIXED | User/role enumeration lacked admin enforcement | Main-process admin checks and execution test |
| AUTH-003 | P0 | FIXED | DB config IPC remained public after first-run | Explicit setup/recovery mode or admin; 4 tests |
| AUTH-004 | P1 | FIXED | Active admin could disable its own backing account | Self-disable blocked; regression test |
| AUTH-005 | P1 | FIXED | User creation accepted weaker passwords/blank names | Consistent 6-char rule and normalized inputs |
| IPC-001 | P2 | FIXED | Preload `off()` could not remove wrapped listener | WeakMap wrapper identity; test |
| IPC-002 | P1 | FIXED | BrowserWindow sandbox disabled | Main/child sandbox forced on; test |
| IPC-003 | P1 | FIXED | Navigation accepted arbitrary `file://` targets | Exact app document plus http(s)-only external policy |
| FILE-001 | P0 | FIXED | DB path could escape approved userData roots | Canonical/realpath/symlink containment tests |
| FILE-002 | P1 | FIXED | Unknown PDF tab silently mapped to another column | Two-value allowlist test |
| FILE-003 | P1 | FIXED | Upload trusted extension only | Size, extension and magic-byte validation |
| FILE-004 | P1 | FIXED | File delete/replace order lost data on DB failure | Stage → DB → cleanup with rollback tests |
| BACKUP-001 | P0 | FIXED | Transfer ZIP accepted no manifest or bad checksum | Required versioned manifest, size and SHA-256 |
| BACKUP-002 | P1 | FIXED | No ZIP-bomb quotas | Count, entry/total size and ratio limits |
| BACKUP-003 | P1 | FIXED | Partial import remained after copy failure | Existing/new file rollback test |
| BACKUP-004 | P1 | FIXED | Archive could be exported inside live userData | Canonical destination rejection |
| BL-001 | P1 | FIXED | Generic log update bypassed atomic workflow status path | Status removed from generic allowlist; unit test |
| RBAC-006 | P1 | FIXED | Log mutations exposed beyond executor roles | Main enforces admin/technician/commander |
| RBAC-007 | P1 | FIXED | Acceptance update weaker than create | Same admin/commander/inspector policy |
| RBAC-008 | P1 | FIXED | Unit mutations bypassed admin-only settings UI | Main requires admin |
| UI-001 | P1 | FIXED | Async route rejection escaped synchronous try/catch | Awaited render and Promise-returning refresh |
| UI-002 | P1 | FIXED | Router rendered exception text as HTML | DOM text nodes; harmless payload test |
| UI-003 | P2 | FIXED | Two action containers had malformed attributes | Correct quotes; source contract test |
| UI-004 | P1 | FIXED | Toast/modal interpolated untrusted strings into HTML | DOM properties/textContent; Electron payload test |
| OFFLINE-001 | P1 | FIXED | Google Fonts and CDN PDF.js violated CSP/offline use | Local WOFF2/PDF.js worker; Electron render test |
| BUILD-001 | P1 | FIXED | Window/build icon paths were missing or stale | `logo_app.png` plus generated multi-size ICO |
| BUILD-002 | P1 | FIXED | `clean` deleted build resources before packaging | Clean now removes only `dist`; NSIS build passes |

## Open risks / blocked hypotheses

The component audit named in each row contains the affected source paths, reproduction/static evidence, expected behavior, impact and next decision. `BLOCKED` and `NOT TESTED` are deliberately not counted as passes.

| ID | Severity | Status | Evidence / next decision |
|---|---|---|---|
| DB-R01 | P1 | OPEN | Nullable equipment serial uses a normal SQL Server unique constraint; needs a new filtered-index migration after checking live data (`01_DATABASE_AUDIT.md`) |
| DB-R02 | P1 | OPEN | Plan code uses `count + 1`; concurrent create/delete collision needs a sequence or unique-retry design (`01_DATABASE_AUDIT.md`) |
| DB-R03 | P2 | OPEN | Dynamic repository identifiers need per-repository allowlists before callers can expose arbitrary sort/filter keys (`01_DATABASE_AUDIT.md`) |
| DB-R04 | P2 | POLICY | Equipment deletion with dependent plans is blocked by FK; cascade/soft-delete behavior needs an explicit retention decision (`01_DATABASE_AUDIT.md`) |
| DB-R05 | P2 | OPEN | Future schema changes must use new numbered migrations rather than modifying the already-applied baseline (`01_DATABASE_AUDIT.md`) |
| SQLTEST-R01 | P1 | BLOCKED | Real migrations, constraints, concurrency and rollback need a disposable SQL Server `TEST_DB` (`01_DATABASE_AUDIT.md`) |
| AUTH-R01 | P1 | OPEN | Session does not revalidate `is_active` changed by another app instance (`02_AUTH_RBAC_AUDIT.md`) |
| AUTH-R02 | P2 | POLICY | Login has no rate-limit/lockout policy (`02_AUTH_RBAC_AUDIT.md`) |
| AUTH-R03 | P1 | POLICY | Equipment/plan mutation roles have no authoritative business role matrix beyond existing UI behavior (`02_AUTH_RBAC_AUDIT.md`) |
| AUTH-R04 | P1 | OPEN | DB credential JSON is plaintext in Windows profile; requires DPAPI/Credential Manager migration (`02_AUTH_RBAC_AUDIT.md`) |
| AUTH-R05 | P1 | OPEN | Database adapter contains deployment fallback credentials; fail-closed migration needs deployment approval (`02_AUTH_RBAC_AUDIT.md`) |
| IPC-R01 | P2 | OPEN | Existing templates still require inline styles, so CSP retains `style-src 'unsafe-inline'`; removal needs a scoped class migration (`03_IPC_ELECTRON_SECURITY.md`) |
| IPC-R02 | P2 | OPEN | IPC payload validation is distributed and lacks uniform length/array schemas (`03_IPC_ELECTRON_SECURITY.md`) |
| IPC-R03 | P2 | OPEN | The in-memory session is process-wide rather than bound to `webContents.id` (`03_IPC_ELECTRON_SECURITY.md`) |
| FILE-R01 | P2 | OPEN | IPC receives whole buffers before service size checks, allowing renderer memory pressure (`04_FILE_STORAGE_AUDIT.md`) |
| FILE-R02 | P2 | OPEN | New DB rows still contain absolute file paths; a separate backed-up migration to relative paths is needed (`04_FILE_STORAGE_AUDIT.md`) |
| FILE-R03 | P2 | OPEN | Crash or permission failure after DB commit can leave orphan files; a health-check/cleanup tool is needed (`04_FILE_STORAGE_AUDIT.md`) |
| BACKUP-R01 | P1 | BLOCKED | Real `.bak`, service-account permission and restore verification need isolated SQL Server (`05_BACKUP_IMPORT_TEST.md`) |
| BACKUP-R02 | P2 | OPEN | Dormant legacy `importFiles()` has no manifest/checksum and must remain unexposed or be upgraded before reuse (`05_BACKUP_IMPORT_TEST.md`) |
| BACKUP-R03 | P2 | OPEN | SHA-256 proves integrity but not archive origin; package signing/authentication is not implemented (`05_BACKUP_IMPORT_TEST.md`) |
| BACKUP-R04 | P2 | OPEN | Archive import validates structure/hash/extension but not deep file magic/decoding (`05_BACKUP_IMPORT_TEST.md`) |
| BL-R01 | P2 | POLICY | Several audit-log writes are best-effort; whether audit failure must block the business action is undefined (`06_BUSINESS_LOGIC_AUDIT.md`) |
| UI-R01 | P2 | OPEN | Some page-specific trusted HTML render callbacks still interpolate DB values; central notifications are fixed but typed rendering is incomplete (`07_UI_REGRESSION_TEST.md`) |
| PERF-R01 | P2 | NOT TESTED | Production-scale SQL/report/archive latency and boundary-size behavior need isolated infrastructure (`09_PERFORMANCE_FAILURE_TEST.md`) |
| DEPLOY-R01 | P1 | NOT TESTED | Installer execution, shortcuts, uninstall and clean-machine offline workflow require a VM/clean machine (`10_WINDOWS_DEPLOYMENT_TEST.md`) |

