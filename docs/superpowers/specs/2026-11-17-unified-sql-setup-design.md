# Thiết kế hợp nhất màn hình thiết lập SQL Server

## Mục tiêu

Chỉ duy trì một màn hình kết nối SQL Server lúc khởi động: `renderer/js/db-setup.js`. Màn hình này phục vụ cả lần chạy đầu chưa có cấu hình và trường hợp phục hồi khi cấu hình/kết nối bị lỗi.

## Hành vi

- `first-run`: hiển thị tiêu đề thiết lập lần đầu, không hiển thị khung lỗi, form trống.
- `recovery`: hiển thị thông báo không kết nối được, chi tiết lỗi và các trường cấu hình có thể phục hồi.
- Hai trạng thái dùng chung kiểm tra kết nối, validation, lưu cấu hình và xử lý lỗi lưu.
- Tab **Kết nối Database** trong Settings không thay đổi.

## Giao tiếp

Main process chỉ gửi sự kiện `app:db-setup` với payload `{ mode, error, config }`, trong đó `mode` là `first-run` hoặc `recovery`. Loại bỏ sự kiện `app:first-run`, script `renderer/js/first-run.js` và thẻ script tương ứng.

## Ràng buộc

Không thay đổi database schema, thông tin kết nối, nghiệp vụ, CSP hoặc giao diện Settings. Không tự điền endpoint mặc định. Không commit hoặc merge.

## Phương án đã chọn

Giữ `db-setup.js` và mở rộng theo `mode`, vì màn hình này đã hỗ trợ dữ liệu phục hồi và chi tiết lỗi. Phương án giữ `first-run.js` đòi hỏi bổ sung lại khả năng phục hồi; giữ cả hai tiếp tục tạo mã trùng lặp.
