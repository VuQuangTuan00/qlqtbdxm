# File Cleanup Queue and DB Password Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dọn lại ảnh/PDF không xóa được và loại bỏ hoàn toàn mật khẩu SQL Server plaintext khỏi `db-config.json`.

**Architecture:** Một service độc lập quản lý hàng đợi cleanup atomic trong `userData`, được gọi từ các thao tác file, lúc startup và trước backup. Module cấu hình dùng Electron `safeStorage` để mã hóa trên đĩa, giải mã chỉ trong Main process và tự migrate cấu hình plaintext cũ.

**Tech Stack:** Electron 29 `safeStorage`, Node.js CommonJS, filesystem atomic rename, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-17-file-cleanup-password-encryption-design.md`

## Global Constraints

- Không thay đổi UI, schema database hoặc nghiệp vụ quản lý.
- Không bao giờ ghi mật khẩu plaintext vào file cấu hình, log hoặc IPC response.
- Chỉ xóa file thực nằm trong `vehicle-images` hoặc `maintenance-files` của `userData`.
- Giữ tương thích đọc cấu hình plaintext cũ bằng migration atomic.
- Không tự commit vì working tree đang chứa thay đổi chưa commit từ các nhiệm vụ đã được người dùng yêu cầu trước đó.

## Review Focus

- File đang bị khóa: thao tác nghiệp vụ vẫn thành công, entry được giữ để retry.
- Queue hỏng hoặc ghi atomic thất bại: không xóa nhầm file và không làm mất queue cũ.
- Đường dẫn ngoài `userData`, symlink hoặc junction: không xóa và không đưa vào queue.
- Ciphertext từ máy/tài khoản Windows khác: chuyển sang recovery mà không làm mất server/database/user.
- `safeStorage` chưa sẵn sàng: từ chối lưu password thay vì fallback plaintext.

---

### Task 1: Service hàng đợi cleanup an toàn

**Files:**
- Create: `main/services/pending-file-cleanup.service.js`
- Create: `tests/unit/services/pending-file-cleanup.test.js`

**Interfaces:**
- Produces: `deleteOrQueue(filePath): boolean`, `processPendingCleanup(): { deleted: number, remaining: number }`, `getCleanupQueuePath(): string`.
- Consumes: Electron `app.getPath('userData')`, filesystem và logger hiện tại.

- [ ] **Step 1: Viết test thất bại** cho xóa thành công, lỗi `EBUSY` được queue, retry thành công, loại trùng, file không tồn tại được bỏ khỏi queue, đường dẫn ngoài vùng/symlink bị từ chối và queue hỏng không bị dùng để xóa.
- [ ] **Step 2: Chạy** `node --test tests/unit/services/pending-file-cleanup.test.js`; expected FAIL vì module chưa tồn tại.
- [ ] **Step 3: Implement service** với queue `{ version: 1, paths: [] }`, temp file UUID + rename, kiểm tra lexical/real path và không ném lỗi cleanup lên nghiệp vụ gọi.
- [ ] **Step 4: Chạy lại test**; expected toàn bộ PASS.

### Task 2: Nối cleanup vào thao tác file, startup và backup

**Files:**
- Modify: `main/services/vehicle.service.js`
- Modify: `main/index.js`
- Modify: `main/ipc/file-archive.ipc.js`
- Modify: `tests/security/file-path/vehicle-file-boundary.test.js`
- Modify/Create: test IPC/startup phù hợp trong `tests/security/authorization/file-archive-ipc.test.js` và `tests/unit/app/`.

**Interfaces:**
- Consumes: `deleteOrQueue()` và `processPendingCleanup()` từ Task 1.
- Produces: mọi luồng thay/xóa ảnh/PDF dùng cleanup queue; startup và backup chạy retry.

- [ ] **Step 1: Viết test thất bại** xác nhận vehicle service gọi queue khi unlink lỗi, startup xử lý queue và export gọi cleanup trước khi tạo `.bak`/ZIP.
- [ ] **Step 2: Chạy nhóm test liên quan**; expected FAIL vì chưa tích hợp.
- [ ] **Step 3: Thay `_deleteFile`** bằng `deleteOrQueue`, gọi `processPendingCleanup` sau `app.whenReady()` và đầu handler backup.
- [ ] **Step 4: Chạy nhóm test**; expected PASS và các test rollback file hiện có vẫn xanh.

### Task 3: Mã hóa và migrate password bằng `safeStorage`

**Files:**
- Modify: `main/config/db-config.js`
- Modify: `tests/unit/config/db-config.test.js`

**Interfaces:**
- Produces: disk fields `passwordEncrypted` và `passwordEncryption: 'electron-safe-storage-v1'`; `readDbConfig()` vẫn trả runtime field `password` cho `mssql`.
- Consumes: Electron `safeStorage.isEncryptionAvailable()`, `encryptString()`, `decryptString()`.

- [ ] **Step 1: Viết test thất bại** xác nhận file mới không chứa plaintext/key `password`, decrypt runtime đúng, giữ ciphertext khi password để trống, migrate plaintext atomic, ciphertext sai máy báo lỗi recovery, và encryption unavailable không ghi file.
- [ ] **Step 2: Chạy** `node --test tests/unit/config/db-config.test.js`; expected FAIL ở các assertion mã hóa.
- [ ] **Step 3: Implement helpers** mã hóa/giải mã, serialize disk config, atomic migration và sanitization recovery; tuyệt đối không fallback plaintext.
- [ ] **Step 4: Chạy lại test**; expected PASS.

### Task 4: Đồng bộ IPC/startup và kiểm thử hồi quy

**Files:**
- Modify: `main/ipc/db-config.ipc.js`
- Modify: `tests/security/authorization/db-config-ipc.test.js`
- Modify: `tests/unit/app/startup-config-routing.test.js` nếu cần.

**Interfaces:**
- Consumes: `readDbConfig()` đã giải mã và `readDbConfigForRecovery()` đã lọc bí mật từ Task 3.
- Produces: test connection có thể dùng password đã lưu khi giải mã được; recovery không lộ ciphertext.

- [ ] **Step 1: Viết test thất bại** cho IPC không trả ciphertext/plaintext, endpoint cũ tái dùng password runtime, decrypt lỗi yêu cầu nhập lại password.
- [ ] **Step 2: Chạy nhóm test db-config/startup**; expected FAIL trước tích hợp.
- [ ] **Step 3: Sửa `_withStoredPassword`** dùng `readDbConfig()` nội bộ và giữ recovery payload công khai.
- [ ] **Step 4: Chạy nhóm test**; expected PASS.

### Task 5: Xác minh toàn hệ thống

**Files:**
- Verify all modified files and documentation.

**Interfaces:**
- Consumes: toàn bộ deliverable Task 1–4.
- Produces: bằng chứng hoàn tất và danh sách giới hạn kiểm thử thực tế.

- [ ] **Step 1: Chạy syntax check** cho toàn bộ file JavaScript đã sửa.
- [ ] **Step 2: Chạy toàn bộ** `node --test` trên `tests/unit`, `tests/integration`, `tests/security`; expected 0 fail.
- [ ] **Step 3: Kiểm tra source** không còn ghi `password` plaintext vào `db-config.json`, không log ciphertext và không có đường dẫn cleanup ngoài allowlist.
- [ ] **Step 4: Chạy `git diff --check`**; expected không có whitespace error.
- [ ] **Step 5: Review cuối** tập trung vào DPAPI migration, atomicity, symlink boundary và mất queue khi crash.
