# Blue Military UI Design

## Intent

Đồng bộ toàn bộ giao diện sau đăng nhập của ứng dụng Electron theo phong cách xanh dương quân đội/công nghệ, bám ảnh tham chiếu, tăng khả năng co giãn và accessibility mà không thay đổi nghiệp vụ.

## Goals

- Theme xanh dương thống nhất cho shell, page, card, table, modal, toast, PDF viewer và mọi màn hình nghiệp vụ.
- Sidebar/topbar dùng đúng ảnh local hiện có, neo chi tiết ảnh ổn định khi resize.
- Card xe bám cấu trúc ảnh tham chiếu, cùng chiều cao và dùng được bằng bàn phím.
- Ổn định ở 1024×600, 1280×800 và 1920×1080.
- Giảm inline style ở các vùng trọng điểm và dùng SVG inline đồng nhất.

## Non-goals

- Không thay đổi login, font, logic nghiệp vụ, database, IPC, preload, service hoặc quyền hạn.
- Không thêm dependency, URL ngoài, ảnh mới hoặc sửa file ảnh hiện có.
- Không đổi route, menu, ID/class đang dùng để bind event.

## Constraints

- Giữ nguyên typography hiện tại, bao gồm `@import`, `font-family`, `font-size`, `font-weight`, `letter-spacing`, `text-transform`.
- Mọi token và rule mới cho theme phải scope dưới `#app` hoặc selector chỉ tồn tại sau đăng nhập.
- Giữ nguyên năm menu và mọi điều kiện `store.hasRole(...)`.
- Icon mới là SVG inline/local, icon trang trí có `aria-hidden="true"`.
- CSP không được nới rộng.

## Chosen approach

Tạo `renderer/assets/css/app-theme.css`, nạp sau `components.css`, chứa toàn bộ token override và style dành riêng cho `#app`. Markup shell được chỉnh tối thiểu để bổ sung topbar brand, SVG icon và loại bỏ thẻ HTML lạ. Các page chỉ thay presentation markup/class và accessibility attributes; event/data flow giữ nguyên.

Hướng sửa trực tiếp CSS dùng chung bị loại vì dễ làm thay đổi login. Hướng viết lại renderer bị loại vì tăng rủi ro vỡ ID, route và role visibility.

## Assets

- Sidebar: `renderer/assets/images/banner_sidebar.png` (724×2172), dùng `background-size: 100% auto`, `background-position: center bottom`.
- Topbar: `renderer/assets/images/banner_topbar.png` (2172×724), dùng `background-size: auto 100%`, `background-position: right center`.
- Logo: `renderer/assets/images/logo_app.png`.

## Component decisions

- Primary gradient: `#0B5EA8` → `#1E88E5`; hover/active dùng navy tối hơn.
- App background: `#EAF4FC` → `#F6FAFE`; heading `#0A3D6B`; border `#B9D7EE`; soft `#E6F2FB`.
- Sidebar active và CTA dùng gradient primary; danger giữ đỏ; semantic colors giữ ý nghĩa.
- Vehicle card có media frame cố định 16:10, `object-fit: cover`, title strip overlay, stats hai cột, action bằng nhau và focus-visible.
- Responsive ≤1199px chuyển form/detail/report phù hợp; low-height <700px giảm vertical spacing.
- PDF viewer dùng class CSS thay style màu/toolbar động; logic render PDF giữ nguyên.

## Verification strategy

- Node built-in test khóa hash fragment login và prefix CSS login.
- Test khóa toàn bộ dòng typography và tập URL ngoài trước/sau.
- Test kiểm tra năm menu/route, role guards và ID quan trọng vẫn còn.
- Test kiểm tra app theme, SVG/icon accessibility, vehicle card keyboard và media queries.
- Chạy `node --check` cho mọi JS renderer, test contract và build nếu môi trường cho phép.

