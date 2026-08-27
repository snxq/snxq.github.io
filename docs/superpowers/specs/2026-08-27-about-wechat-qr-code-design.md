# About 微信公众号二维码设计

## 背景

当前 `content:about` 使用结构化 Issue 字段管理个人资料，页面以双栏身份卡展示姓名、角色、简介、资料字段和链接。现有“关于我”Issue 包含“深夜旅行”微信公众号二维码，但 About 内容模型没有图片字段，且结构化 Bio 不支持 Markdown 图片或原始 HTML。

## 目标

- About 页面直接展示唯一的“深夜旅行”微信公众号二维码。
- 二维码由 `content:about` Issue 管理，更换图片不需要提交代码。
- 保持个人简介为页面主视觉，二维码作为资料和链接后的辅助信息卡。
- 字段可选，未配置时保持当前 About 页面行为。

## 非目标

- 不建设通用图片或多图模型。
- 不支持自定义公众号名称、类型、说明或 alt 文本。
- 图片不可点击，不提供下载、弹窗或放大交互。
- 不修改其他内容类型。

## 内容模型

Issue 输入仍使用远程源地址：

```markdown
### WeChat QR Code URL

https://github.com/user-attachments/assets/<uuid>
```

该 URL 只存在于构建期输入，不会发布到浏览器可读的 About JSON。内容构建成功后，规范化属性改为：

```js
wechatQrCodeUrl: '/generated/content/assets/wechat-qr.<sha256>.png' | null
```

约束：

- 字段可选；无值规范化为 `null`。
- 非空输入必须是 `https://github.com/user-attachments/assets/<uuid>`。
- 构建阶段下载并校验图片，再替换为严格同源 asset path。
- 浏览器只接受 `^/generated/content/assets/wechat-qr\.[a-f0-9]{64}\.png$`。

## 构建期图片物化

内容构建在写入不可变 JSON 前物化二维码：

1. 生产构建使用 `fetch(url, { redirect: 'manual' })` 下载；禁止默认自动跟随。每次响应显式读取 `Location`，校验下一跳为 HTTPS 且 host 属于允许的 GitHub 用户附件入口或 `github-production-user-asset-<字母或数字>.s3.amazonaws.com`，仅在剩余重定向次数大于 0 时继续，最多 3 次。
2. 输入 URL 必须严格满足：协议 `https:`、host `github.com`、pathname 为 `/user-attachments/assets/<uuid>`，其中 `<uuid>` 为标准小写或大写十六进制 UUID（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）；不得包含 query 或 fragment，拒绝额外路径段。
3. 只接受 `Content-Type: image/png`，最大 1 MiB，并同时检查 `Content-Length` 与实际流式字节数。
4. 校验 PNG 8 字节签名与 IHDR；要求正方形、边长 1–2048px。
5. 使用图片字节 SHA-256 命名 `assets/wechat-qr.<sha256>.png`。
6. 将 About 字段替换为同源路径，并重新计算 About JSON 与 manifest 的不可变 hash。
7. 下载、redirect、解析、MIME、大小、PNG 签名、尺寸、文件写入或最终 Schema 失败，均包装为关联 About Issue 的 `ContentValidationError`，包含 `issueNumber`、`title`、`field: WeChat QR Code URL` 和 `url`，以确保现有 report/comment 流程可用。

图片与 JSON 写入同一临时 `generated/content` 目录；所有校验成功后原子替换旧目录。生产图片请求不发送 `GITHUB_TOKEN` 或其他认证头。PR fixture 构建读取 `tests/fixtures/assets/wechat-qr.png`，不访问网络。

图片源输入与浏览器发布值使用两个独立合同，禁止用一个同时接受远程和同源值的 union：

- `aboutBuildSchema`：内容规范化中间态，只接受字段缺失、`null` 或严格 GitHub 用户附件 URL。
- `aboutSchema`：最终发布态，只接受字段缺失、`null` 或严格同源哈希路径。

`buildDocuments()` 的初次校验使用构建中间态合同；图片物化并替换 URL 后，必须使用发布态 `sectionDocumentSchema` 重新校验，之后才能写入临时目录。`site:check` 只使用发布态合同，因此远程 URL 永远不能成为合法部署产物。

`src/content-api.js` 继续原样透传 `section.data`。页面 renderer 使用 `data.wechatQrCodeUrl ?? null`，并只接受匹配 `^/generated/content/assets/wechat-qr\.[a-f0-9]{64}\.png$` 的路径；其他值不渲染。

PR fixture 构建通过显式参数读取本地图片，不访问网络：

```sh
node scripts/content/build-content.js \
  --source fixture \
  --fixtures tests/fixtures/issues \
  --asset-fixtures tests/fixtures/assets \
  --output generated/content \
  --repository fixture/content
```

`parseArguments()`、`buildContent()` 与 `content:build:fixture` npm script 均显式传递 `assetFixtures`。fixture 模式遇到非空二维码字段时，缺少 `--asset-fixtures`、目录或 `wechat-qr.png` 必须失败，不依赖当前工作目录，也不回退网络。

## 共享二维码资源模块

新增 `scripts/content/qr-asset.js`，集中提供并由内容构建与 `site:check` 复用：

- GitHub 用户附件输入 URL 和允许的 redirect host 校验。
- PNG MIME、1 MiB 限制、签名、IHDR、正方形及尺寸校验。
- SHA-256 文件名、同源路径生成与验证。
- 已写入 asset 文件的字节/hash/PNG 复验。

下载编排与 fixture 文件选择仍由内容构建负责；所有二进制及路径规则只有这一套实现。

## 页面展示

采用已确认的“A：信息卡片”布局：

- 位置：About 右栏中，资料列表和普通链接之后。
- 桌面端：横向卡片，左侧二维码，右侧固定说明。
- 二维码显示尺寸约 `112px × 112px`，保持正方形。
- 文案固定为：
  - 主标题：`深夜旅行`
  - 类型：`微信公众号`
  - 提示：`扫码关注`
- `alt` 固定为：`深夜旅行微信公众号二维码`。
- 图片不可点击，不包裹 `<a>`，不绑定 click handler。
- 使用 `loading="lazy"` 和 `decoding="async"`。
- 图片加载失败时隐藏整张二维码卡片，避免显示破损图标。

移动端：

- 默认保持横向卡片。
- 在窄屏空间不足时改为二维码在上、文字在下的居中纵向布局。
- 不改变现有 About 主双栏降为单栏的断点。

视觉风格复用站点现有 token：边框、暗色背景、mono 小字和 rust 强调色，不引入新色彩系统或组件抽象。

## 数据流

```text
content:about Issue
  → parser 读取 GitHub 用户附件 URL
  → normalizeIssue 校验输入 URL 形状
  → 生产下载 / PR 读取本地 PNG fixture
  → 校验 PNG 类型、大小、签名和尺寸
  → 哈希命名并写入 generated/content/assets
  → About JSON 替换为同源路径并完成最终 Schema 校验
  → content-api 加载
  → renderAbout 条件渲染二维码信息卡
```

## 错误处理

- URL 缺失：正常发布 `null`，不生成 asset，不显示二维码卡片。
- 输入 URL 不是规定的 GitHub 用户附件：内容构建失败。
- redirect、网络、MIME、大小、PNG 签名或尺寸不符合合同：内容构建失败并保留上一版输出。
- fixture 构建缺少本地二维码：fixture 内容构建失败，不回退到网络。
- 部署产物 About JSON 含远程 URL、asset 缺失或 hash 不符：`site:check` 失败。
- 客户端图片加载失败：隐藏二维码卡片，不影响其余 About 内容。
- 旧文档缺少新字段：客户端视为 `null`。

## 测试

扩展现有内容测试，并用实际浏览器完成页面行为验证：

自动测试：

- About 模板声明可选 `WeChat QR Code URL`。
- 输入只接受规定的 GitHub 用户附件 URL，拒绝其他 HTTPS host、HTTP 和无效 URL。
- 空字段输出 `null`。
- 生产下载允许规定的 GitHub → S3 HTTPS redirect，拒绝其他 host、HTTP、redirect 超限。
- 拒绝错误 MIME、超过 1 MiB、错误 PNG 签名、非正方形和超限尺寸。
- fixture 构建不访问网络，写出哈希命名 PNG。
- 下载失败不替换旧输出目录。
- 最终 About JSON 只含同源 asset path，并在替换后重新计算 JSON/manifest hash。
- `site:check` 拒绝远程 URL、缺失 asset、hash 不符或非法 PNG。
- 旧文档字段缺失仍可读取。

浏览器 smoke test：

- `<img src>` 是严格同源路径且图片成功加载。
- 二维码卡片不包含 `<a>`。
- `alt`、`loading`、`decoding` 与固定文案正确。
- 触发图片 `error` 后整张卡片隐藏。
- 无 URL 时不生成卡片。
- 桌面宽度下为横向卡片，窄屏下为居中纵向布局。

不引入 DOM、图片或 HTTP 测试框架；下载测试使用注入的 `fetch` test double。

最终验证：

```sh
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
```
