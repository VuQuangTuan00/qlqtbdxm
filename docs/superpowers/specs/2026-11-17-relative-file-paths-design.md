# Thiết kế đường dẫn tương đối và kho file dùng chung UNC

## Mục tiêu

Ảnh và PDF được lưu trong một thư mục mạng dùng chung để mọi máy Electron kết nối cùng SQL Server qua LAN đều đọc được cùng dữ liệu. SQL Server chỉ lưu đường dẫn tương đối, không lưu tên người dùng Windows, ổ đĩa hoặc tên máy nguồn.

Ba cột áp dụng:

- `vehicle.img_path`
- `engine_maintenance.tech_process_file_path`
- `engine_maintenance.norm_ktkt_file_path`

Giá trị trong database có dạng:

```text
vehicle-images/23_May_ui_B14.png
maintenance-files/quy_trinh_bao_duong.pdf
```

## Quyết định đã chọn

Sử dụng kho file UNC cấu hình được, ví dụ:

```text
\\DESKTOP-SEPTJA2\QTCN-Files
```

Cấu trúc vật lý:

```text
\\DESKTOP-SEPTJA2\QTCN-Files\
├── vehicle-images\
└── maintenance-files\
```

Mọi máy, kể cả máy chủ, sử dụng cùng đường dẫn UNC. Không suy đoán share từ tên SQL Server và không hard-code tên máy.

## Phạm vi và ràng buộc

- Không migration hoặc chỉnh sửa hàng loạt dữ liệu cũ; người dùng sẽ cập nhật thủ công bằng SSMS.
- Loại bỏ toàn bộ lưu, đọc fallback, backup, restore và kiểm tra liên quan đến thư mục `uploads`.
- Dữ liệu mới chỉ lưu đường dẫn tương đối thuộc `vehicle-images` hoặc `maintenance-files`.
- Không thay đổi database schema hoặc nghiệp vụ quản lý xe/bảo dưỡng.
- Không lưu file dưới Electron `userData` khi `fileStorageRoot` đã được cấu hình.
- Không cho phép đường dẫn tuyệt đối được ghi vào ba cột file.
- Không cho phép `..`, symlink/junction hoặc đường dẫn thoát khỏi kho file cấu hình.

## Cấu hình

Thêm trường công khai `fileStorageRoot` vào `db-config.json` trên từng máy:

```json
{
  "fileStorageRoot": "\\\\DESKTOP-SEPTJA2\\QTCN-Files"
}
```

- Trường này xuất hiện trên màn hình thiết lập SQL Server lần đầu và trang “Kết nối Database”.
- Giá trị bắt buộc phải là UNC tuyệt đối `\\server\share`.
- `dbconfig:test` kiểm tra đồng thời kết nối SQL Server và quyền đọc/ghi kho file bằng một file probe tạm thời rồi xóa ngay.
- Cấu hình cũ thiếu `fileStorageRoot` được đưa về màn hình recovery để quản trị viên nhập, thay vì âm thầm dùng thư mục cục bộ.
- Password SQL Server tiếp tục được mã hóa như hiện tại; `fileStorageRoot` không phải bí mật.

## Kiến trúc lưu trữ

Tạo một service tập trung chịu trách nhiệm:

- Đọc và xác thực `fileStorageRoot`.
- Tạo/kiểm tra hai thư mục con được phép.
- Chuyển đường dẫn tuyệt đối của file vừa tạo thành đường dẫn tương đối chuẩn dùng dấu `/`.
- Resolve đường dẫn tương đối trong database thành đường dẫn UNC tuyệt đối.
- Từ chối đường dẫn tuyệt đối lấy từ database và mọi đường dẫn thoát root.
- Kiểm tra real path để chặn symlink, junction và reparse point trỏ ra ngoài root.

`vehicle.service.js`, `pending-file-cleanup.service.js` và `file-archive.service.js` sử dụng service này thay vì tự ghép với `app.getPath('userData')`.

## Luồng ảnh và PDF

### Thêm hoặc thay file

1. Main process resolve thư mục con trong kho UNC.
2. Tạo tên file gồm tên đã làm sạch, timestamp và UUID để tránh hai máy ghi trùng tên, rồi ghi buffer bằng chế độ không ghi đè file có sẵn.
3. Ghi đường dẫn tương đối vào database.
4. Nếu database update thất bại, xóa hoặc đưa file mới vào hàng đợi dọn dẹp.
5. Sau khi update thành công, file cũ hợp lệ mới được xóa.

### Đọc file

1. Đọc đường dẫn tương đối từ database.
2. Resolve trong `fileStorageRoot` và kiểm tra ranh giới bảo mật.
3. Ảnh được chuyển thành URL file UNC hợp lệ để renderer hiển thị.
4. PDF được Main process đọc buffer như hiện tại; PDF viewer không truy cập trực tiếp đường dẫn mạng.

### Máy mất kết nối kho file

- Danh sách dữ liệu SQL vẫn có thể tải.
- Ảnh hiển thị fallback hiện tại.
- Mở PDF trả lỗi rõ ràng rằng kho file mạng không truy cập được.
- Không tự tạo bản sao cục bộ vì sẽ làm các máy nhìn thấy dữ liệu khác nhau.

## Backup và restore

- Backup đóng gói `vehicle-images`, `maintenance-files` từ `fileStorageRoot` cùng database `.bak`.
- Không còn kiểm tra, backup hoặc restore `uploads`.
- Restore file ghi trở lại kho UNC; thay đổi được tất cả máy dùng chung nhìn thấy.
- Các kiểm tra checksum, chống path traversal, rollback và giới hạn ZIP hiện tại vẫn được giữ.
- `backupDirectory` của SQL Server vẫn là cấu hình riêng với `fileStorageRoot`; hai thư mục có mục đích và quyền truy cập khác nhau.

## Khả năng tương thích dữ liệu cũ

- Không tự động hỗ trợ đường dẫn tuyệt đối cũ sau thay đổi này.
- Người dùng cập nhật ba cột bằng SSMS thành đường dẫn tương đối trước khi sử dụng bản mới.
- Bản ghi còn đường dẫn tuyệt đối sẽ bị từ chối với thông báo cần chuẩn hóa, không được phép truy cập tùy ý vào ổ đĩa máy khách.

## Kiểm thử

- Cấu hình từ chối đường dẫn cục bộ và UNC thiếu share; chấp nhận UNC hợp lệ.
- IPC chỉ nhận/trả `fileStorageRoot` trong allowlist và không làm mất các khóa cấu hình khác.
- Kiểm tra kết nối xác nhận quyền tạo/xóa file probe.
- Thêm/thay ảnh ghi `vehicle-images/<tên-file>` vào database.
- Upload cả hai loại PDF ghi `maintenance-files/<tên-file>`.
- Hai máy có `userData` khác nhau nhưng cùng `fileStorageRoot` resolve tới cùng file.
- Đường dẫn tuyệt đối, traversal, junction và file ngoài root bị từ chối.
- Backup/restore không còn chuỗi hoặc entry `uploads`.
- Test bảo mật, unit, integration và Electron hiện có tiếp tục chạy.

## Không thuộc thay đổi này

- Tạo Windows share hoặc cấp quyền SMB tự động.
- Migration/copy/xóa file đang có trong `uploads`.
- Cập nhật dữ liệu SQL Server cũ; người dùng thực hiện bằng SSMS.
- Đồng bộ offline hoặc cache file trên từng máy trạm.
