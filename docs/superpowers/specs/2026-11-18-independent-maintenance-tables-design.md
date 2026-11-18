# Thiết kế tách Quy trình công nghệ và Định mức KT-KT

## Mục tiêu

Tách danh sách hạng mục dùng chung trong `engine_maintenance` thành hai danh sách độc lập. Người dùng có thể thêm, sửa tên, xóa và sắp xếp hạng mục Quy trình công nghệ mà không ảnh hưởng danh sách Định mức KT-KT, và ngược lại.

## Phạm vi

- Tạo hai bảng `tech_process_maintenance` và `norm_ktkt_maintenance`.
- Chuyển toàn bộ dữ liệu hiện có từ `engine_maintenance` sang cả hai bảng.
- Tách repository, service và thao tác renderer theo tab đang hoạt động.
- Giữ nguyên kho file `maintenance-files`, đường dẫn tương đối, phân quyền admin, PDF preview, backup và restore.
- Không thay đổi bảng `vehicle`, cấu hình SQL Server, nghiệp vụ đăng nhập hoặc giao diện ngoài màn hình chi tiết trang bị.

## Các hướng đã cân nhắc

### Một bảng có cột phân loại

Dùng một bảng với `maintenance_type`, tên và đường dẫn file tổng quát. Cách này ít lặp code nhưng không đáp ứng lựa chọn muốn hai cấu trúc dữ liệu tách biệt rõ ràng.

### Hai bảng riêng — được chọn

Mỗi loại tài liệu có bảng, khóa chính, tên, thứ tự và file riêng. Cách này làm CRUD rõ ràng, bảo đảm thao tác ở một tab không ảnh hưởng tab còn lại, đổi lại cần hai repository và nhiều kiểm thử hơn.

## Schema đích

```sql
CREATE TABLE tech_process_maintenance (
  tech_process_id        INT IDENTITY(1,1) PRIMARY KEY,
  vehicle_id             INT NOT NULL,
  tech_process_name      NVARCHAR(200) NOT NULL,
  display_order          INT NOT NULL DEFAULT 0,
  tech_process_file_name NVARCHAR(255) NULL,
  tech_process_file_path NVARCHAR(MAX) NULL,
  CONSTRAINT fk_tech_process_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE CASCADE
);

CREATE TABLE norm_ktkt_maintenance (
  norm_ktkt_id        INT IDENTITY(1,1) PRIMARY KEY,
  vehicle_id          INT NOT NULL,
  norm_ktkt_name      NVARCHAR(200) NOT NULL,
  display_order       INT NOT NULL DEFAULT 0,
  norm_ktkt_file_name NVARCHAR(255) NULL,
  norm_ktkt_file_path NVARCHAR(MAX) NULL,
  CONSTRAINT fk_norm_ktkt_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE CASCADE
);
```

Tên `norm_ktkt` được dùng thống nhất với các cột file hiện tại; không dùng `nom_ktkt`.

## Migration dữ liệu

Thêm migration mới, không sửa lịch sử của migration `001_schema.sql` đã chạy trên máy khách.

1. Tạo hai bảng mới nếu chưa tồn tại.
2. Với mỗi dòng cũ trong `engine_maintenance`, tạo một dòng `tech_process_maintenance`:
   - `maintenance_name` → `tech_process_name`
   - giữ `vehicle_id`, `display_order`
   - chuyển `tech_process_file_name` và `tech_process_file_path`
3. Với mỗi dòng cũ, tạo một dòng `norm_ktkt_maintenance`:
   - `maintenance_name` → `norm_ktkt_name`
   - giữ `vehicle_id`, `display_order`
   - chuyển `norm_ktkt_file_name` và `norm_ktkt_file_path`
4. Sao chép cả hạng mục chưa có file để giữ nguyên danh sách đang hiển thị ở mỗi tab.
5. Kiểm tra số bản ghi từng bảng mới bằng số bản ghi bảng cũ trước khi xóa bảng cũ.
6. Xóa `engine_maintenance` chỉ trong cùng migration sau khi việc sao chép và kiểm tra hoàn tất. Migration chạy trong transaction để lỗi ở bất kỳ bước nào sẽ rollback toàn bộ.

Migration cần an toàn với database mới và database đã có dữ liệu. `001_schema.sql` tiếp tục tạo schema nền cũ; migration mới chuyển nó sang schema đích, giúp một chuỗi migration duy nhất hoạt động cho cả hai trường hợp.

## Backend

- Tạo repository riêng cho hai bảng, mỗi repository hỗ trợ list theo xe, tìm theo ID, tạo, sửa, xóa, lấy thứ tự lớn nhất và sắp xếp.
- Service nhận loại tab hợp lệ rồi điều phối đến repository tương ứng; không cho phép tên cột hoặc tên bảng do renderer truyền trực tiếp vào SQL.
- Tạo và cập nhật bắt buộc tên sau khi `trim`, tối đa theo giới hạn schema.
- Upload, đọc, mở và xóa file sử dụng bản ghi của đúng loại tài liệu.
- Xóa hạng mục chỉ xóa một PDF tương ứng. Xóa xe vẫn lấy cả hai danh sách và dọn file của cả hai trước/sau thao tác database theo cơ chế an toàn hiện tại.
- Thống kê xe tính tổng hạng mục từ hai bảng và đếm file theo từng bảng. `maintenance_count` nên là tổng hai danh sách vì chúng không còn là các cặp dùng chung.
- Giữ kiểm tra xác thực và quyền admin tại IPC như hiện tại.

## Renderer

- Tab `tech_process` chỉ hiển thị dữ liệu từ `tech_process_maintenance`; tab `norm_ktkt` chỉ hiển thị dữ liệu từ `norm_ktkt_maintenance`.
- Nút “Thêm hạng mục” tạo bản ghi trong tab đang mở và modal chỉ có một trường tên phù hợp.
- Sửa, xóa và sắp xếp chỉ tác động danh sách đang mở.
- Tiêu đề PDF preview, modal upload và thông báo xóa dùng tên của đúng bảng.
- Badge và số liệu trên hai tab được tính độc lập.
- Không tạo bản ghi rỗng tự động ở tab còn lại.

## Backup, restore và kho file

- Không thay đổi định dạng ZIP. Database `.bak` chứa hai bảng mới; file vẫn nằm trong `maintenance-files`.
- Không đổi quy tắc đường dẫn tương đối hay UNC.
- Bản backup schema cũ khi được restore sẽ được migration mới chuyển đổi ở lần khởi động tiếp theo.
- Bản backup schema mới không tương thích với phiên bản ứng dụng cũ; triển khai cần nâng cấp ứng dụng trên máy chủ và các máy khách cùng đợt.

## Kiểm thử và tiêu chí chấp nhận

- Migration giữ đúng số dòng, tên, thứ tự và đường dẫn file ở cả hai bảng.
- Thêm/sửa/xóa/sắp xếp ở một tab không làm thay đổi tab kia.
- Upload/thay/xóa/mở PDF hoạt động độc lập cho từng loại.
- Xóa xe dọn PDF thuộc cả hai bảng.
- Danh sách xe và màn hình chi tiết tính đúng số liệu mới.
- Backup rồi restore giữ đủ database, ảnh và PDF.
- Kiểm thử migration trên database có dữ liệu và database mới.
- Chạy toàn bộ unit/security test và kiểm tra thủ công hai tab trong Electron.

## Rollout và rollback

- Tạo một bản backup đầy đủ trước khi nâng cấp.
- Triển khai migration cùng phiên bản ứng dụng mới; không chạy ứng dụng cũ sau khi migration hoàn tất.
- Nếu migration thất bại, transaction giữ nguyên bảng cũ.
- Nếu cần quay lại sau khi migration đã thành công, khôi phục gói backup tạo trước nâng cấp cùng phiên bản ứng dụng cũ.
