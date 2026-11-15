# 07 — UI Regression Test

Date: 2026-11-15

## Results

| Scenario | Result | Evidence |
|---|---|---|
| Login palette and button hover | PASS | hidden Electron test |
| Maintenance tabs fill available card width | PASS | hidden Electron test |
| Topbar uses `bg_hckt.png`, transparent base and no dark overlay | PASS | hidden Electron test |
| Desktop sizes 1259×751, 1366×768, 1600×900, 1920×1080 | PASS for maintained tabs/topbar fixture | `maintenance-layout.electron.test.js` |
| PDF thumbnails default open, canvas visible, upload loading, delete confirmation | PASS 3/3 | `pdf-preview.contract.test.js` |
| Current theme/route/icon/accessibility contracts | PASS 13/13 | `ui-theme.contract.test.js` |
| Async route rejection | PASS | awaited rejection produces a text-only error instead of an unhandled rejection |
| Toast/modal harmless HTML payload | PASS | hidden Electron test; zero injected `<img>` nodes |

## Fixes

- UI-001: router did not await asynchronous render functions, causing rejected renders to escape the error boundary. `navigate()` now awaits and reports errors safely; `refresh()` returns its Promise.
- UI-002: router inserted exception messages through `innerHTML`. It now uses `textContent`/text nodes.
- UI-003: equipment and plan action containers had malformed quote placement, which could corrupt the DOM and styles. Both templates are well formed and contract-tested.
- UI-004: toast titles/messages and modal titles/confirm/prompt/alert values created markup from untrusted strings. These values now use DOM properties and `textContent`.

## Scope limits

- The four-size runtime check covers the two components previously reported broken, not every route with real SQL data.
- Full keyboard traversal, screen-reader output, long localized strings and 10,000-row DOM rendering are NOT TESTED. Data tables paginate at 20 rows, so rendering 10,000 rows is not a supported normal path.
- Several page templates still use trusted HTML render callbacks. CSP prevents inline script execution, but a systematic typed-template migration remains a P2 hardening item.

