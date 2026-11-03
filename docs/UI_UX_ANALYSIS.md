# PHÂN TÍCH UI/UX ỨNG DỤNG HIỆN TẠI

> Dự án: Quản lý Quy trình Bảo dưỡng Xe máy  
> Thời điểm khảo sát: 02/11/2026  
> Phạm vi: giao diện Renderer, design token, shell, các trang nghiệp vụ, trạng thái tương tác, responsive và accessibility.  
> Phương pháp: phân tích tĩnh HTML/CSS/JavaScript và tài nguyên ảnh hiện có; không thay đổi giao diện trong lần khảo sát này.

## 1. Kết luận nhanh

UI hiện tại có nền tảng khá tốt cho ứng dụng desktop nội bộ: sidebar cố định, topbar rõ, trang danh sách có filter/stats/table, thao tác phá hủy có confirm, có toast/loading/empty state và quyền admin được ẩn ở nhiều vị trí.

Tuy nhiên, giao diện đang ở trạng thái “hai hệ thiết kế ghép lại”:

- Hệ token chính dùng light theme, trắng/xám/olive.
- Login dùng phong cách quân đội tối, vàng/olive.
- Banner sidebar/topbar và ảnh tham chiếu thiên về xanh dương.
- Nút chính ở nhiều nơi lại dùng đen.

Điều này làm nhận diện chưa nhất quán. Khả năng co giãn cũng chưa hoàn chỉnh: source không có media query, nhiều layout có kích thước cố định và khoảng 250 dấu `style=` được tạo trực tiếp trong HTML/template. Accessibility mới ở mức cơ bản.

Ba ưu tiên UI/UX lớn nhất:

1. Chuẩn hóa design system và chuyển inline style thành component/class dùng chung.
2. Hoàn thiện responsive cho cửa sổ 1024–1920 px, đặc biệt card xe, trang chi tiết, bảng và settings tabs.
3. Bổ sung keyboard/focus/ARIA và local hóa toàn bộ font/PDF dependency để giao diện ổn định offline.

## 2. Kiến trúc giao diện

```text
Login screen
    │ đăng nhập thành công
    ▼
App shell
├── Sidebar 200px
│   ├── Hồ sơ trang bị
│   ├── Kế hoạch bảo dưỡng
│   ├── Danh sách trang bị/xe
│   ├── Báo cáo tổng hợp
│   └── Cài đặt hệ thống
├── Topbar 52px
└── Page view cuộn độc lập
    ├── Header / actions
    ├── Stats / filters
    └── Table / card / tabs / detail
```

BrowserWindow hiện có kích thước mặc định 1280×800 và tối thiểu 1024×600. Đây là phạm vi desktop hợp lý, nhưng 600 px chiều cao vẫn tạo áp lực lớn cho modal, bảng và trang chi tiết nhiều cột.

## 3. Design system hiện tại

### 3.1. Màu sắc

Token chính trong `variables.css`:

| Vai trò | Giá trị nổi bật |
|---|---|
| Nền ứng dụng | `#f0f4ec` |
| Card/header/input | `#ffffff` |
| Accent olive | `#4a7c59` |
| Text chính | `#1a1a1a` |
| Heading | `#111827` |
| Success | `#16a34a` |
| Warning | `#d97706` |
| Danger | `#dc2626` |
| Info | `#2563eb` |

Điểm tốt:

- Có token màu nền, text, trạng thái, border, shadow, radius.
- Badge trạng thái phân biệt rõ success/warning/danger/info.
- Nền sáng và card trắng phù hợp với ứng dụng dữ liệu.

Điểm chưa nhất quán:

- Tên token vẫn là `gold` nhưng giá trị đã đổi sang olive.
- Login vẫn dùng nhiều màu vàng cũ như `#c9a84c`.
- Primary button dùng `#1a1a1a`, trong khi link/focus/outline dùng olive.
- Banner ảnh có thể đưa thêm dải xanh dương, tạo ba màu chủ đạo cạnh tranh nhau.
- Một số text phụ dùng `#9ca3af` trên nền sáng, cần đo contrast thực tế ở cỡ 10–11 px.

Khuyến nghị chọn một hệ chủ đạo:

- Navy/blue quân đội làm primary cho header và CTA.
- Olive làm secondary hoặc trạng thái chuyên ngành.
- Đỏ chỉ dùng cảnh báo/xóa.
- Vàng chỉ dùng điểm nhấn huy hiệu, không dùng song song như primary.

### 3.2. Typography

Hiện có ba định hướng font:

- `variables.css`: `Inter`, system UI.
- `layout.css`: body dùng `Barlow`.
- Tiêu đề, branding và `.nav-item-label`: `Oswald`.

`layout.css` đang `@import` Oswald/Barlow từ Google Fonts và source khảo sát không có thư mục font local. Khi mất Internet, giao diện sẽ fallback sang sans-serif, làm thay đổi độ rộng chữ, xuống dòng và cảm giác nhận diện. CSP cũng đang cho phép `fonts.googleapis.com` và `fonts.gstatic.com` chỉ để phục vụ phụ thuộc này.

Đề xuất:

1. Đóng gói WOFF2 local cho đúng các weight đang dùng.
2. Khai báo `@font-face` trong file riêng `fonts.css`.
3. Đặt token rõ: `--font-body: 'Barlow'`, `--font-display: 'Oswald'`.
4. Bỏ token Inter nếu không sử dụng, hoặc dùng Inter nhất quán cho control/table.
5. Giữ Oswald cho nav/title ngắn; không dùng Oswald cho đoạn văn dài.

### 3.3. Spacing, radius và shadow

Hệ spacing theo bước 4 px (`4, 8, 12, 16, 20, 24...`) là hợp lý. Radius 8–20 px tạo giao diện hiện đại, nhưng có chỗ radius 3–6 px ở login/sidebar và 16–20 px ở card/modal, nên cần chọn một thang thống nhất.

Shadow nhẹ phù hợp desktop business app. Hover card tăng shadow và nâng 3 px giúp nhận biết click được, nhưng hiện hiệu ứng này được gắn bằng JavaScript thay vì CSS.

## 4. Đánh giá App Shell

### 4.1. Sidebar

Điểm tốt:

- Nhóm chức năng rõ: Quản lý, Báo cáo, Hệ thống.
- Active state dễ nhận biết.
- Có logo, tên hệ thống và thông tin người dùng.
- Font Oswald cho nav-item-label tạo bản sắc mạnh.

Điểm cần cải thiện:

- Sidebar cố định 200 px, chưa có trạng thái collapse mặc dù đã có token `--sidebar-width-collapsed`.
- Nhãn 11 px + letter spacing 1 px + chữ in hoa có thể khó đọc với chuỗi dài.
- Icon đang dùng emoji; hình dạng và màu phụ thuộc Windows, không đồng nhất với phong cách thiết kế.
- Một số menu có tên gần nghĩa: “Hồ sơ trang bị” và “Danh sách trang bị”, cần mô tả rõ một trang là thiết bị vật lý, một trang là loại xe/quy trình.
- Brand subtitle trong HTML có thẻ lạ `<Tarea></Tarea>` cần loại bỏ.
- Toàn sidebar đặt `user-select: none`; chấp nhận được cho điều hướng nhưng không nên cản copy ở vùng dữ liệu.

### 4.2. Topbar

Topbar cao 52 px, gồm title và logout. Cấu trúc đơn giản, dễ dùng.

Điểm cần lưu ý:

- `background-size: cover` làm banner bị crop/co giãn khi thay đổi kích thước cửa sổ. Nếu yêu cầu hình không đổi, cần dùng kích thước nền cố định hoặc vùng anchor rõ, ví dụ `background-size: auto 100%`/px cố định và `background-position` phù hợp.
- Title 14 px khá nhỏ so với vai trò heading màn hình.
- Topbar chỉ có logout, còn user/context/breadcrumb nằm rải rác ở page; có thể tận dụng khoảng trống cho đơn vị đang làm việc hoặc trạng thái kết nối database.

### 4.3. Page view

Page view cuộn độc lập là đúng cho desktop shell. Padding 20 px đủ gọn. Tuy nhiên chưa có max content width; ở màn hình 2K/4K bảng và card kéo quá rộng, còn ở 1024 px một số layout 2 cột bị chật.

## 5. Đánh giá từng màn hình

### 5.1. Đăng nhập

Điểm tốt:

- Phân tách form và panel chào mừng rõ ràng.
- Có loading/disabled state khi đăng nhập.
- Có vùng lỗi riêng.
- Input có autocomplete phù hợp.

Vấn đề UX:

- “Quên mật khẩu?”, “Đăng ký” và nút “Đăng ký” đang hiển thị nhưng không thấy luồng chức năng tương ứng. Đây là affordance giả, dễ làm người dùng hiểu nhầm.
- Logo login vẫn dùng `logo.ico`, trong khi sidebar dùng `logo_app.png`; nhận diện chưa thống nhất.
- Form dựa nhiều vào placeholder, không có label hiển thị thường trực.
- Login dark theme khác mạnh với app light theme, cảm giác chuyển ngữ cảnh đột ngột.
- Khi lỗi đăng nhập chưa thấy focus tự đưa về trường cần sửa hoặc thông báo bằng `aria-live`.

### 5.2. Hồ sơ trang bị

Điểm tốt:

- Page header + CTA rõ.
- Bốn stat card giúp nhìn tổng quan.
- Tìm kiếm có debounce 400 ms.
- Có lọc trạng thái, đơn vị và reset.
- DataTable có phân trang, sort, empty/loading state và action theo role.

Vấn đề:

- Sortable header chỉ click chuột, không phải button và không có `aria-sort`.
- Cả row click được nhưng `<tr>` không focus được bằng keyboard.
- Bảng có horizontal scroll, nhưng không có chỉ báo cho người dùng khi còn cột phía phải.
- Nút sửa/xóa/chit tiết làm cột thao tác dày ở cửa sổ nhỏ.
- Search dùng emoji trong placeholder thay vì icon component.

### 5.3. Kế hoạch bảo dưỡng

Điểm tốt:

- Stats tập trung vào tổng/đang làm/hoàn thành/quá hạn.
- Bộ lọc trạng thái, loại và khoảng ngày phù hợp nghiệp vụ.
- Quy trình tạo → phê duyệt → thực hiện → nghiệm thu được thể hiện bằng action và detail page.
- Badge quá hạn ở sidebar giúp người dùng ưu tiên công việc.

Vấn đề:

- Nhiều action trên từng row dễ gây quá tải thị giác.
- Trạng thái phụ thuộc nhiều vào màu; nên kèm icon/text nhất quán.
- Cần hiển thị rõ action nào bị khóa theo role và lý do, thay vì chỉ ẩn hoàn toàn trong các trường hợp cần đào tạo người dùng.
- Hàm format ngày hiện giả định chuỗi `YYYY-MM-DD`; dữ liệu datetime/locale khác có thể hiển thị trống hoặc sai.

### 5.4. Danh sách xe / card item

Card hiện tại có:

- Ảnh cao 260 px, `object-fit: contain`.
- Tên xe.
- Hai chỉ số thiết bị/hạng mục.
- Hint “Nhấn để xem chi tiết”.
- Nút sửa/xóa cho admin.

Điểm tốt:

- Grid `auto-fill/minmax(260px,1fr)` tự phân phối số cột.
- Card có empty image fallback.
- Chỉ số chính ngắn gọn, dễ quét.
- Click vùng card mở detail, action admin tách riêng.

Vấn đề:

- Ảnh thật cao 260 px nhưng fallback cao 160 px, làm card lệch chiều cao và gây layout shift.
- `object-fit: contain` có thể tạo khoảng trắng lớn với ảnh ngang; ảnh tham chiếu mong muốn thiên về `cover` với khung crop đồng nhất.
- Hover được điều khiển qua `mouseover/mouseout` và sửa inline style; không có focus-visible tương đương.
- Card là `<div>` click được nhưng không có `role`, `tabindex` hoặc keyboard Enter/Space.
- Nút sửa/xóa dùng emoji, kích thước/đường nét không đồng nhất.
- Tên dài chưa có clamp/tooltip nên card có thể lệch chiều cao.
- Card có quá nhiều inline style, khó giữ đồng bộ khi redesign.

Đề xuất cấu trúc card chuẩn:

```text
┌──────────────────────────────┐
│  Ảnh tỉ lệ cố định 16:9      │
├──────────────────────────────┤
│  Tên xe (tối đa 2 dòng)      │
│  Loại hình / trạng thái      │
├──────────────┬───────────────┤
│  Thiết bị    │  Hạng mục     │
├──────────────┴───────────────┤
│  Xem chi tiết   Sửa   Xóa    │
└──────────────────────────────┘
```

Toàn card nên là một component CSS; ảnh và fallback cùng `aspect-ratio`; có focus-visible; các action là button thật và không chồng vùng click.

### 5.5. Chi tiết xe và hạng mục PDF

Điểm tốt:

- Breadcrumb và page header rõ.
- Có ảnh, loại hình, thiết bị đang sử dụng, thống kê file.
- Có hai tab tài liệu và chế độ chỉnh sửa riêng cho admin.
- PDF viewer có chuyển trang, zoom, fit, tải xuống, xóa và ESC để đóng.

Vấn đề:

- Layout detail cố định `280px 1fr`, không có breakpoint; ở 1024 px phần phải dễ chật.
- File được truyền base64 toàn bộ sang Renderer, có thể tốn RAM với PDF lớn.
- PDF toolbar nhiều action trên một hàng, dễ overflow ở cửa sổ hẹp.
- pdf.js tải từ CDN; offline sẽ mở ứng dụng mặc định thay vì preview nội bộ, làm trải nghiệm không nhất quán.
- PDF overlay chèn `<style>` và nhiều inline style động; đây cũng là nguyên nhân xung đột CSP khi bỏ `'unsafe-inline'`.

### 5.6. Báo cáo

Điểm tốt:

- Có KPI tổng quan, breakdown và bảng quá hạn.
- Cấu trúc phù hợp màn hình nghiệp vụ.

Điểm cần cải thiện:

- Stats grid của báo cáo ép 4 cột bằng inline style, không co hợp lý ở 1024 px.
- Chưa có biểu đồ hoặc xu hướng thời gian; người dùng phải tự đọc số.
- Nên có timestamp “dữ liệu cập nhật lúc…” và trạng thái lỗi/không đủ dữ liệu rõ hơn.
- Nếu có xuất báo cáo, cần thể hiện trạng thái tạo file và vị trí lưu.

### 5.7. Cài đặt hệ thống

Các tab hiện có: hồ sơ cá nhân, đơn vị, người dùng, kết nối database, file backup và thông tin hệ thống.

Điểm tốt:

- Tab admin chỉ hiển thị cho admin.
- Tách thao tác backup và database khỏi màn hình nghiệp vụ.
- Backup có giải thích rằng `.bak` cần restore bằng SSMS.
- Có `role="status"` và `aria-live` cho trạng thái backup.

Vấn đề:

- Nhiều tab ngang có thể tràn ở cửa sổ nhỏ; không có scroll tab hoặc menu phụ.
- Cấu hình database là thao tác rủi ro cao nhưng được đặt ngang hàng với profile/about.
- Thông báo import nói file trùng sẽ bị thay; nên có bước xem trước danh sách thay đổi.
- Người dùng thông thường vẫn thấy tab đơn vị dù quyền sửa thực tế có thể khác; cần xác định rõ view-only/edit.
- Bảng user/đơn vị trong tab thiếu responsive strategy.

## 6. Component dùng chung

### 6.1. DataTable

Ưu điểm: cấu hình cột/action linh hoạt, có sort, phân trang, loading và empty state.

Cần bổ sung:

- `aria-sort`, keyboard cho header và row.
- Caption hoặc accessible name cho bảng.
- Trạng thái loading bằng `aria-busy`/live region.
- Hủy hoặc bỏ qua response cũ khi tìm kiếm nhanh để tránh race condition.
- Một menu “…” cho action phụ ở màn hình hẹp.

### 6.2. Modal

Modal đã có `role="dialog"`, `aria-modal="true"`, nút đóng có aria-label và hỗ trợ ESC.

Thiếu:

- `aria-labelledby` liên kết title.
- Focus trap trong modal.
- Tự focus control đầu tiên/nút an toàn.
- Trả focus về trigger khi đóng.
- Gỡ listener `keydown` khi đóng bằng nút, click overlay hoặc code; hiện listener chỉ được gỡ trực tiếp trong nhánh ESC.
- Ngăn mở nhiều modal chồng gây xung đột focus.

### 6.3. Toast

Toast phân loại success/error/warning/info rõ. Cần bổ sung live region thích hợp, timeout theo độ dài nội dung, pause khi hover/focus và khả năng đọc lại lỗi quan trọng.

### 6.4. PDF viewer

Chức năng khá đầy đủ cho desktop. Nên chuyển CSS ra file component, thêm accessible label cho mọi nút, focus trap, trạng thái loading/error live và responsive toolbar.

## 7. Responsive và resize

Kết quả kiểm tra tĩnh:

- Không có `@media` query trong bốn file CSS.
- Grid stats dùng `auto-fit`, grid xe dùng `auto-fill`; đây là hai vùng tự co tốt nhất.
- Form `.form-row` luôn hai cột.
- Chi tiết xe luôn `280px 1fr`.
- Sidebar luôn 200 px.
- Report stats ép bốn cột.
- Modal `sm`, `lg`, `xl` đều đang `max-width: 1000px`, nên tên size không phản ánh kích thước thực.
- Banner sidebar/topbar dùng `background-size: cover`, vì vậy hình crop thay đổi theo resize.

Breakpoint đề xuất cho desktop Electron:

| Vùng | Hành vi đề xuất |
|---|---|
| ≥ 1440 px | Content max-width, card 3–4 cột, detail 300px + content |
| 1200–1439 px | Card 3 cột, sidebar 220–240 px |
| 1024–1199 px | Sidebar compact/collapse, card 2–3 cột, detail xếp dọc |
| Chiều cao < 700 px | Giảm header/padding, modal body cuộn, giữ action footer cố định |

Ứng dụng không cần mobile-first, nhưng bắt buộc phải ổn định ở min window 1024×600 đã khai báo.

## 8. Accessibility

### 8.1. Điểm đã có

- Button và input native ở phần lớn form.
- Focus outline cho `.btn` và form-control.
- Modal có role/aria-modal.
- Nút đóng modal có aria-label.
- Backup status có aria-live.
- Ảnh xe có alt theo tên xe.

### 8.2. Khoảng trống

Khảo sát source chỉ thấy rất ít thuộc tính `aria-*` so với quy mô UI. Các vấn đề chính:

- Card và table row click được nhưng không keyboard-accessible.
- Sort header không keyboard-accessible.
- Modal thiếu focus trap/restore focus.
- Placeholder đang thay cho label ở login và filter.
- Emoji làm icon không có `aria-hidden` hoặc accessible name nhất quán.
- Text 10–11 px xuất hiện nhiều, khó đọc trên màn hình độ phân giải cao.
- Màu trạng thái chưa luôn có icon/pattern phụ trợ.
- Body `user-select: none` cản người dùng copy mã, tên, lỗi và dữ liệu báo cáo.
- Loading spinner không có text/live region ở nhiều nơi.

Mục tiêu tối thiểu nên là WCAG 2.1 AA cho contrast, keyboard, focus order, accessible name và trạng thái động.

## 9. Nội dung và ngôn ngữ

Điểm tốt:

- Toàn bộ UI dùng tiếng Việt và từ ngữ nghiệp vụ tương đối nhất quán.
- Confirm xóa thường nêu rõ không thể hoàn tác.
- Empty state có câu giải thích.

Điểm cần chỉnh:

- “Loại xe”, “loại hình”, “trang bị”, “thiết bị” đang được dùng đan xen; cần glossary nghiệp vụ.
- Thông báo kỹ thuật có thể lộ nguyên văn lỗi SQL/path; người dùng phổ thông cần thông báo dễ hiểu, log giữ chi tiết.
- “Đăng ký/Quên mật khẩu” không có chức năng nên phải ẩn hoặc triển khai.
- Các action dùng cả “Thêm xe”, “Thêm trang bị”, “Tạo mới”; nên chuẩn hóa động từ theo đối tượng.
- Định dạng ngày cần thống nhất `dd/MM/yyyy` và xử lý datetime đúng locale.

## 10. Khả năng hoạt động offline

UI chưa offline hoàn toàn vì:

1. Oswald/Barlow tải từ Google Fonts.
2. pdf.js và worker tải từ cdnjs.
3. CSP đang cho phép các domain ngoài tương ứng.

Khi offline:

- Font fallback làm thay đổi kích thước và ngắt dòng.
- PDF preview nội bộ thất bại và chuyển sang app mặc định nếu có.
- Người dùng nhận trải nghiệm khác với khi có Internet.

Yêu cầu khắc phục:

- WOFF2 local cho font/weight thực dùng.
- `pdf.min.js` và `pdf.worker.min.js` đóng gói local.
- Xóa các domain ngoài khỏi CSP.
- Chuyển style động của PDF viewer và inline style sang CSS class để tiến tới bỏ `'unsafe-inline'`.

## 11. Ma trận ưu tiên cải thiện

| Ưu tiên | Vấn đề | Giá trị mang lại |
|---|---|---|
| P0 | Local hóa font và pdf.js, xử lý CSP | App chạy ổn định offline, giảm lỗi console |
| P0 | Loại bỏ affordance không hoạt động ở login | Tránh người dùng đi vào luồng cụt |
| P1 | Chuẩn hóa palette/font/icon/component | UI thống nhất, dễ bảo trì |
| P1 | Responsive tại 1024×600 | Đúng với kích thước cửa sổ tối thiểu |
| P1 | Keyboard/focus/ARIA cho card, table, modal | Tăng khả dụng và accessibility |
| P1 | Tách 250 inline style marker thành class/component | Giảm CSP conflict và sai lệch giao diện |
| P1 | Chuẩn hóa card xe | Bám sát ảnh tham chiếu và tránh lệch card |
| P2 | Collapse sidebar và responsive tabs | Tăng diện tích nội dung |
| P2 | Biểu đồ/xu hướng cho báo cáo | Hỗ trợ ra quyết định nhanh |
| P2 | Glossary và chuẩn hóa microcopy | Giảm nhầm lẫn nghiệp vụ |

## 12. Lộ trình UI/UX đề xuất

### Giai đoạn 1 — Ổn định và offline

1. Đóng gói font WOFF2 và pdf.js local.
2. Sửa CSP tối thiểu, không tắt CSP.
3. Thống nhất logo app/login/window/shortcut.
4. Xóa link/nút login chưa có chức năng.
5. Sửa HTML không hợp lệ và các lỗi console.

### Giai đoạn 2 — Chuẩn hóa component

1. Chốt palette primary/secondary/status.
2. Tạo token font body/display.
3. Thay emoji bằng bộ SVG local đồng nhất.
4. Tạo component/class cho vehicle card, toolbar, stats, detail panel, file item.
5. Chuyển inline style ra CSS; ưu tiên PDF viewer và maintenance pages.
6. Chuẩn hóa modal size `sm/md/lg/xl`.

### Giai đoạn 3 — Responsive và accessibility

1. Thêm breakpoint 1024, 1200, 1440 và low-height.
2. Detail xe xếp dọc ở cửa sổ hẹp.
3. Form 2 cột chuyển 1 cột khi thiếu chỗ.
4. Tab settings scroll/collapse.
5. Keyboard navigation cho card/table/sort.
6. Focus trap/restore cho modal/PDF.
7. Kiểm tra contrast và cỡ chữ tối thiểu.

### Giai đoạn 4 — Tối ưu nghiệp vụ

1. Dashboard/report có xu hướng và mốc cập nhật.
2. Empty state có CTA phù hợp quyền.
3. Import backup có preview thay đổi.
4. Hiển thị trạng thái kết nối database có kiểm soát.
5. User testing với admin, commander, inspector và người chỉ xem.

## 13. Checklist nghiệm thu UI/UX

- [ ] Giao diện giống nhau khi online và offline.
- [ ] Không còn request tới Google Fonts/cdnjs.
- [ ] Không còn lỗi CSP trong DevTools.
- [ ] Mọi màn hình dùng được ở 1024×600, 1280×800 và 1920×1080.
- [ ] Banner không méo hoặc crop ngoài chủ đích khi resize.
- [ ] Card xe bằng chiều cao, ảnh/fallback cùng tỉ lệ.
- [ ] Không có action giả hoặc link đi vào ngõ cụt.
- [ ] Mọi thao tác chính dùng được bằng keyboard.
- [ ] Modal/PDF giữ focus bên trong và trả focus khi đóng.
- [ ] Table sort có trạng thái và accessible name.
- [ ] Màu chữ/nền đạt contrast AA.
- [ ] Status không chỉ truyền đạt bằng màu.
- [ ] Font, icon, logo, button và radius nhất quán.
- [ ] Loading, empty, error, success đều có trạng thái rõ.
- [ ] Thuật ngữ “xe/loại xe/trang bị/thiết bị” được chuẩn hóa.

## 14. Phạm vi chưa xác minh trực tiếp

Tài liệu này chưa bao gồm usability test với người dùng thật, đo contrast bằng công cụ, chụp từng màn hình ở các độ phân giải hoặc chạy app với dữ liệu production. Các nhận định responsive/accessibility dựa trên source hiện tại và nên được xác nhận bằng kiểm thử bản đóng gói sau khi có SQL Server test.

