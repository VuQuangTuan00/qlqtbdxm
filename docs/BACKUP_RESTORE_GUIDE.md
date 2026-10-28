# Hướng dẫn Backup/Restore

## Sao lưu

Đăng nhập admin → Cài đặt hệ thống → File backup → Sao lưu toàn bộ → chọn vị trí ZIP.

Gói version 2 chứa:

```text
manifest.json
database/app.sqlite
files/vehicle-images/*
files/maintenance-files/*
files/uploads/*
```

App dùng SQLite Online Backup API, chuyển snapshot sang journal DELETE để gói chỉ cần một file DB, tính SHA-256/size, tạo ZIP tạm, giải nén và kiểm tra lại trước khi rename thành file đích. File đích có sẵn sẽ không bị ghi đè.

## Khôi phục

Admin chọn Khôi phục từ backup. App kiểm tra trước khi hỏi xác nhận:

- Format/version/manifest.
- Tối đa 5.000 entry, 2 GB tổng, 256 MB mỗi entry, compression ratio tối đa 200.
- Không path traversal, absolute path, duplicate path hoặc tên Windows nguy hiểm.
- Size và SHA-256 từng file.
- Schema migrations khớp manifest.
- SQLite integrity và foreign key.

Sau xác nhận, app tạo safety backup trong `userData/backups`, đóng DB, swap qua staging, mở và kiểm tra lại. Nếu lỗi, dữ liệu trước restore được đưa trở lại. Thành công sẽ restart app.

## Giới hạn

- Không nhận `.bak` SQL Server hoặc ZIP legacy version 1.
- Không restore schema mới hơn app.
- Backup hiện chạy thủ công; chưa có scheduler/retention tự động.
- Không sửa tay manifest hoặc nội dung ZIP.
