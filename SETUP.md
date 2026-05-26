# Hướng dẫn cài đặt hệ thống QLQT Bảo Dưỡng Xe Máy

## Kiến trúc mạng LAN

```
[Máy chủ Windows]              [Các máy trạm Windows]
  PostgreSQL 5432  <─────LAN──── Electron App (nhiều máy)
  192.168.1.100                  192.168.1.x
```

---

## 1. Cài đặt PostgreSQL trên máy chủ (Windows)

### 1.1 Tải về và cài đặt

1. Tải **PostgreSQL 16** tại: https://www.postgresql.org/download/windows/
2. Chạy installer, cài đặt với các thông số:
   - Port: **5432**
   - Superuser password: *(ghi nhớ lại)*
   - Locale: Vietnamese hoặc mặc định

### 1.2 Tạo database và user

Mở **pgAdmin 4** hoặc **psql** (Command Prompt), đăng nhập với superuser:

```sql
-- Tạo user cho ứng dụng
CREATE USER qlqt_user WITH PASSWORD 'matkhau123';

-- Tạo database
CREATE DATABASE qlqtbdxm OWNER qlqt_user ENCODING 'UTF8';

-- Cấp quyền
GRANT ALL PRIVILEGES ON DATABASE qlqtbdxm TO qlqt_user;
```

> Đổi `'matkhau123'` thành mật khẩu mạnh hơn trong môi trường thực.

---

## 2. Cấu hình cho phép kết nối từ mạng LAN

### 2.1 Sửa file pg_hba.conf

Vị trí: `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`

Thêm dòng sau vào cuối file (thay `192.168.1.0/24` bằng dải mạng LAN thực tế):

```
# Cho phép kết nối từ mạng LAN
host    qlqtbdxm    qlqt_user    192.168.1.0/24    md5
```

### 2.2 Sửa file postgresql.conf

Vị trí: `C:\Program Files\PostgreSQL\16\data\postgresql.conf`

Tìm dòng `#listen_addresses = 'localhost'`, đổi thành:

```
listen_addresses = '*'
```

### 2.3 Khởi động lại PostgreSQL

Mở **Services** (Win + R → `services.msc`), tìm **postgresql-x64-16**, nhấn **Restart**.

---

## 3. Mở firewall Windows

Mở **Windows Defender Firewall** → **Advanced Settings** → **Inbound Rules** → **New Rule**:

- Rule type: **Port**
- Protocol: **TCP**, Port: **5432**
- Action: **Allow the connection**
- Profile: **Domain, Private** (KHÔNG chọn Public)
- Name: `PostgreSQL QLQT`

---

## 4. Kiểm tra kết nối từ máy trạm

Từ máy trạm, mở Command Prompt và chạy:

```cmd
telnet 192.168.1.100 5432
```

Nếu kết nối được (màn hình đen) → thành công.

---

## 5. Cài đặt ứng dụng

### 5.1 Trên máy chủ (lần đầu)

Clone code hoặc copy project về máy chủ:

```cmd
cd C:\qlqtbdxm
npm install
```

Tạo file `.env` (copy từ `.env.example` rồi sửa):

```
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=qlqtbdxm
DB_USER=qlqt_user
DB_PASSWORD=123456
```

Chạy seed để tạo schema và dữ liệu mẫu:

```cmd
npm run seed
```

### 5.2 Build ứng dụng

```cmd
npm run build
```

File cài đặt được tạo trong thư mục `dist/`.

### 5.3 Cài đặt trên từng máy trạm

1. Chạy file cài đặt từ `dist/`
2. Khởi động ứng dụng
3. Đăng nhập bằng `admin / Admin@123`
4. Vào **Cài Đặt Hệ Thống** → tab **Kết nối Database**
5. Nhập địa chỉ IP máy chủ: `192.168.1.100`
6. Nhập mật khẩu database
7. Nhấn **Kiểm tra kết nối** để xác nhận
8. Nhấn **Lưu & khởi động lại**

---

## 6. Tài khoản mặc định

| Tài khoản   | Mật khẩu   | Vai trò         |
|-------------|-----------|-----------------|
| admin       | Admin@123 | Quản trị viên   |
| chihuy01    | Pass@123  | Chỉ huy         |
| thuchien1   | Pass@123  | Thợ kỹ thuật    |
| nghiemthu1  | Pass@123  | Kiểm tra        |

> **Bắt buộc đổi mật khẩu sau lần đăng nhập đầu tiên.**

---

## 7. Backup database

Chạy lệnh sau trên máy chủ để backup hàng ngày:

```cmd
pg_dump -U qlqt_user -F c qlqtbdxm > backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.dump
```

Khôi phục từ backup:

```cmd
pg_restore -U qlqt_user -d qlqtbdxm backup_20250101.dump
```

---

## 8. Xử lý sự cố thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `Connection refused` | PostgreSQL chưa chạy | Kiểm tra Services |
| `Host not found` | Sai IP máy chủ | Kiểm tra lại địa chỉ IP |
| `Password authentication failed` | Sai mật khẩu | Kiểm tra lại mật khẩu trong Settings |
| `Database does not exist` | Chưa tạo database | Chạy lại bước 1.2 |
| `permission denied` | User chưa có quyền | Chạy lại GRANT trong bước 1.2 |
