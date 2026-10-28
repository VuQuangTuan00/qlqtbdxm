# QLQT Bảo Dưỡng Xe Máy

Ứng dụng Electron chạy offline trên một máy Windows, dùng SQLite nhúng. Không cần SQL Server, SSMS, dịch vụ database hoặc Internet để vận hành.

## Chạy development

```powershell
npm install
npm run rebuild:native
npm test
npm start
```

Database tự tạo tại `%APPDATA%\qlqtbdxm\data\app.sqlite`. Lần đầu mở ứng dụng phải tạo tài khoản admin; dự án không có mật khẩu mặc định.

## Build Windows

```powershell
npm run build
```

Installer xuất tại `dist/QLQT Bảo Dưỡng Xe Máy Setup 1.0.0.exe`.

## Tài liệu

- [Kiến trúc SQLite](docs/SQLITE_ARCHITECTURE.md)
- [Kế hoạch migration](docs/SQLITE_MIGRATION_PLAN.md)
- [Chuyển dữ liệu SQL Server](docs/SQLITE_DATA_MIGRATION.md)
- [Backup/Restore](docs/BACKUP_RESTORE_GUIDE.md)
- [Triển khai Windows](docs/WINDOWS_DEPLOYMENT.md)
- [Báo cáo test](docs/SQLITE_TEST_REPORT.md)

Không đặt file SQLite trên network share/OneDrive để nhiều máy cùng mở. Mỗi máy là một database độc lập; dùng backup ZIP để chuyển máy.
