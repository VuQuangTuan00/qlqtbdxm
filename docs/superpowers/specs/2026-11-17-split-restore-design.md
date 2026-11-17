# Thiết kế tách luồng khôi phục

## Mục tiêu

- Giữ một gói ZIP backup duy nhất, có manifest, checksum, file dữ liệu và SQL Server `.bak`.
- Tách thao tác khôi phục thành hai nút độc lập: **Khôi phục file** và **Khôi phục database**.
- Backup mới không đưa thư mục legacy `uploads` vào ZIP.
- Không thay đổi schema hay nghiệp vụ của ứng dụng.

## Luồng khôi phục file

1. Người quản trị chọn gói ZIP.
2. Ứng dụng kiểm tra giới hạn ZIP, đường dẫn, manifest, kích thước và checksum của toàn bộ payload.
3. Chỉ các file thuộc `vehicle-images` và `maintenance-files` được chép vào `userData`.
4. Nếu chép lỗi giữa chừng, các file đã tạo bị xóa và file bị ghi đè được phục hồi.
5. Không giải nén hoặc tác động đến SQL Server.

Để tương thích backup cũ, bộ đọc vẫn chấp nhận `uploads` trong gói cũ. Backup mới tuyệt đối không ghi thư mục này vào manifest hoặc ZIP. Nếu `uploads` vẫn còn file legacy, ứng dụng từ chối tạo backup và hướng dẫn chuyển ảnh sang `vehicle-images`, tài liệu sang `maintenance-files`; như vậy không có trường hợp backup báo thành công nhưng âm thầm bỏ mất file còn sử dụng.

## Luồng khôi phục database

1. Người quản trị chọn gói ZIP.
2. Ứng dụng xác thực gói rồi chỉ giải nén `.bak` vào thư mục backup mà SQL Server có quyền đọc.
3. Kết nối vào database `master`, chạy `RESTORE VERIFYONLY`.
4. Tạo một bản backup an toàn của database hiện tại.
5. Đóng pool ứng dụng, chuyển database sang `SINGLE_USER`, chạy `RESTORE DATABASE ... WITH REPLACE, MOVE` rồi trả về `MULTI_USER`.
6. Nếu restore thất bại sau khi bắt đầu thay thế database, ứng dụng thử phục hồi lại từ bản backup an toàn.
7. Khi thành công, giữ lại bản backup an toàn và khởi động lại Electron.

Luồng này không chép file ảnh/PDF và không yêu cầu người dùng restore thủ công bằng SSMS.

## Phạm vi backup

Backup mới gồm:

- `vehicle-images/**`
- `maintenance-files/**`
- `database/<database>.bak`
- `manifest.json`

Không gồm `uploads/**`.

Các thư mục con hợp lệ bên trong `vehicle-images` và `maintenance-files` được giữ nguyên. Khôi phục từ chối junction/symlink/reparse point có thể dẫn ra ngoài `userData`.
