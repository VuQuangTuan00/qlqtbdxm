# 05 — Kiểm thử backup, ZIP import và gói chuyển máy

Ngày kiểm tra: 2026-11-15

## Luồng thực tế

1. Admin chọn nơi lưu ZIP.
2. SQL Server tạo `.bak` bằng `BACKUP DATABASE ... WITH COPY_ONLY, INIT, CHECKSUM` vào thư mục mà service account SQL Server có quyền ghi.
3. App tạo ZIP gồm `manifest.json`, một `.bak` trong `database/` và file trong ba root `uploads`, `vehicle-images`, `maintenance-files`.
4. File `.bak` tạm phía SQL Server được xóa best-effort sau export.
5. Khi import, app **không tự RESTORE database**. App kiểm tra/chép file và trích `.bak` ra Documents; người quản trị restore bằng SSMS/quy trình vận hành riêng.

Điểm 5 là hành vi an toàn hiện tại: import package không tự ghi đè database đang chạy.

## Bảo vệ ZIP sau sửa

| Kiểm soát | Trạng thái |
|---|---|
| Chỉ `.zip`, file phải tồn tại | PASS |
| Path traversal/absolute/nested path lạ | PASS |
| Duplicate entry, kể cả manifest | PASS |
| Extension allowlist | PASS |
| Tối đa entry | 10.000 |
| Tối đa một entry | 5 GiB |
| Tổng uncompressed | 10 GiB |
| Compression ratio bất thường | chặn trên 200:1 với entry >1 MiB |
| Manifest format/version | Bắt buộc, version 1 |
| Size + SHA-256 từng payload | Bắt buộc và xác minh trước khi chạm live file |
| `.bak` và manifest khớp nhau | PASS |
| Destination ZIP nằm trong `userData` | Từ chối |
| Staging temp cleanup | `finally`, PASS trong test |
| Rollback nếu copy giữa chừng lỗi | PASS với failure injection |
| Ghi đè ZIP đích đã tồn tại | Từ chối |

## Lỗi đã sửa

### BACKUP-001 — Transfer import chấp nhận gói không có manifest/checksum

Mức độ: P0.  
Tái hiện: ZIP chỉ có `vehicle-images/test.png` được chép vào profile; manifest có SHA sai cũng được chấp nhận.  
Sửa: manifest bắt buộc; export ghi path/size/SHA-256 cho mọi file và `.bak`; import so khớp tập entry, kích thước và hash trước khi copy.  
Test red → green — PASS.

### BACKUP-002 — Không có quota chống ZIP bomb

Mức độ: P0/P1.  
Sửa: kiểm tra count, entry length, tổng uncompressed và compression ratio ngay trên central directory trước extraction.  
Bằng chứng: source contract PASS; chưa tạo fixture 10 GiB vì không phù hợp môi trường test.

### BACKUP-003 — Import lỗi giữa chừng để lại trạng thái file nửa chừng

Mức độ: P1.  
Sửa: file đích hiện hữu được backup vào staging; file mới được ghi nhận. Nếu copy sau lỗi, file mới bị xóa và file cũ được restore.  
Failure injection: file đầu copy thành công, đường dẫn file thứ hai cố ý bị chặn; sau lỗi file đầu không còn, blocker gốc giữ nguyên — PASS.

### BACKUP-004 — ZIP có thể được xuất vào chính `userData`

Mức độ: P1.  
Sửa: canonical containment check cho cả export file-only và transfer package trước khi gọi PowerShell.  
Test xác nhận không tạo destination — PASS.

## Kết quả test tích hợp tạm thời

Chạy ngoài managed sandbox vì sandbox chặn spawn PowerShell:

```text
tests/integration/backup/transfer-package-validation.test.js
7 PASS, 0 FAIL, 0 SKIP
```

Bao gồm: thiếu manifest, checksum sai, quota contract, round-trip ảnh + `.bak`, traversal, duplicate entry, rollback và destination policy. Toàn bộ artifact nằm trong thư mục temp và được cleanup.

Toàn suite ngoài sandbox: `npm test` → 54 PASS, 0 FAIL, 0 SKIP.

## Phần BLOCKED / NOT TESTED

- `BACKUP DATABASE` trên SQL Server thật: BLOCKED vì không có SQL Server test riêng và không được chạm production.
- `RESTORE VERIFYONLY`, restore sang database disposable và đối chiếu row count/checksum: BLOCKED.
- Quyền ghi thực tế của SQL Server service account vào thư mục mặc định của instance hoặc `db-config.json.backupDirectory`: NOT TESTED.
- File `.bak` nhiều GiB và đúng quota biên 5/10 GiB: NOT TESTED để tránh tiêu tốn tài nguyên.
- Mất điện/process kill đúng lúc PowerShell copy: mô phỏng logic failure PASS, process-kill recovery NOT TESTED.

## Rủi ro còn lại

- `importFiles()` legacy không có manifest/checksum và hiện không được IPC/UI gọi; nếu dùng lại phải áp dụng cùng policy hoặc đánh dấu rõ là legacy trusted-only.
- Export duyệt đệ quy nhưng transfer import hiện chỉ nhận file một cấp dưới mỗi root; dữ liệu hiện tại do app tạo là flat. Nếu cho phép subfolder trong tương lai phải đồng bộ validator.
- Package bảo đảm integrity bằng SHA-256 nhưng không có chữ ký/xác thực nguồn; admin vẫn có thể tạo lại manifest cho nội dung độc hại.
- Nội dung file trong archive được kiểm extension + checksum, không decode sâu magic bytes. Upload trực tiếp qua app có magic-byte validation.
- Giá trị default thư mục SQL Server backup phụ thuộc máy cài đặt; nên bắt buộc cấu hình rõ trong installer/deployment.

