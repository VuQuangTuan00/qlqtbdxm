# Thiết kế giới hạn kích thước background topbar

## Mục tiêu

Giữ ảnh nền `bg_hckt.png` đúng tỷ lệ và không phóng lớn hơn kích thước gốc `2172 × 231px` trên màn hình rộng, đồng thời vẫn cho phép ảnh thu nhỏ trên màn hình hẹp.

## Phạm vi

- Chỉ chỉnh CSS của `#app #topbar` trong `renderer/assets/css/app-theme.css`.
- Giữ nguyên ảnh, chiều cao topbar, vị trí nội dung, màu sắc và hành vi responsive khác.
- Ảnh tiếp tục bám `right center`, không lặp.

## Các hướng đã cân nhắc

1. Cố định tuyệt đối `2172px 231px`: không co giãn nhưng bị cắt nhiều trên màn hình nhỏ.
2. Giới hạn theo kích thước gốc — được chọn: dùng `background-size: min(2172px, 100%) auto`, cho phép thu nhỏ nhưng không phóng quá kích thước gốc.
3. Cố định theo chiều cao topbar: tạo khoảng trống ngang lớn nên không phù hợp.

## Kiểm tra

- Xác nhận computed style không còn nhận `background-size: cover` từ `layout.css`.
- Kiểm tra các viewport hiện có: 1259×751, 1366×768, 1600×900 và 1920×1080.
- Chạy test UI/topbar và toàn bộ test liên quan; không thay đổi HTML hoặc JavaScript.
