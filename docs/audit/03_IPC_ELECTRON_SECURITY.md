# 03 — Kiểm toán IPC và bảo mật Electron

Ngày kiểm tra: 2026-11-15

## Kết luận

Preload và Main process có cùng 65 channel invoke, không phát hiện channel thừa/thiếu ở baseline. `nodeIntegration` tắt, `contextIsolation` bật, sandbox đã được bật, listener cleanup và policy điều hướng đã được sửa. Tại Task 4, CSP còn phụ thuộc Google Fonts/CDN PDF.js; Task 6 sau đó đã chuyển toàn bộ font/PDF.js sang asset local và kiểm chứng Electron runtime. Inline style vẫn được cho phép ở mức tối thiểu để giữ tương thích giao diện hiện hữu.

## Ranh giới IPC

- Renderer chỉ nhận API `invoke`, `on`, `off` và metadata platform/version qua `contextBridge`.
- `invoke` từ chối channel không nằm trong allowlist.
- `on` chỉ cho 4 event Main → renderer.
- Authorization nằm trong handler Main process; việc ẩn nút/tab ở renderer không được xem là bảo mật.
- `dbconfig:*` dùng state first-run/recovery do Main process quyết định; renderer không tự bật state này.

## Lỗi đã sửa

### IPC-001 — `off()` không gỡ listener do wrapper khác tham chiếu

Mức độ: P1 về độ ổn định, P2 về bảo mật.  
Nguyên nhân: `on()` đăng ký anonymous wrapper nhưng `off()` truyền callback gốc cho `removeListener`.  
Sửa: `WeakMap` lưu callback → channel → wrapper set; `off()` gỡ đúng mọi wrapper tương ứng và dọn mapping.  
Test: đăng ký thực tế với ipcRenderer test double, số listener từ 1 về 0 — PASS.

### IPC-002 — Sandbox bị tắt

Mức độ: P1 defense-in-depth.  
Sửa: `sandbox: true` cho main và child window; child window luôn ghi đè các tùy chọn nguy hiểm do caller truyền vào. `nodeIntegration: false` và `contextIsolation: true` tiếp tục được cưỡng chế.  
Test cấu hình cửa sổ bằng unit test — PASS. Hai Electron layout smoke test ngoài sandbox môi trường công cụ — 2/2 PASS.

### IPC-003 — Điều hướng cho phép mọi URL `file://`

Mức độ: P1.  
Lỗi cũ: `will-navigate` bỏ qua mọi local file URL và `setWindowOpenHandler` đưa mọi protocol sang `shell.openExternal`.  
Sửa: chỉ document `renderer/index.html` (kèm query/hash) được điều hướng nội bộ; URL ngoài chỉ mở nếu protocol `http:` hoặc `https:`; `file:`, `javascript:` và protocol khác bị từ chối.  
Test local-file, HTTPS và javascript URL — PASS.

### IPC-004 — Public business read handlers

Chi tiết và permission matrix nằm trong `02_AUTH_RBAC_AUDIT.md`. Main process hiện yêu cầu auth cho toàn bộ read handler nghiệp vụ.

## Cấu hình cửa sổ sau sửa

| Thuộc tính | Main | Child |
|---|---:|---:|
| `nodeIntegration` | false | false, không override được |
| `contextIsolation` | true | true, không override được |
| `sandbox` | true | true, không override được |
| DevTools | bật khi development, tắt khi đóng gói theo `app.isPackaged` | cùng chính sách với main, không override bật lại được trong bản đóng gói |
| New windows | deny; chỉ HTTP(S) mở ngoài | chưa có API caller trong source |
| Navigation | chỉ document app; HTTP(S) mở ngoài | chưa có load/navigation flow trong source |

## CSP và offline — đã xử lý ở Task 6

`renderer/index.html` hiện chỉ cho phép script/font local, PDF.js và worker được đóng gói trong ứng dụng, và Google Fonts đã được thay bằng WOFF2 local có kèm license. Electron E2E đã render một trang PDF bằng worker local mà không ghi nhận CSP refusal. Chi tiết và giới hạn của `'unsafe-inline'` cho style nằm trong `08_OFFLINE_TEST.md`.

## Rủi ro còn lại

- CSP inline style cần nonce/hash hoặc chuyển inline style ra class; source first-run/db-setup và nhiều renderer template còn dùng `style=`.
- IPC payload validation phân tán, chủ yếu kiểm tra field bắt buộc; chưa có schema validator, giới hạn độ dài đồng nhất hoặc giới hạn mảng.
- Session không gắn với `webContents.id`; trong app một cửa sổ chính điều này ít ảnh hưởng, nhưng child window dùng cùng preload sẽ có cùng khả năng invoke.
- File read/open phụ thuộc kiểm soát canonical path của service; được kiểm tra riêng ở Task 5.
- Không thực hiện fuzzing Electron/Chromium native hoặc kiểm thử exploit thực tế.

## Bằng chứng kiểm thử

```text
npm test          -> 34 PASS, 0 FAIL
npm run test:e2e  -> 2 PASS, chạy ngoài managed sandbox vì Electron GUI bị chặn platform channel trong sandbox
```

Lần chạy Electron trong managed sandbox phát sinh `FATAL platform_channel ... Access is denied`; runner cũ trả mã 0 dù process fatal. Kết quả đó không được tính PASS. Lần chạy được cấp quyền ngoài sandbox in rõ hai dòng PASS và mới là bằng chứng runtime sử dụng ở trên.

