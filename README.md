# snxq.cc

`snxq.cc` 是一个静态发布的个人 “signal archive”。访客通过命令入口浏览 profile、projects、posts、notes、now、bookmarks、uses、life 和 opensource 内容；浏览器只加载同源静态资源，不访问 GitHub API。

## 本地启动

```bash
npm ci
npm run content:build:fixture
npm run serve
```

打开 <http://localhost:4173/>。`content:build:fixture` 只使用 `tests/fixtures/issues/` 中的测试 fixture，适合本地开发和 Pull Request 验证；它不是发布内容来源。

## 内容发布规则

正式内容由仓库的 GitHub Issues 管理：

1. 文章使用经典模板 `.github/ISSUE_TEMPLATE/content-post.md` 创建：模板只有 front matter，编辑区正文为空，Issue 标题就是文章标题，完整可读 Markdown body 不会被注入 `### Body` 或其他说明；其他内容类型继续使用各自的结构化 Issue Form。
2. 保留模板自动添加的唯一 `content:*` 标签；仅 open、带一个受支持内容标签、没有 `draft` 标签且作者身份为 `OWNER`、`MEMBER` 或 `COLLABORATOR` 的 Issue 会发布。来自 `NONE`、`CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR`、`FIRST_TIMER` 或 `MANNEQUIN` 的内容会被忽略。
3. `content:post` 的发布模型固定为：`id` 是 `issue-<number>`，日期取 Issue `created_at` 的 UTC 日历日期，更新来源取 `updated_at`，正文使用完整 Issue body；摘要按文档顺序递归查找顶层、引用或列表中的首个非空文本段落并折叠空白、约 160 字截断，标题、图片、代码、分隔线和表格不会作为摘要。没有有效段落时摘要为空。
4. 文章展示标签来自 GitHub labels，但排除全部 `content:*`、`draft` 和 `blog-post` 系统标签。正文中的 `### Slug`、`### Summary` 等文本只是普通可见 Markdown，不会覆盖元数据。
5. `about` 和 `now` 各只允许一个已发布 Issue。
6. `projects` 和 `life` 的 Slug 在所有可打开详情的内容（包括固定 `issue-<number>` 文章 ID）之间必须唯一。结构化类型的 Slug 发布后不要修改；留空时使用稳定的 `issue-<number>`。
7. 修复表单或跨内容校验错误后，编辑 Issue 触发重新验证。工作流会在每个受影响 Issue 上创建或更新一条带验证详情的 bot 评论。

正文支持受控的 GitHub Flavored Markdown：二至四级标题、段落、强调、粗体、删除线、行内代码、代码块、引用、单层有序/无序列表、表格、分隔线、链接和 HTTPS 图片。原始 HTML、任务列表、嵌套列表、不安全链接协议和非 HTTPS 图片会被拒绝。

## 旧文章迁移

旧 `blog-post` Issue 无需改正文。逐篇确认 Issue 为可信作者创建且保持 Open，然后添加 `content:post`、移除 `blog-post`；原有非系统 labels 会直接成为展示标签。标签变更后，原 Issue 标题、完整 Markdown body、编号、URL、评论和编辑历史均保留。以现有 Issue #29 为代表的旧文章只需这次标签切换即可发布。若校验失败，可先添加 `draft` 或移除 `content:post`，修复安全 Markdown 后再发布；不要批量改写旧 Issue。

## 构建和测试


```bash
# 使用测试 fixture 生成内容
npm run content:build:fixture

# 运行完整 Node 测试套件
npm test

# 生成 dist/ 静态站点
npm run site:build

# 检查 dist/ 必需静态资源
npm run site:check
```

在连接到目标 GitHub 仓库的本地 checkout 中，可执行真实内容构建：

```bash
gh auth login
gh auth status
npm run content:build
```

真实本地构建通过 `gh api` 读取 Issues，并通过 `gh repo view` 解析当前 checkout 的仓库；也可用 `--repository owner/repo` 明确指定。若使用 `GITHUB_TOKEN` 直接访问 GitHub API，还必须设置 `GITHUB_REPOSITORY=owner/repo`。未能显式或从当前 checkout 解析仓库时构建会失败，绝不回退到硬编码仓库。GitHub Actions 自动提供仓库和令牌上下文。`--report-file <path>` 会在内容校验失败时写入机器可读报告。

生成目录 `generated/`、部署目录 `dist/`、依赖目录 `node_modules/` 和本地验证报告 `.content-validation-report.json` 均被 Git 忽略。

## 自动化发布

`.github/workflows/content-deploy.yml` 的行为：

- Pull Request：仅使用测试 fixture 构建内容，然后运行测试、站点构建和站点检查；不读取真实 Issues，也不部署。
- `main` push、Issue 变更和手动运行：读取真实 Issues，校验内容，运行全部检查，并仅在成功后上传 `dist/` 和部署 GitHub Pages。
- 校验失败：保留上一次成功部署的网站，按受影响 Issue 创建或更新一条 bot 评论，并使工作流失败。

首次生产运行前，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。工作流不监听 Issue comments，因此 bot 评论不会形成触发循环。

## 架构边界

- `scripts/content/` 获取、解析、规范化并校验 GitHub Issue 内容，将每个 section 的规范 JSON 字节做 SHA-256 哈希并写为 `<section>.<hash>.json`；`manifest.json` 指向这些不可变文件。整个 `generated/content/` 仅在全部校验成功后原子替换，因此旧哈希文件会被移除。
- `src/content-api.js` 从同源静态 JSON 加载已发布内容，并保持 UI 使用的命令和窗口响应契约。
- `scripts/build-site.js` 将前端和已验证内容复制到 `dist/`。
- `src/app.js` 使用 DOM API 安全渲染内容。访客运行时不需要 GitHub 凭据，也不会请求 `api.github.com`。
