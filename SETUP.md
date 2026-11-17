# Hướng dẫn cài đặt ứng dụng Quy Trình Công Nghệ

## 1. Chuẩn bị SQL Server

Ứng dụng sử dụng Microsoft SQL Server. Trên máy chủ, cài SQL Server và bật chế độ xác thực phù hợp với đơn vị. Tạo database và tài khoản riêng cho ứng dụng, sau đó cấp các quyền cần thiết để chạy migration, đọc/ghi dữ liệu và thực hiện backup/restore.

Nếu máy trạm kết nối qua LAN:

- Bật TCP/IP trong SQL Server Configuration Manager.
- Chọn cổng cố định hoặc instance name và ghi lại giá trị thực tế.
- Chỉ mở cổng SQL Server trong Windows Firewall cho mạng Domain/Private và dải máy được phép.
- Không mở SQL Server trực tiếp ra Internet.

## 2. Cài và khởi động ứng dụng

### Chạy từ source

```cmd
cd C:\DuongDan\QuanLyQuyTrinhBaoDuognXeMay
npm install
npm start
```

### Tạo bản cài đặt

```cmd
npm run build
```

Installer được tạo trong thư mục `dist`.

## 3. Thiết lập kết nối lần đầu

Khi chưa có cấu hình, ứng dụng tự hiển thị màn hình thiết lập SQL Server. Nhập đúng:

- Server: tên máy, địa chỉ máy chủ hoặc tên phù hợp với hạ tầng của đơn vị.
- Port: để trống nếu dùng cấu hình mặc định/instance name; nếu dùng cổng cố định thì nhập cổng thực tế.
- Database: database đã tạo cho ứng dụng.
- User và password: tài khoản SQL Server của ứng dụng.

Nhấn **Kiểm tra kết nối**, sau đó **Kết nối & Khởi động**. Ứng dụng lưu dữ liệu vào `db-config.json` trong Electron `userData`; không cần và không đọc file `.env`.

Không sao chép `db-config.json` sang máy không được phép vì file có chứa thông tin kết nối.

## 4. Cấu hình backup

Mặc định, ứng dụng hỏi SQL Server qua `SERVERPROPERTY('InstanceDefaultBackupPath')` để lấy thư mục backup của instance.

Nếu cần chỉ định thư mục khác, thêm `backupDirectory` vào `db-config.json`. Với SQL Server từ xa, nên dùng đường dẫn UNC mà cả dịch vụ SQL Server và ứng dụng Electron đều truy cập được, ví dụ `\\may-chu\sql-backup`.

Tài khoản dịch vụ SQL Server phải có quyền ghi vào thư mục backup. Tài khoản Windows chạy ứng dụng phải có quyền đọc file backup để đóng gói hoặc khôi phục.

## 5. Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Không kết nối được | Tên server/instance, cổng, TCP/IP, firewall và dịch vụ SQL Server |
| Đăng nhập SQL thất bại | User/password, chế độ xác thực và trạng thái tài khoản SQL Server |
| Database không tồn tại | Tên database trong màn hình thiết lập và database trên server |
| Backup thất bại | Quyền `BACKUP DATABASE`, thư mục mặc định hoặc `backupDirectory`, quyền của service account |
| Máy trạm không thấy đường dẫn backup | Dùng UNC share thay vì ổ đĩa cục bộ của máy chủ |

Không xóa `db-config.json` để xử lý lỗi thông thường. Nếu file hỏng cú pháp, màn hình phục hồi cho phép nhập lại; khi lưu thành công, ứng dụng giữ nguyên file hỏng trong một file `db-config.invalid-*.bak` để đối chiếu.
