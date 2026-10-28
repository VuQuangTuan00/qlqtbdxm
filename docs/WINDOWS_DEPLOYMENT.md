# Triển khai Windows

## Development

Yêu cầu Node.js 20 và Windows x64.

```powershell
npm install
npm run rebuild:native
npm test
npm start
```

Lần đầu app tự tạo `%APPDATA%\qlqtbdxm\data\app.sqlite`, rồi yêu cầu tạo admin (không có password mặc định).

## Build

```powershell
npm run build
```

Nguồn build duy nhất là `electron-builder.yml`. Native `better_sqlite3.node` được unpack. `.lnk`, migration T-SQL, scripts migration và database người dùng không nằm trong installer.

Artifact đã tạo trong phiên này:

```text
dist/QLQT Bảo Dưỡng Xe Máy Setup 1.0.0.exe
dist/win-unpacked/
```

## Checklist máy sạch

1. Không cài SQL Server/SSMS.
2. Ngắt Internet.
3. Cài NSIS.
4. Mở app, tạo admin, login.
5. Tạo dữ liệu, đóng/mở lại.
6. Upload/xem PDF và ảnh.
7. Backup, thay đổi dữ liệu, restore.
8. Gỡ/cài lại, xác nhận chính sách giữ `%APPDATA%`.

Checklist máy sạch hiện `NOT TESTED`; phiên này chỉ build thành công và smoke-test `win-unpacked` bằng userData TEMP.
