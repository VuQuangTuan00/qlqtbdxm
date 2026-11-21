# Nâng cấp sang danh sách bảo dưỡng độc lập

## Trước khi nâng cấp

1. Thông báo thời gian bảo trì và đóng ứng dụng trên tất cả máy khách.
2. Tạo một bản backup đầy đủ gồm database SQL Server, `vehicle-images` và `maintenance-files`.
3. Ghi lại số dòng của `engine_maintenance` để đối chiếu sau nâng cấp:

   ```sql
   SELECT COUNT_BIG(*) AS legacy_count FROM dbo.engine_maintenance;
   ```

4. Giữ lại bộ cài ứng dụng hiện tại để dùng cùng bản backup nếu cần rollback.

## Triển khai

1. Đảm bảo không còn máy khách chạy phiên bản cũ.
2. Cài cùng một phiên bản mới trên máy quản trị và các máy khách.
3. Khởi chạy phiên bản mới một lần để migration `002_split_engine_maintenance.sql` tự chạy. Migration thực hiện trong transaction và ghi nhận phiên bản sau khi hoàn tất.
4. Kiểm tra log khởi động, sau đó đối chiếu database:

   ```sql
   SELECT filename FROM dbo._migrations
   WHERE filename = '002_split_engine_maintenance.sql';

   SELECT COUNT_BIG(*) AS tech_count FROM dbo.tech_process_maintenance;
   SELECT COUNT_BIG(*) AS norm_count FROM dbo.norm_ktkt_maintenance;
   ```

   Hai bảng mới phải có cùng số dòng với `legacy_count` đã ghi lại; bảng `engine_maintenance` không còn tồn tại.
5. Kiểm tra trên màn hình chi tiết một xe: thêm và sắp xếp hạng mục ở từng tab, upload/mở/xóa PDF, rồi xác nhận thao tác ở tab này không làm thay đổi tab kia.
6. Mở lại quyền truy cập cho người dùng sau khi các máy khách đã được nâng cấp đồng bộ.

Không khởi chạy ứng dụng cũ trên database sau khi migration thành công. Database schema mới không tương thích ngược.

## Khôi phục và rollback

- Nếu migration thất bại, transaction phải rollback và giữ nguyên `engine_maintenance`. Không xóa bảng cũ hoặc đánh dấu migration đã chạy thủ công; xem log, xử lý nguyên nhân rồi khởi động lại phiên bản mới.
- Nếu cần quay lại sau khi migration thành công, dừng toàn bộ ứng dụng, khôi phục bản backup đầy đủ tạo trước nâng cấp (database và file), sau đó cài lại phiên bản ứng dụng cũ.
- Khi khôi phục bản backup schema cũ để tiếp tục dùng phiên bản mới, migration `002` sẽ chạy ở lần khởi động mới tiếp theo. Không dùng phiên bản cũ với schema đã được migration.

