# Phân tích Migration — QLQT Bảo Dưỡng Xe Máy
## Chuyển hoàn toàn từ Dual-Mode (SQLite + SQL Server) sang SQL Server Only

**Branch:** demosqlite · **Tác giả:** VuQuangTuan00 · **Ngày:** 2026-07-15  
**Tổng kết:** 11 task hoàn thành · 7 file xóa · 10+ file sửa

---

## Mục tiêu Migration

Dự án ban đầu hỗ trợ hai chế độ database:
- **SQL Server** (`mode: "sqlserver"`) — production, kết nối server LAN
- **SQLite** (`mode: "sqlite"`) — demo, dùng `better-sqlite3` local để giới thiệu phần mềm mà không cần server

Migration này loại bỏ hoàn toàn SQLite và tất cả code liên quan.

**Lý do:**
- `better-sqlite3` cần native rebuild sau mỗi `npm install` → brittle build chain
- Hai SQL adapter riêng tăng surface area bug (dialect mismatch)
- `sync.service.js` copy 14 bảng từ SQL Server → SQLite: fragile, không nhất quán
- Deployment thực tế luôn cần SQL Server; demo mode không còn cần thiết

**Nguyên tắc giữ nguyên:** Repository layer viết PostgreSQL-style SQL (`$1`, `ILIKE`, `RETURNING *`). `mssql.js` tự động transform sang T-SQL lúc runtime. Interface `{ query(), connect() }` không đổi — toàn bộ repository không cần sửa.

---

## Hai Lỗi Runtime Đã Sửa (Trước Migration)

### Lỗi 1 — "Login failed for user 'qtcn'" khi khởi động

**Root cause:** `db-config.json` tại `AppData/Roaming/qlqtbdxm/` thiếu trường `password`. Khi người dùng lần đầu save config từ first-run overlay mà không nhập lại password, logic cũ `if (!cfg.password) delete cfg.password` xóa luôn trường này. mssql kết nối với `password: undefined` → SQL Server từ chối xác thực.

**Fix immediate:** Ghi trực tiếp `db-config.json` đúng với password.

**Fix permanent:** Thêm password-preservation logic vào `dbconfig:set` IPC handler:

```js
// db-config.ipc.js — nếu request không gửi password mới, giữ lại password cũ
if (!config.password && fs.existsSync(configPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (existing.password) config = { ...config, password: existing.password };
  } catch (_) {}
}
```

### Lỗi 2 — "No handler registered for 'auth:getSession'"

**Root cause:** `registerAllIpcHandlers()` nằm *bên trong* `try` block của `initDatabase()`. Khi DB kết nối thất bại, `catch` bắt lỗi và `registerAllIpcHandlers()` không bao giờ được gọi. Renderer vẫn load và gọi `auth:getSession` nhưng không có handler nào lắng nghe.

**Fix:** Di chuyển `registerAllIpcHandlers()` ra ngoài `try/catch`, gọi *sau* block đó.

```js
// main/index.js — BEFORE (buggy)
try {
  await initDatabase();
  registerAllIpcHandlers(); // KHÔNG chạy nếu DB lỗi
} catch (err) { dbError = err.message; }

// main/index.js — AFTER (fixed)
try {
  await initDatabase();
} catch (err) { dbError = err.message; }

registerAllIpcHandlers(); // Luôn chạy dù DB có lỗi hay không
```

---

## Danh Sách File Thay Đổi

### File sửa đổi
```
main/database/mssql.js              ← thêm CURRENT_DATE transform
main/database/index.js              ← rewrite: chỉ SQL Server, bỏ mode routing
main/index.js                       ← bỏ SQLite startup, fix registerAllIpcHandlers
main/ipc/db-config.ipc.js          ← bỏ dbconfig:getMode, thêm password preservation
main/ipc/index.js                   ← bỏ require('./sync.ipc')
main/preload.js                     ← bỏ 'dbconfig:getMode', 'sync:fromSqlServer' khỏi whitelist
main/services/vehicle.service.js    ← bỏ isDemo import, đơn giản hóa _storePath
renderer/js/first-run.js            ← rewrite: form SQL Server trực tiếp, bỏ mode cards
renderer/js/db-setup.js             ← đã SQL Server only từ trước (không thay đổi)
renderer/pages/settings/settings.js ← rewrite _loadDbConfigTab: bỏ mode cards, sync card
package.json                        ← bỏ better-sqlite3, postinstall, export-demo, demo-assets
CLAUDE.md                           ← cập nhật: single-mode SQL Server
```

### File bị xóa
```
main/database/sqlite.js             ← SQLite adapter (pg-compatible interface)
main/database/migrations-sqlite/    ← schema SQLite (folder)
main/ipc/sync.ipc.js                ← handler sync:fromSqlServer
main/services/sync.service.js       ← copy 14 bảng SQL Server → SQLite
main/utils/setup-demo-assets.js     ← copy demo.db + assets từ extraResources → userData
scripts/export-demo-db.js           ← xuất SQL Server → demo.db
scripts/seed-sqlite-runtime.js      ← seed dữ liệu mẫu vào SQLite lúc app chạy
```

---

## Chi Tiết Từng Task

### Task 1 — main/database/mssql.js: Thêm CURRENT_DATE transform

Repository dùng `CURRENT_DATE` (PostgreSQL-style). SQL Server không nhận token này.

```js
// mssql.js — _transformSql()
function _transformSql(s) {
  s = s.replace(/\$(\d+)/g, (_, n) => `@p${n}`);       // $1 → @p1
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  s = s.replace(/\bCURRENT_DATE\b/gi, 'CAST(GETDATE() AS DATE)'); // MỚI
  // ... các transform khác giữ nguyên
  return s;
}
```

**Nơi dùng:** `maintenance-plan.repository.js` trong `getOverdue()` so sánh ngày với `CURRENT_DATE`. Không cần sửa repository.

**Bảng transform đầy đủ sau task này:**

| PG-style | → T-SQL |
|---|---|
| `$1, $2` | `@p1, @p2` |
| `ILIKE` | `LIKE` |
| `CURRENT_DATE` | `CAST(GETDATE() AS DATE)` ← mới |
| `INSERT ... RETURNING *` | `INSERT ... OUTPUT INSERTED.* VALUES ...` |
| `UPDATE ... RETURNING *` | `UPDATE ... OUTPUT INSERTED.* WHERE ...` |
| `LIMIT n OFFSET m` | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| `LIMIT n` (không OFFSET) | `SELECT TOP n ...` |

---

### Task 2 — main/database/index.js: Bỏ mode routing

File gốc đọc `db-config.json`, kiểm tra `mode`, rồi gọi `initMssqlDatabase()` hoặc `initSqliteDatabase()`. Sau migration, file chỉ là thin re-export:

```js
// database/index.js — AFTER (toàn bộ file)
'use strict';
const { initMssqlDatabase, getMssqlDb,
        closeMssqlDatabase, getDbConfig } = require('./mssql');

async function initDatabase() { return await initMssqlDatabase(); }
function getDb()               { return getMssqlDb(); }
async function closeDatabase() { await closeMssqlDatabase(); }

module.exports = { initDatabase, getDb, closeDatabase, getDbConfig };
// Removed: getDbMode, isDemo, _mode variable
```

> **Chú ý:** `isDemo()` và `getDbMode()` không còn được export. Code nào import chúng sẽ nhận `undefined` (không throw), gây bug logic âm thầm. Đã grep và fix toàn bộ — xem Task 11.

---

### Task 3 — main/index.js: Đơn giản hóa startup

**Đã xóa:** `setupDemoAssets()`, `seedSqlite()`, `isDemo()`, `getDbMode()` imports và logic SQLite startup.

**Luồng khởi động hiện tại:**
```
app.whenReady()
  1. db-config.ipc.register()          ← trước DB (overlay setup hoạt động)
  2. db-config.json tồn tại?
     └─ KHÔNG → mainWindow + send 'app:first-run'
     └─ CÓ:
        try: await initDatabase()
        catch: dbError = err.message
        registerAllIpcHandlers()        ← LUÔN chạy, ngoài try block
        if dbError → send 'app:db-setup'
```

---

### Task 4 — main/ipc/db-config.ipc.js: Bỏ getMode, thêm password preservation

| Handler | Thay đổi |
|---|---|
| `dbconfig:getMode` | **XÓA** — không còn khái niệm "mode" |
| `dbconfig:get` | Giữ nguyên — trả về server/port/database/user (không password, không mode) |
| `dbconfig:set` | Luôn lưu với `mode: 'sqlserver'`; thêm password-preservation logic |
| `dbconfig:test` | Giữ nguyên — pool tạm, SELECT @@VERSION, trả về latency |

> **Bug phát hiện trong quá trình rewrite:** Draft trung gian có `const toSave = { mode:'sqlserver', ...config }; delete toSave.mode;` — set rồi xóa ngay. Đã phát hiện và sửa trước khi commit.

---

### Task 5 — main/ipc/index.js + main/preload.js: Xóa sync

```js
// main/ipc/index.js — xóa dòng:
require('./sync.ipc')  // ← XÓA

// main/preload.js — ALLOWED_INVOKE_CHANNELS — xóa:
'dbconfig:getMode',    // ← XÓA
'sync:fromSqlServer',  // ← XÓA
```

Preload whitelist là boundary bảo mật. Xóa kênh đã xóa handler là bắt buộc để CSP/security model nhất quán.

---

### Task 6 — renderer/js/first-run.js: Xóa mode selection

**Trước — 2 bước:**
```
[Card: Demo SQLite]  [Card: SQL Server Production]
→ Chọn SQL Server → Form nhập credentials
→ [Kiểm tra kết nối] [Kết nối & Khởi động]
```

**Sau — 1 bước:**
```
Form nhập server / port / database / user / password
→ [Kiểm tra kết nối] [Kết nối & Khởi động]
```

Cả hai nút gọi `window.electronAPI.invoke()` trực tiếp (không qua `api.js` wrapper vì overlay render trước khi SPA shell init).

---

### Task 7 — renderer/pages/settings/settings.js: Rewrite _loadDbConfigTab

Hàm `_loadDbConfigTab()` (lines 436–701 trong file gốc) chứa toàn bộ UI chọn mode và sync.

**Đã xóa:**
- `api.invoke('dbconfig:getMode')` — gọi đầu hàm
- Grid 2 card: `#mode-card-sqlite`, `#mode-card-sqlserver`
- Button `btn-apply-mode` và click handler
- Card đồng bộ `#sync-card` (chỉ hiện khi SQLite mode)
- `sync:fromSqlServer` invoke + toàn bộ sync UI handler
- `let selectedMode`, `_highlightMode()`

**Giữ lại:**
- Form: `db-server`, `db-port`, `db-name`, `db-user`, `db-password`
- `dbconfig:get` load config hiện tại vào form
- `btn-test-db` → `dbconfig:test`
- `btn-save-db` → `dbconfig:set` với confirmation modal
- `_getFormConfig()`, `_showResult()` helpers

---

### Task 8 — package.json: Gỡ dependencies và build config SQLite

| Trường | Xóa | Lý do |
|---|---|---|
| `dependencies` | `better-sqlite3: ^9.6.0` | Không còn SQLite adapter |
| `devDependencies` | `electron-rebuild: ^3.2.9` | Chỉ cần để rebuild better-sqlite3 |
| `scripts` | `postinstall`, `export-demo` | postinstall rebuild native module; export-demo xuất SQLite |
| `build.asarUnpack` | `node_modules/better-sqlite3/**/*` | Native module cần unpack từ asar |
| `build.extraResources` | `demo-assets/demo.db`, `vehicle-images`, `maintenance-files` | Demo data không còn đóng gói |
| `build.files` | `scripts/seed-sqlite-runtime.js` | Script seed SQLite lúc runtime |

---

### Task 9 — Xóa 7 file dead code

```
main/database/sqlite.js          — SQLite adapter (pg-compatible interface)
main/database/migrations-sqlite/ — schema SQLite (folder)
main/ipc/sync.ipc.js             — handler sync:fromSqlServer
main/services/sync.service.js    — copy 14 bảng SQL Server → SQLite
main/utils/setup-demo-assets.js  — copy demo.db + assets từ extraResources → userData
scripts/export-demo-db.js        — xuất SQL Server → demo.db
scripts/seed-sqlite-runtime.js   — seed dữ liệu mẫu vào SQLite lúc app chạy
```

`sync.service.js` là file phức tạp nhất: mở connection SQL Server thứ hai, đọc từng bảng theo thứ tự FK dependency (14 bảng), insert vào SQLite raw database theo thứ tự: `units → roles → vehicle_type → users → vehicle → equipments → ...`

---

### Task 10 — CLAUDE.md: Cập nhật tài liệu AI

| Phần | Thay đổi |
|---|---|
| Tech Stack | Bỏ hàng "DB Demo / better-sqlite3"; gộp thành một hàng DB → mssql ^11 |
| Kiến trúc 6 tầng | Cập nhật số module IPC (10→9), service (8→7); DB adapter → "mssql.js ← SQL Server" |
| Dual-Mode Database | Thay bằng section "Database" — single-mode, thêm CURRENT_DATE vào transformer table |
| IPC Handlers | Xóa sync.ipc.js; số module 10→8 |
| Renderer / first-run.js | "chọn SQLite Demo hoặc SQL Server" → "nhập credentials SQL Server" |
| Scripts | Xóa export-demo và workflow cập nhật demo data |
| userData Paths | Xóa hàng demo.db; cập nhật mô tả db-config.json |
| Vấn đề đã biết | Xóa CURRENT_DATE item (đã fix) |

---

### Task 11 — Grep cleanup: Phát hiện và sửa lỗi còn sót

Sau khi grep toàn repo với pattern `sqlite|better-sqlite3|isDemo|getDbMode|sync:fromSqlServer`, phát hiện **một lỗi nghiêm trọng còn sót:**

**`main/services/vehicle.service.js`** vẫn import `isDemo` từ `database/index` (line 10) và gọi `isDemo()` trong `_storePath()` (line 58). Vì `database/index` không còn export `isDemo`, giá trị là `undefined` → gọi `undefined()` → **TypeError crash** khi upload ảnh hoặc file PDF.

```js
// vehicle.service.js — BEFORE (bug)
const { getDb, isDemo } = require('../database/index'); // isDemo = undefined

function _storePath(absolutePath) {
  if (!absolutePath) return null;
  if (isDemo()) return path.relative(...)  // TypeError: isDemo is not a function
  return absolutePath;
}

// vehicle.service.js — AFTER (fixed)
const { getDb } = require('../database/index');

function _storePath(absolutePath) {
  return absolutePath || null; // Luôn lưu absolute path (SQL Server mode)
}
```

**Logic cũ của `_storePath`:** SQLite lưu *relative* path (để `demo.db` portable giữa máy), SQL Server lưu *absolute* path. Sau khi bỏ SQLite, luôn lưu absolute path là đúng.

**Tham chiếu còn lại (không cần sửa):**
- `package-lock.json` — stale, tự cập nhật khi chạy `npm install`
- `main/ipc/index.js` comment — comment thuần, không ảnh hưởng runtime

---

## Kiến Trúc Sau Migration

```
Renderer Process (Chromium)
  └─ contextBridge / preload.js       ← ~60 kênh invoke + 4 kênh on
       └─ IPC Handlers (main/ipc/)    ← 8 module (bỏ sync.ipc)
            └─ Service Layer          ← 7 service (bỏ sync.service)
                 └─ Repository Layer  ← 11 repo, SQL PG-style
                      └─ mssql.js     ← SQL Server duy nhất

Database Layer:
  main/database/
  ├── index.js          ← thin re-export từ mssql.js
  ├── mssql.js          ← adapter + SQL transformer (7 transform rules)
  └── migrations-mssql/ ← 001_schema.sql (T-SQL, GO separator)

Startup flow:
  app.whenReady()
    ├─ db-config.ipc.register()      ← không cần DB
    ├─ [db-config.json chưa tồn tại] → send 'app:first-run'
    └─ [db-config.json tồn tại]
         ├─ try: initDatabase() → SQL Server
         ├─ catch: dbError
         ├─ registerAllIpcHandlers()  ← LUÔN chạy
         └─ if dbError → send 'app:db-setup'
```

---

## Việc Cần Làm Tiếp

| Ưu tiên | Việc cần làm | Ghi chú |
|---|---|---|
| **HIGH** | `npm install` | Sync package-lock, gỡ better-sqlite3 khỏi node_modules |
| **HIGH** | Test upload ảnh / PDF | vehicle.service.js vừa sửa `_storePath` — verify path lưu đúng |
| **MED** | Test Settings → tab Cơ sở dữ liệu | `_loadDbConfigTab` đã rewrite |
| **MED** | Test first-run flow | Xóa db-config.json, chạy lại, xác nhận overlay SQL Server hiện đúng |
| **LOW** | Xóa `demo-assets/` folder | Nếu còn trong repo — không còn được đóng gói |
| **LOW** | Session timeout | Vấn đề đã biết, không liên quan migration này |

---

## Ràng Buộc Bảo Mật (Không Thay Đổi)

- **KHÔNG thêm inline event handler** (`onclick="..."`) — CSP chặn `unsafe-inline` trên `script-src`
- **KHÔNG import Google Fonts bằng thẻ `<link>`** — CSP không cho phép font CDN
- **KHÔNG sửa CSS variables** trong `variables.css` nếu không cần
- **KHÔNG sửa layout login screen**
- Mọi kênh IPC mới phải được thêm vào whitelist trong `main/preload.js`
- Luôn dùng `encrypt: true, trustServerCertificate: true` cho SQL Server
