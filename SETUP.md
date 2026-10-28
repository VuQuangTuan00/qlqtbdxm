# Cài đặt QLQT Bảo Dưỡng Xe Máy

## Người dùng cuối

1. Chạy installer Windows trong `dist/`.
2. Mở ứng dụng; SQLite tự tạo trong thư mục dữ liệu người dùng.
3. Tạo admin đầu tiên bằng form hiển thị lần đầu.
4. Đăng nhập và sử dụng. Không cần SQL Server hoặc cấu hình mạng.

Không có tài khoản/mật khẩu mặc định.

## Chuyển máy

Máy cũ: đăng nhập admin → Cài đặt → File backup → Sao lưu toàn bộ.

Máy mới: cài và mở app → tạo admin tạm nếu app yêu cầu → đăng nhập admin → Khôi phục từ backup. Gói backup sẽ thay cả database/tài khoản/file và restart app.

## Developer

```powershell
npm install
npm run rebuild:native
npm test
npm start
```

Nếu native binding sai ABI sau khi đổi Electron, chạy lại `npm run rebuild:native`.

Xem thêm [hướng dẫn triển khai](docs/WINDOWS_DEPLOYMENT.md) và [backup/restore](docs/BACKUP_RESTORE_GUIDE.md).
