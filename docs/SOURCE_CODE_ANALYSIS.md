# PHÂN TÍCH SOURCE CODE HIỆN TẠI

> Dự án: Quản lý Quy trình Bảo dưỡng Xe máy  
> Thời điểm khảo sát: 02/11/2026  
> Phạm vi: `main/`, `renderer/`, migration SQL Server, cấu hình đóng gói và luồng lưu trữ/backup.  
> Phương pháp: đọc tĩnh source code ở trạng thái hiện tại; không thay đổi logic, database hoặc cấu hình ứng dụng.

## 1. Kết luận nhanh

Ứng dụng là Electron desktop thuần JavaScript, dùng SQL Server làm database duy nhất. Kiến trúc chính đã được phân lớp khá rõ theo hướng:

```text
Renderer UI
   │ window.electronAPI.invoke(...)
   ▼
Preload (danh sách IPC cho phép)
   ▼
IPC Handler ──► Service ──► Repository ──► SQL Server
                         └──► File system / PowerShell / Electron shell
```

Điểm tốt nhất của source hiện tại là ranh giới Renderer/Main tương đối rõ, `nodeIntegration` đã tắt, `contextIsolation` đã bật, IPC được whitelist và truy vấn database chủ yếu truyền tham số. Các module nghiệp vụ chính cũng đã tách khỏi giao diện.

Các vấn đề cần ưu tiên nhất:

1. Thông tin kết nối SQL Server có giá trị mặc định nhạy cảm trong source và file cấu hình được lưu dạng văn bản thuần.
2. Các IPC cấu hình database không kiểm tra quyền; một số IPC đọc dữ liệu cũng không yêu cầu phiên đăng nhập.
3. CSP vẫn cho phép Google Fonts/cdnjs, trong khi UI vẫn tải font và pdf.js qua Internet; ứng dụng chưa offline hoàn toàn.
4. Electron sandbox đang tắt và còn nhiều HTML/style được sinh động bằng chuỗi.
5. Upload file chưa kiểm tra chặt loại file, kích thước và giá trị `tab` ở tầng service.
6. Chưa có test script, lint script hoặc test tự động trong cấu hình dự án.
7. Đường dẫn icon của `BrowserWindow` trỏ tới file không tồn tại.

## 2. Quy mô và công nghệ

### 2.1. Công nghệ chính

| Thành phần | Công nghệ hiện tại |
|---|---|
| Desktop runtime | Electron 29.1.0 |
| Ngôn ngữ | JavaScript CommonJS, HTML, CSS, T-SQL |
| Database | Microsoft SQL Server qua `mssql`/`tedious` |
| Mật khẩu | `bcryptjs` |
| Logging | `electron-log` |
| Đóng gói | `electron-builder`, Windows NSIS |
| Frontend | Vanilla JavaScript, SPA router tự viết |
| PDF preview | pdf.js 3.11.174 tải động từ cdnjs |

### 2.2. Kích thước source khảo sát

| Khu vực | Số file code | Số dòng xấp xỉ |
|---|---:|---:|
| `main/` (`.js`, `.sql`) | 39 | 3.906 |
| `renderer/` (`.js`, `.css`, `.html`) | 23 | 5.626 |

Số liệu không gồm `node_modules`, file ảnh, shortcut và output build.

### 2.3. Cấu trúc thư mục

```text
main/
├── database/       Kết nối SQL Server, migration, backup .bak
├── ipc/            Điểm vào từ Renderer
├── repositories/   CRUD và truy vấn dữ liệu
├── services/       Nghiệp vụ, xác thực, file, backup
├── utils/          Hash, logger, response chuẩn
├── index.js        Vòng đời ứng dụng
├── preload.js      API an toàn cho Renderer
└── window-manager.js

renderer/
├── assets/css/     Token, base, layout, component
├── assets/images/  Logo, banner, background
├── js/             API client, store, router, auth, component dùng chung
├── pages/          Trang thiết bị, bảo dưỡng, báo cáo, cài đặt
└── index.html      Shell SPA, login, CSP và thứ tự nạp script
```

## 3. Luồng khởi động ứng dụng

Luồng trong `main/index.js`:

1. Yêu cầu single-instance lock; instance thứ hai chỉ khôi phục/focus cửa sổ cũ.
2. Khi Electron `ready`, đăng ký IPC cấu hình database trước.
3. Kiểm tra `db-config.json` trong `app.getPath('userData')`.
4. Nếu chưa có cấu hình, mở cửa sổ và gửi sự kiện `app:first-run`.
5. Nếu đã có cấu hình, khởi tạo SQL Server và chạy migration chưa áp dụng.
6. Đăng ký toàn bộ IPC nghiệp vụ rồi mở cửa sổ chính.
7. Nếu kết nối database lỗi, cửa sổ vẫn được mở để hiển thị màn hình thiết lập lại database.
8. Trước khi thoát, đóng connection pool SQL Server.

Đánh giá: luồng first-run hợp lý cho ứng dụng desktop. Tuy nhiên, IPC cấu hình database tồn tại suốt vòng đời ứng dụng và hiện không có kiểm tra admin, nên cần bảo vệ trạng thái “đang first-run” hoặc quyền quản trị tại Main process.

## 4. Ranh giới Electron và IPC

### 4.1. Điểm tích cực

- `nodeIntegration: false`.
- `contextIsolation: true`.
- `preload.js` chỉ cho invoke các channel trong `ALLOWED_INVOKE_CHANNELS`.
- Điều hướng khỏi trang local bị chặn; cửa sổ mới được chuyển sang trình duyệt hệ thống.
- Main process mới trực tiếp chạm database và filesystem.
- Các response phần lớn có cấu trúc thống nhất `{ success, data, error/message }`.

### 4.2. Điểm cần xử lý

- `sandbox: false` ở cả cửa sổ chính và cửa sổ con.
- `electronAPI.off(channel, callback)` không gỡ đúng listener đã đăng ký, vì `on()` bọc callback bằng một hàm mới nhưng không lưu mapping giữa hai hàm.
- `dbconfig:get`, `dbconfig:set`, `dbconfig:test` không xác thực phiên hoặc quyền admin. Việc này cần hỗ trợ first-run, nhưng sau first-run phải có policy riêng.
- Một số channel đọc như `equipment:list/get/search`, `unit:list/get/tree`, `plan:list/get/getSteps`, `vehicle:list/get`, `engineMaintenance:list/read/open` và `vehicleType:list` không gọi `requireAuth()` tại Main process.
- Renderer có route guard, nhưng route guard không thay thế authorization ở Main process.
- `router.navigate()` chỉ bắt lỗi đồng bộ. Nếu hàm `render()` là async và reject sau khi trả về Promise thì khối `try/catch` hiện tại không bắt được.

## 5. Phân lớp backend

### 5.1. IPC handlers

Các nhóm IPC hiện có:

| Nhóm | Chức năng |
|---|---|
| Auth/User/Role | Đăng nhập, đăng xuất, đổi mật khẩu, quản lý user và role |
| Unit | Danh sách, cây đơn vị, CRUD |
| Equipment | Danh sách, tìm kiếm, CRUD, tra QR |
| Maintenance Plan | Danh sách, tạo/sửa, phê duyệt, hủy, xóa, lấy bước |
| Maintenance Log | Nhật ký thực hiện và cập nhật trạng thái |
| Acceptance | Nghiệm thu kế hoạch |
| Report | Tổng hợp, trạng thái thiết bị, theo kỳ, quá hạn |
| Vehicle/Engine Maintenance | Loại xe, xe, hạng mục động cơ, ảnh và PDF |
| DB Config | Đọc, kiểm tra, lưu kết nối SQL Server |
| File Archive | Xuất/nhập bộ chuyển máy ZIP + `.bak` |

Quyền đã được áp dụng tốt hơn ở nhóm xe và backup: CRUD xe/hạng mục/file yêu cầu admin; xuất/nhập backup yêu cầu admin; phê duyệt kế hoạch yêu cầu admin hoặc commander; tạo nghiệm thu giới hạn admin/commander/inspector.

Điểm chưa đồng nhất là CRUD thiết bị, đơn vị, kế hoạch và nhật ký mới chỉ yêu cầu đăng nhập, chưa có ma trận quyền rõ theo hành động.

### 5.2. Services

Service đang chứa các quy tắc nghiệp vụ và phối hợp repository:

- `auth.service.js`: phiên đăng nhập trong bộ nhớ Main process; bcrypt; audit login/logout.
- `equipment.service.js`: CRUD và audit thiết bị.
- `maintenance-plan.service.js`: tạo mã, bước bảo dưỡng, trạng thái/phê duyệt.
- `maintenance-log.service.js`: nhật ký thực hiện.
- `acceptance.service.js`: nghiệm thu.
- `unit.service.js`: cây đơn vị và kiểm tra ràng buộc.
- `vehicle.service.js`: xe, loại xe, hạng mục, ảnh, PDF và mở file ngoài.
- `file-archive.service.js`: đóng gói/giải nén file bằng PowerShell.

### 5.3. Repositories

`BaseRepository` cung cấp CRUD, count, exists, paginate và transaction. Các repository riêng mở rộng cho truy vấn join/thống kê.

Ưu điểm:

- Giảm SQL lặp lại giữa service.
- Hầu hết giá trị truy vấn được bind thành tham số.
- Có transaction-compatible interface cho code theo phong cách `pg`.

Rủi ro:

- Lớp `_transformSql()` dùng regex để đổi cú pháp PostgreSQL (`$1`, `ILIKE`, `RETURNING`, `LIMIT/OFFSET`) sang SQL Server. Cách này phù hợp truy vấn đơn giản nhưng dễ sai với SQL phức tạp, subquery, comment hoặc chuỗi chứa từ khóa.
- Các trường động như sort/order cần được whitelist ở repository; không nên ghép trực tiếp giá trị nhận từ Renderer.

## 6. Database và dữ liệu

### 6.1. Schema hiện tại

Migration `001_schema.sql` tạo 14 bảng:

| Nhóm | Bảng |
|---|---|
| Tổ chức và phân quyền | `units`, `roles`, `users` |
| Phân loại xe | `vehicle_type`, `vehicle`, `engine_maintenance` |
| Thiết bị | `equipments` |
| Bảo dưỡng | `maintenance_steps`, `maintenance_plans`, `maintenance_logs` |
| Nghiệm thu/tệp/QR/audit | `acceptance_records`, `attachments`, `qr_codes`, `audit_logs` |

Các quan hệ chính:

```text
units ──< users
units ──< equipments >── vehicle_type/vehicle
vehicle_type ──< vehicle ──< engine_maintenance
equipments ──< maintenance_plans ──< maintenance_logs
maintenance_plans ── acceptance_records
users ──< audit_logs
```

Migration có bảng `_migrations`, chạy theo tên file tăng dần và bọc từng file trong transaction. Phần thu thập nhiều lỗi từ `tedious` và giữ lỗi gốc khi rollback thất bại là một điểm tốt cho vận hành.

### 6.2. Cấu hình kết nối

Thứ tự lấy cấu hình:

1. `%APPDATA%/.../db-config.json` nếu `mode === "sqlserver"`.
2. Biến môi trường.
3. Giá trị mặc định viết trong `main/database/mssql.js`.

Rủi ro cao:

- Source chứa server, database, user và mật khẩu mặc định rất yếu.
- `db-config.json` lưu cả password dạng plain text.
- `trustServerCertificate: true` làm giảm khả năng xác minh server certificate.
- Pool dùng timeout kết nối 5 giây và request 60 giây; hợp lý cho LAN nhưng cần thông báo UI rõ khi server không thể truy cập.

### 6.3. Phiên đăng nhập

Session chỉ nằm trong biến `_session` của Main process:

- Ưu điểm: không ghi token ra disk, restart app sẽ kết thúc phiên.
- Hạn chế: chỉ có một phiên cho toàn bộ instance; không có timeout bất hoạt, refresh token hoặc khóa phiên sau thời gian dài.

## 7. Lưu trữ file và backup

### 7.1. Ba thư mục trong ZIP

`file-archive.service.js` cố ý đóng gói ba thư mục:

| Thư mục | Vai trò hiện tại |
|---|---|
| `vehicle-images` | Nơi code hiện tại ghi ảnh xe mới |
| `maintenance-files` | Nơi code hiện tại ghi PDF/tài liệu bảo dưỡng mới |
| `uploads` | Thư mục tương thích dữ liệu cũ; được dùng làm đường dẫn fallback khi tìm file |

Kết luận: dữ liệu mới đã được tách ảnh và tài liệu. `uploads` vẫn xuất hiện trong ZIP để không làm mất file của phiên bản cũ. Đây không phải ba bản sao của cùng một file, nhưng quy ước legacy chưa được mô tả bằng metadata và chưa có migration dọn dữ liệu cũ.

Khuyến nghị:

1. Giữ đọc `uploads` trong một giai đoạn chuyển tiếp.
2. Tạo migration file một lần: nhận diện loại file, chuyển ảnh sang `vehicle-images`, PDF/tài liệu sang `maintenance-files`, cập nhật đường dẫn trong DB.
3. Sau khi kiểm tra checksum và backup, ngừng ghi/đọc fallback `uploads` ở phiên bản kế tiếp.
4. Đổi hằng `FOLDERS` thành cấu hình có chú thích `legacy` để tránh hiểu nhầm.

### 7.2. Luồng xuất backup

1. Chỉ admin được gọi.
2. SQL Server tạo `.bak` vào thư mục backup của dịch vụ SQL Server.
3. App tạo ZIP gồm `database/<database>.bak`, `manifest.json` và ba thư mục file nói trên.
4. File `.bak` tạm được xóa sau khi đóng gói.

Luồng này phù hợp để chuyển máy nếu dịch vụ SQL Server có quyền ghi vào thư mục backup. Hạn chế là đường dẫn mặc định của thư mục SQL Server được hard-code và phụ thuộc máy cài đặt.

### 7.3. Luồng nhập backup

- ZIP được kiểm tra tên thư mục, extension, file trùng và manifest.
- Entry chỉ được chấp nhận ở đúng thư mục cấp một, giúp giảm zip-slip.
- File ứng dụng được chép vào `userData`; bản trùng bị ghi đè trong luồng transfer package.
- `.bak` chỉ được trích ra `Documents`; app không tự restore database.

Điểm cần bổ sung:

- Giới hạn tổng dung lượng ZIP, số entry và dung lượng từng entry để tránh zip bomb.
- Kiểm tra MIME/magic bytes thay vì chỉ extension.
- Xác minh checksum trong manifest.
- Có báo cáo trước khi import: file nào thêm mới, file nào ghi đè.
- Có rollback hoặc staging toàn bộ trước khi copy vào dữ liệu thật.

### 7.4. Upload và đường dẫn file

- Tên file được làm sạch phần basename và thêm timestamp.
- Ảnh và PDF đang lưu đường dẫn tuyệt đối vào DB; fallback theo filename giúp chuyển máy nhưng không phải mô hình portable lý tưởng.
- `uploadFile()` chưa giới hạn extension/size và chưa xác thực `tab` chỉ thuộc `tech_process | norm_ktkt`.
- `_deleteFile()` có thể xử lý đường dẫn tuyệt đối lấy từ DB; cần bắt buộc đường dẫn resolve nằm trong các thư mục dữ liệu được phép trước khi xóa.

Đề xuất lưu đường dẫn tương đối, ví dụ `vehicle-images/<name>` và `maintenance-files/<name>`, rồi resolve bên trong `userData` ở runtime.

## 8. Renderer và luồng giao diện

Renderer là SPA không framework:

- `api.js`: wrapper gọi IPC.
- `store.js`: session và state dùng chung trong bộ nhớ.
- `router.js`: đăng ký route, route guard, title/sidebar.
- `auth.js`: login/logout và khởi tạo phiên.
- `DataTable`, `modal`, `toast`, `sidebar`, `pdfPreview`: component dùng chung.
- Các page tự render HTML bằng template string và gắn event sau khi render.

Ưu điểm: ít dependency, dễ đóng gói, phù hợp ứng dụng nội bộ nhỏ.

Hạn chế:

- Nhiều template dùng `innerHTML` với dữ liệu lấy từ database. Nếu dữ liệu không được escape, đây là điểm vào XSS trong Renderer.
- Source giao diện có nhiều style inline và logic UI đặt trực tiếp trong page lớn.
- `maintenance-steps.js` vượt 1.000 dòng và đảm nhiệm nhiều trách nhiệm: danh sách xe, card, chi tiết, loại xe, hạng mục, reorder, upload, PDF.
- Các script phụ thuộc thứ tự khai báo global trong `index.html`; thiếu module boundary và dễ va chạm tên.

## 9. Bảo mật

### 9.1. Điểm tốt

- Tắt Node trong Renderer, bật context isolation.
- Whitelist IPC ở preload.
- Chặn điều hướng và cửa sổ ngoài.
- Bcrypt cho mật khẩu.
- Parameter binding ở tầng database.
- Admin guard cho quản lý user, xe và backup.
- Có audit log cho một số hành động quan trọng.
- Import ZIP có kiểm tra cấu trúc thư mục và extension.

### 9.2. Danh sách rủi ro theo ưu tiên

| Mức | Vấn đề | Tác động |
|---|---|---|
| P0 | Credential SQL Server mặc định yếu nằm trong source | Truy cập trái phép database nếu cấu hình này được dùng thật |
| P0 | `dbconfig:set/test/get` không có authorization sau first-run | Renderer bị chèn mã có thể đổi kết nối hoặc kiểm tra credential |
| P1 | CSP cho phép CDN/Google Fonts và `'unsafe-inline'`; UI tạo `<style>` động | Tăng bề mặt XSS, không đáp ứng offline hoàn toàn |
| P1 | `sandbox: false` | Giảm lớp cô lập khi Renderer bị khai thác |
| P1 | `innerHTML` nhận nhiều trường từ DB mà không escape | Stored XSS trong Electron Renderer |
| P1 | Upload không giới hạn size/type/magic bytes | File giả mạo, tốn RAM/disk, crash khi base64 file lớn |
| P1 | Hàm xóa/mở file chưa giới hạn path vào `userData` | Có thể tác động file ngoài vùng dữ liệu nếu DB chứa path sai/độc hại |
| P2 | Một số IPC đọc không yêu cầu đăng nhập | Authorization không nhất quán |
| P2 | Password cấu hình DB lưu plain text | Lộ credential khi profile Windows bị đọc |
| P2 | Listener `off()` không gỡ đúng wrapper | Rò listener, callback chạy lặp |
| P2 | Không có giới hạn ZIP/checksum/rollback import | Rủi ro vận hành và toàn vẹn dữ liệu |

## 10. Độ tin cậy và khả năng bảo trì

### 10.1. Điểm tốt

- Module hóa theo nghiệp vụ khá rõ.
- Có single-instance và đóng pool khi thoát.
- Có logging lỗi global.
- Migration theo thứ tự, có transaction.
- Response chuẩn giúp Renderer xử lý nhất quán.
- Các thao tác phá hủy chính thường có confirm ở UI.

### 10.2. Nợ kỹ thuật

- Không có `test`, `lint`, `format` trong `package.json`.
- Không thấy test unit/integration/e2e trong source khảo sát.
- Không có CI config trong phạm vi source đã đọc.
- Một migration duy nhất đang chứa toàn bộ schema; mọi thay đổi tiếp theo phải thêm file mới, không sửa migration đã chạy.
- Logic report viết SQL trực tiếp ở IPC thay vì repository/service, làm lệch kiến trúc.
- Một số catch nuốt lỗi hoàn toàn, đặc biệt audit và xóa file.
- `maintenance-steps.js` và `settings.js` quá lớn, nên tách theo màn hình/tab.
- Icon `BrowserWindow` trỏ `renderer/assets/icon.png`, nhưng file hiện có nằm trong `renderer/assets/images/`.
- `package.json` chưa khai báo rõ icon cho `electron-builder` Windows.

## 11. Đánh giá build và vận hành

`package.json` có các script `start`, `dev`, `build`, `seed`, `reset-db`, `clean`; không có script test. Build Windows dùng NSIS, `asar: true` và đóng gói `main/**/*`, `renderer/**/*`, `package.json`.

Các điểm cần xác minh trước phát hành:

1. Icon cửa sổ, installer và shortcut dùng đúng `logo_app` đã chuyển sang `.ico` chuẩn nhiều kích thước.
2. Font Oswald/Barlow và pdf.js được đóng gói local.
3. App chạy được khi ngắt Internet.
4. Cấu hình SQL Server không còn credential mặc định.
5. Backup/restore được thử trên một máy sạch, với SQL Server service account khác.
6. Migration chạy trên database mới và database đã có dữ liệu.
7. CSP console không còn lỗi.

Trong lần khảo sát này không chạy app/build vì runtime phụ thuộc SQL Server và yêu cầu chỉ là tạo tài liệu phân tích. Việc xác nhận ở đây là kiểm tra tĩnh source, không phải chứng nhận runtime production.

## 12. Lộ trình cải thiện đề xuất

### Giai đoạn 1 — An toàn phát hành

1. Xóa credential mặc định; bắt buộc first-run/env.
2. Bảo vệ IPC database bằng first-run state hoặc admin authorization.
3. Local hóa Oswald, Barlow, pdf.js và siết CSP.
4. Validate/escape dữ liệu trước khi đưa vào `innerHTML`.
5. Validate upload theo tab, extension, MIME, magic bytes, size.
6. Canonicalize và kiểm tra mọi path nằm trong thư mục cho phép.
7. Sửa icon cửa sổ và build icon.

### Giai đoạn 2 — Toàn vẹn dữ liệu

1. Dùng relative path cho file.
2. Migration dọn `uploads` legacy.
3. Thêm checksum, quota, preview và staging/rollback cho import.
4. Chuẩn hóa RBAC cho mọi IPC theo ma trận role/action.
5. Thêm session inactivity timeout nếu môi trường yêu cầu.

### Giai đoạn 3 — Chất lượng kỹ thuật

1. Thêm test cho SQL transformer, repositories, services và quyền IPC.
2. Thêm test backup ZIP độc hại/trùng file/zip bomb.
3. Thêm smoke test cho login, danh sách xe, upload PDF, backup.
4. Tách page lớn thành các module nhỏ.
5. Chuyển SQL report khỏi IPC về repository/service.
6. Thêm lint, format và CI.

## 13. Checklist nghiệm thu kỹ thuật

- [ ] Không còn secret/credential thật trong source hoặc installer.
- [ ] Mọi IPC có policy auth/role được ghi rõ và test.
- [ ] App hoạt động đầy đủ khi không có Internet.
- [ ] CSP không cần domain ngoài và không báo lỗi console.
- [ ] Renderer sandbox được bật hoặc có tài liệu lý do không thể bật.
- [ ] Upload từ chối file sai định dạng và quá dung lượng.
- [ ] Xóa/mở file không thể thoát khỏi `userData`.
- [ ] ZIP import có quota, checksum và cơ chế rollback.
- [ ] Database migration pass trên DB mới và DB nâng cấp.
- [ ] Có test/lint tự động và smoke test bản đóng gói.
- [ ] Icon window, installer, Start Menu và desktop shortcut thống nhất.

