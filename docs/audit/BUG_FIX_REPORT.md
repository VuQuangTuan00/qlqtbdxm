# Bug Fix Report

Date: 2026-11-15

## Delivered fixes

- Database adapter and workflow atomicity: protected SQL transformation, transaction-safe equipment/QR, plan/log and completion flows.
- Authentication/RBAC: Main-process guards for reads, user/role and DB configuration; self-disable and password-rule fixes; executor, acceptance and unit mutation roles enforced.
- Electron boundary: sandbox enabled, navigation restricted, preload listener cleanup corrected.
- File storage: canonical approved roots, symlink escape protection, typed PDF/image validation, safe staging/delete order.
- Backup/import: manifest, SHA-256, quotas, traversal/duplicate rejection, rollback and safe destination policy.
- Renderer: awaited async router, text-only error/notification rendering, corrected malformed action markup.
- Offline/CSP: local Oswald/Barlow WOFF2 subsets and licenses, local PDF.js 3.11.174 and worker, remote CSP origins removed without disabling CSP.
- Windows: current `logo_app.png` used for the window; derived ICO used by packaged executable/installer; clean no longer deletes build resources.

## Red → green examples

| Defect | Red evidence | Green evidence |
|---|---|---|
| Async router rejection | unhandled rejection after test ended | router unit 2/2 pass |
| Offline assets | remote-origin/static asset test failed | security offline tests pass + real PDF render |
| Workflow status bypass | generic update wrote `status: completed` | update writes note only |
| Main-process mutation roles | unit/log/acceptance policy test failed | policy test passes |
| Markup injection | harmless payload created 5 injected images | Electron reports zero injected images |
| Build icon | source referenced missing PNG and no ICO | config test, unpacked package and NSIS build pass |

## Main source files changed

- Main/database/services/IPC: `main/database/mssql.js`, `main/ipc/*.ipc.js`, `main/services/*.service.js`, `main/preload.js`, `main/window-manager.js`, `main/index.js`.
- Renderer: `renderer/index.html`, `renderer/assets/css/layout.css`, router, modal/toast/PDF components, and two malformed page templates.
- Assets: local fonts/licenses, local PDF.js/license, `build/icon.ico`.
- Tooling: test harness and package scripts/config.

No business database, production userData, original image/PDF, existing `dist`, or archive was modified. Generated package/installer evidence was written to Windows Temp.

