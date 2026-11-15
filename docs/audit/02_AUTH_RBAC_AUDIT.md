# 02 — Kiểm toán xác thực và RBAC

Ngày kiểm tra: 2026-11-15  
Phạm vi: session Main process, đăng nhập/đăng xuất/đổi mật khẩu, quản lý người dùng, quyền IPC và cấu hình database.

## Kết luận

Xác thực dùng session in-memory trong Main process; password hash không được đưa vào session renderer. Các lỗi đọc dữ liệu không cần đăng nhập, quản trị user/role chưa bắt buộc admin và database config chỉ được che ở UI đã được sửa tại Main process. Các quyền nghiệp vụ chưa có ma trận vai trò rõ ràng được giữ nguyên, không tự phát minh chính sách.

Kết quả tự động liên quan: 18 test auth/authorization/security PASS trong tổng 34 test `npm test` tại thời điểm chốt phần này.

## Ma trận quyền sau sửa

| Nhóm | Public | Đã đăng nhập | Admin / vai trò đặc biệt |
|---|---|---|---|
| Auth | login, logout, getSession | changePassword của chính session | — |
| Unit | — | list/get/tree | create/update/delete: admin |
| Equipment | — | list/get/search/getByQr/create/update/delete | Chưa có policy vai trò rõ hơn trong source |
| Plan | — | list/get/getSteps/create/update/cancel/delete | approve: admin hoặc commander |
| Log | — | list/get | create/update/updateStatus: admin, technician hoặc commander |
| Acceptance | — | get | create/update: admin, commander hoặc inspector |
| Reports | — | tất cả report hiện có | — |
| User / Role | — | — | list/create/update/toggleActive/list role: admin |
| Vehicle / loại xe / hạng mục | — | các thao tác đọc và đọc/mở PDF | mọi thao tác ghi/file: admin |
| File archive | — | — | export/import: admin |
| DB config | first-run hoặc recovery mode rõ ràng | — | admin sau khi DB hoạt động |

`auth:login`, màn hình first-run và recovery là các ngoại lệ có chủ đích. Route guard renderer không được tính là enforcement; bảng trên phản ánh kiểm tra ở Main process.

## Kiểm thử auth service

File: `tests/unit/auth/auth-service.test.js`.

- user không tồn tại và sai mật khẩu trả cùng lỗi chung, giảm rò rỉ username;
- tài khoản inactive không tạo session;
- login đúng tạo session không chứa password hash;
- logout xóa session;
- đổi mật khẩu xác minh mật khẩu cũ, độ dài tối thiểu và chỉ cập nhật user id được IPC lấy từ session.

## Lỗi đã sửa

### AUTH-001 — IPC đọc dữ liệu nghiệp vụ không yêu cầu đăng nhập

Mức độ: P1.  
Ảnh hưởng: renderer bị chèn mã có thể gọi preload allowlist để đọc đơn vị, trang bị, kế hoạch, log, nghiệm thu, xe, hạng mục và file dù chưa đăng nhập.  
Sửa: thêm `requireAuth()` ở Main process cho 20 read handler.  
Test: `tests/security/authorization/ipc-auth-policy.test.js` — PASS.

### AUTH-002 — Liệt kê user/role không bắt buộc admin

Mức độ: P1.  
Policy đã có bằng chứng: preload ghi rõ nhóm Users admin-only và UI Settings chỉ hiển thị cho admin.  
Sửa: `user:list` và `role:list` yêu cầu `requireAdmin()`.  
Test tĩnh policy và test thực thi non-admin không gọi repository — PASS.

### AUTH-003 — Database config không có authorization sau first-run

Mức độ: P0 trước sửa.  
Ảnh hưởng: bất kỳ mã renderer nào được thực thi đều có thể đọc thông tin endpoint/user, thử credential khác hoặc đổi database rồi relaunch app.  
Sửa: ba handler chỉ mở khi Main process đặt `setupMode` (first-run hoặc DB recovery), ngoài trạng thái đó chỉ admin. Password vẫn luôn trả chuỗi rỗng.  
Test: first-run PASS; unauth sau setup bị từ chối PASS; recovery PASS; admin PASS.

### AUTH-004 — Admin có thể tự vô hiệu hóa session hiện tại

Mức độ: P1.  
Lỗi cũ: tài khoản active bị đổi thành inactive nhưng session vẫn hoạt động.  
Sửa: chặn thao tác vô hiệu hóa đúng `session.userId`; vẫn cho admin quản lý tài khoản khác.  
Test: `tests/security/authorization/auth-ipc.test.js` — PASS.

### AUTH-005 — Tạo user chấp nhận mật khẩu ngắn hơn quy tắc đổi mật khẩu

Mức độ: P1.  
Sửa: áp dụng tối thiểu 6 ký tự, chuẩn hóa username trước khi kiểm tra trùng và từ chối username/full name chỉ có khoảng trắng.  
Test red → green trong `auth-ipc.test.js` — PASS.

## Rủi ro còn lại

### AUTH-R01 — Session không tái kiểm tra `is_active`

Mức độ: P1.  
Việc tự disable đã bị chặn, nhưng nếu tài khoản bị vô hiệu hóa trực tiếp từ một app/instance khác, session hiện tại chỉ hết khi logout/restart. Muốn xử lý triệt để cần middleware async kiểm tra user cho mọi request hoặc cơ chế thu hồi session; đây là thay đổi kiến trúc và cần quyết định hiệu năng/policy.

### AUTH-R02 — Chưa có rate limit/lockout cho login

Mức độ: P2 trong mô hình desktop nội bộ, cao hơn nếu máy dùng chung hoặc renderer bị compromise. Chưa có policy số lần thử, thời gian khóa hoặc quy trình mở khóa nên không tự thêm.

### AUTH-R03 — RBAC thao tác ghi còn phụ thuộc policy nghiệp vụ

Mức độ: P1/policy.  
CRUD đơn vị, log và nghiệm thu đã được đồng bộ với quyền renderer hiện hữu. CRUD trang bị và kế hoạch vẫn cho mọi session đăng nhập vì giao diện hiện cho phép các thao tác đó và chưa có ma trận role/action chính thức. Không tự thu hẹp thêm khi chưa có quyết định nghiệp vụ, tránh làm gián đoạn quy trình.

### AUTH-R04 — Credential database lưu dạng JSON plaintext

Mức độ: P1.  
File nằm trong Electron `userData`; IPC đã được bảo vệ và không trả password, nhưng người có quyền đọc profile Windows vẫn có thể đọc credential. Cần Windows Credential Manager/DPAPI và kế hoạch migration; chưa thay đổi định dạng trong audit này.

### AUTH-R05 — Giá trị fallback cấu hình yếu trong source

Mức độ: P1.  
Adapter có giá trị server/database/user/password fallback hard-coded khi thiếu file/env. Báo cáo không lặp lại credential. Nên bỏ password fallback và fail closed sau khi xác nhận quy trình triển khai/first-run.

## Giới hạn bằng chứng

- Không đăng nhập vào SQL Server thật; repository user được kiểm soát bằng test double.
- Không kiểm thử nhiều instance đồng thời hoặc thay đổi `is_active` từ instance khác.
- Không thực hiện penetration test hệ điều hành/ACL của thư mục `userData`.

