# Topbar Background Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngăn ảnh nền topbar phóng vượt kích thước gốc trên màn hình rộng nhưng vẫn cho phép thu nhỏ trên màn hình hẹp.

**Architecture:** Ghi đè giá trị `background-size: cover` từ stylesheet nền bằng một khai báo cụ thể hơn trong `app-theme.css`. Không thay đổi HTML, JavaScript, ảnh hoặc kích thước topbar.

**Tech Stack:** CSS, Electron renderer, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-17-topbar-background-size-design.md`

## Global Constraints

- Chỉ chỉnh CSS của `#app #topbar` trong `renderer/assets/css/app-theme.css`.
- Dùng chính xác `background-size: min(2172px, 100%) auto`.
- Giữ `background-position: right center`, `background-repeat: no-repeat` và toàn bộ bố cục hiện tại.
- Không thay đổi HTML, JavaScript, ảnh hoặc nghiệp vụ.

## Review Focus

- Màn hình rộng hơn ảnh gốc: background không vượt `2172px`.
- Màn hình hẹp: background thu theo `100%` và không gây tràn.
- Các media query chỉ đổi chiều cao topbar, không ghi đè `background-size`.
- Rule `cover` cũ trong `layout.css` không còn thắng computed style.
- Topbar vẫn dùng `bg_hckt.png`, bám phải và không lặp.

---

### Task 1: Giới hạn kích thước background topbar

**Files:**
- Modify: `renderer/assets/css/app-theme.css:243-256`
- Modify: `renderer/tests/maintenance-layout.electron.test.js`

**Interfaces:**
- Consumes: CSS cascade hiện tại giữa `layout.css` và `app-theme.css`.
- Produces: computed `background-size` tương ứng `min(2172px, 100%) auto` trên topbar.

- [x] **Step 1: Viết test thất bại** xác nhận computed style không còn là `cover`, ảnh vẫn là `bg_hckt.png`, vị trí là `100% 50%`, không lặp và kích thước nền không vượt chiều rộng ảnh gốc trên các viewport từ 1259×751 đến 2560×1440.
- [x] **Step 2: Chạy test UI topbar** bằng Electron runner; test đã FAIL vì computed `background-size` là `cover`.
- [x] **Step 3: Thêm** `background-size: min(2172px, 100%) auto;` vào rule `#app #topbar` trong `app-theme.css`, không sửa khai báo sản phẩm khác.
- [x] **Step 4: Chạy lại test UI topbar**; PASS ở cả năm viewport, kể cả mô phỏng 2560px trên màn hình vật lý bị clamp ở 1904px.
- [x] **Step 5: Chạy** `npm test` và `git diff --check`; 138/138 test PASS và không có whitespace error.
- [x] **Step 6: Không commit** vì người dùng chưa yêu cầu tạo commit.
