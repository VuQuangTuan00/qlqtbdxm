# Local Font Subset Fix Design

## Intent

Restore the uniform Vietnamese typography seen on branch `a` while keeping the renderer fully offline on branch `QTCN`.

## Constraints

- Keep the existing `font-family`, `font-size`, `font-weight`, `letter-spacing`, layout, CSP and business logic unchanged.
- Keep all runtime font requests local under `renderer/assets/fonts`.
- Correct only WOFF2 assets whose filename does not match its actual character coverage.

## Selected approach

Use the existing local subset architecture and swap the incorrectly named Vietnamese/Latin Extended asset pairs. This is smaller and safer than returning to Google Fonts or replacing the current typography system with new full-font files.

## Verification

- Inspect each WOFF2 cmap and weight metadata with FontTools.
- Require Vietnamese-named files to contain Vietnamese-specific glyphs and Latin-Extended-named files to contain representative Latin Extended glyphs.
- Run the renderer contract suite and confirm the pre-existing baseline failure does not increase.

