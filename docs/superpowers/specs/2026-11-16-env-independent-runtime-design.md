# Thiết kế cấu hình runtime không phụ thuộc `.env`

## Mục tiêu

Ứng dụng Electron phải khởi động, đăng nhập, kết nối SQL Server, sao lưu/khôi phục và ghi log trong development cũng như bản đóng gói mà không cần file `.env`. Cấu hình kết nối SQL Server do người dùng nhập được lưu trong `db-config.json` tại Electron `userData` và là nguồn cấu hình production duy nhất.

## Phạm vi và ràng buộc

- Không thay đổi giao diện, database schema hoặc nghiệp vụ.
- Không hard-code IP, username, password hoặc tên database để tự động kết nối.
- Không xóa hoặc ghi đè mất dữ liệu/khóa chưa biết trong `db-config.json`.
- Giữ nguyên màn hình thiết lập SQL Server lần đầu và màn hình phục hồi kết nối hiện có.
- Không đưa password vào log hoặc renderer ngoài hành vi hiện tại là trả chuỗi password rỗng.
- Biến `TEST_DB_*` chỉ thuộc test và không tham gia runtime production.

## Các hướng đã cân nhắc

### Hướng 1 — cấu hình runtime tập trung (đã chọn)

`db-config.json` là nguồn duy nhất cho kết nối SQL Server. Các chế độ development/packaged được suy ra từ `app.isPackaged`; bcrypt và log dùng mặc định nội bộ; thư mục backup được lấy từ cấu hình tùy chọn hoặc SQL Server. Hướng này loại bỏ phụ thuộc `.env` mà không thêm màn hình hay file cấu hình mới.

### Hướng 2 — chỉ loại bỏ biến kết nối database

Giữ các biến môi trường còn lại ở cấp hệ điều hành. Ít thay đổi hơn nhưng bản cài đặt vẫn cần cấu hình bên ngoài và không giải quyết triệt để yêu cầu vận hành không có `.env`.

### Hướng 3 — thêm `app-config.json`

Tách logging, bcrypt và backup khỏi cấu hình database. Cấu trúc tách biệt hơn nhưng tăng thêm file, luồng đọc/ghi và cơ chế quản lý không cần thiết cho ứng dụng hiện tại.

## Thiết kế đã chọn

### 1. Đọc cấu hình SQL Server

- Một module cấu hình chịu trách nhiệm xác định đường dẫn `userData/db-config.json`, đọc JSON và kiểm tra các trường bắt buộc: `mode`, `server`, `database`, `user` và thông tin endpoint hợp lệ.
- `getDbConfig()` chỉ đọc file này; không đọc `DB_SERVER`, `DB_HOST`, `DB_PORT`, `DB_INSTANCE`, `DB_NAME`, `DB_USER` hoặc `DB_PASSWORD` trong mọi chế độ.
- Khi file không tồn tại, `getDbConfig()` trả trạng thái chưa cấu hình để luồng khởi động mở màn hình first-run.
- Khi file tồn tại nhưng hỏng/không hợp lệ, ứng dụng không xóa file; luồng khởi động mở màn hình phục hồi và hiển thị lỗi.
- `initMssqlDatabase()` không chứa fallback server, instance, database, user hay password hard-code.

### 2. Ghi cấu hình mà không mất dữ liệu

- IPC `dbconfig:set` đọc object hiện có nếu file hợp lệ, hợp nhất các trường mới lên object cũ rồi mới ghi.
- Password cũ được giữ khi form không gửi password mới.
- Các khóa ngoài form, gồm `backupDirectory`, được giữ nguyên.
- Ghi file theo kiểu nguyên tử thông qua file tạm trong cùng thư mục rồi đổi tên, giảm nguy cơ file JSON bị dở dang khi ứng dụng tắt bất ngờ.

### 3. Khởi động lần đầu và phục hồi

- Luồng khởi động dựa trên kết quả đọc/validate cấu hình, không chỉ dựa vào `fs.existsSync`.
- Không có file: đăng ký IPC setup và phát `app:first-run`.
- File không hợp lệ hoặc kết nối thất bại: giữ nguyên file, bật recovery mode và phát `app:db-setup` với dữ liệu không nhạy cảm lấy được nếu có.
- File hợp lệ: kết nối SQL Server, chạy migration và đăng ký IPC như hiện tại.

### 4. Backup và restore

- `backupDirectory` trong `db-config.json`, nếu có và không rỗng, là override ưu tiên để tương thích thư mục chia sẻ/instance đặc biệt.
- Nếu không có override, kết nối hiện tại truy vấn `SERVERPROPERTY('InstanceDefaultBackupPath')` để lấy thư mục backup của chính SQL Server instance.
- Không dùng `SQLSERVER_BACKUP_DIR`.
- Thư mục phải tồn tại và ứng dụng phải đọc được file `.bak` sau khi SQL Server tạo. Nếu SQL Server ở máy khác và trả đường dẫn cục bộ của server, lỗi sẽ yêu cầu cấu hình một đường dẫn UNC dùng chung trong `backupDirectory`.
- Restore tiếp tục dùng hộp thoại chọn đích `.bak` và luồng hiện có; không thay đổi định dạng ZIP/manifest.

### 5. Các biến môi trường khác

- `NODE_ENV`: bỏ khỏi runtime; dùng `app.isPackaged` để bật/tắt DevTools và chọn mức log console.
- `LOG_LEVEL`: bỏ; file log dùng `info`, console dùng `debug` ở development và `warn` ở packaged.
- `BCRYPT_ROUNDS`: bỏ; dùng hằng số `10` để giữ tương thích hash và mức chi phí hiện tại.
- `SESSION_SECRET`: bỏ khỏi mẫu cấu hình vì source không sử dụng; session hiện lưu trong bộ nhớ main process.
- `TEST_DB_*`: giữ trong test helper để bảo vệ database production, không được import vào runtime app.

### 6. Packaging

- Xóa lời gọi `dotenv.config` và dependency trực tiếp `dotenv` khỏi package manifest/lockfile.
- `.env` không được đóng gói và cũng không cần tồn tại khi chạy development hoặc bản cài đặt.
- Không can thiệp các dependency con có thể tự phụ thuộc `dotenv`; chỉ loại bỏ dependency trực tiếp và việc ứng dụng gọi nó.

## Kiểm thử

- Unit test đọc config: file thiếu, JSON hỏng, config thiếu trường, config hợp lệ, không đọc `DB_*` dù môi trường có giá trị.
- IPC test: first-run không cần session; lưu mới; giữ password cũ; giữ khóa `backupDirectory`; không làm hỏng file cũ nếu ghi thất bại.
- Database config test: không có fallback hard-code và kết nối dùng đúng port/instance từ file.
- Backup test: ưu tiên `backupDirectory`, fallback sang đường dẫn SQL Server cung cấp, báo lỗi rõ khi không có đường dẫn hoặc đường dẫn không thể truy cập.
- Runtime test: development/packaged không phụ thuộc `NODE_ENV`; bcrypt vẫn tạo/so sánh hash; logging khởi tạo không cần biến môi trường.
- Static audit: không còn `dotenv` hoặc các biến runtime đã loại bỏ trong `main`/`renderer`; `TEST_DB_*` chỉ còn trong test.
- Chạy test suite, build Electron đóng gói và kiểm tra nội dung artifact không chứa `.env`.

## Không thuộc phạm vi

- Mã hóa password trong `db-config.json`.
- Thêm trường hoặc thay đổi bố cục màn hình cấu hình.
- Thay đổi schema SQL Server, migrations, tài khoản mặc định hoặc logic login.
- Tự động cấp quyền filesystem cho tài khoản dịch vụ SQL Server.
