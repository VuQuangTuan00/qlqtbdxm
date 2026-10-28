# Migration SQL Server → SQLite

Tài liệu SQL Server-only trước đây đã lỗi thời. Runtime hiện dùng SQLite nhúng và không kết nối SQL Server.

Tài liệu nguồn hiện hành:

- `docs/SQLITE_MIGRATION_PLAN.md`
- `docs/SQLITE_ARCHITECTURE.md`
- `docs/SQLITE_DATA_MIGRATION.md`
- `docs/BACKUP_RESTORE_GUIDE.md`
- `docs/SQLITE_TEST_REPORT.md`

SQL Server chỉ còn trong schema lịch sử `main/database/migrations-mssql/` (không đóng gói) và dev tool `scripts/migrate-mssql-to-sqlite.js`. Dữ liệu SQL Server thật chưa được migrate trong phiên triển khai vì không có nguồn/credential được cấp.
