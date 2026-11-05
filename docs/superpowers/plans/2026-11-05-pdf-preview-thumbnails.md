# PDF Preview Thumbnails and Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rendered PDF content visible, add a default-open responsive thumbnail panel, show upload progress and make PDF file deletion confirm and complete correctly.

**Architecture:** Keep the existing `pdfPreview.open(...)` API and pdf.js integration. Extend the current overlay with a responsive body/sidebar, use CSS state classes for visibility, enhance the existing modal button descriptor with opt-in async loading, and make the delete callback return a success boolean.

**Tech Stack:** Electron Renderer, vanilla HTML/CSS/JavaScript, pdf.js 3.11.174, Node built-in `node:test` contract tests.

**Spec:** `docs/superpowers/specs/2026-11-05-pdf-thumbnail-preview-design.md`

## Global Constraints

- Do not change IPC handlers, database, file storage paths, authentication or permissions.
- Do not add dependencies, CDN URLs or relax CSP.
- Preserve the existing `pdfPreview.open({ title, subtitle, base64, fileName, onDelete, onOpenExternal })` interface.
- Preserve download, external-open, zoom, fit and page navigation behavior.
- Do not overwrite unrelated dirty-worktree changes in shared CSS, images or other screens.

## Review Focus

- A successfully rendered first page must become visible even though the canvas starts hidden.
- A long PDF must not block the UI while all thumbnails render.
- Closing the viewer during thumbnail rendering must stop safe DOM updates.
- Upload failure must restore buttons and allow retry; repeated clicks while pending must not invoke IPC twice.
- Delete cancel/failure must keep the viewer open; delete success must close it and refresh the underlying page.

---

### Task 1: Visible PDF canvas and responsive thumbnail navigation

**Files:**
- Modify: `renderer/tests/ui-theme.contract.test.js`
- Modify: `renderer/js/components/pdf-preview-modal.js`
- Modify: `renderer/assets/css/app-theme.css`

**Interfaces:**
- Consumes: existing `pdfPreview.open(...)`, pdf.js `PDFDocumentProxy` and `PDFPageProxy`.
- Produces: `renderPage(pageNumber)`, `renderThumbnails()`, `setThumbnailPanelOpen(open)` and CSS states `.is-visible`, `.is-open`, `.is-active`.

- [ ] Add failing contract assertions for `#pdf-toggle-thumbnails`, `.pdf-viewer-body`, `.pdf-thumbnail-panel`, default `aria-expanded="true"`, `.pdf-canvas.is-visible`, active thumbnails, responsive drawer and absence of `canvas.style.display`.
- [ ] Run `node renderer/tests/ui-theme.contract.test.js`; expect the new thumbnail/canvas test to fail while prior tests remain green.
- [ ] Implement the toolbar toggle, default-open panel/body markup, thumbnail buttons and active-page synchronization in `pdf-preview-modal.js`.
- [ ] Render thumbnail canvases sequentially at a small scale, yielding between pages and aborting DOM updates after close.
- [ ] Replace inline canvas visibility with `.is-visible`; remove the accidental toolbar `//` text and restore the file name.
- [ ] Add desktop sidebar and `max-width: 900px` drawer CSS without adding any external resource.
- [ ] Run the contract and `node --check renderer/js/components/pdf-preview-modal.js`; expect green.

### Task 2: Opt-in async modal loading for PDF upload

**Files:**
- Modify: `renderer/tests/ui-theme.contract.test.js`
- Modify: `renderer/js/components/modal.js`
- Modify: `renderer/pages/maintenance/maintenance-steps.js`
- Modify: `renderer/assets/css/app-theme.css`

**Interfaces:**
- Consumes: modal button descriptor `{ label, class, action }`.
- Produces: optional `loadingText` descriptor field; while its Promise is pending, the modal is `aria-busy`, all footer buttons are disabled and the action button shows a spinner.

- [ ] Add a failing contract assertion for `loadingText: 'Đang tải lên…'`, an async pending guard and modal loading classes/ARIA.
- [ ] Run the contract; expect only the upload-loading test to fail.
- [ ] Extend modal button handling so only descriptors with `loadingText` use async busy state; restore state on rejection/failure if the modal remains connected.
- [ ] Set `loadingText: 'Đang tải lên…'` on the upload action and preserve its existing validation, IPC payload, toast, close and refresh behavior.
- [ ] Add spinner/loading CSS and run the full contract plus syntax checks for `modal.js` and `maintenance-steps.js`; expect green.

### Task 3: PDF delete confirmation and lifecycle

**Files:**
- Modify: `renderer/tests/ui-theme.contract.test.js`
- Modify: `renderer/js/components/pdf-preview-modal.js`
- Modify: `renderer/pages/maintenance/maintenance-steps.js`
- Modify: `renderer/assets/css/app-theme.css`

**Interfaces:**
- Consumes: `onDelete(): Promise<boolean>` from the maintenance page.
- Produces: delete button pending state; `true` closes the viewer, `false` keeps it open; `body.pdf-preview-open` raises only confirmation modals above the viewer.

- [ ] Add failing contract assertions for the body lifecycle class, scoped modal z-index, boolean delete callback and close-on-success branch.
- [ ] Run the contract; expect only the delete lifecycle test to fail.
- [ ] Add/remove `pdf-preview-open` in `open()`/`close()`, make close idempotent and keep keyboard listener cleanup.
- [ ] Disable and mark the delete button busy while awaiting `onDelete()`; close only when it resolves `true`, restore on cancel/failure.
- [ ] Return `false` on cancel/error and `true` after successful `engineMaintenance:deleteFile`; keep role guard and refresh behavior unchanged.
- [ ] Run the full contract, all Renderer JavaScript syntax checks and `git diff --check`; expect green.
- [ ] Run `npm run build`; expect exit code 0 or record an environment-only packaging limitation.
