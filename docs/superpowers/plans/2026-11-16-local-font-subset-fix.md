# Local Font Subset Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the offline Oswald and Barlow subset mapping so Vietnamese text renders with one consistent font.

**Architecture:** Preserve the current `@font-face` declarations and CSS typography. Correct the binary asset-to-filename mapping for the confirmed swapped Vietnamese and Latin Extended pairs.

**Tech Stack:** Electron, CSS `@font-face`, WOFF2, FontTools metadata audit, Node test runner

**Spec:** `docs/superpowers/specs/2026-11-16-local-font-subset-fix-design.md`

## Global Constraints

- Do not change typography declarations, layout, CSP or business logic.
- Keep runtime font loading offline and self-hosted.
- Do not modify the already-correct Barlow 400 subset pair.

## Review Focus

- Vietnamese glyphs must resolve from the Vietnamese subset at weights 300, 400, 500 and 600.
- Latin Extended glyphs must resolve from the Latin Extended subset at the same weights.
- Oswald variable subsets must retain the declared 400-700 weight axis.
- Renderer external-URL and typography contracts must remain unchanged.
- The existing unrelated login/body CSS hash failure must not be counted as a regression.

---

### Task 1: Correct local subset asset mapping

**Files:**
- Modify: `renderer/assets/fonts/oswald-latin-ext-variable.woff2`
- Modify: `renderer/assets/fonts/oswald-vietnamese-variable.woff2`
- Modify: `renderer/assets/fonts/barlow-latin-ext-300-normal.woff2`
- Modify: `renderer/assets/fonts/barlow-vietnamese-300-normal.woff2`
- Modify: `renderer/assets/fonts/barlow-latin-ext-500-normal.woff2`
- Modify: `renderer/assets/fonts/barlow-vietnamese-500-normal.woff2`
- Modify: `renderer/assets/fonts/barlow-latin-ext-600-normal.woff2`
- Modify: `renderer/assets/fonts/barlow-vietnamese-600-normal.woff2`

**Interfaces:**
- Consumes: Existing `@font-face` source paths and `unicode-range` declarations in `renderer/assets/css/layout.css`.
- Produces: WOFF2 files whose cmap coverage matches their filename and CSS range.

- [x] **Step 1: Run the font metadata contract and confirm RED**

Use FontTools to assert representative Vietnamese and Latin Extended glyph coverage for every named subset. Expected: fail for Oswald and Barlow 300/500/600.

- [x] **Step 2: Swap only the confirmed mismatched binary pairs**

Use temporary names so no font data is overwritten. Leave Barlow 400 untouched.

- [x] **Step 3: Run the font metadata contract and confirm GREEN**

Expected: all subset filenames match their cmap coverage and declared weights.

- [x] **Step 4: Run renderer regression verification**

Run: `node renderer/tests/ui-theme.contract.test.js`

Expected: 12 pass, the same one pre-existing login/body CSS hash failure, and no new font, CSP or external-URL failure.

