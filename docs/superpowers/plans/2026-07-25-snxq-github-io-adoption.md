# snxq.github.io Repository Adoption and Issue Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已完成的新站代码安全合入 `snxq/snxq.github.io`，保留旧仓库历史与 Issues，并由作者逐篇只切换旧 `blog-post` Issue 的标签，使原有 Markdown 正文按新的 `content:post` 模型发布。

**Architecture:** 代码、Issue Forms、内容 Issues 和 GitHub Actions 位于同一个 `snxq/snxq.github.io` 仓库。系统只消费新 `content:*` 格式；旧 `blog-post` 在手工迁移前不展示。迁移后的 Issue 触发内容校验、不可变静态 JSON 构建与 GitHub Pages 部署。

**Tech Stack:** Git、GitHub CLI、GitHub Issues、GitHub Actions、GitHub Pages、Node.js 22、原生 ES Modules。

## Global Constraints

- 不删除或重建 `snxq/snxq.github.io` 仓库；保留 Git 历史、Issues、Issue 编号、URL、评论和编辑历史。
- 系统只支持 `content:*` 新格式，不实现生产 `blog-post` 兼容层。
- 迁移一篇上线一篇；未迁移的 `blog-post` 不展示。
- 只有 `OWNER`、`MEMBER` 或 `COLLABORATOR` 创建的 Open、非 draft、单一 `content:*` Issue 才发布。
- 生产代码不得使用 mock/fake 组件、模块、数据或命名；测试夹具和测试替身只允许出现在测试中。
- 外部操作包括远端 push、创建分支/标签、修改 Issue/labels、修改 Pages 设置和合并 PR；执行前必须获得明确授权。
- 不得将测试夹具生成的 `generated/` 或 `dist/` 提交或部署为生产内容。

---

### Task 1: Inspect and back up the existing remote repository

**Files:**
- No source changes.

**Interfaces:**
- Produces a verified remote state, backup ref, and known base commit for migration.

- [ ] Confirm `gh auth status` succeeds for the `snxq` account.
- [ ] Inspect `snxq/snxq.github.io` default branch, protection rules, Pages configuration, latest Actions runs, labels, and open Issues.
- [ ] Fetch the latest remote `main` without modifying it.
- [ ] Record the exact current remote commit SHA.
- [ ] With explicit authorization, create a remote backup tag named `pre-signal-archive-YYYYMMDD` at that SHA.
- [ ] Verify the backup tag resolves to the recorded SHA.

### Task 2: Rebase the completed site onto the real repository history

**Files:**
- Preserve the completed new-site files and `.github` configuration.
- Remove only old frontend files that conflict with the replacement after reviewing them.

**Interfaces:**
- Produces a feature branch based on the real `snxq/snxq.github.io/main`, containing the new site implementation.

- [ ] Create a migration branch from the fetched remote `main`.
- [ ] Apply the completed new-site commit range onto that branch while preserving remote history.
- [ ] Resolve old React/Vite frontend conflicts by explicitly listing files removed or replaced.
- [ ] Do not modify or delete repository Issues through this task.
- [ ] Verify active production source contains no mock/fake components, data, or naming.
- [ ] Run:

```bash
npm ci
npm run content:build:fixture
npm test
npm run site:build
npm run site:check
```

- [ ] Expected: all commands succeed and the current full test count passes.
- [ ] Commit conflict resolution separately if required.

### Task 3: Prepare repository labels and Pages deployment

**Files:**
- Existing `.github/ISSUE_TEMPLATE/*.yml`
- Existing `.github/workflows/content-deploy.yml`

**Interfaces:**
- Produces labels: `content:post`, `content:project`, `content:note`, `content:life`, `content:bookmark`, `content:use`, `content:opensource`, `content:about`, `content:now`, `draft`.

- [ ] Verify all Issue Forms parse as valid YAML and reference the required labels.
- [ ] With explicit authorization, create missing labels without deleting unrelated historical labels.
- [ ] Confirm the workflow permissions and repository Actions permissions allow Issues comments and Pages deployment.
- [ ] With explicit authorization, set Pages source to GitHub Actions.
- [ ] Do not migrate any content Issue yet.

### Task 4: Push the replacement branch and validate its Pull Request

**Files:**
- No additional source changes unless CI reveals an integration defect.

**Interfaces:**
- Produces a PR whose fixture-only workflow validates the replacement without reading or changing real content Issues.

- [ ] With explicit authorization, push the migration branch.
- [ ] Create a PR describing the frontend replacement, content model, rollback tag, and staged Issue migration.
- [ ] Confirm the PR workflow uses fixture content only and does not deploy.
- [ ] Require all tests, static build, strict manifest/hash checks, and code review to pass.
- [ ] Inspect the built frontend locally or through a preview artifact before merge.

### Task 5: Merge the new site without migrating old content

**Files:**
- No new source changes.

**Interfaces:**
- Produces the new frontend on `main`; articles remain empty until individual Issues are migrated.

- [ ] With explicit authorization, merge the approved PR.
- [ ] Verify the `main` workflow reads the same repository via `GITHUB_REPOSITORY`.
- [ ] Verify GitHub Pages deployment succeeds with currently valid `content:*` Issues; old `blog-post` Issues are ignored.
- [ ] Confirm the public site loads and no fixture content appears.
- [ ] If deployment fails, use the backup tag and previous Pages deployment as rollback references rather than deleting Issues.

### Task 6: Migrate one pilot article in place

**Files:**
- One existing GitHub Issue in `snxq/snxq.github.io`.

**Interfaces:**
- Converts one old `blog-post` Issue to valid `content:post` while retaining its Issue identity.

- [ ] Select existing Issue #29 as the pilot and record its Issue number, URL, labels, original body, creation date, and comments.
- [ ] Do not edit or wrap the Issue body; the full existing Markdown is the publishable article.
- [ ] Confirm its first valid paragraph produces an acceptable derived summary and its non-system labels are the intended display tags.
- [ ] Add `content:post` and remove `blog-post`; preserve all other useful labels.
- [ ] Keep the Issue Open and without `draft`.
- [ ] Verify the Issue event workflow validates, deploys, and does not create an error comment.
- [ ] Open the public site, run `posts`, open the migrated article, and verify title, derived summary, `created_at` date, labels-as-tags, and unchanged Markdown, links and images.
- [ ] Confirm ID is `issue-29` and Issue URL, comments, body and edit history remain intact.

### Task 7: Establish the repeatable manual migration checklist

**Files:**
- Update `README.md` with a concise “旧文章迁移” checklist if the pilot reveals any missing operational detail.

**Interfaces:**
- Produces a repeatable process for all remaining `blog-post` Issues.

- [ ] Document that post ID/date/summary are automatic: `issue-<number>`, Issue creation date, and first valid text paragraph (about 160 characters).
- [ ] Document that non-system labels become display tags and `content:*`, `draft`, `blog-post` never display.
- [ ] Document the safe order: verify the unchanged body against supported Markdown, then switch labels.
- [ ] Document failure recovery: add `draft` or remove `content:post`, fix only the unsupported Markdown, then publish again.
- [ ] Confirm no automation bulk-edits old Issues and no migration rewrites their bodies.
- [ ] Migrate remaining articles one at a time, verifying each successful deployment before starting the next.

### Task 8: Final production verification

- [ ] Confirm no Open trusted Issue with multiple `content:*` labels exists.
- [ ] Confirm only one published `content:about` and one published `content:now` exist, or neither until created.
- [ ] Confirm every deployed content filename is immutable and its SHA-256 matches its exact bytes.
- [ ] Confirm browser network requests are same-origin static assets only and never access `api.github.com`.
- [ ] Confirm production site contains no fixture content and production source contains no mock/fake components or data.
- [ ] Confirm the backup tag remains available until the migration has been stable for an agreed period.

## Verification and rollback

Before any remote merge:

```bash
npm ci
npm run content:build:fixture
npm test
npm run site:build
npm run site:check
```

After remote merge, verify the real Issue build and Pages deployment through GitHub Actions. If the replacement must be rolled back, revert the site-code merge or redeploy the backup ref; do not delete or recreate Issues.
