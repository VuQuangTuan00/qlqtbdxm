# 04 — Kiểm toán lưu trữ ảnh, PDF và đường dẫn file

Ngày kiểm tra: 2026-11-15

## Kết luận

File ghi mới đã được tách đúng theo loại:

| Thư mục trong Electron `userData` | Mục đích |
|---|---|
| `vehicle-images` | Ảnh đại diện xe/trang bị theo mô hình vehicle mới |
| `maintenance-files` | PDF quy trình công nghệ và định mức KT-KT |
| `uploads` | Dữ liệu legacy để tương thích các bản cũ; code hiện tại không ghi upload mới vào đây |

ZIP vẫn chứa ba folder vì backup phải mang theo file legacy chưa được migration, tránh mất dữ liệu khi chuyển máy. Việc nhìn thấy `uploads` trong ZIP không có nghĩa ảnh và PDF mới tiếp tục lưu chung. Không tự di chuyển file legacy vì cần đối chiếu đường dẫn DB và kế hoạch rollback trên dữ liệu thật.

## Lỗi đã sửa

### FILE-001 — Đường dẫn tuyệt đối có thể đọc/mở/xóa file ngoài `userData`

Mức độ: P0.  
Lỗi được tái hiện bằng một PDF nằm cạnh, không nằm trong profile test: `readFile` trả nội dung, `openFile` gọi shell và `deleteFile` xóa file.  
Sửa:

- chỉ chấp nhận canonical path nằm trong `uploads`, `vehicle-images` hoặc `maintenance-files`;
- kiểm tra cả lexical path và `realpath`, chặn symlink/junction thoát root;
- đường dẫn absolute legacy bên ngoài bị từ chối; nếu file cũ không còn tồn tại, chỉ fallback theo basename vào root hợp lệ;
- không xóa metadata DB khi path hiện hữu không an toàn.

Test: absolute outside, delete outside, relative current, legacy fallback và symlink escape — PASS.

### FILE-002 — Tab file không hợp lệ mặc định ghi/xóa nhầm `norm_ktkt`

Mức độ: P1.  
Sửa: allowlist đúng hai giá trị `tech_process`, `norm_ktkt` cho upload/read/open/delete.  
Test unknown tab không gọi repository — PASS.

### FILE-003 — Upload chỉ tin extension/tên file

Mức độ: P1.  
Sửa:

- PDF: chỉ `.pdf`, tối đa 50 MiB, phải có header `%PDF-` trong 1024 byte đầu;
- ảnh: chỉ JPG/JPEG/PNG/GIF/WEBP, tối đa 10 MiB, magic bytes phải khớp extension;
- filename được chuẩn hóa trước khi ghi và tên vật lý có timestamp để tránh va chạm thông thường.

Test fake PDF, fake PNG và extension sai trước khi tạo folder/gọi repository — PASS.

### FILE-004 — Thứ tự thao tác có thể làm mất file khi DB lỗi

Mức độ: P1.  
Các lỗi được tái hiện:

- upload thay thế xóa file cũ trước khi DB update;
- xóa file vật lý trước khi xóa metadata;
- tạo ảnh để lại file mồ côi khi insert vehicle lỗi;
- thay ảnh xóa ảnh cũ trước khi update;
- xóa hạng mục xóa PDF trước khi delete DB.

Sửa theo staging tối thiểu: ghi file mới → update DB → xóa file cũ; nếu DB lỗi thì xóa file mới. Luồng delete cập nhật/xóa DB trước, sau đó mới cleanup file.  
Test rollback PDF/ảnh/delete — PASS.

## Cấu trúc đường dẫn hiện tại

DB vẫn lưu absolute path cho file mới. Service có thể đọc relative path và absolute path hợp lệ, nên package chuyển máy hoạt động bằng cách chép đúng basename/folder và fallback legacy. Absolute path làm giảm tính di động và lộ cấu trúc profile trong DB; chuyển sang relative path cần migration dữ liệu, chưa thực hiện trong audit này.

## Trường hợp đã kiểm thử

| Trường hợp | Kết quả |
|---|---|
| Absolute path ngoài profile | Từ chối |
| Relative path trong `maintenance-files` | Đọc được |
| Legacy basename trong `uploads` | Đọc được |
| Symlink trong root trỏ ra ngoài | Từ chối |
| Path thiếu/file thiếu | Trả lỗi có kiểm soát |
| Tab lạ | Từ chối |
| PDF sai extension/signature | Từ chối |
| Ảnh sai signature | Từ chối |
| DB update/upload/delete lỗi | File cũ được giữ, file staging được dọn |
| Open file an toàn | Được giới hạn path trước khi gọi `shell.openPath` |

## Rủi ro còn lại

- Magic-byte validation xác định container cơ bản, không giải mã sâu ảnh/PDF để phát hiện file hỏng tinh vi.
- IPC nhận toàn bộ buffer trước khi service kiểm tra kích thước; renderer độc hại vẫn có thể gây memory pressure bằng payload rất lớn. Cần giới hạn/chunk/stream ở IPC nếu threat model yêu cầu.
- DB và filesystem không thể chung một transaction ACID; crash đúng giữa DB commit và cleanup có thể để file mồ côi, nhưng không làm mất file đang được DB tham chiếu.
- Absolute paths trong DB nên được migrate sang relative paths trong một nhiệm vụ migration riêng có backup/rollback.
- Cleanup sau DB success hiện best-effort; lỗi quyền file tạo orphan và cần công cụ health-check dọn rác.

## Bằng chứng

`tests/security/file-path/vehicle-file-boundary.test.js`: 12 PASS, gồm path boundary, symlink, validation và rollback; toàn bộ dùng thư mục tạm.

