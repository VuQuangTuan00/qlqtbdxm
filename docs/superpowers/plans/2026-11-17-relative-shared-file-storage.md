# Relative Shared File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lưu ảnh/PDF trong một kho UNC dùng chung, chỉ ghi đường dẫn tương đối vào SQL Server và loại bỏ hoàn toàn mọi thao tác liên quan đến `uploads`.

**Architecture:** Một `file-storage.service.js` tập trung xác thực UNC, kiểm tra ranh giới đường dẫn, resolve đường dẫn tương đối và kiểm tra quyền đọc/ghi. Các service xe, cleanup và archive chỉ làm việc qua abstraction này; `db-config.json` trên từng máy cung cấp `fileStorageRoot` và UI bắt buộc quản trị viên kiểm tra cả SQL lẫn kho file.

**Tech Stack:** Electron 29, Node.js, SQL Server (`mssql`), Windows UNC/SMB, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-17-relative-file-paths-design.md`

## Global Constraints

- Database chỉ lưu `vehicle-images/<file>` hoặc `maintenance-files/<file>` trong ba cột file.
- Không migration, sao chép hoặc xóa dữ liệu legacy; người dùng cập nhật dữ liệu cũ bằng SSMS.
- Không còn lưu, đọc fallback, backup, restore hoặc kiểm tra thư mục `uploads`.
- `fileStorageRoot` bắt buộc là UNC `\\server\share`, không hard-code hoặc suy đoán từ SQL Server.
- Không thay đổi database schema hoặc nghiệp vụ quản lý xe/bảo dưỡng.
- Không fallback về `userData` khi kho UNC thiếu hoặc mất kết nối.
- Giữ mã hóa password SQL Server và toàn bộ kiểm tra ZIP/checksum/rollback hiện tại.
- Không commit nếu người dùng không yêu cầu.

## Review Focus

- Share mất kết nối hoặc chỉ có quyền đọc phải báo lỗi rõ ràng và không ghi file cục bộ; Task 1 và Task 2 kiểm thử.
- Hai client có `userData` khác nhau nhưng cùng UNC phải resolve cùng file tuyệt đối; Task 1 kiểm thử.
- Hai máy upload cùng tên trong cùng millisecond không được ghi đè nhau; Task 3 kiểm thử tên UUID và cờ ghi độc quyền.
- Đường dẫn UNC có slash cuối, khác kiểu separator hoặc ký tự traversal vẫn phải chuẩn hóa/từ chối đúng; Task 1 kiểm thử.
- Restore vào share có file trùng tên hoặc lỗi giữa chừng phải rollback như trước và không đi ra ngoài root; Task 4 kiểm thử.

---

### Task 1: Shared file storage boundary

**Files:**
- Create: `main/services/file-storage.service.js`
- Create: `tests/unit/services/file-storage.test.js`
- Modify: `main/config/db-config.js`
- Modify: `tests/unit/config/db-config.test.js`

**Interfaces:**
- Consumes: `readDbConfig().fileStorageRoot`, Electron `app.getPath('userData')` only for the cleanup queue (not payload files).
- Produces: `validateFileStorageRoot(root)`, `createFileStorageService(dependencies)`, and default exports `getStorageRoot()`, `ensureFolder(folder)`, `toStoredPath(absolutePath, expectedFolder)`, `resolveStoredPath(storedPath, expectedFolder, options)`, `toFileUrl(absolutePath)`, `testReadWriteAccess(root)`.

- [ ] **Step 1: Write failing unit tests** proving UNC validation accepts `\\server\share` (including a trailing slash), rejects drive paths/relative paths/server-only UNC, requires `fileStorageRoot` in `validateDbConfig`, resolves both allowed relative prefixes inside one shared root for two different simulated clients, rejects absolute/traversal/wrong-folder paths and reparse-point escapes, creates no local fallback, and read/write probe cleans up its temporary file on success or failure.

- [ ] **Step 2: Run the focused tests** with `node --test tests/unit/services/file-storage.test.js tests/unit/config/db-config.test.js` and verify failures are caused by the missing service/validation.

- [ ] **Step 3: Implement the storage boundary** with dependency injection for filesystem/config/UUID tests, canonical database separators `/`, lexical plus real-path containment checks, and exclusive temporary probe creation/deletion.

- [ ] **Step 4: Update config validation** so every valid runtime/disk config includes a normalized UNC `fileStorageRoot`, while password encryption and unknown-key preservation remain unchanged.

- [ ] **Step 5: Rerun the focused tests** and expect all Task 1 cases to pass.

### Task 2: Configure and verify the UNC root

**Files:**
- Modify: `main/ipc/db-config.ipc.js`
- Modify: `renderer/js/db-setup.js`
- Modify: `renderer/pages/settings/settings.js`
- Modify: `tests/security/authorization/db-config-ipc.test.js`
- Modify: `tests/security/unified-db-setup.test.js`
- Modify: `tests/unit/app/startup-config-routing.test.js`

**Interfaces:**
- Consumes: Task 1 `validateFileStorageRoot()` and `testReadWriteAccess(root)`.
- Produces: `dbconfig:get/set/test` round-trip the public `fileStorageRoot`; both setup UIs collect the same required UNC value; connection test succeeds only when SQL and file storage tests both succeed.

- [ ] **Step 1: Write failing IPC/UI contract tests** asserting `fileStorageRoot` is allowlisted, returned without secrets, preserved independently of SQL credentials, passed by both renderer forms, required before save, and tested for read/write access after SQL connects.

- [ ] **Step 2: Run** `node --test tests/security/authorization/db-config-ipc.test.js tests/security/unified-db-setup.test.js tests/unit/app/startup-config-routing.test.js`; expect failures for the absent field/access test.

- [ ] **Step 3: Implement IPC and both configuration forms**, label the field “Thư mục file dùng chung (UNC)”, use placeholder `\\MAY-CHU\QTCN-Files`, and return a specific storage permission/unreachable error without exposing credentials.

- [ ] **Step 4: Rerun Task 2 tests** and expect all to pass.

### Task 3: Store vehicle images and maintenance PDFs by relative path

**Files:**
- Modify: `main/services/vehicle.service.js`
- Modify: `main/services/pending-file-cleanup.service.js`
- Modify: `renderer/pages/maintenance/maintenance-steps.js`
- Modify: `tests/security/file-path/vehicle-file-boundary.test.js`
- Modify: `tests/unit/services/pending-file-cleanup.test.js`

**Interfaces:**
- Consumes: Task 1 folder/resolve/store/file-URL APIs.
- Produces: new records contain only `vehicle-images/<name>` or `maintenance-files/<name>`; renderer receives a valid `img_url`; deletion/cleanup permits only files resolved inside the configured shared root.

- [ ] **Step 1: Replace/add failing tests** proving create/update image and both PDF tabs persist relative paths, files are physically written to the injected shared root, UUID naming prevents same-time/same-name overwrite, absolute legacy paths and `uploads/...` are rejected, UNC image URLs render correctly, and rollback/deferred cleanup still preserve the old file on database failure.

- [ ] **Step 2: Run** `node --test tests/security/file-path/vehicle-file-boundary.test.js tests/unit/services/pending-file-cleanup.test.js`; expect failures because current code writes absolute `userData` paths and accepts `uploads`.

- [ ] **Step 3: Refactor `vehicle.service.js`** to use the shared storage API, save with exclusive mode and UUID filenames, persist only relative paths, add `img_url` from the trusted resolved path, and remove all `uploads` constants/fallback/error text.

- [ ] **Step 4: Refactor durable cleanup** so its queue remains under local `userData` but payload validation/deletion uses only the shared storage root; if configuration/share is unavailable, retain queued entries instead of dropping them.

- [ ] **Step 5: Update the renderer image helper** to prefer the trusted `img_url` while keeping the existing visual fallback.

- [ ] **Step 6: Rerun Task 3 tests** and expect all to pass.

### Task 4: Back up and restore only the shared folders

**Files:**
- Modify: `main/services/file-archive.service.js`
- Modify: `main/ipc/file-archive.ipc.js`
- Modify: `tests/integration/backup/transfer-package-validation.test.js`
- Modify: `tests/security/authorization/file-archive-ipc.test.js`
- Modify: `tests/security/runtime-environment-contract.test.js`

**Interfaces:**
- Consumes: Task 1 `getStorageRoot()` and safe path boundary; Task 3 pending cleanup behavior.
- Produces: ZIP payload/manifest accepts only `vehicle-images`, `maintenance-files`, `database`; restore targets the same UNC root; source files and runtime main-process code contain no `uploads` behavior.

- [ ] **Step 1: Write failing archive tests** proving export reads from the configured shared root rather than `userData`, restore writes to it, no ZIP/manifest/source branch accepts `uploads`, traversal and reparse escapes remain rejected, collisions and mid-restore failures rollback, and backup stops before `BACKUP DATABASE` when the share is inaccessible.

- [ ] **Step 2: Run** `node --test tests/integration/backup/transfer-package-validation.test.js tests/security/authorization/file-archive-ipc.test.js tests/security/runtime-environment-contract.test.js`; expect failures from current `userData`/`uploads` behavior.

- [ ] **Step 3: Refactor archive export/restore** to use the shared root and exactly two allowed folders, remove `assertLegacyUploadsEmpty`, remove `uploads` from all PowerShell regexes/manifests, and preserve checksum/quota/rollback controls.

- [ ] **Step 4: Reorder export IPC validation** to verify storage accessibility before creating the temporary SQL `.bak`, keeping final cleanup behavior unchanged.

- [ ] **Step 5: Rerun Task 4 tests** and expect all to pass.

### Task 5: Whole-application verification

**Files:**
- Modify only if verification exposes a regression directly caused by Tasks 1–4.

**Interfaces:**
- Consumes: all earlier task outputs.
- Produces: verified Windows/Electron application contract for shared paths.

- [ ] **Step 1: Run static search** with `rg -n "uploads|app\.getPath\(['\"]userData['\"]\).*vehicle-images|app\.getPath\(['\"]userData['\"]\).*maintenance-files" main renderer`; expected no `uploads` behavior and no payload folder resolution under local `userData`.

- [ ] **Step 2: Run** `npm test`; expected all unit, integration and security tests pass.

- [ ] **Step 3: Run** `npm run test:e2e`; record any unrelated pre-existing failure separately, and require all affected DB setup, maintenance and backup flows to pass.

- [ ] **Step 4: Run** `git diff --check`; expected no whitespace errors.

- [ ] **Step 5: Review the final diff** to confirm no schema, unrelated UI or business-logic changes and no modification of the existing topbar worktree changes.

- [ ] **Step 6: Do not commit** because the user did not request a commit.
