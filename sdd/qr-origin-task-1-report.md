# Task 1 report

## Status
已完成并提交 Task 1：同源 WeChat QR asset 校验、fixture 支持、原子写入与缺失 fixture 保护。

## Red/Green evidence
- 初始聚焦测试在 `qr-asset.js` 不存在时失败；依赖安装后新增 QR 测试按预期暴露缺失实现。
- `node --test tests/content/build-content.test.js tests/content/markdown.test.js`：27 passed。
- `npm test`：121 passed，0 failed。
- `npm run content:build:fixture`、`npm run site:build`、`npm run site:check`：全部通过。
- `git diff --check`：通过。

## Files
- `scripts/content/qr-asset.js`：URL、redirect、1 MiB streamed bytes、PNG signature/IHDR/dimension、hash path、fixture/network materialization。
- `scripts/content/build-content.js`：records 非枚举保留、asset materialization、fixture CLI option、同一 temporary directory 原子写 asset。
- `scripts/content/schema.js`：build-time About 仅允许严格 GitHub attachment URL；published About 仅允许 null/严格同源 hashed path。
- tests：覆盖 URL、redirect 上限/协议、MIME、声明/流式 1 MiB 上限、PNG signature/IHDR/dimension、无认证 header、fixture 缺失、下载/写入错误归因及旧输出保留。

## Deviations / concerns
- 资源文件落在 output/assets 下，而 JSON 路径为 `/generated/content/assets/...`，与部署根目录一致。
- `materializeContentAssets` 目前处理单个 About QR（当前 schema 也只有单例 About）；返回 asset 列表供原子 writer 使用。
- production source without fixture assets downloads validated URL; fixture source with non-empty QR and missing assets fails before replacement as `ContentValidationError`。

## Commit
`3094fc2c1c0f715c275789e370d0f0e77009edb1`（实现提交；报告哈希更新另有后续提交）
