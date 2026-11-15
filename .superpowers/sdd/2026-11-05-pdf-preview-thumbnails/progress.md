# SDD execution ledger

- Plan: `docs/superpowers/plans/2026-11-05-pdf-preview-thumbnails.md`
- Branch: `testCN`
- Workspace ruling: execute in the current checkout because the PDF work depends on the user's existing uncommitted UI changes. Do not create commits or overwrite unrelated changes.
- Baseline verification: `renderer/tests/ui-theme.contract.test.js` has 8 passing and 5 failing tests before this implementation. The failures cover protected CSS hashes, typography hashes, menu routes, theme-link ordering, and app-shell branding; they are unrelated to the PDF tasks and will not be changed here.
- Test ruling: add a focused `renderer/tests/pdf-preview.contract.test.js` suite so RED/GREEN results are isolated from the pre-existing UI contract failures.

## Task 1 - PDF canvas and page thumbnails

- Status: complete
- Preflight: the PDF document loads (page count and zoom are shown), but `.pdf-canvas { display: none; }` still wins after `canvas.style.display = ''`. The toolbar template also contains a literal `//` before the filename.
- Expected files: `renderer/tests/pdf-preview.contract.test.js`, `renderer/js/components/pdf-preview-modal.js`, `renderer/assets/css/app-theme.css`.
- RED: focused contract failed on the literal `//` and absent visible-canvas/thumbnail contract.
- GREEN: `node renderer/tests/pdf-preview.contract.test.js` passes 1/1.
- Result: canvas uses `.is-visible`; thumbnail panel is default-open, toggleable, and becomes a drawer at 900px and below.

## Task 2 - Upload loading state

- Status: complete
- Preflight: upload action is async but the reusable modal does not await it, disable buttons, expose `aria-busy`, or show a progress label.
- RED: focused contract failed because `loadingText`, pending-state behavior, and spinner styling were absent.
- GREEN: `node renderer/tests/pdf-preview.contract.test.js` passes 2/2.
- Result: upload displays `Đang tải lên…`, disables modal actions while pending, blocks duplicate submission, and restores the form after validation/API errors.

## Task 3 - Delete confirmation and viewer lifecycle

- Status: complete
- Preflight: the confirmation modal uses z-index 200 while the PDF viewer uses z-index 9999, so clicking `Xóa file` opens a confirmation that is hidden behind the viewer. The callback also does not report success to the viewer.
- RED: focused contract failed on hidden confirmation stacking, missing pending state, and missing callback result.
- GREEN: `node renderer/tests/pdf-preview.contract.test.js` passes 3/3.
- Result: the confirmation is displayed above the PDF, the delete button is locked while awaiting a result, cancel/error keeps the viewer open, and success closes it after refresh.

## Visual smoke test

- Launched the Electron app against the configured SQL Server and opened `Gioi_thieu_chung_BMK-T_1782352799376.pdf` (38 pages).
- Confirmed page 1 content renders visibly, all 38 thumbnails render, the panel is open by default, and the toggle hides it.
- Confirmed the delete dialog is visible above the PDF; selected `Hủy`, so no file or database data was deleted.
- Observation: the initial page and thumbnails were competing for rendering. Added a regression assertion and changed startup order to await the fitted main page before rendering thumbnails.

## Final verification

- Focused suite: 3/3 pass, 0 fail.
- JavaScript syntax checks: pass for `pdf-preview-modal.js`, `modal.js`, and `maintenance-steps.js`.
- `git diff --check`: pass.
- Existing broad UI contract remains at its unchanged baseline of 8 pass / 5 fail. These are pre-existing failures from the current uncommitted UI redesign and are outside the PDF scope.

