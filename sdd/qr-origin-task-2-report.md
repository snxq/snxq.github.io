# Same-Origin QR Task 2 Report

## Status

DONE

## Changes

- `scripts/check-static-site.js`
  - Reuses `validateAssetPath()` and `validatePng()` from `qr-asset.js`.
  - Retains the parsed, published About document after canonical section validation.
  - Requires the referenced QR asset to exist under `dist/generated/content/assets`.
  - Verifies the file bytes match the SHA-256 in the published path and satisfy the shared PNG contract.
- `tests/content/build-site.test.js`
  - Adds missing-asset and hash-mismatch rejection coverage.

Task 1 had already implemented and tested separate build/published About schemas, so Task 2 did not duplicate those changes.

## TDD evidence

- Initial Task 2 red: static-site missing-asset/hash-mismatch cases failed because `checkStaticSite()` only validated section JSON.
- Review red coverage gap: added a malformed byte payload under its correct SHA-256 filename and consistently rewrote the About section hash plus manifest reference. This ensures `validateAssetPath()` passes before `validatePng()` rejects the asset.
- Green: focused and full test commands passed without changing implementation for the review fix.

## Verification

- `node --test tests/content/build-site.test.js --test-name-pattern='invalid About QR asset'`: 37 passed, 0 failed.
- `npm test`: 126 passed, 0 failed.
- `npm run content:build:fixture`: passed, exit 0.
- `npm run site:build`: passed, exit 0.
- `npm run site:check`: passed, exit 0.
- `git diff --check`: passed, exit 0.

## Commits

- `81ffdf9` — `test: enforce same-origin QR assets`
- `be710d1` — `test: cover malformed published QR PNG`

## Self-review

- No new dependency or duplicate PNG/path rule was introduced.
- Remote URLs are already rejected by the published Schema before asset validation.
- Asset resolution removes the leading slash and stays beneath the static output root because the published Schema strictly constrains the path.

## Concerns

None.
