# 08 — Offline Operation and CSP Test

Date: 2026-11-15

## Changes

- Removed the Google Fonts `@import` and vendored Oswald 400–700 variable WOFF2 plus Barlow 300/400/500/600 WOFF2.
- Included Vietnamese, Latin Extended and Latin subsets and the two OFL license files.
- Vendored PDF.js and worker version 3.11.174 with its Apache-2.0 license.
- Changed the PDF loader to local relative URLs.
- Reduced CSP to local runtime sources: `script-src 'self'`, `font-src 'self'`, local/blob workers, no objects, and no remote connection origin. `style-src 'unsafe-inline'` remains because the existing UI contains many inline style attributes; removing it would break current layout.

## Evidence

| Check | Result |
|---|---|
| Runtime HTML/CSS/JS has no `http://` or `https://` asset dependency | PASS |
| All referenced WOFF2 files exist and begin with `wOF2` | PASS |
| PDF.js API and worker both identify as 3.11.174 | PASS |
| Hidden Electron loads local PDF.js, starts local worker and renders a one-page PDF | PASS |
| CSP/refused-load console messages during PDF test | PASS — none captured |
| PDF viewer static contracts | PASS 3/3 |

The offline-equivalent test does not disable the Windows network adapter; it proves the exercised path references only packaged local files and renders without any remote origin.

