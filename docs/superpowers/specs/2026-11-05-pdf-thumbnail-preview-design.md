# PDF Preview Thumbnail Panel Design

## Intent

Khắc phục PDF preview mở được nhưng canvas nội dung vẫn bị ẩn, bổ sung Page Thumbnails Panel, phản hồi loading khi upload và sửa luồng Xóa file trong PDF viewer.

## Goals

- Canvas PDF chính hiển thị ngay sau khi `pdf.js` render thành công.
- Thumbnail panel mặc định mở, có nút bật/tắt trên toolbar.
- Nhấn thumbnail chuyển đúng trang; trang hiện tại có trạng thái active rõ ràng.
- Desktop dùng panel cố định bên trái; cửa sổ hẹp dùng drawer phủ lên vùng xem để không ép nhỏ trang PDF.
- Thumbnail render tuần tự/lazy để tài liệu nhiều trang không khóa giao diện.
- Giữ nguyên tải xuống, xóa file, mở ngoài, zoom, fit, CSP và luồng dữ liệu hiện tại.
- Khi upload, khóa thao tác gửi lặp và hiển thị spinner/trạng thái “Đang tải lên…”.
- Nút Xóa file mở được hộp xác nhận phía trên PDF viewer, chỉ đóng viewer khi xóa thành công.

## Non-goals

- Không thay đổi API, IPC, database, đường dẫn file hoặc quyền xóa.
- Không thay thư viện PDF hay thêm dependency/CDN.
- Không hỗ trợ chỉnh sửa, sắp xếp hoặc xóa từng trang PDF.

## Root cause

CSS đặt `.pdf-canvas { display: none; }`, trong khi JavaScript sau khi render chỉ gán `canvas.style.display = ''`. Khi inline value bị xóa, rule CSS vẫn tiếp tục ẩn canvas. Sửa bằng class trạng thái `.is-visible`, không dùng inline style để điều khiển hiển thị canvas.

Ngoài ra:

- Template toolbar đang chứa ký tự `//` trước tên file; trong HTML đây là text thật chứ không phải comment, nên nó xuất hiện trên giao diện.
- Modal xác nhận Xóa file dùng `z-index: 200`, còn PDF viewer dùng `z-index: 9999`; sự kiện vẫn chạy nhưng hộp xác nhận bị che hoàn toàn phía sau viewer.
- Upload gọi IPC bất đồng bộ nhưng không có trạng thái pending, không khóa nút và không chặn gửi lặp.

## Chosen approach

Panel responsive:

- Toolbar có nút `#pdf-toggle-thumbnails`, mặc định `aria-expanded="true"`.
- Body gồm `.pdf-thumbnail-panel` và `.pdf-viewer-scroll` trong `.pdf-viewer-body`.
- Desktop: panel rộng khoảng 180px, nằm trong luồng layout.
- Cửa sổ hẹp: panel trở thành drawer có shadow, phủ bên trái vùng PDF.
- Mỗi `.pdf-thumbnail-item` là button có canvas riêng, số trang và `aria-label`.
- Render thumbnail theo từng trang, nhường event loop giữa các trang; dừng an toàn nếu overlay đã đóng.
- Khi đổi trang bằng toolbar hoặc thumbnail, cập nhật active thumbnail và đưa nó vào vùng nhìn thấy.
- Khôi phục tên file đúng trong toolbar và loại bỏ text `//` ngoài ý muốn.

## Upload behavior

- Bổ sung vùng trạng thái `aria-live` trong modal upload.
- Khi bắt đầu đọc file/gọi IPC: hiện spinner và “Đang tải lên…”, khóa drop zone, nút Upload và nút Hủy, đồng thời chặn click gửi lặp.
- Thành công: toast, đóng modal và refresh như hiện tại.
- Thất bại: ẩn loading, mở lại các điều khiển và hiển thị lỗi hiện có.

## Delete behavior

- Khi PDF viewer đang mở, modal xác nhận được nâng lên trên viewer bằng trạng thái CSS riêng, không thay z-index toàn app.
- Callback xóa trả về `true` khi IPC thành công và `false` khi hủy/thất bại.
- Nút Xóa file khóa trong lúc chờ; viewer chỉ đóng khi callback trả về `true`.
- Khi viewer đóng, class trạng thái trên `body` và listener bàn phím được dọn sạch.

## Error and accessibility behavior

- Lỗi render thumbnail của một trang không làm hỏng canvas chính; item đó hiển thị trạng thái lỗi.
- Nút toggle có `aria-controls`, `aria-expanded`, title và SVG local.
- Thumbnail dùng button nên hỗ trợ click, Enter và Space mặc định.
- Khi panel đóng, vùng canvas chính tự giãn; trạng thái chỉ tồn tại trong phiên preview hiện tại.

## Verification

- Contract test phải thất bại trước khi triển khai vì chưa có toggle/panel/class hiển thị.
- Test xác nhận không còn điều khiển canvas bằng `style.display`, có class `.is-visible`, panel mặc định mở và responsive drawer.
- Test xác nhận upload có pending guard/loading và callback xóa trả kết quả để viewer đóng đúng lúc.
- Chạy toàn bộ UI contract, `node --check` cho Renderer và build Electron.
