# Kế hoạch triển khai tách luồng khôi phục

**Spec:** `docs/superpowers/specs/2026-11-17-split-restore-design.md`

## Task 1: Khóa hành vi gói backup bằng kiểm thử

- Cập nhật integration test để xác nhận backup mới bỏ `uploads`.
- Kiểm thử riêng `restoreFilesFromTransferPackage` và `extractDatabaseBackupFromTransferPackage`.
- Giữ kiểm thử tương thích và rollback cho gói backup cũ.

## Task 2: Tách service ZIP

- Tách danh sách thư mục xuất mới và danh sách thư mục đọc tương thích.
- Tái sử dụng một bước xác thực gói cho cả hai chế độ.
- Chế độ file chỉ chép file; chế độ database chỉ xuất `.bak`.
- Chuẩn hóa lỗi PowerShell để tránh trả raw CLIXML khó đọc.

## Task 3: Bổ sung restore SQL Server an toàn

- Viết unit test cho thứ tự `VERIFYONLY`, safety backup, `SINGLE_USER`, restore và `MULTI_USER`.
- Kết nối `master`, xây lệnh `MOVE` từ `RESTORE FILELISTONLY` và đường dẫn mặc định của SQL Server.
- Khi restore lỗi, thử rollback từ safety backup và luôn trả database về `MULTI_USER`.

## Task 4: Tách IPC và giao diện

- Thay `fileArchive:import` bằng `fileArchive:restoreFiles` và `fileArchive:restoreDatabase`.
- Thêm hai nút, xác nhận và thông báo riêng.
- Khởi động lại Electron sau khi database được phục hồi thành công.

## Task 5: Xác minh

- Chạy test tập trung sau từng thay đổi.
- Chạy toàn bộ test suite và kiểm tra source không còn handler nhập ZIP kết hợp.
- Review thay đổi, đặc biệt đường dẫn file và khả năng rollback.
