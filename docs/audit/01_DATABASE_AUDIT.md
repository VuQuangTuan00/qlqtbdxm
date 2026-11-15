# 01 — Kiểm toán database và tính toàn vẹn dữ liệu

Ngày kiểm tra: 2026-11-15  
Phạm vi: `main/database`, `main/repositories`, các service có thao tác nhiều bảng và migration SQL Server.  
Engine thực tế: Microsoft SQL Server qua package `mssql`. SQLite không nằm trong luồng khởi tạo hiện hành.

## Kết luận

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Migration runner | PASS tĩnh / BLOCKED thực thi thật | Migration có bảng `_migrations`, sắp xếp tên file và transaction theo file. Không chạy vào SQL Server vì chưa có `TEST_DB_*` riêng biệt. |
| SQL adapter tương thích cú pháp repository | PASS unit | 6 test cho placeholder, literal/comment, `ILIKE`, boolean, `RETURNING`, `LIMIT/OFFSET`, CTE. |
| Transaction tạo/xóa trang bị | PASS unit sau sửa | Insert trang bị + QR + audit và xóa QR + trang bị + audit cùng transaction. |
| Transaction tạo/xóa kế hoạch | PASS unit sau sửa | Kế hoạch + các log sinh tự động và luồng xóa được rollback khi một bước lỗi. |
| Transaction bắt đầu/hoàn thành log | PASS unit sau sửa | Trạng thái kế hoạch và log không còn có thể lệch nhau khi câu lệnh sau thất bại. |
| CRUD/query thật trên SQL Server | BLOCKED | Không có database test cô lập và không được phép thử phá hủy trên database vận hành. |
| Toàn vẹn schema | PARTIAL | Có PK/FK/UNIQUE/CHECK cơ bản; còn rủi ro unique nullable và sinh mã theo `COUNT(*)`. |

## Kiến trúc và migration

- `main/database/index.js` chọn SQL Server.
- `main/database/mssql.js` tạo pool, chạy các file trong `main/database/migrations-mssql` và cung cấp interface gần tương thích `pg` cho repository.
- Chỉ có một migration `001_schema.sql`. File này là lịch sử đã áp dụng; audit không sửa trực tiếp migration cũ.
- Mỗi migration chạy trong `sql.Transaction`; chỉ ghi `_migrations` sau khi toàn bộ batch thành công.
- Batch được tách bằng `GO`. Runner giữ lại các lỗi do `tedious` phát ra để tránh lỗi tổng quát che lỗi gốc.

### Giới hạn chưa thể xác minh

Không có cấu hình `TEST_DB_*` trỏ đến một database có tên test và không có xác nhận `ALLOW_DESTRUCTIVE_DB_TESTS=1`. Harness chủ động từ chối dùng `DB_*` production. Vì vậy các nội dung sau **không được tuyên bố PASS**:

- chạy migration từ database rỗng;
- chạy lại migration để xác minh idempotency trên SQL Server thật;
- CRUD, FK/CHECK/UNIQUE và rollback thật;
- backup/restore SQL Server thật và so sánh dữ liệu sau restore.

## Các lỗi đã sửa

### DB-001 — SQL transformer sửa nhầm literal/comment và thiếu các cú pháp đang dùng

Mức độ: P1.  
Nguyên nhân: transformer dùng regex trực tiếp trên toàn câu SQL; token trong string, identifier và comment có thể bị thay đổi. Boolean và `LIMIT` ở outer query của CTE chưa được xử lý đầy đủ.  
Sửa tại `main/database/mssql.js`: bảo vệ segment, khôi phục sau transform, đổi boolean và tìm `SELECT` top-level.  
Test: `tests/unit/database/sql-transformer.test.js` — 6/6 PASS.

### DB-002 — Tạo/xóa trang bị có thể để dữ liệu nửa chừng

Mức độ: P1.  
Ví dụ lỗi cũ: trang bị được insert nhưng QR insert lỗi; hoặc QR bị xóa rồi xóa trang bị lỗi.  
Sửa tại `main/services/equipment.service.js`: toàn bộ câu lệnh liên quan chạy bằng một transaction.  
Test: `tests/unit/services/equipment-transaction.test.js` — 2/2 PASS.

### DB-003 — Tạo/xóa kế hoạch có thể lệch kế hoạch và nhật ký

Mức độ: P1.  
Sửa tại `main/services/maintenance-plan.service.js`: insert kế hoạch + các log + audit và xóa log + kế hoạch + audit đều nguyên tử.  
Test: `tests/unit/services/maintenance-plan-transaction.test.js` — 2/2 PASS.

### DB-004 — Cập nhật trạng thái log/kế hoạch không nguyên tử

Mức độ: P1.  
Lỗi được tái hiện: log cuối đã chuyển `completed`, sau đó cập nhật kế hoạch lỗi; dữ liệu còn lại là log `completed` nhưng kế hoạch `in_progress`.  
Sửa tại `main/services/maintenance-log.service.js`: cập nhật log, đếm các bước hoàn thành và cập nhật kế hoạch trong một transaction.  
Test: `tests/unit/services/maintenance-log-transaction.test.js` — 2/2 PASS, gồm test rollback đỏ trước khi sửa.

## Rủi ro còn lại

### DB-R01 — UNIQUE trên cột serial nullable

Mức độ: P1, chưa sửa vì cần migration mới và xác minh dữ liệu hiện hữu.  
`equipments.serial_number` cho phép `NULL`, service cũng ghi `null`, nhưng schema dùng unique constraint không lọc. Trên SQL Server, unique constraint/index thông thường chỉ chấp nhận một giá trị `NULL`; trang bị thứ hai không có serial có thể thất bại. Hướng sửa an toàn là migration mới thay constraint bằng filtered unique index `WHERE serial_number IS NOT NULL`, sau khi kiểm tra dữ liệu trùng.

### DB-R02 — Sinh `plan_code` bằng `COUNT(*) + 1`

Mức độ: P1.  
Hai request đồng thời có thể cùng sinh một mã. Unique constraint ngăn dữ liệu trùng nhưng một request sẽ lỗi. Cần sequence/identity chuyên biệt hoặc retry có kiểm soát trong transaction; chưa tự đổi vì đây là quyết định định dạng mã nghiệp vụ.

### DB-R03 — Identifier động trong `BaseRepository`

Mức độ: P2.  
`conditions` keys, `orderBy` và `order` được nội suy trực tiếp. Giá trị dữ liệu vẫn parameterized, nhưng nếu caller chuyển input người dùng trực tiếp vào các trường này sẽ tạo SQL injection identifier. Hiện phần lớn caller dùng hằng số; nên thêm allowlist theo repository trước khi mở rộng API lọc/sắp xếp.

### DB-R04 — Xóa trang bị có kế hoạch phụ thuộc

Mức độ: P2/policy.  
FK `maintenance_plans.equipment_id` không cascade nên thao tác xóa sẽ bị chặn khi đã có lịch sử. Đây có thể là chính sách đúng để bảo toàn hồ sơ. Không tự thêm cascade hoặc soft-delete vì prompt yêu cầu không thay đổi nghiệp vụ.

### DB-R05 — Migration duy nhất chứa toàn schema

Mức độ: P2.  
Các thay đổi tiếp theo phải tạo `002_...sql`; không sửa `001_schema.sql` đã có thể được ghi nhận trong `_migrations`.

## Bằng chứng kiểm thử

Lệnh:

```text
npm test
```

Kết quả tại thời điểm audit: 18 test, 18 PASS, 0 FAIL. Bộ test gồm guard chống nhầm production DB, SQL transformer và rollback của các luồng nhiều bảng. Đây là unit/in-process test; không thay thế kiểm thử tích hợp SQL Server thật.

## Điều kiện để hoàn tất kiểm thử SQL Server thật

1. Cấp một database riêng, tên thể hiện rõ mục đích test (ví dụ `QTCN_AUDIT_TEST`).
2. Cấp tài khoản chỉ có quyền trong database đó.
3. Truyền cấu hình qua `TEST_DB_SERVER`, `TEST_DB_NAME`, `TEST_DB_USER`, `TEST_DB_PASSWORD`.
4. Chỉ khi chủ động đặt `ALLOW_DESTRUCTIVE_DB_TESTS=1` mới chạy migration/CRUD/rollback/restore test.

