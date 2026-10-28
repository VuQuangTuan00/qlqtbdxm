# QLQT Bảo Dưỡng Xe Máy — Developer Notes

## Stack

- Electron 29, Vanilla HTML/CSS/JS.
- SQLite qua `better-sqlite3` ở Main Process.
- `bcryptjs`, `electron-log`, `electron-builder`.
- `mssql` chỉ là devDependency cho công cụ migration legacy; không thuộc runtime/installer.

## Kiến trúc

```text
Renderer → contextBridge/preload whitelist → IPC → Service → Repository → SQLite adapter
```

Database code nằm trong `main/database/`. Schema mới thêm bằng migration đánh số; không sửa migration đã phát hành vì runner kiểm tra checksum.

Database runtime: `%APPDATA%\qlqtbdxm\data\app.sqlite`. File nghiệp vụ lưu dưới `vehicle-images`, `maintenance-files`, `uploads`; DB lưu path tương đối.

## Database contract

Adapter trả `{ rows, rowCount }`, bind `$1..$n`, hỗ trợ `connect()` và `transaction()`. Repository phải dùng SQL SQLite chuẩn và parameter binding; không thêm transformer dialect.

PRAGMA bắt buộc: foreign keys ON, WAL, busy timeout 5000 ms. Ngày giờ là ISO TEXT, boolean là 0/1.

## Auth/bootstrap

Session ở Main Process. Khi `users` rỗng, `bootstrap:createAdmin` cho tạo đúng admin đầu tiên và recheck trong transaction. Không hard-code credential.

## Backup

`main/services/file-archive.service.js` tạo snapshot bằng SQLite backup API, manifest/checksum, validate ZIP và restore qua staging/rollback. Không hỗ trợ `.bak` trong runtime.

## Legacy migration

`scripts/migrate-mssql-to-sqlite.js` mặc định dry-run. Chỉ `--execute` mới tạo đích mới. Không kết nối SQL Server trong startup.

## Commands

```powershell
npm test
npm run test:syntax
npm run rebuild:native
npm start
npm run build
npm run migrate:mssql -- --help
```

Mọi IPC mới phải thêm vào preload, kiểm tra auth/role trong Main Process và có test SQLite thật. Không thêm dependency CDN cho chức năng offline.
