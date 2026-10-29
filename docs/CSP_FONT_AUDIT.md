# Báo cáo audit CSP và font offline

Ngày kiểm tra: 2026-10-28.

## Phát hiện

- Import Google Fonts nằm ở đầu `renderer/assets/css/layout.css`, tải Oswald 400/500/600/700 và Barlow 300/400/500/600 từ `fonts.googleapis.com`.
- CSP được khai báo bằng thẻ meta trong `renderer/index.html`.
- `style-src 'self' 'unsafe-inline'` không cho tải stylesheet Google Fonts nên Chromium báo lỗi. `font-src 'self'` đã đúng cho mô hình offline.
- Không phát hiện URL `http://`, `https://` hoặc `@import` nào khác trong HTML/CSS/JavaScript đang chạy của renderer.

## Thay đổi

- Xóa import Google Fonts khỏi `layout.css`.
- Thêm `renderer/assets/css/fonts.css` và nạp trước các stylesheet giao diện.
- Đóng gói 17 WOFF2 chính thức:
  - Oswald variable 400–700: Latin, Latin Extended, Vietnamese, Cyrillic và Cyrillic Extended.
  - Barlow 300/400/500/600: Latin, Latin Extended và Vietnamese.
- Giữ nguyên `font-family`, `font-weight`, `font-display: swap`, selector và toàn bộ layout hiện tại.
- Kèm giấy phép SIL Open Font License 1.1 trong từng thư mục font.
- CSP sau chỉnh sửa:
  - `style-src 'self'`
  - `style-src-elem 'self'`
  - `style-src-attr 'unsafe-inline'` vì giao diện hiện dùng nhiều `style` attribute.
  - `font-src 'self'`
  - `connect-src 'none'`
- Không whitelist Google hoặc vô hiệu hóa CSP.

## Kết quả kiểm tra

- Static frontend scan: 0 tham chiếu mạng đang hoạt động, 0 font local bị thiếu.
- Binary validation: 17/17 file có signature WOFF2 hợp lệ (`wOF2`).
- Electron offline/CSP smoke:
  - 0 request HTTP/HTTPS.
  - 0 lỗi CSP.
  - 0 console error.
  - Tải thành công Oswald 400/500/600/700 và Barlow 300/400/500/600.
  - Computed font của `body` là Barlow; tiêu đề đăng nhập là Oswald.
- Regression: 11 passed, 0 failed.
- JavaScript syntax: 66 file OK.
- Windows installer build: passed.
- Kiểm tra `app.asar`: có 17 WOFF2, 2 OFL và `fonts.css`; không có URL Google Fonts.

## Phạm vi

Không thay đổi service, repository, IPC nghiệp vụ, schema hoặc dữ liệu database.
