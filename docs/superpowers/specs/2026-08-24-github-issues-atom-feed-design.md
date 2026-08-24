# GitHub Issues Atom Feed 设计（静态内容流水线）

## 背景

当前站点是原生静态站点。GitHub Actions 将 GitHub Issues 经过信任、状态、标签、draft、Markdown 和 Schema 校验后，规范化为 `generated/content` 中的不可变 JSON，再由 `scripts/build-site.js` 复制到 `dist` 并部署 GitHub Pages。

博客文章属于 `content:post`，页面消费规范化后的 Posts JSON，而不是在浏览器中直接请求 GitHub。Feed 必须复用这一发布合同，不能另建一套 Issue 查询、过滤或 Markdown 解析逻辑。

## 目标

- 提供 Atom 1.0 Feed：`https://blog.snxq.cc/feed.xml`。
- Feed 只包含内容流水线已发布的 Posts。
- 每个 Entry 包含文章完整 HTML 正文。
- Issue 新增、编辑、删除、关闭、重新打开或标签变化后自动更新并部署 Feed。
- PR 使用现有 fixture 内容，生产部署使用认证后的真实 Issue 内容。
- 不增加运行时、Feed、XML 或 Markdown 依赖。

## 非目标

- 不生成 RSS 2.0、sitemap 或 robots.txt。
- 不再次请求 GitHub Issues。
- 不支持正文中的隐藏日期覆盖；文章日期继续来自 Issue `created_at`。
- 不增加文章静态 permalink 或客户端深链路由。
- 不修改现有内容发布、信任或 Markdown 合同。

## 内容来源与一致性

Feed 从构建前已生成并通过 Zod 校验的 Posts 文档读取数据：

1. 读取 `generated/content/manifest.json` 并用现有 `manifestSchema` 校验。
2. 要求 `manifest.files.posts` 严格匹配 `^posts\.[a-f0-9]{64}\.json$`，只允许读取 `contentDirectory` 的直属文件，拒绝绝对路径、路径分隔符和 traversal。
3. 读取 Posts 文件原始字节，校验 SHA-256 与文件名中的 hash 完全一致。
4. 用现有 `sectionDocumentSchema` 校验文档，并明确断言 `document.section === 'posts'`。
5. 使用 `posts.data.items` 生成 Atom Feed。

因此 Feed 自动继承现有规则：

- Issue 必须为 `open`。
- 恰好带一个支持的 `content:*` 标签，文章标签为 `content:post`。
- 不带 `draft`。
- 作者关联为 `OWNER`、`MEMBER` 或 `COLLABORATOR`。
- Markdown 必须满足现有安全子集，原始 HTML 和不安全 URL 会在内容构建阶段被拒绝。
- 发布时间来自 `created_at` 规范化后的 `post.date`。

PR 继续执行 `content:build:fixture`，生产事件继续执行 `content:build`。Feed 只消费二者产出的相同文档格式，因此不需要额外 token、fixture 分支或网络逻辑。

## 构建集成

新增 `scripts/build-feed.js`，提供：

```js
export async function buildAtomFeed({ contentDirectory, outputPath })
```

职责：

- 加载并校验 manifest 与 Posts 文档。
- 将 Posts rich blocks 转成完整 HTML。
- 生成 Atom XML。
- 写入指定 `outputPath`。

修改 `scripts/build-site.js`：

1. 清空输出目录。
2. 复制现有 deployable paths。
3. 调用 `buildAtomFeed`，从复制后的 `dist/generated/content` 读取内容并写入 `dist/feed.xml`。

Feed 直接生成到已忽略的 `dist`，不创建或提交源目录产物，也不需要修改 `.gitignore`。

## Rich Blocks 转 HTML

不能复用依赖浏览器 `document` 的页面 DOM renderer。Feed 模块实现一个只覆盖现有 Schema 的纯字符串序列化器。

Block 映射：

- `heading` → `<h2>` 至 `<h4>`
- `paragraph` → `<p>`
- `quote` → `<blockquote>`
- `code` → `<pre><code>`，有语言时增加 `class="language-{language}"`
- `list` → `<ol>` / `<ul>`；有 `start` 时写入 `<ol start="…">`
- `table` → 第一行为 `<thead>`，其余行为 `<tbody>`；使用已有 `align` 写入 `style="text-align: …"`
- `image` → `<img src="…" alt="…">`，有标题时增加 `title`
- `divider` → `<hr>`

Inline 映射：

- `text` → 文本
- `emphasis` → `<em>`
- `strong` → `<strong>`
- `delete` → `<del>`
- `inlineCode` → `<code>`
- `link` → `<a href="…">`

所有 HTML 文本与属性先按 HTML 规则转义；完整 HTML 嵌入 `<content type="html">` 时再按 XML 文本规则转义。输入已经过严格 Schema 和 URL 协议校验，但输出仍必须正确转义。

## Atom 数据映射

Feed：

- `id`：`https://blog.snxq.cc/feed.xml`
- `title`：`snxq.cc posts`
- 普通链接：`https://blog.snxq.cc/`
- `link rel="self"`：`https://blog.snxq.cc/feed.xml`
- `author`：`snxq`
- `updated`：Posts 文档的 `updatedAt`

Entry：

- `id`：`post.source.issueUrl`
- `link`：`post.source.issueUrl`
- `title`：`post.title`
- `published`：`${post.date}T00:00:00Z`
- `updated`：`post.source.updatedAt`
- `content type="html"`：`post.detail` 的完整 HTML

当前站点没有文章 permalink；Entry 使用可直接访问且稳定的 GitHub Issue URL，避免生成无效站内链接。

Posts 已由内容流水线确定性排序；Feed 保持其顺序。

空 Posts 集合仍生成合法 Atom Feed，`updated` 使用 Posts 文档的 `updatedAt`。

## Feed 发现

在 `index.html` 的 `<head>` 中添加：

```html
<link rel="alternate" type="application/atom+xml" title="snxq.cc posts" href="feed.xml">
```

使用相对地址以匹配当前站点其他静态资源风格。

## 静态检查

修改 `scripts/check-static-site.js`：

- 将 `feed.xml` 加入 required paths。
- 读取 Feed 并检查：
  - XML 声明。
  - Atom namespace 根元素。
  - 正确的 self link。
  - 每个 Entry 具有 `id`、Issue URL link、RFC 3339 `published` / `updated` 和 HTML content。

项目不增加 XML parser 依赖；构建器完全控制输出，检查器使用明确的字符串/正则契约即可。内容生成逻辑的字段与转义正确性由单元测试覆盖。

## GitHub Actions

保留现有 `.github/workflows/content-deploy.yml` 架构、权限、PR fixture、生产 token、校验评论和 Pages 部署，仅把 Issue `deleted` 事件加入触发类型：

```yaml
issues:
  types: [opened, edited, deleted, closed, reopened, labeled, unlabeled]
```

删除 Issue 后，下一次内容构建从全量 Issue 集合重新生成 Posts 和 Feed，被删除文章自然消失。

## 测试

扩展现有 `tests/content/build-site.test.js`，使用当前 fixture 内容完成确定性覆盖：

- `buildStaticSite` 生成 `feed.xml`，输出根目录白名单包含该文件。
- Feed 只包含规范化 Posts 文档中的文章，不包含其他内容类型。
- Entry 使用 Issue URL、合法 RFC 3339 日期和完整 HTML。
- rich block 与 inline 类型均映射为预期 HTML。
- 文本、代码、URL、alt、title 等特殊字符正确转义。
- 空 Posts 文档生成合法空 Feed。
- manifest 中的 Posts 文件名路径穿越、错误 immutable 名称、hash 不符或文件 section 不是 `posts` 时，Feed 构建失败。
- `checkStaticSite` 在 Feed 缺失或契约错误时失败。
- `index.html` 包含 Atom discovery link。

最终运行：

```sh
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
```

## 风险与处理

- **Feed 与页面内容漂移**：只消费同一规范化 Posts 文档，不重复过滤和 Markdown 解析。
- **输出注入或 XML 损坏**：HTML 层和 XML 层分别转义，并覆盖特殊字符测试。
- **无站内文章 permalink**：使用有效的 GitHub Issue URL；未来增加 permalink 时再单独迁移 Entry link，稳定 `id` 可继续保持 Issue URL。
- **Issue 删除后 Feed 未更新**：补充 `deleted` Action 事件，全量内容构建自然移除条目。
