# Blue Military UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every post-login Renderer screen into a cohesive blue military/technology UI while preserving login, typography, routes, permissions and business behavior.

**Architecture:** Add one `#app`-scoped theme stylesheet loaded after existing styles, then make targeted presentation-only changes to shell/component/page templates. A Node built-in contract test snapshots protected login/font/external-URL behavior and asserts the new UI structure.

**Tech Stack:** Electron Renderer, vanilla HTML/CSS/JavaScript, Node built-in `node:test` and `assert`.

**Spec:** `docs/superpowers/specs/2026-11-03-blue-military-ui-design.md`

## Global Constraints

- Modify only Renderer files plus documentation/tests under Renderer.
- Do not change login markup/style/behavior or any typography declaration/value.
- Do not modify `main/`, IPC, preload, services, repositories, database, migrations, authentication or role rules.
- Keep all five menus, routes, IDs and event-binding classes.
- Add no dependency, image, CDN or Internet URL; do not loosen CSP or modify image files.
- Use only inline/local SVG icons and preserve semantic danger/success/warning behavior.

## Review Focus

- Login fragment and login CSS remain byte-equivalent to the baseline contract.
- Existing typography declarations and external URL set remain unchanged.
- Every route/menu and role-based visibility condition remains available.
- Vehicle card supports mouse and Enter/Space without double navigation from action buttons.
- Layout remains usable at 1024×600 and low-height windows without hiding modal actions.

---

### Task 1: Renderer UI contract tests

**Files:**
- Create: `renderer/tests/ui-theme.contract.test.js`

**Interfaces:**
- Consumes: current `renderer/index.html`, CSS and JS files as protected baseline.
- Produces: `node --test renderer/tests/ui-theme.contract.test.js` contract covering protected and required UI behavior.

- [ ] Capture SHA-256 baselines for the login HTML fragment, pre-app `layout.css` region, typography declarations and external URLs.
- [ ] Add tests for five menu routes, protected IDs, role guards, scoped theme file, shell SVG markup, vehicle-card accessibility and responsive rules.
- [ ] Run the contract and verify RED only for the not-yet-created blue theme/markup requirements; protected baseline tests must already pass.

### Task 2: Scoped design tokens and app shell

**Files:**
- Create: `renderer/assets/css/app-theme.css`
- Modify: `renderer/index.html`

**Interfaces:**
- Consumes: asset choices and protected login/font contract from Task 1.
- Produces: `#app`-scoped blue tokens, sidebar/topbar/page shell, local SVG navigation/logout icons.

- [ ] Add the stylesheet link after `components.css` without changing CSP or font imports.
- [ ] Update only the app-shell markup: topbar brand, SVG icons, logout icon and remove `<Tarea>`.
- [ ] Implement sidebar/topbar/page background, CTA, form, focus, header, stat and common utility styles under `#app`.
- [ ] Run the contract and verify shell/theme tests GREEN while login/font/URL tests remain GREEN.

### Task 3: Vehicle card and keyboard behavior

**Files:**
- Modify: `renderer/pages/maintenance/maintenance-steps.js`
- Modify: `renderer/assets/css/app-theme.css`
- Test: `renderer/tests/ui-theme.contract.test.js`

**Interfaces:**
- Consumes: primary tokens and SVG visual language from Task 2.
- Produces: semantic `.vehicle-card` structure, fixed media ratio, title strip, stats/action rows and keyboard activation.

- [ ] Extend the contract with card structure, `tabindex`, role and Enter/Space assertions; verify RED.
- [ ] Replace presentation-only card template/hover JS with CSS classes and inline SVG; preserve admin guards and button listeners.
- [ ] Add keyboard navigation that ignores events from `.vc-actions` and interactive descendants.
- [ ] Run contract and `node --check` for the page; verify GREEN.

### Task 4: Shared components and remaining screens

**Files:**
- Modify: `renderer/assets/css/app-theme.css`
- Modify: `renderer/js/components/data-table.js`
- Modify: `renderer/js/components/modal.js`
- Modify: `renderer/js/components/pdf-preview-modal.js`
- Modify: presentation templates under `renderer/pages/`
- Test: `renderer/tests/ui-theme.contract.test.js`

**Interfaces:**
- Consumes: scoped tokens/classes from Task 2.
- Produces: blue DataTable, tabs, breadcrumb, modal sizes, toast, PDF toolbar, reports/settings/detail panels and page-header icons.

- [ ] Add contract assertions for modal size classes, PDF class-based toolbar, table keyboard semantics and absence of app-only legacy hard-coded colors; verify RED.
- [ ] Move priority PDF/card/report/detail presentation styles to named classes and theme all shared components.
- [ ] Add accessible sort/table row behavior without changing data loading/actions.
- [ ] Preserve IDs, API calls and role guards; run contract and `node --check` on all modified JS.

### Task 5: Responsive and accessibility pass

**Files:**
- Modify: `renderer/assets/css/app-theme.css`
- Modify: targeted Renderer templates only where ARIA/keyboard attributes are required.
- Test: `renderer/tests/ui-theme.contract.test.js`

**Interfaces:**
- Consumes: all themed components.
- Produces: ≤1199px and <700px behavior, content max-width, focus-visible, selectable data and scrollable settings tabs.

- [ ] Add contract assertions for required media queries, selectable content and focus-visible; verify RED.
- [ ] Implement responsive grid/form/detail/report/tab/modal rules and decorative SVG accessibility.
- [ ] Run the full contract and all Renderer JS syntax checks; verify GREEN.

### Task 6: Final regression and build verification

**Files:**
- Modify only if a verification finding requires a Renderer fix.

**Interfaces:**
- Consumes: completed Renderer theme.
- Produces: verification evidence and final changed-file/asset/token report.

- [ ] Compare protected login/font/url hashes against baseline.
- [ ] Verify no file under `main/` or `renderer/assets/images/` changed.
- [ ] Run `node --test renderer/tests/ui-theme.contract.test.js` and `node --check` for every Renderer JS file.
- [ ] Run build; if SQL Server/runtime prevents interactive validation, record the exact limitation.
- [ ] Review final diff for routes, IDs, role guards, CSP and business logic preservation.

