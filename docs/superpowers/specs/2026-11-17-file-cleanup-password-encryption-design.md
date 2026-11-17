# Thiết kế dọn file và mã hóa mật khẩu SQL Server

## Mục tiêu

- Ảnh/PDF cũ không tích tụ lâu dài khi Windows tạm thời khóa file.
- `db-config.json` không còn lưu mật khẩu SQL Server dạng plaintext.
- Không thay đổi giao diện, schema database hoặc nghiệp vụ quản lý hiện tại.

## Phần 1 — Hàng đợi dọn file

### Hành vi

1. Khi thay ảnh, xóa ảnh, xóa PDF, xóa hạng mục hoặc xóa xe, ứng dụng vẫn thử xóa file vật lý ngay.
2. Nếu xóa thất bại, ứng dụng ghi đường dẫn vào `pending-file-cleanup.json` trong Electron `userData`.
3. Ứng dụng thử lại hàng đợi khi khởi động và trước khi tạo backup.
4. Xóa thành công thì bỏ entry khỏi hàng đợi; thất bại thì giữ lại cho lần sau và ghi log cảnh báo.
5. Chỉ nhận đường dẫn thực nằm trong `vehicle-images` hoặc `maintenance-files`; không theo symlink/junction ra ngoài `userData`.
6. Ghi file hàng đợi theo kiểu atomic temp + rename, loại bỏ entry trùng và không làm thao tác nghiệp vụ thất bại chỉ vì Windows đang khóa file.

### Các hướng đã cân nhắc

- **Hàng đợi dọn lại — được chọn:** cân bằng an toàn dữ liệu và trải nghiệm sử dụng.
- Chặn thao tác khi không xóa được file: dễ gây lỗi giả do PDF viewer, antivirus hoặc Windows giữ file.
- Quét toàn bộ file mồ côi: có nguy cơ xóa nhầm dữ liệu legacy đang được tìm qua fallback.

## Phần 2 — Mã hóa mật khẩu `db-config.json`

### Hành vi

1. Dùng Electron `safeStorage`, tương ứng Windows DPAPI trên máy triển khai.
2. File chỉ lưu `passwordEncrypted` dạng Base64 và trường phiên bản mã hóa; không lưu khóa `password` plaintext.
3. `readDbConfig()` giải mã trong bộ nhớ để truyền cho `mssql`; renderer và log không nhận mật khẩu.
4. Khi lưu cấu hình mới, nếu người dùng để trống mật khẩu và endpoint không đổi, ứng dụng giữ ciphertext cũ mà không giải mã rồi mã hóa lại không cần thiết.
5. Nếu phát hiện cấu hình legacy có `password` plaintext, ứng dụng tự động chuyển sang dạng mã hóa bằng thao tác ghi atomic trước khi kết nối.
6. Nếu `safeStorage` chưa sẵn sàng hoặc giải mã thất bại, không ghi plaintext; ứng dụng vào màn hình recovery và yêu cầu nhập lại mật khẩu.
7. `readDbConfigForRecovery()` chỉ trả các trường kết nối công khai, không trả ciphertext hoặc plaintext cho renderer.
8. Ciphertext gắn với tài khoản Windows/máy. Khi chuyển `db-config.json` sang máy khác, người dùng phải nhập lại mật khẩu.

### Các hướng đã cân nhắc

- **Electron `safeStorage`/DPAPI — được chọn:** bảo vệ thực tế mà không phải tự quản lý khóa.
- AES với khóa cạnh file cấu hình: chỉ che giấu vì ciphertext và khóa cùng vị trí.
- Windows Credential Manager: bảo mật tốt nhưng tăng phụ thuộc và độ phức tạp không cần thiết.

## Kiểm thử

- File bị khóa được đưa vào hàng đợi; lần thử sau xóa thành công và loại khỏi hàng đợi.
- Đường dẫn ngoài vùng cho phép hoặc qua symlink/junction bị từ chối.
- Backup chạy bước dọn hàng đợi trước khi đóng gói.
- File cấu hình mới không chứa plaintext.
- Cấu hình plaintext cũ được migrate mà vẫn kết nối được.
- Ciphertext giải mã đúng trên cùng máy; lỗi giải mã dẫn tới recovery, không làm mất các trường cấu hình khác.
- Toàn bộ test login, SQL connection, backup/restore và file boundary vẫn pass.
