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

在 `.github/ISSUE_TEMPLATE/content-about.yml` 增加可选输入字段：

```yaml
- type: input
  id: wechat-qr-code-url
  attributes:
    label: WeChat QR Code URL
    description: HTTPS image URL for the 深夜旅行 official account QR code.
```

在 About 的结构化正文中对应：

```markdown
### WeChat QR Code URL

https://github.com/user-attachments/assets/4918d2e9-b5ae-44ce-b91c-4c0661e3e481
```

将 `WeChat QR Code URL` 加入 About 的允许字段，并规范化为：

```js
{
  // existing fields
  wechatQrCodeUrl: 'https://...'
}
```

约束：

- 字段可选；空值规范化为 `null`。
- 非空时必须是有效的 HTTPS URL。
- 继续使用现有 URL 校验函数与图片 URL 协议约束，不增加依赖。
- About 仍然只能存在一个已发布实例。

## Schema 与客户端契约

About Schema 增加：

```js
wechatQrCodeUrl: imageUrlSchema.nullable().optional()
```

新生成文档始终输出 `wechatQrCodeUrl: null | HTTPS URL`；Schema 的 `optional()` 仅用于兼容旧缓存或旧生成文档。`src/content-api.js` 继续原样透传 `section.data`，不增加额外规范化。页面 renderer 使用 `data.wechatQrCodeUrl ?? null`，只在值非空时创建二维码卡片。

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
  → content parser 读取 WeChat QR Code URL
  → normalizeIssue 校验 HTTPS 并输出 wechatQrCodeUrl
  → Zod about schema 校验
  → generated/content/about.<hash>.json
  → content-api 加载
  → renderAbout 条件渲染二维码信息卡
```

## 错误处理

- URL 缺失：正常发布，不显示二维码卡片。
- URL 非法或非 HTTPS：内容构建失败，沿用现有 validation report 与 Issue 评论机制。
- 客户端图片加载失败：隐藏二维码卡片，不影响其余 About 内容。
- 文档缺少新字段：客户端视为 `null`，避免旧缓存/旧 fixture 导致 About 不可用。

## 测试

扩展现有内容测试，并用实际浏览器完成页面行为验证：

自动测试：

- About 模板声明可选 `WeChat QR Code URL`。
- 有效 HTTPS 图片 URL 正确规范化。
- 空字段输出 `null`。
- HTTP、无效 URL 被内容校验拒绝。
- About Zod Schema 接受缺失、`null` 或 HTTPS URL，拒绝不安全 URL。

浏览器 smoke test：

- 有 URL 时生成二维码卡片，图片不位于 `<a>` 内。
- `alt`、`loading`、`decoding` 与固定文案正确。
- 触发图片 `error` 后整张卡片隐藏。
- 无 URL 时不生成卡片。
- 桌面宽度下为横向卡片，窄屏下为居中纵向布局。

不为这个小功能引入 DOM 测试框架或额外测试依赖。

最终验证：

```sh
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
```
