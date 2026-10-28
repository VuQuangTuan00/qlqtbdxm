# Chuyển dữ liệu SQL Server cũ

## Nguyên tắc

Công cụ chỉ đọc SQL Server, không chạy trong startup, không sửa nguồn và không ghi đè đích. Password truyền qua biến môi trường, không đưa lên command line hoặc log.

## Dry-run

PowerShell:

```powershell
$env:DB_SERVER = 'SERVER'
$env:DB_NAME = 'QTCN'
$env:DB_USER = 'readonly_user'
$env:DB_PASSWORD = '<nhập trong phiên shell>'
$env:DB_TRUST_CERT = 'true' # chỉ khi hạ tầng dùng cert nội bộ
npm run migrate:mssql -- --report .\migration-dry-run.json
```

Dry-run kiểm tra kết nối và số bản ghi 14 bảng, không tạo SQLite.

## Thực thi

```powershell
npm run migrate:mssql -- --execute `
  --destination-root 'D:\QLQT-Migrated' `
  --source-files-root 'C:\Users\old-user\AppData\Roaming\qlqtbdxm'
```

`destination-root` phải chưa tồn tại. Kết quả gồm `data/app.sqlite`, các thư mục file và `migration-report.json`.

Validation gồm count từng bảng, PK/FK, Unicode qua driver, hash password được copy nguyên giá trị, checksum file, `PRAGMA integrity_check` và `foreign_key_check`. Bất kỳ file/path/dòng nào không bảo toàn được sẽ dừng toàn bộ; công cụ không âm thầm bỏ qua.

## Đưa vào app

Không copy thủ công lên database đang mở. Dùng tính năng Sao lưu trên một app SQLite staging để tạo gói ZIP hợp lệ, rồi dùng Khôi phục trong app đích; hoặc thực hiện khi app đóng theo quy trình quản trị có backup.

## Khi chỉ còn `.bak`

SQLite không mở trực tiếp `.bak`. Phải restore `.bak` vào một SQL Server tạm, tạo login chỉ đọc cho database đó, chạy dry-run rồi migration. Không đưa `.bak` vào chức năng restore SQLite.

## Trạng thái thực tế

Công cụ và validation đã triển khai, nhưng migration dữ liệu thật là `NOT TESTED` vì phiên triển khai không được cung cấp SQL Server/credential nguồn. Không có dữ liệu nguồn nào bị thay đổi.
