# CLAUDE.md — QLQT Bảo Dưỡng Xe Máy

Hệ thống quản lý quy trình bảo dưỡng xe máy quân đội. Electron desktop app, kết nối SQL Server. Tác giả: Bộ Tư lệnh Xe Máy.

---

## Tech Stack

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Runtime | Electron 29 | Node.js + Chromium |
| DB | mssql ^11 (tedious) | SQL Server 2019+, encrypt + trustServerCertificate |
| Mật khẩu | bcryptjs | Hash + compare, pure JS |
| Logging | electron-log | Ghi file tại `app.getPath('userData')/logs/` |
| Build | electron-builder | NSIS installer Windows → `dist/` |
| Frontend | Vanilla HTML/CSS/JS | Không React/Vue/Angular |

---

## Kiến trúc — 6 Tầng

```
Renderer Process (Chromium)
  └─ contextBridge / preload.js       ← whitelist ~60 kênh invoke + 4 kênh on
       └─ IPC Handlers (main/ipc/)    ← 9 module, xác thực session
            └─ Service Layer (main/services/)   ← 7 service, business logic
                 └─ Repository Layer (main/repositories/)  ← 11 repo, SQL queries
                      └─ Database Adapter (main/database/mssql.js) ← SQL Server
```

Renderer giao tiếp với main process **chỉ qua** `window.electronAPI.invoke(channel, args)`. Không có truy cập Node.js trực tiếp từ renderer.

---

## Database

```
main/database/
├── index.js          ← Re-export initDatabase/getDb/closeDatabase/getDbConfig từ mssql.js
├── mssql.js          ← SQL Server adapter, pg-compatible interface
└── migrations-mssql/ ← 001_schema.sql (T-SQL, GO separator)
```

`db-config.json` trong `app.getPath('userData')` lưu `{ "mode": "sqlserver", server, port, database, user, password }`. Nếu file chưa tồn tại → hiển thị first-run overlay.

Adapter export `{ query(sql, params) → { rows, rowCount }, connect() → client }`. Repository không cần biết chi tiết driver.

### SQL Transformer (mssql.js)

Repository viết cú pháp PostgreSQL-style. mssql.js tự động chuyển sang T-SQL lúc runtime:

| PG-style | → T-SQL |
|---|---|
| `$1, $2` | `@p1, @p2` |
| `ILIKE` | `LIKE` |
| `CURRENT_DATE` | `CAST(GETDATE() AS DATE)` |
| `INSERT ... RETURNING *` | `INSERT ... OUTPUT INSERTED.* VALUES ...` |
| `UPDATE ... RETURNING *` | `UPDATE ... OUTPUT INSERTED.* WHERE ...` |
| `LIMIT n OFFSET m` | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| `LIMIT n` (không OFFSET) | `SELECT TOP n ...` |

### Cấu hình kết nối SQL Server

Khi chưa có `db-config.json`, fallback đọc từ `.env`:
```
DB_SERVER=DESKTOP-SEPTJA2
DB_PORT=1433
DB_NAME=QTCN
DB_USER=qtcn
DB_PASSWORD=1
```

Luôn dùng `encrypt: true, trustServerCertificate: true` — SQL Server được cấu hình Encrypt: Mandatory.

---

## Database Schema — 14 Bảng

Thứ tự FK dependency (quan trọng cho seed):

```
units → roles → vehicle_type → users → vehicle
  → equipments → maintenance_steps → maintenance_plans
  → maintenance_logs → acceptance_records → attachments
  → qr_codes → audit_logs → engine_maintenance
```

**PK không đồng nhất:**
- Hầu hết bảng: `id INT IDENTITY(1,1)`
- `vehicle`: PK là `vehicle_id`
- `vehicle_type`: PK là `vehicle_type_id`
- `engine_maintenance`: PK là `engine_maintenance_id`

Repository tương ứng override `findById()`, `update()`, `delete()`, `exists()` để dùng đúng PK.

---

## Repository Layer

```
main/repositories/
├── base.repository.js         ← BaseRepository: findAll/findById/findOne/create/update/delete/count/paginate/transaction
├── user.repository.js
├── vehicle.repository.js      ← PK: vehicle_id, override findById/update/delete
├── vehicle-type.repository.js ← PK: vehicle_type_id
├── equipment.repository.js
├── maintenance-plan.repository.js
├── maintenance-log.repository.js
├── maintenance-step.repository.js
├── acceptance.repository.js
├── engine-maintenance.repository.js ← PK: engine_maintenance_id
└── unit.repository.js
```

Tất cả export singleton: `module.exports = new XxxRepository()`.

**Transaction pattern** (từ BaseRepository):
```js
await repo.transaction(async (client) => {
  await client.query('INSERT INTO ...', [...]);
  await client.query('UPDATE ...', [...]);
  // COMMIT tự động, ROLLBACK nếu throw
});
```

---

## IPC Handlers

```
main/ipc/
├── index.js              ← registerAllIpcHandlers() — đăng ký 8 module
├── db-config.ipc.js      ← Đăng ký RIÊNG trong main/index.js (không cần DB sẵn sàng)
├── auth.ipc.js           ← auth:* + user:* + role:*
├── unit.ipc.js
├── equipment.ipc.js
├── maintenance-plan.ipc.js
├── maintenance-log.ipc.js
├── acceptance.ipc.js
├── report.ipc.js
└── vehicle.ipc.js        ← vehicle:* + vehicleType:* + engineMaintenance:*
```

**Thứ tự khởi động trong main/index.js:**
1. `db-config.ipc.register()` — trước khi init DB (cho phép màn hình setup hoạt động)
2. `initDatabase()` — có thể thất bại
3. `registerAllIpcHandlers()` — **luôn gọi** dù DB lỗi hay không (tránh "No handler registered")

---

## Authentication

Session lưu in-memory tại `main/services/auth.service.js`:
```js
let _session = { userId, username, fullName, roleCode, roleName, unitId, unitName, loginAt }
```

- Không persist xuống disk, mất khi app restart
- `requireAuth()` → trả về session hoặc null
- `requireAdmin()` → kiểm tra `roleCode === 'admin'`
- Mỗi IPC handler kiểm tra auth trước khi xử lý

---

## Renderer — SPA Shell

```
renderer/
├── index.html                         ← Shell duy nhất, load tất cả JS
├── assets/css/
│   ├── variables.css                  ← CSS custom properties (theme)
│   ├── base.css                       ← Reset + typography
│   ├── layout.css                     ← Sidebar + main-content layout
│   └── components.css                 ← Buttons, tables, forms, cards
└── js/
    ├── api.js                         ← Wrapper electronAPI.invoke(), map thành method có tên
    ├── store.js                       ← Reactive state: get/set/watch, lưu session + route
    ├── router.js                      ← Hash router: register/navigate/refresh, guard auth
    ├── auth.js                        ← Login screen, session management
    ├── first-run.js                   ← Overlay lần đầu: nhập credentials SQL Server
    ├── db-setup.js                    ← Overlay lỗi DB: nhập lại credentials
    └── components/
        ├── sidebar.js
        ├── modal.js
        ├── toast.js
        ├── data-table.js
        └── pdf-preview-modal.js
```

**Routes đã đăng ký:**
- `equipment-list` → `pages/equipment/list.js`
- `equipment-detail` → `pages/equipment/detail.js`
- `plan-list` → `pages/maintenance/plan-list.js`
- `plan-detail` → `pages/maintenance/plan-detail.js`
- `maintenance-steps` → `pages/maintenance/maintenance-steps.js`
- `reports` → `pages/reports/report.js`
- `settings` → `pages/settings/settings.js`

---

## Bảo mật — Ràng buộc Không Thay Đổi

- **KHÔNG thêm inline event handler** (`onclick="..."`) — CSP chặn `unsafe-inline` trên `script-src`
- **KHÔNG import Google Fonts bằng thẻ `<link>`** — CSP không cho phép font CDN trong script
- **KHÔNG sửa CSS variables** trong `variables.css` nếu không cần — ảnh hưởng toàn bộ theme
- **KHÔNG sửa layout login screen** — đã được thiết kế và duyệt
- Mọi kênh IPC mới phải được thêm vào whitelist trong `main/preload.js`

---

## Scripts Phát Triển

```bash
npm start             # Chạy app
npm run dev           # Chạy với Node inspector port 5858
npm run seed          # Seed SQL Server từ .env
npm run reset-db      # Reset schema SQL Server
npm run build         # Build NSIS installer → dist/
```

---

## userData Paths

App name: `qlqtbdxm` → userData tại `C:\Users\<user>\AppData\Roaming\qlqtbdxm\`

| File | Mô tả |
|---|---|
| `db-config.json` | SQL Server connection config, có trường `password` |
| `logs/` | electron-log output |
| `vehicle-images/` | Ảnh trang bị upload |
| `maintenance-files/` | File PDF kỹ thuật |

---

## Vấn Đề Đã Biết

- Session không có timeout — chưa có auto-logout
- Password trong `db-config.json` lưu plain text
- `cdnjs.cloudflare.com` trong CSP — một số tính năng cần mạng
