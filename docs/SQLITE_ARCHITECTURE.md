# Kiến trúc SQLite

## Database lifecycle

`main/index.js` gọi `initDatabase()` sau `app.whenReady()`. Adapter tạo thư mục `userData/data`, mở duy nhất một connection `better-sqlite3`, bật PRAGMA và chạy migrations theo thứ tự. `before-quit` đóng connection.

`main/database/sqlite.js` giữ boundary async để service/repository cũ không phải chuyển sang API đồng bộ. `$1..$n` được bind thành prepared-statement parameters; adapter không biến đổi dialect SQL khác.

## Migration runner

`_migrations` lưu filename, SHA-256 và thời điểm áp dụng. Runner:

1. Từ chối migration đã áp dụng nhưng bị đổi checksum.
2. Từ chối database chứa migration không có trong app (schema mới hơn/không tương thích).
3. Chạy từng migration trong transaction.
4. Không chạy lại migration đã áp dụng.

Để thêm schema, tạo file số tiếp theo trong `main/database/migrations-sqlite/`; không sửa file đã phát hành.

## Transaction

Adapter dùng `BEGIN IMMEDIATE`. Các luồng nhiều bảng đã bọc transaction gồm equipment + QR + audit, plan + logs + audit, đổi template plan, log + trạng thái plan, reorder và xóa plan.

File system không tham gia SQLite transaction. Vehicle service dùng staging/compensation: ghi file mới trước, chỉ xóa file cũ sau khi DB update thành công, và xóa file mới nếu DB update lỗi.

## Backup lock

Trong lúc snapshot/copy file hoặc restore, adapter bật maintenance mode. Query nghiệp vụ mới bị từ chối với thông báo thử lại sau, bảo đảm snapshot DB và tập file không bị thay đổi giữa chừng.

## Quy ước dữ liệu

- PK là INTEGER, giữ ba PK đặc biệt: `vehicle_id`, `vehicle_type_id`, `engine_maintenance_id`.
- Boolean là 0/1.
- Timestamp UTC ISO-8601; date là `YYYY-MM-DD`.
- Tiếng Việt lưu TEXT UTF-8.
- Path trong DB dùng dấu `/` và tương đối từ `userData`.

## Native module và build

`better-sqlite3` là production dependency. `electron-builder.yml` unpack native module khỏi asar và electron-builder rebuild binary cho Electron 29 ABI 121. Installer không chứa database người dùng hoặc SQL Server driver.
