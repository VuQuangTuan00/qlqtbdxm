# Báo cáo kiểm thử SQLite

Ngày kiểm thử: 2026-10-28, Windows x64, Electron 29.4.6, better-sqlite3 11.10.0, SQLite 3.49.2.

## Tự động

`npm test`: **11 passed, 0 failed**.

1. Fresh schema, roles/steps seed, PRAGMA và rerun idempotent.
2. Parameter binding lặp, Unicode tiếng Việt, unique constraint, rollback.
3. Bootstrap admin chỉ một lần, bcrypt login, equipment + QR + cascade delete.
4. Plan tạo mã và 10 log định kỳ trong transaction.
5. Đơn vị phân cấp, tìm kiếm, ràng buộc khóa ngoại, khóa/mở user, login và đổi mật khẩu.
6. Loại xe, hạng mục động cơ, sắp xếp, ảnh và PDF với đường dẫn tương đối; từ chối PDF giả.
7. Luồng hoàn chỉnh kế hoạch → nhật ký → nghiệm thu → báo cáo tổng hợp/kỳ/quá hạn.
8. Migration lỗi rollback và schema mới hơn bị từ chối.
9. Checksum legacy tương đương được nâng; checksum không xác định vẫn bị từ chối.
10. Backup/restore end-to-end và rollback khi lỗi sau swap.
11. Database hỏng và ZIP path traversal bị từ chối.

`npm run test:syntax`: **64 file JavaScript OK**.

`npm audit --omit=dev`: **0 production vulnerability**.

## Build

`electron-builder --win`: **PASSED**. Native module rebuild đúng Electron ABI 121. NSIS và blockmap được tạo.

Kiểm tra app.asar: có migration SQLite và `better_sqlite3.node`; không có `mssql`, `tedious`, `.lnk`, migration SQL Server hoặc database người dùng.

Packaged `win-unpacked` startup smoke: **PASSED**; tiến trình chạy sau 8 giây và SQLite được tạo trong TEMP. Dữ liệu smoke đã dọn.

Packaged legacy-database smoke: **PASSED**; bản sao database checksum cũ khởi động được, metadata được nâng sang checksum hiện tại, `integrity_check=ok`, không lỗi khóa ngoại và dữ liệu hiện có được giữ nguyên.

## Chưa kiểm thử

- Installer NSIS trên máy Windows sạch/VM.
- Gỡ rồi cài lại thực tế.
- Full manual regression từng màn hình UI.
- Migration SQL Server thật và sample migration có server nguồn.
- Tải lớn sát giới hạn 2 GB và nhiều process cùng ghi.

Các mục này phải được coi là `NOT TESTED`, không phải passed.
