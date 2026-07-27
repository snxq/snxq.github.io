# GitHub Issues Content Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前样例数据替换为由同仓库 GitHub Issues 管理、由 GitHub Actions 构建为静态 JSON、并保持现有命令窗口交互契约的内容系统。

**Architecture:** Node.js 内容构建器读取 GitHub Issues，解析固定 Issue Form 字段，校验发布规则和跨内容约束，将安全 GFM 转换为结构化块，并生成分栏目静态 JSON。浏览器端继续使用原生 ES Modules；`src/mock-api.js` 演进为懒加载静态内容的适配器，不直接访问 GitHub API。

**Tech Stack:** Node.js 22、原生 ES Modules、`node:test`、GitHub Issue Forms、GitHub Actions、GitHub Pages、`zod`、`unified`、`remark-parse`、`remark-gfm`。

## Global Constraints

- Node.js 最低版本为 20；GitHub Actions 固定使用 Node.js 22。
- 浏览器前端保持无框架、无打包器、无浏览器端 Markdown 解析器。
- 仅增加 `zod`、`unified`、`remark-parse`、`remark-gfm` 四个直接依赖；Issue Form YAML 由 GitHub 校验，不在运行时解析 YAML。
- 访客浏览器不得访问 GitHub API，也不得包含 GitHub Token。
- 已发布内容必须同时满足：Issue 为 Open、恰好一个 `content:*` 标签、没有 `draft` 标签。
- Closed Issue 不进入生成结果；没有 `content:*` 标签的普通 Issue 被忽略。
- 多内容类型标签、重复 slug、非法字段、重复 `about`/`now`、原始 HTML、不支持的 Markdown 节点、不完整分页和 schema 错误必须阻止部署。
- slug 必须匹配 `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`；空 slug 使用 `issue-<number>`；所有类型全局唯一。
- 日期固定为 `YYYY-MM-DD`；年份允许 `YYYY`、`YYYY—YYYY` 或仍在持续的 `YYYY—`。
- 保持窗口响应字段：`requestId`、`id`、`title`、`subtitle`、`updatedAt`、`contentType`、`view`、`data`。
- 保持当前窗口的 inert、焦点陷阱、Escape/背景关闭、焦点恢复和 `detailToken` 防陈旧响应行为。
- 生成 `generated/content/manifest.json` 以及 `about.json`、`now.json`、`projects.json`、`posts.json`、`notes.json`、`bookmarks.json`、`uses.json`、`life.json`、`opensource.json`。
- `help` 从前端命令元数据生成，不使用 Issue。
- Pull Request 只使用固定夹具；`main` push、Issue 事件和手动运行才读取真实 Issues。
- `generated/` 与 `dist/` 是构建产物，不提交仓库。

---

## Target File Map

### Create

- `.github/ISSUE_TEMPLATE/content-{post,project,note,life,bookmark,use,opensource,about,now}.yml` — 九种内容表单。
- `.github/workflows/content-deploy.yml` — 内容校验、错误评论和 Pages 部署。
- `scripts/content/constants.js` — 标签、栏目元数据、字段名与 schema 版本。
- `scripts/content/errors.js` — 结构化内容错误及可读诊断。
- `scripts/content/fetch-issues.js` — GitHub Issues 分页读取与 PR 排除。
- `scripts/content/parse-form.js` — 固定 Issue Form 标题解析。
- `scripts/content/markdown.js` — GFM AST 到安全块模型。
- `scripts/content/schema.js` — Zod 内容与输出 schema。
- `scripts/content/normalize.js` — 各内容类型规范化。
- `scripts/content/build-content.js` — 内容构建入口与原子写出。
- `scripts/build-site.js` — 静态站点复制构建。
- `scripts/check-static-site.js` — 部署产物完整性检查。
- `tests/content/*.test.js` — 内容流水线测试。
- `tests/fixtures/issues/*.json` — GitHub API Issue 夹具。

### Modify

- `package.json`、新建的 `package-lock.json` — 依赖、Node 版本和脚本。
- `.gitignore` — 忽略依赖和构建产物。
- `src/mock-api.js` — 静态内容适配器。
- `src/app.js` — 新块模型和规范化栏目数据渲染。
- `styles.css` — 富文本、表格和真实图片样式。
- `tests/mock-api.test.js` — 更新适配器契约测试。
- `README.md`、`CLAUDE.md` — 内容发布与开发命令。

### Delete

- `src/mock-data.js` — 样例内容不再作为生产内容源或静默后备。

---

### Task 1: Establish the Node content-pipeline baseline

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`

**Interfaces:**
- Produces commands: `npm test`, `npm run content:build`, `npm run content:build:fixture`, `npm run dev`, `npm run site:build`, `npm run site:check`.
- Requires Node.js `>=20`.

- [ ] **Step 1: Record the pre-change test baseline**

Run:

```bash
npm test
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 2: Install the minimal build dependencies**

Run:

```bash
npm install zod unified remark-parse remark-gfm
```

Expected: `package-lock.json` is created and exactly these four packages appear as direct dependencies.

- [ ] **Step 3: Add the complete script surface**

Update `package.json` to retain the existing name/private/type fields and add:

```json
{
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test tests/*.test.js tests/content/*.test.js",
    "serve": "python -m http.server 4173",
    "content:build": "node scripts/content/build-content.js --source gh --output generated/content",
    "content:build:fixture": "node scripts/content/build-content.js --source fixture --fixtures tests/fixtures/issues --output generated/content",
    "site:build": "node scripts/build-site.js",
    "site:check": "node scripts/check-static-site.js",
    "dev": "npm run content:build:fixture && npm run serve"
  }
}
```

Keep the exact dependency versions written by npm.

- [ ] **Step 4: Ignore transient outputs**

Create `.gitignore`:

```gitignore
node_modules/
generated/
dist/
.content-validation-report.json
```

- [ ] **Step 5: Verify the baseline after dependency setup**

Run:

```bash
npm test
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Commit when execution occurs in the actual Git repository**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add content pipeline dependencies"
```

If the execution directory is still not a Git repository, stop before this step and move the working tree into, or initialize and connect it to, the intended GitHub repository. Do not invent a remote URL.

---

### Task 2: Define Issue Forms and parse their stable field contract

**Files:**
- Create: `.github/ISSUE_TEMPLATE/content-post.yml`
- Create: `.github/ISSUE_TEMPLATE/content-project.yml`
- Create: `.github/ISSUE_TEMPLATE/content-note.yml`
- Create: `.github/ISSUE_TEMPLATE/content-life.yml`
- Create: `.github/ISSUE_TEMPLATE/content-bookmark.yml`
- Create: `.github/ISSUE_TEMPLATE/content-use.yml`
- Create: `.github/ISSUE_TEMPLATE/content-opensource.yml`
- Create: `.github/ISSUE_TEMPLATE/content-about.yml`
- Create: `.github/ISSUE_TEMPLATE/content-now.yml`
- Create: `scripts/content/constants.js`
- Create: `scripts/content/parse-form.js`
- Test: `tests/content/parse-form.test.js`

**Interfaces:**
- Produces `CONTENT_TYPES`, `SECTION_META`, `FORM_FIELDS`, `CONTENT_SCHEMA_VERSION`.
- Produces `parseFormBody(body, expectedFields): Record<string, string>`.

- [ ] **Step 1: Write the failing parser test**

Create `tests/content/parse-form.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormBody } from '../../scripts/content/parse-form.js';

test('parses fixed fields and keeps Markdown headings inside final Body', () => {
  const fields = parseFormBody(
    '### Slug\nquiet-systems\n\n### Summary\nA quiet interface.\n\n### Body\n## Section\n\n### Subsection\n\nText.',
    ['Slug', 'Summary', 'Body']
  );

  assert.deepEqual(fields, {
    Slug: 'quiet-systems',
    Summary: 'A quiet interface.',
    Body: '## Section\n\n### Subsection\n\nText.'
  });
});

test('rejects duplicate known fields', () => {
  assert.throws(
    () => parseFormBody('### Summary\nOne\n\n### Summary\nTwo', ['Summary']),
    /duplicate Issue Form field "Summary"/
  );
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
node --test tests/content/parse-form.test.js
```

Expected: FAIL with module-not-found for `parse-form.js`.

- [ ] **Step 3: Define the shared vocabulary**

Create `scripts/content/constants.js` with these exported values:

```js
export const CONTENT_SCHEMA_VERSION = 1;

export const CONTENT_TYPES = Object.freeze({
  'content:post': 'posts',
  'content:project': 'projects',
  'content:note': 'notes',
  'content:life': 'life',
  'content:bookmark': 'bookmarks',
  'content:use': 'uses',
  'content:opensource': 'opensource',
  'content:about': 'about',
  'content:now': 'now'
});

export const SECTION_META = Object.freeze({
  about: { title: '关于', subtitle: 'IDENTITY SHEET' },
  projects: { title: '项目', subtitle: 'BUILT SIGNALS' },
  posts: { title: '文章', subtitle: 'LONG-FORM TRANSMISSIONS' },
  notes: { title: '短笔记', subtitle: 'FIELD SIGNALS' },
  now: { title: '此刻', subtitle: 'CURRENT STATE' },
  bookmarks: { title: '收藏', subtitle: 'SAVED COORDINATES' },
  uses: { title: '使用清单', subtitle: 'DAILY INSTRUMENTS' },
  life: { title: '生活切片', subtitle: 'OFFLINE FRAGMENTS' },
  opensource: { title: '开源与技术轨迹', subtitle: 'PUBLIC WORK' }
});

export const FORM_FIELDS = Object.freeze({
  posts: [],
  projects: ['Slug', 'Summary', 'Status', 'Year', 'Tags', 'Project URL', 'Body'],
  notes: ['Date', 'Tags', 'Body'],
  life: ['Slug', 'Date', 'Summary', 'Tone', 'Image URL', 'Body'],
  bookmarks: ['URL', 'Description', 'Group'],
  uses: ['Description', 'Category', 'URL'],
  opensource: ['Year', 'Description', 'Tags', 'URL'],
  about: ['Display Name', 'Role', 'Bio', 'Location', 'Status', 'Fields', 'Links'],
  now: ['Summary', 'BUILD', 'LEARN', 'READ', 'LOOP']
});
```

- [ ] **Step 4: Implement the fixed-field parser**

Create `scripts/content/parse-form.js`. Scan line-by-line; only exact `### <expected field>` lines begin fields. Reject duplicates. Trim values except `Body`. When `Body` is encountered, consume the entire remaining text so Markdown `###` headings are preserved.

```js
export function parseFormBody(body, expectedFields) {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const expected = new Set(expectedFields);
  const result = {};
  let current = null;
  let buffer = [];

  const flush = () => {
    if (!current) return;
    if (Object.hasOwn(result, current)) throw new Error(`duplicate Issue Form field "${current}"`);
    result[current] = buffer.join('\n').trim();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^### (.+)$/);
    if (match && expected.has(match[1])) {
      flush();
      current = match[1];
      buffer = [];
      if (current === 'Body') {
        result.Body = lines.slice(index + 1).join('\n').trim();
        return result;
      }
      continue;
    }
    if (current) buffer.push(lines[index]);
  }
  flush();
  return result;
}
```

- [ ] **Step 5: Verify parser behavior**

Run:

```bash
node --test tests/content/parse-form.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Create all nine Issue templates**

The post template auto-applies `content:post` and provides one normal Body Markdown textarea; it has no Slug, Summary, Date, Tags, Cover Image URL, visible metadata, or hidden metadata override. The Issue title and full body are canonical. The other eight types retain fixed English field labels matching `FORM_FIELDS`, with `Body` last where applicable.

```yaml
name: Content — Post
description: Publish one long-form article from normal readable Markdown.
title: ""
labels: ["content:post"]
body:
  - type: textarea
    id: body
    attributes:
      label: Body
      description: Complete GitHub Flavored Markdown article body.
    validations:
      required: true
```

Apply the structured field sets from `FORM_FIELDS` to the remaining eight forms. `Links` uses one `Label | URL` entry per line; `Fields`, `BUILD`, `LEARN`, `READ`, and `LOOP` use one value per line; structured `Tags` fields use comma-separated values.

- [ ] **Step 7: Commit**

```bash
git add .github/ISSUE_TEMPLATE scripts/content/constants.js scripts/content/parse-form.js tests/content/parse-form.test.js
git commit -m "feat: add GitHub content issue forms"
```

---

### Task 3: Fetch and classify published Issues

**Files:**
- Create: `scripts/content/errors.js`
- Create: `scripts/content/fetch-issues.js`
- Create: `scripts/content/validate.js`
- Test: `tests/content/fetch-issues.test.js`
- Test: `tests/content/validate.test.js`

**Interfaces:**
- `fetchAllIssues({ repository, token, fetchImpl }): Promise<Issue[]>`
- `fetchIssuesWithGh({ repository }): Promise<Issue[]>`
- `classifyIssues(issues): { published, ignored }`
- `ContentValidationError` with entries `{ issueNumber, title, field, reason, url }`.

- [ ] **Step 1: Write failing pagination and filtering tests**

Create `tests/content/fetch-issues.test.js` with a fake `fetchImpl` that returns one page containing a normal Issue and a PR, then a second Issue via `Link: <...>; rel="next"`. Assert that both pages are requested and PR objects are excluded.

```js
assert.deepEqual(issues.map(issue => issue.number), [1, 3]);
assert.equal(requests.length, 2);
```

Create `tests/content/validate.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIssues } from '../../scripts/content/validate.js';

const issue = ({ number, state = 'open', labels = [] }) => ({
  number,
  title: `Issue ${number}`,
  state,
  labels: labels.map(name => ({ name })),
  body: '',
  html_url: `https://example.test/issues/${number}`
});

test('publishes only open, typed, non-draft Issues', () => {
  const result = classifyIssues([
    issue({ number: 1, state: 'closed', labels: ['content:post'] }),
    issue({ number: 2, labels: ['content:post', 'draft'] }),
    issue({ number: 3, labels: [] }),
    issue({ number: 4, labels: ['content:post'] })
  ]);
  assert.deepEqual(result.published.map(item => item.number), [4]);
});

test('rejects multiple content labels before filtering state', () => {
  assert.throws(
    () => classifyIssues([issue({ number: 5, state: 'closed', labels: ['content:post', 'content:note'] })]),
    /exactly one content:\* label is allowed/
  );
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
node --test tests/content/fetch-issues.test.js tests/content/validate.test.js
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement structured diagnostics**

`ContentValidationError` accepts an array of entries and formats each as:

```text
Content validation failed

Issue #42 "Example"
Field: Slug
Error: duplicate slug "example"; already used by issue #31
URL: https://github.com/org/repo/issues/42
```

- [ ] **Step 4: Implement REST pagination**

`fetchAllIssues` requests:

```text
https://api.github.com/repos/<repository>/issues?state=all&per_page=100
```

Send `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and optional Bearer token. Follow only `rel="next"`; fail on non-2xx responses or malformed non-array bodies. Exclude entries containing `pull_request`.

- [ ] **Step 5: Implement local authenticated acquisition**

`fetchIssuesWithGh` resolves the repository from `GITHUB_REPOSITORY` or:

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

Then run:

```bash
gh api --paginate --slurp 'repos/<owner>/<repo>/issues?state=all&per_page=100'
```

Flatten the page arrays and exclude Pull Requests. Reject malformed output instead of returning partial content.

- [ ] **Step 6: Implement publication classification**

For every non-PR Issue, count labels present in `CONTENT_TYPES` before applying state/draft filtering. More than one type is a validation error. Zero types is ignored. Exactly one is published only if state is `open` and `draft` is absent.

- [ ] **Step 7: Verify tests pass**

Run:

```bash
node --test tests/content/fetch-issues.test.js tests/content/validate.test.js
```

Expected: pagination, PR exclusion, draft, closed, ordinary Issue and multi-type tests pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/content/errors.js scripts/content/fetch-issues.js scripts/content/validate.js tests/content/fetch-issues.test.js tests/content/validate.test.js
git commit -m "feat: classify published GitHub Issues"
```

---

### Task 4: Convert GFM to a safe versioned block model

**Files:**
- Create: `scripts/content/markdown.js`
- Create: `scripts/content/schema.js`
- Test: `tests/content/markdown.test.js`

**Interfaces:**
- `markdownToBlocks(markdown, context): RichBlock[]`
- `richBlockSchema`, `sectionDocumentSchema`, `manifestSchema`.
- Block types: `heading`, `paragraph`, `quote`, `code`, `list`, `table`, `divider`, `image`.
- Inline types: `text`, `emphasis`, `strong`, `delete`, `link`, `inlineCode`.

- [ ] **Step 1: Write failing conversion and security tests**

Test headings, paragraphs, emphasis, strong, links, fenced code, ordered/unordered lists, quotes, tables, images and dividers. Include:

```js
test('rejects raw HTML and unsafe URLs', () => {
  assert.throws(() => markdownToBlocks('<script>alert(1)</script>', context), /raw HTML is not allowed/);
  assert.throws(() => markdownToBlocks('[bad](javascript:alert(1))', context), /URL protocol is not allowed/);
  assert.throws(() => markdownToBlocks('![bad](data:image/png;base64,x)', context), /image URL must use https/);
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
node --test tests/content/markdown.test.js
```

Expected: FAIL because `markdown.js` does not exist.

- [ ] **Step 3: Parse GFM using MDAST**

Initialize:

```js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const parser = unified().use(remarkParse).use(remarkGfm);
```

`markdownToBlocks` parses once and recursively converts only the explicitly allowed block and inline types.

- [ ] **Step 4: Enforce safety rules**

- Link protocols: `https:`, `http:`, `mailto:`.
- Image protocols: `https:` only.
- Reject relative, protocol-relative, malformed, `data:`, `javascript:` and `file:` URLs.
- Reject raw `html`, references, footnotes, task-list checkboxes, nested lists and every unknown node type with Issue number/title/field/URL context.
- Normalize accepted URLs using `new URL(value).href`.

- [ ] **Step 5: Define and apply Zod schemas**

Define discriminated unions for every block and inline type, section envelopes, content items and manifest. Call `safeParse` before any JSON write; map failures to `ContentValidationError` including the JSON property path.

- [ ] **Step 6: Verify conversion tests pass**

Run:

```bash
node --test tests/content/markdown.test.js
```

Expected: all supported-node tests pass and unsafe/unsupported input is rejected.

- [ ] **Step 7: Commit**

```bash
git add scripts/content/markdown.js scripts/content/schema.js tests/content/markdown.test.js
git commit -m "feat: convert safe GitHub Markdown blocks"
```

---

### Task 5: Normalize Issues and generate deterministic static JSON

**Files:**
- Create: `scripts/content/normalize.js`
- Create: `scripts/content/build-content.js`
- Create: `tests/content/normalize.test.js`
- Create: `tests/content/build-content.test.js`
- Create: `tests/fixtures/issues/valid.json`
- Create: `tests/fixtures/issues/invalid-duplicate-slug.json`
- Create: `tests/fixtures/issues/invalid-singleton.json`

**Interfaces:**
- `normalizeIssue(issue, section, fields): NormalizedItem`
- `validateCrossContent(items): void`
- `buildDocuments({ issues, repository, generatedAt }): { manifest, sections }`
- `buildContent(options): Promise<BuildResult>`.

- [ ] **Step 1: Write failing normalization tests**

Cover strict date/year/slug/URL validation for structured types, comma-separated structured tags, newline lists, `Label | URL` links, and default `issue-<number>` structured slugs. For posts, cover fixed `issue-<number>` IDs, `created_at` dates, `updated_at` sources, full native Markdown bodies, derived summaries, and non-system label tags. Include duplicate-ID and duplicate-singleton failures.

```js
test('accepts supported year values', () => {
  for (const year of ['2026', '2024—2026', '2024—']) {
    assert.doesNotThrow(() => validateYear(year));
  }
});
```

- [ ] **Step 2: Write a failing fixture integration test**

Build to a temporary directory with fixed `generatedAt`. Assert:

```js
assert.equal(manifest.version, 1);
assert.equal(manifest.files.posts, 'posts.json');
assert.equal(posts.data.items[0].id, 'issue-101');
assert.deepEqual(uses.data.categories, []);
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
node --test tests/content/normalize.test.js tests/content/build-content.test.js
```

Expected: FAIL because normalization/build modules do not exist.

- [ ] **Step 4: Normalize each type to current UI shapes**

Use these exact shapes:

```js
// post
{ id, date, title, summary, tags, detail, source }
// project
{ id, name: title, summary, status, tags, year, url, detail, source }
// note
{ time: date, text, tags, source }
// life
{ id, date, title, summary, tone, imageUrl, detail, source }
// bookmark group entry
{ name: title, description, url, source }
// use category entry
{ name: title, description, url, source }
// opensource
{ year, title, text: description, tags, url, source }
```

`source` is:

```js
{ issueNumber: issue.number, issueUrl: issue.html_url, updatedAt: issue.updated_at }
```

Normalize `about` and `now` to the current renderer shapes. Derive note plain text only when Markdown contains paragraphs and inline formatting; reject rich block types that cannot be represented as a short note.

- [ ] **Step 5: Apply cross-content constraints and deterministic sorting**

- Global slug uniqueness across detail-bearing items.
- Zero or one published `about`; zero or one published `now`.
- Posts, notes, life: date descending, then Issue number descending.
- Projects and open source: first four-digit year descending, then Issue number descending.
- Bookmark groups and use categories: `localeCompare('zh-CN')`; entries within groups: Issue number descending.

- [ ] **Step 6: Generate every section even when empty**

Use this envelope:

```json
{
  "version": 1,
  "section": "posts",
  "title": "文章",
  "subtitle": "LONG-FORM TRANSMISSIONS",
  "updatedAt": "2026-07-24T08:00:00.000Z",
  "data": { "items": [] }
}
```

Manifest fields are `version`, `generatedAt`, `source.repository`, `source.issueCount`, and `files`.

- [ ] **Step 7: Write outputs atomically**

Write all files to a temporary sibling directory, validate serialized values, then rename into place only after all writes succeed. Preserve the previous output directory on failure.

- [ ] **Step 8: Verify tests and fixture build**

Run:

```bash
node --test tests/content/normalize.test.js tests/content/build-content.test.js
npm run content:build:fixture
```

Expected: tests pass and all ten JSON files exist under `generated/content/`.

- [ ] **Step 9: Commit**

```bash
git add scripts/content/normalize.js scripts/content/build-content.js tests/content tests/fixtures/issues
git commit -m "feat: generate validated static content"
```

---

### Task 6: Build and verify deployable static assets

**Files:**
- Create: `scripts/build-site.js`
- Create: `scripts/check-static-site.js`
- Test: `tests/content/build-site.test.js`

**Interfaces:**
- `buildStaticSite({ rootDirectory, outputDirectory }): Promise<void>`.
- `checkStaticSite(outputDirectory): Promise<void>`.

- [ ] **Step 1: Write the failing static-build test**

Build into a temporary directory and assert it contains only deployable roots: `index.html`, `favicon.svg`, `styles.css`, `src/`, `generated/`. Assert it excludes `tests`, `docs`, `.github`, `node_modules` and scripts.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
node --test tests/content/build-site.test.js
```

Expected: FAIL because `build-site.js` does not exist.

- [ ] **Step 3: Implement copy-only site construction**

Remove `dist/`, then copy `index.html`, `favicon.svg`, `styles.css`, `src/` and `generated/content/` into `dist/`. Do not add a bundler.

- [ ] **Step 4: Implement required-path validation**

Require:

```text
dist/index.html
dist/styles.css
dist/src/app.js
dist/src/mock-api.js
dist/generated/content/manifest.json
dist/generated/content/about.json
dist/generated/content/now.json
dist/generated/content/projects.json
dist/generated/content/posts.json
dist/generated/content/notes.json
dist/generated/content/bookmarks.json
dist/generated/content/uses.json
dist/generated/content/life.json
dist/generated/content/opensource.json
```

- [ ] **Step 5: Verify build and checks**

Run:

```bash
node --test tests/content/build-site.test.js
npm run content:build:fixture
npm run site:build
npm run site:check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-site.js scripts/check-static-site.js tests/content/build-site.test.js
git commit -m "build: create deployable static site output"
```

---

### Task 7: Replace mock data with a lazy static-content adapter

**Files:**
- Modify: `src/mock-api.js`
- Delete: `src/mock-data.js`
- Modify: `tests/mock-api.test.js`
- Create: `tests/content-adapter.test.js`

**Interfaces:**
- Preserve `executeCommand(input)` and `loadDetail(contentType, itemId)`.
- Add `configureContentAdapterForTests({ fetchImpl, baseUrl })` and `resetContentAdapterForTests()`.

- [ ] **Step 1: Write failing adapter tests**

Use injected `fetchImpl` responses for `manifest.json` and `projects.json`. Test:

- English and Chinese aliases;
- manifest loaded once;
- section loaded once across repeated aliases;
- overview contract;
- detail lookup by slug;
- invalid command count;
- empty collection;
- a failed section request is not cached and never falls back to GitHub API.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
node --test tests/mock-api.test.js tests/content-adapter.test.js
```

Expected: FAIL because current adapter imports `mock-data.js` and lacks injection/cache behavior.

- [ ] **Step 3: Consolidate public command metadata**

Keep aliases for the nine public sections. Remove mock latency and the hidden `custom` command. Generate `help` from the same command definitions so its count and list cannot diverge.

- [ ] **Step 4: Implement manifest and section loading**

- Base URL defaults to `new URL('../generated/content/', import.meta.url)`.
- Cache one successful manifest promise.
- Cache one successful section promise per content type.
- Delete rejected promises from caches so retry is possible.
- Fetch sections with `?v=<encoded manifest.generatedAt>`.
- Validate at least `version`, `section`, `title`, `subtitle`, `updatedAt`, and `data` at the browser boundary.

- [ ] **Step 5: Preserve the window contract**

Overview and detail IDs remain `window-<type>` and `window-<type>-<slug>`. Request IDs remain `req-0001` style. Detail `updatedAt` uses item date/year/source timestamp, then section timestamp.

When a known section fails to load, return an `ok: true` unavailable overview window:

```js
{
  unavailable: true,
  reference: `request ${requestId} · content ${manifest?.version ?? 'unknown'}`
}
```

Do not request GitHub API from the browser.

- [ ] **Step 6: Verify tests pass**

Run:

```bash
node --test tests/mock-api.test.js tests/content-adapter.test.js
```

Expected: all adapter and compatibility tests pass.

- [ ] **Step 7: Remove sample content and commit**

```bash
git add src/mock-api.js tests/mock-api.test.js tests/content-adapter.test.js
git rm src/mock-data.js
git commit -m "feat: load generated content in command adapter"
```

---

### Task 8: Render generated rich content safely

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Test: `tests/render-contract.test.js`

**Interfaces:**
- Adds `renderInline(children)` and extends `renderRichBlocks(blocks)`.
- Consumes only validated static block objects; never uses `innerHTML`.

- [ ] **Step 1: Extract pure render-contract helpers for testability**

Export or move protocol/shape decisions into functions that can run without DOM:

```js
export function normalizeRenderableBlock(block) { /* strict allowed-type switch */ }
export function normalizeRenderableInline(node) { /* strict allowed-type switch */ }
```

Write tests asserting unknown types return `null`, unsafe URLs become `null`, and known block fields are preserved.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/render-contract.test.js
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement strict inline rendering**

Render `text`, `emphasis`, `strong`, `delete`, `inlineCode`, and `link`. Links continue through `safeLink`. Unknown nodes produce no element and never control element names or attributes.

- [ ] **Step 4: Implement all rich block renderers**

Support heading levels 2–4, inline paragraphs/quotes, ordered and unordered lists, fenced code, GFM tables, HTTPS images with alt/loading, and dividers. Wrap tables in `.rich-table-wrap`. Never use `innerHTML`.

- [ ] **Step 5: Update normalized overview shapes**

- Bookmarks read `{ name, description, url }`.
- Uses read `{ name, description, url }` and optionally render a safe link.
- Open-source entries render optional safe links.
- Project/post/life cards render safe cover/image URLs when present.
- `renderWindowContent` handles `data.unavailable` before type dispatch.

- [ ] **Step 6: Add responsive styles**

Add horizontal scrolling only inside `.rich-table-wrap` and code blocks; constrain `.rich-image` to `max-width: 100%; height: auto`; retain existing dialog breakpoints and reduced-motion behavior.

- [ ] **Step 7: Verify automated and browser behavior**

Run:

```bash
npm run content:build:fixture
npm test
npm run site:build
npm run site:check
npm run serve
```

Using Playwright at `http://localhost:4173/`, verify `help`, `projects`, Chinese aliases, post detail, table, code, link and image rendering; then verify Escape, close, focus restoration, back navigation and 390×844 overflow behavior. Save one desktop and one mobile screenshot.

- [ ] **Step 8: Commit**

```bash
git add src/app.js styles.css tests/render-contract.test.js
git commit -m "feat: render generated rich content safely"
```

---

### Task 9: Add validation reports, Issue comments, and Pages deployment

**Files:**
- Modify: `scripts/content/build-content.js`
- Create: `.github/workflows/content-deploy.yml`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Test: `tests/content/report.test.js`

**Interfaces:**
- CLI option `--report-file <path>` writes `{ marker, errors }` before nonzero exit.
- Marker is exactly `snxq-content-validation`.

- [ ] **Step 1: Write a failing report test**

Invoke the build CLI with an invalid duplicate-slug fixture and temporary report path. Assert exit code 1, no output replacement, and:

```json
{
  "marker": "snxq-content-validation",
  "errors": [{
    "issueNumber": 42,
    "title": "Example",
    "field": "Slug",
    "reason": "duplicate slug \"example\"; already used by issue #31",
    "url": "https://example.test/issues/42"
  }]
}
```

- [ ] **Step 2: Implement report output and verify the test**

On `ContentValidationError`, write the report only when requested, print readable diagnostics to stderr, set exit code 1 and leave the previous generated directory intact.

Run:

```bash
node --test tests/content/report.test.js
```

Expected: PASS.

- [ ] **Step 3: Create the workflow trigger and permissions**

```yaml
on:
  push:
    branches: [main]
  pull_request:
  issues:
    types: [opened, edited, closed, reopened, labeled, unlabeled]
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  pages: write
  id-token: write
```

Add a concurrency group based on repository and ref/event so a newer content deployment cancels an older in-progress deployment.

- [ ] **Step 4: Implement the PR validation path**

For pull requests: checkout, setup Node 22 with npm cache, `npm ci`, fixture content build, `npm test`, site build and site check. Do not call real Issues and do not deploy.

- [ ] **Step 5: Implement the real-content path**

For `main`, Issue events and manual runs: set `GH_TOKEN: ${{ github.token }}`, run real content build with report and `continue-on-error: true`. On failure, use `actions/github-script@v7` to create or update one comment per affected Issue containing `<!-- snxq-content-validation -->`; then fail the job. The workflow does not subscribe to comments, preventing loops.

- [ ] **Step 6: Deploy only validated output**

After content build and all tests succeed, run site build/check, upload `dist/` with `actions/upload-pages-artifact@v3`, and deploy with `actions/deploy-pages@v4`. Configure repository Pages source to “GitHub Actions” before the first production run.

- [ ] **Step 7: Document authoring and operations**

Update README and CLAUDE.md with publication rules, Issue Form usage, slug stability, supported Markdown, `gh` authentication for real local builds, fixture development, all tests/build commands, ignored outputs, and the fact that visitors never access GitHub API.

- [ ] **Step 8: Run full local verification**

```bash
npm run content:build:fixture
npm test
npm run site:build
npm run site:check
```

Expected: every command exits 0 with no failed tests.

- [ ] **Step 9: Verify workflow behavior in a non-production repository**

Open a PR and confirm the fixture-only path. Create a valid content Issue and confirm deployment. Introduce a duplicate slug and confirm one bot comment is created/updated and deployment is skipped. Repair the Issue and confirm the next run deploys successfully.

- [ ] **Step 10: Commit**

```bash
git add scripts/content/build-content.js .github/workflows/content-deploy.yml README.md CLAUDE.md tests/content/report.test.js
git commit -m "ci: validate Issue content before Pages deploy"
```

---

## Final Verification Gate

- [ ] Run the complete automated pipeline:

```bash
npm run content:build:fixture
npm test
npm run site:build
npm run site:check
```

Expected: exit code 0; all tests pass; all required static assets exist.

- [ ] Run the real authenticated content build in the connected repository:

```bash
npm run content:build
```

Expected: exit code 0 and all published Issues appear in the corresponding generated section.

- [ ] Run the frontend and exercise every public command in desktop and mobile viewports.

- [ ] Confirm browser network requests are limited to same-origin static assets and contain no `api.github.com` request.

- [ ] Confirm malformed content blocks deployment and preserves the last successfully deployed site.

- [ ] Confirm the repository is configured for GitHub Pages via GitHub Actions.

## Self-Review Results

- Spec coverage: all approved architecture, Issue Forms, publication rules, Markdown security, static output, adapter, error feedback, testing and non-browser-GitHub constraints map to Tasks 2–9.
- Placeholder scan: no TBD/TODO or deferred implementation steps remain.
- Type consistency: `CONTENT_TYPES` maps labels to plural frontend section names; those names are reused by schemas, filenames and adapter routing. Stable detail identity is consistently named `id` and sourced from slug.
- Scope: the plan intentionally excludes CMS, database, authentication, scheduling, comments, private content and search.
- Execution blocker: the current directory was not a Git repository during planning. Implementation may proceed locally through tests, but commit, Issue and workflow steps require the intended GitHub repository to be initialized or checked out without inventing its remote URL.
