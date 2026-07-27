# GitHub Issues 内容管理设计

日期：2026-07-24

## 1. 目标与范围

使用 `snxq/snxq.github.io` 仓库的 GitHub Issues 作为全部网站内容的编辑后台，当前新站代码也最终合入并替换该仓库中的旧前端实现。内容变化触发 GitHub Actions，在部署阶段拉取、解析、校验 Issues，生成前端消费的静态 JSON，再部署纯静态网站。

现有 `blog-post` Issues 采用与新文章相同的原生 Markdown 模型，不需要旧格式兼容解析，也不需要改写正文。作者逐篇只将标签从 `blog-post` 调整为 `content:post`；Issue 标题、完整 Markdown 正文、编号、URL、评论和历史均保留。迁移一篇，该文章便在下一次成功部署后上线。尚未迁移的旧格式 Issue 不展示。

本设计服务于单人、低频、以文字为主的内容维护方式。它不引入数据库、独立服务端、登录系统或浏览器内管理后台。访客浏览器不直接访问 GitHub API。

纳入 Issues 管理的内容包括：

- 文章；
- 项目；
- 笔记；
- 生活记录；
- 收藏；
- 使用清单；
- 开源与技术经历；
- 个人介绍；
- 当前近况。

`help` 内容由命令配置和已支持内容类型生成，不创建对应 Issue。

## 2. 总体架构

```text
GitHub Issue Forms
        │
        │ 创建、编辑、关闭 Issue
        ▼
同一 GitHub 仓库的 Issues
        │
        │ issues / push / workflow_dispatch 事件
        ▼
GitHub Actions 内容构建任务
        │
        ├── 拉取所有 Issues
        ├── 筛选已发布内容
        ├── 解析 Issue Form 字段
        ├── 校验内容模型
        ├── 转换 Markdown
        └── 生成静态 JSON
        ▼
静态前端构建产物
        │
        ▼
GitHub Pages 或其他静态托管
```

前端不理解 GitHub API 响应或 Issue Form 格式。内容构建器负责把 Issues 转换为稳定的规范化内容模型；前端适配器再把该模型转换为当前 UI 使用的 overview/detail 窗口响应。

```text
Issue 数据
  → 内容解析器
  → 规范化内容模型
  → 静态 JSON
  → content adapter
  → overview/detail 窗口模型
```

该边界允许未来将内容源替换为 Markdown 文件或 CMS，而不重写窗口 UI。

## 3. Issue 与发布模型

### 3.1 内容粒度

每条独立内容对应一个 Issue：

| 内容类型 | GitHub 标签 | Issue 粒度 |
|---|---|---|
| 文章 | `content:post` | 一篇文章一个 Issue |
| 项目 | `content:project` | 一个项目一个 Issue |
| 笔记 | `content:note` | 一条笔记一个 Issue |
| 生活记录 | `content:life` | 一条记录一个 Issue |
| 收藏 | `content:bookmark` | 一个链接一个 Issue |
| 使用清单 | `content:use` | 一个工具一个 Issue |
| 开源经历 | `content:opensource` | 一段经历一个 Issue |
| 个人介绍 | `content:about` | 一个固定单例 Issue |
| 当前近况 | `content:now` | 一个固定单例 Issue |

### 3.2 发布状态

- Open、恰好有一个 `content:*` 标签、没有 `draft`，且作者关联身份为 `OWNER`、`MEMBER` 或 `COLLABORATOR`：已发布；
- Open 且有 `draft` 标签：草稿，不发布；
- Closed：下线；
- `blog-post` 等没有 `content:*` 标签的旧格式或普通 Issue：不参与内容构建；
- 作者身份不受信任的 Issue：不发布；
- 同时拥有多个 `content:*` 标签：内容错误，阻止部署；
- 同时存在多个已发布 `content:about` 或 `content:now`：内容错误，阻止部署。

### 3.3 标签职责

GitHub Repository Labels 同时表达内容类型、发布流程，以及文章的展示标签。系统标签为九个 `content:*`、`draft` 和历史 `blog-post`；这些标签永不展示。`content:post` 上其余 labels（如“设计”“系统”“Go”）按 GitHub 返回顺序成为站内展示标签。其他结构化内容类型继续在 Issue Form 字段中填写展示标签。

```text
content:post
content:project
content:note
content:life
content:bookmark
content:use
content:opensource
content:about
content:now
draft
```

“设计”“系统”“Go”等展示标签填写在 Issue Form 字段中，不要求全部成为仓库标签。

## 4. Issue Forms

为各内容类型提供独立模板；文章模板只提供普通 Body Markdown 编辑区，其他类型使用结构化 Issue Form：

```text
.github/ISSUE_TEMPLATE/
├── content-post.yml
├── content-project.yml
├── content-note.yml
├── content-life.yml
├── content-bookmark.yml
├── content-use.yml
├── content-opensource.yml
├── content-about.yml
└── content-now.yml
```

每个模板自动添加对应的 `content:*` 标签。Issue 标题作为内容标题。除文章外，结构化表单在 Issue 正文中生成固定字段标题供构建器解析；文章正文不解析任何可见或隐藏元数据字段。

### 4.1 通用字段

适用时，各类型共享以下概念：

- `slug`：稳定站内标识；
- `summary`：列表摘要；
- `date`：内容展示日期；
- `tags`：站内展示标签；
- `body`：GitHub Flavored Markdown 正文；
- `url`：可选外部链接。

### 4.2 Slug 规则

1. 文章固定使用 `issue-<number>`，不接受显式 slug；
2. 其他需要详情 ID 的结构化类型在 Slug 留空时使用 `issue-<number>`；
3. 显式 slug 只允许小写 ASCII 字母、数字和连字符；
4. 不根据中文标题自动生成拼音或英文 slug；
5. 所有详情 ID（包括文章固定 ID）全局唯一；
6. 结构化类型发布后修改 slug 会改变站内稳定标识，应避免随意修改；
7. Issue number 保留在生成数据中，用于定位来源和生成编辑链接。

### 4.3 各类型字段

#### 文章 `content:post`

- Issue 标题作为文章标题；
- 完整 Issue body 作为正文 Markdown；
- ID 固定为 `issue-<number>`；
- 日期取 Issue `created_at` 的 UTC 日期，来源更新时间取 `updated_at`；
- 摘要取第一个有效文本段落：跳过空白、标题、图片、代码、分隔线和表格，提取可读行内文本、折叠空白，并在约 160 字时加省略号；无有效段落则为空；
- 展示标签取 GitHub labels，排除全部 `content:*`、`draft` 和 `blog-post`；
- 不提供 slug、摘要、日期、标签、封面图等正文元数据字段，也不允许隐藏元数据覆盖。

#### 项目 `content:project`

- Issue 标题；
- slug；
- 摘要；
- 项目状态；
- 年份；
- 技术标签；
- 可选项目链接；
- 正文 Markdown。

#### 笔记 `content:note`

- 正文；
- 日期；
- 展示标签。

笔记标题可以省略。前端使用日期和正文开头作为辅助标识。

#### 生活记录 `content:life`

- Issue 标题；
- slug；
- 日期；
- 摘要；
- 视觉色调；
- 正文 Markdown；
- 可选图片。

#### 收藏 `content:bookmark`

- 名称；
- URL；
- 描述；
- 分组。

#### 使用清单 `content:use`

- 名称；
- 描述；
- 分类；
- 可选 URL。

#### 开源经历 `content:opensource`

- Issue 标题；
- 年份；
- 描述；
- 技术标签；
- 可选 URL。

#### 个人介绍 `content:about`

- 显示名称；
- 角色；
- 简介；
- 位置；
- 当前状态；
- 关注领域；
- 个人链接。

#### 当前近况 `content:now`

- 摘要；
- `BUILD` 条目；
- `LEARN` 条目；
- `READ` 条目；
- `LOOP` 条目。

## 5. Markdown 与安全

Issue Form 正文使用 GitHub Flavored Markdown，支持：

- 二至四级标题；
- 段落；
- 有序和无序列表；
- 引用；
- 代码块；
- 链接；
- 图片；
- 表格；
- 分隔线。

构建器将 Markdown 转换为受控的结构化块，不把任意 HTML 直接交给浏览器：

- 禁止正文中的原始 HTML；
- 链接只允许 `https:`、`http:` 和适用场景下的 `mailto:`；
- 图片只允许 `https:`；
- 未支持的 Markdown 节点导致构建错误，或按预先定义的安全方式降级；
- 浏览器继续使用 DOM API 和 `textContent` 构造内容。

生成块模型与当前 `renderRichBlocks()` 的职责一致，并可扩展表格等新块类型。

## 6. 内容构建器

建议拆分为以下模块：

```text
scripts/content/
├── fetch-issues.js
├── parse-form.js
├── normalize.js
├── validate.js
├── markdown.js
└── build-content.js
```

职责如下：

- `fetch-issues.js`：使用 GitHub API 拉取全部 Issues，处理分页并排除 Pull Requests；
- `parse-form.js`：按固定字段标题解析 Issue Form 正文；
- `normalize.js`：将各内容类型转换为版本化的统一模型；
- `validate.js`：校验必填字段、格式、slug、单例和跨内容约束；
- `markdown.js`：将 GFM 转为安全结构化块；
- `build-content.js`：编排完整流程并写出静态文件。

GitHub Actions 使用仓库自动提供的 `GITHUB_TOKEN`。Token 只在构建环境中使用，不进入前端产物。

### 6.1 本地开发命令目标

实现后提供：

```bash
# 使用 gh CLI 的当前登录状态读取真实 Issues
npm run content:build

# 使用测试夹具生成内容，不访问网络
npm run content:build:fixture

# 生成内容并启动前端开发服务器
npm run dev
```

## 7. 静态输出

按栏目生成不可变哈希 JSON：

```text
generated/content/
├── manifest.json
├── about.<sha256>.json
├── now.<sha256>.json
├── projects.<sha256>.json
├── posts.<sha256>.json
├── notes.<sha256>.json
├── bookmarks.<sha256>.json
├── uses.<sha256>.json
├── life.<sha256>.json
└── opensource.<sha256>.json
```

`manifest.json` 包含严格 schema 版本、生成时间、来源仓库、内容数量和九个栏目的精确哈希文件映射，例如：

```json
{
  "version": 1,
  "generatedAt": "2026-07-24T08:00:00Z",
  "source": {
    "repository": "snxq/snxq.github.io",
    "issueCount": 38
  },
  "files": {
    "posts": "posts.<64-character-sha256>.json",
    "projects": "projects.<64-character-sha256>.json"
  }
}
```

文件名哈希基于栏目 JSON 的精确序列化字节。部署检查必须验证完整 manifest schema、九个栏目精确集合、栏目文档 schema/身份以及文件内容与 SHA-256 文件名一致。前端在首次执行某类命令时加载 manifest 指定的不可变文件，并在当前页面生命周期内缓存。

## 8. 前端适配

`src/content-api.js` 是静态内容适配层：

1. 保留命令规范化和别名解析；
2. 按内容类型懒加载对应 JSON；
3. 在内存中缓存成功响应；
4. 将规范化内容转换为既有 overview/detail 窗口模型；
5. 使用稳定 slug 加载详情；
6. 保留异步请求 ID 和 UI 的陈旧响应保护机制。

窗口契约保持：

```text
requestId
id
title
subtitle
updatedAt
contentType
view
data
```

前端不接收 GitHub Token，不访问私有 API，也不具有内容编辑权限。

## 9. GitHub Actions

工作流监听：

```yaml
on:
  push:
    branches: [main]
  issues:
    types: [opened, edited, closed, reopened, labeled, unlabeled]
  workflow_dispatch:
```

执行步骤：

```text
检出代码
  → 安装 Node 依赖
  → 拉取真实 Issues
  → 解析并校验内容
  → 生成静态 JSON
  → 运行内容和前端测试
  → 构建静态站点
  → 部署
```

Pull Request 不读取可能持续变化的真实 Issues，而使用固定夹具执行内容构建、测试和静态站点验证。

## 10. 错误处理

以下错误阻止部署：

- 一个 Issue 同时有多个 `content:*` 标签；
- 必填字段缺失；
- 日期、URL 或 slug 格式错误；
- slug 重复；
- 多个已发布 `about` 或 `now`；
- 原始 HTML 或不允许的协议；
- Issue Form 字段结构无法解析；
- GitHub API 分页未完整获取；
- 生成结果不符合版本化 schema。

错误信息必须包含 Issue number、标题、字段、原因和 URL，例如：

```text
Content validation failed

Issue #42 "为安静的系统辩护"
Field: Slug
Error: duplicate slug "quiet-systems"; already used by issue #31
URL: https://github.com/snxq/snxq.github.io/issues/42
```

构建失败时不部署，线上保留上一版可用内容。

工作流在出错 Issue 下创建或更新一条带隐藏标记的机器人评论，避免重复刷屏。修复 Issue 会由 `edited` 事件重新触发构建。工作流不监听评论事件，因此机器人评论不会形成构建循环。

## 11. 浏览器错误处理

- 每个栏目独立加载，单个栏目失败不影响命令输入和其他栏目；
- 成功加载的数据在内存中缓存；
- JSON 请求失败时使用现有不可用状态，并显示生成版本或请求标识；
- 部署产物使用统一版本或内容哈希，避免 HTML 与 JSON 版本错配；
- 不因运行时加载失败回退到 GitHub API，避免重新引入限流和网络依赖。

## 12. 测试策略

### 12.1 解析与校验单元测试

为各 Issue Form 保存 GitHub API 响应夹具：

```text
tests/fixtures/issues/
├── post-valid.json
├── project-valid.json
├── about-valid.json
├── invalid-multiple-types.json
├── invalid-missing-field.json
└── invalid-duplicate-slug.json
```

覆盖：

- Issue Form 字段解析；
- Open、Closed、Reopened 状态；
- `draft` 和内容标签过滤；
- GitHub API 分页与 Pull Request 排除；
- Markdown 块转换；
- 日期、URL 和 slug 规范化；
- slug 全局唯一性；
- `about`、`now` 单例约束；
- 禁止的 HTML 和链接协议。

### 12.2 内容契约测试

验证完整链路：

```text
Issue → normalized content → generated JSON → frontend adapter
```

必须覆盖：

- overview 返回正确的 `contentType`；
- detail 使用稳定 slug 查找；
- 空栏目生成空集合而不是失败；
- 无效或草稿内容不进入生成结果；
- 生成 JSON 符合 schema 版本；
- 当前窗口契约保持兼容。

### 12.3 工作流验证

Pull Request：

```text
内容夹具构建 → 单元测试 → 前端测试 → 静态构建
```

Issue 事件和主分支部署：

```text
真实 Issues 拉取 → 内容校验 → 全部测试 → 静态构建 → 部署
```

## 13. 旧仓库合入与内容迁移

### 13.1 代码合入

当前新站最终合入 `snxq/snxq.github.io`，替换旧 React/Vite 前端，但保留该仓库的 Git 历史、Issues 和 Issue 编号。不得通过删除远端仓库或重建仓库实现替换。

安全合入顺序：

1. 获取 `snxq/snxq.github.io` 最新 `main` 并创建备份标签或备份分支；
2. 在功能分支中将当前新站代码与工作流合入旧仓库；
3. 保留现有 Issues，不执行 Issue 删除或批量重建；
4. 创建九个 `content:*` 标签和 `draft` 标签；
5. 将 GitHub Pages source 设置为 GitHub Actions；
6. 在合并前运行夹具构建、全部测试、静态构建和严格部署检查；
7. 合入后先迁移一篇旧文章并验证 Issue 事件、内容生成和 Pages 部署；
8. 验证成功后再逐篇迁移其余旧文章。

远端合入、推送、标签创建和 Pages 设置都是外部操作，执行时必须单独确认。

### 13.2 旧文章原地迁移

系统只发布带 `content:*` 的内容，不实现 `blog-post` 标签兼容发布；但旧文章正文天然就是新的 `content:post` 原生 Markdown 格式。每篇旧文章手工原地迁移：

1. 保留原 Issue 标题、完整正文、编号、URL、评论和历史；
2. 确认作者受信任、Issue 为 Open、正文符合安全 Markdown 规则且没有 `draft`；
3. 添加 `content:post`，删除 `blog-post`；
4. 保留希望作为展示标签的其他 labels；
5. 保存后等待内容构建与部署成功。

Issue #29 因而只需标签变更即可发布，正文必须保持不动。

迁移一篇便上线一篇。未迁移的 `blog-post` Issue 没有 `content:*` 标签，因此不展示。若构建校验失败，线上保留上一版，工作流在对应 Issue 更新错误评论。

## 14. 非目标与演进条件

本阶段不实现：

- 独立内容管理后台；
- 数据库；
- 多人审核和复杂角色权限；
- 浏览器直接读取 GitHub API；
- 定时发布；
- 私有内容；
- 全文搜索服务；
- 评论系统；
- 自动将中文标题生成英文 slug。

满足以下条件时再评估独立 CMS：

- 出现不使用 Git 的多位编辑者；
- 需要审核流、定时发布或细粒度权限；
- 内容必须保存后立即上线且无法接受构建等待；
- 需要动态用户数据或私有内容；
- GitHub Issues 的表单与内容模型已明显限制编辑体验。
