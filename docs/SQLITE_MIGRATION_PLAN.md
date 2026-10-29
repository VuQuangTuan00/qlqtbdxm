# Kế hoạch migration SQL Server → SQLite

## Phạm vi và trạng thái

Kế hoạch này đã được triển khai cho runtime chính. SQL Server cũ không bị kết nối, sửa hoặc xóa trong quá trình phát triển. Migration dữ liệu thật chỉ thực hiện khi người vận hành chủ động chạy công cụ legacy với credential riêng.

## Kiến trúc cũ và mới

```text
Cũ: Renderer → Preload/IPC → Service → Repository → mssql/tedious → SQL Server
Mới: Renderer → Preload/IPC → Service → Repository → better-sqlite3 → userData/data/app.sqlite
```

Renderer không truy cập trực tiếp SQLite. `nodeIntegration` vẫn tắt và IPC vẫn qua whitelist trong preload.

## Schema

14 bảng nghiệp vụ được giữ nguyên: `roles`, `users`, `units`, `equipments`, `qr_codes`, `maintenance_steps`, `maintenance_plans`, `maintenance_logs`, `acceptance_records`, `audit_logs`, `attachments`, `vehicle_type`, `vehicle`, `engine_maintenance`.

Quan hệ chính:

```text
units ─┬─ users ─┬─ maintenance_plans ─┬─ maintenance_logs
       │         │                     └─ acceptance_records
       └─ equipments ─ qr_codes
vehicle_type ─ vehicle ─┬─ equipments
                        └─ engine_maintenance
users ─ attachments / audit_logs
maintenance_steps ─ maintenance_logs
```

SQLite bật `foreign_keys=ON`, WAL và `busy_timeout=5000`. Ngày giờ được lưu TEXT ISO-8601; ngày nghiệp vụ dùng `YYYY-MM-DD`. Boolean lưu INTEGER có CHECK 0/1.

## Thành phần bị ảnh hưởng

- Database: `main/database/index.js`, `sqlite.js`, `migration-runner.js`, `migrations-sqlite/`.
- Toàn bộ repository tiếp tục dùng hợp đồng async `{ query, connect, transaction }`; query đặc thù SQL Server đã được chuyển sang SQLite.
- IPC SQL Server config đã bị loại khỏi runtime/preload/UI.
- Auth có bootstrap admin đầu tiên khi `users` rỗng.
- Backup IPC chuyển từ `.bak` sang snapshot SQLite + file + manifest/checksum.
- File path mới lưu tương đối dưới `userData`; đường dẫn tuyệt đối ngoài `userData` bị từ chối ở runtime.

## Vị trí dữ liệu

```text
%APPDATA%/qlqtbdxm/
├── data/app.sqlite
├── vehicle-images/
├── maintenance-files/
├── backups/              # safety backup trước restore
└── logs/
```

Database không nằm trong source, installer, `dist` hay `app.asar`.

## Migration dữ liệu

`scripts/migrate-mssql-to-sqlite.js` chạy tách khỏi startup. Mặc định chỉ dry-run; `--execute` tạo một thư mục đích mới qua staging. Nguồn chỉ có câu `SELECT`, giữ nguyên PK/FK/hash, đổi path file sang tương đối, so sánh count, chạy `integrity_check` và `foreign_key_check` trước khi công bố đích.

## Rollback

- Schema migration SQLite chạy từng file trong transaction và không reset dữ liệu.
- Database có migration không được app hỗ trợ hoặc checksum bị đổi sẽ bị từ chối.
- Data migration chỉ rename staging thành đích sau validation; lỗi sẽ xóa staging, không đụng nguồn.
- Restore tạo safety backup, chuyển dữ liệu hiện tại vào rollback staging và tự hoàn tác nếu swap/validation lỗi.

## Rủi ro còn lại

- Chưa migration dữ liệu SQL Server thật trong workspace này.
- Chưa kiểm thử installer trên máy Windows sạch/VM và chưa kiểm thử uninstall/reinstall thực tế.
- SQLite phù hợp mô hình một máy; không dùng chung file database qua LAN/cloud-sync.
- Backup tự động theo lịch chưa triển khai; backup hiện do admin chủ động.

## Tiêu chí kiểm thử

- Fresh DB, rerun migration, migration rollback, schema mới hơn.
- Binding, Unicode, unique/FK/check constraint, transaction rollback.
- Bootstrap admin, login bcrypt, equipment + QR, plan + logs.
- Backup/restore/checksum/path traversal/corruption/rollback.
- Syntax, production dependency audit, Windows build và packaged startup smoke.
