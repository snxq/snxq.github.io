# Task 1 report

## Status
已完成并提交 Task 1：同源 WeChat QR asset 校验、fixture 支持、原子写入与缺失 fixture 保护。

## Red/Green evidence
- 初始聚焦测试在 `qr-asset.js` 不存在时失败；依赖安装后新增 QR 测试按预期暴露缺失实现。
- `node --test tests/content/build-content.test.js --test-name-pattern='QR|About|atomic|fixture'`：15 passed。
- `npm test`：117 passed，0 failed。
- `npm run content:build:fixture`：成功，生成 `generated/content/assets/wechat-qr.e9cb421111e9a6dc2d1704884646f44044cf3874c60f09a86c3208739af3b2a6.png`；About JSON 仅含 `/generated/content/assets/...` 同源路径。
- `git diff --check`：通过。

## Files
- `scripts/content/qr-asset.js`：URL、redirect、1 MiB streamed bytes、PNG signature/IHDR/dimension、hash path、fixture/network materialization。
- `scripts/content/build-content.js`：records 非枚举保留、asset materialization、fixture CLI option、同一 temporary directory 原子写 asset。
- `scripts/content/schema.js`：允许生成的同源 hashed QR path。
- `package.json`：fixture build 使用 `--asset-fixtures`。
- tests/fixtures/assets/wechat-qr.png：73-byte deterministic valid 2x2 PNG。
- tests：URL/redirect/bad response/materialization、fixture asset requirement、atomic output updates。

## Deviations / concerns
- 资源文件落在 output/assets 下，而 JSON 路径为 `/generated/content/assets/...`，与部署根目录一致。
- `materializeContentAssets` 目前处理单个 About QR（当前 schema 也只有单例 About）；返回 asset 列表供原子 writer 使用。
- production source without fixture assets downloads validated URL; fixture source with non-empty QR and missing assets fails before replacement as `ContentValidationError`。

## Commit
`c3f72c59c0af07de6166e19d21299d915afdcd6f`
