# Same-origin QR Task 3 Report

## Changes

- `src/app.js` now accepts only `/generated/content/assets/wechat-qr.<64 lowercase hex>.png` for the About QR card.
- Existing copy, accessibility attributes, non-clickable structure, image-error hiding, and responsive styles remain unchanged.

## Automated verification

- `npm test`: 126 passed, 0 failed.
- `npm run content:build:fixture`: passed.
- `npm run site:build`: passed.
- `npm run site:check`: passed.
- `git diff --check`: passed.

## Browser smoke verification

Against `http://localhost:4173` with fixture content:

- QR image resolved to same origin: `http://localhost:4173/generated/content/assets/wechat-qr.e9cb421111e9a6dc2d1704884646f44044cf3874c60f09a86c3208739af3b2a6.png`.
- Path matched the strict hashed asset contract.
- Card anchor count: 0.
- Attributes: `alt="深夜旅行微信公众号二维码"`, `loading="lazy"`, `decoding="async"`.
- Fixed copy: `深夜旅行 / 微信公众号 / 扫码关注`.
- Desktop 1280px: row layout, QR 112×112, no horizontal overflow.
- Mobile 390px: column/center layout, no horizontal overflow.
- Dispatched image `error`: card became hidden and computed display was `none`.

## Commits

- Renderer implementation in parent branch: `86e3fcc`.

## Self-review

The change is limited to the URL trust boundary. It cannot render or request arbitrary HTTPS URLs, and preserves all previously approved card behavior.

## Concerns

None.
