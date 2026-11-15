# 10 — Windows Deployment Test

Date: 2026-11-15

## Build fixes

- Main window icon now resolves to `renderer/assets/images/logo_app.png`; the previous `renderer/assets/icon.png` did not exist.
- Generated a seven-size Windows ICO (16–256 px) at `build/icon.ico` from `logo_app.png`.
- Active package config and `electron-builder.yml` both resolve `icon.ico` from the `build` resources directory.
- `npm run clean` no longer deletes the `build` resource directory immediately before packaging.

## Evidence

| Scenario | Result |
|---|---|
| JavaScript syntax check | PASS — 88 files |
| Icon/config path contract | PASS |
| Windows x64 unpacked package | PASS — Electron 29.4.6, electron-builder 24.13.3 |
| Required fonts, PDF.js, worker, licenses and `logo_app.png` inside ASAR | PASS |
| Packaged app startup | PASS — stayed running 8 seconds with isolated temporary userData and DB variables cleared |
| NSIS installer build | PASS - 88,206,870 bytes (fresh build from the final config) |
| Installer SHA-256 | `8DE18C58503CD3B1A94E7598E912816A107E423E60794DD4800084025F04757D` |
| Installer execution/install/uninstall | NOT TESTED — no clean test machine/VM was provided |
| Desktop/Start Menu shortcut icon after install | NOT TESTED; config requests both shortcuts and built executable received the generated icon |
| Installed CRUD/upload/backup/restart/offline | NOT TESTED — requires isolated SQL Server and clean installed environment |

Build outputs were written under Windows Temp, not the repository `dist` directory, so existing artifacts were not overwritten. The temporary installer is an audit artifact, not a signed release. No signing certificate was configured.

Final verification output: `C:\Users\quang\AppData\Local\Temp\qlqtbdxm-final-audit-20261115`. A first diagnostic launch exited because the audit shell set `ELECTRON_RUN_AS_NODE=1`; stderr confirmed the executable was being forced into Node mode. With that test-only variable removed, the same packaged executable remained running for 8 seconds with isolated userData.

## Packaging observations

- The active default configuration is the `build` field in `package.json`; `electron-builder.yml` is retained in sync but is not automatically selected while the package field exists.
- electron-builder printed transient dependency-resolution diagnostics but completed both unpacked and NSIS targets successfully.
- The packaged application contains SQL client dependencies and no native rebuild was required.

