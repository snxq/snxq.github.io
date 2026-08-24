# Static Content Atom Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从现有规范化 Posts JSON 生成完整 HTML Atom Feed，并在 Issue 内容变化后随静态站点自动部署。

**Architecture:** `scripts/build-feed.js` 安全读取 manifest 指向的不可变 Posts 文档、验证 hash/section 后，把现有 rich blocks 序列化为 HTML 和 Atom XML。`buildStaticSite` 在复制静态资源后写入 `dist/feed.xml`，`checkStaticSite` 验证部署契约；现有 Action 只补充 Issue 删除触发事件。

**Tech Stack:** Node.js 22、Node 标准库（`crypto`、`fs`、`path`）、`node:test`、现有 Zod Schema、GitHub Actions、GitHub Pages。

## Global Constraints

- Feed 地址固定为 `https://blog.snxq.cc/feed.xml`，站点地址固定为 `https://blog.snxq.cc/`。
- 只生成 Atom 1.0，不生成 RSS、sitemap 或 robots.txt。
- Feed 只消费现有已验证 Posts 文档，不请求 GitHub，不重复发布过滤或 Markdown 解析。
- 不增加运行时、Feed、XML、Markdown或测试依赖。
- Entry 正文是 `post.detail` 的完整 HTML。
- Entry `id` 与 `link` 均使用 `post.source.issueUrl`；当前不新增站内 permalink。
- Entry `published` 使用 `${post.date}T00:00:00Z`，`updated` 使用 `post.source.updatedAt`。
- Feed 构建必须限制 `posts.<sha256>.json` 直属文件、验证 SHA-256 并断言 `section === 'posts'`。
- PR 与生产继续复用现有内容构建分支；不新增 Feed token、fixture 或网络路径。
- Feed 只写入已忽略的 `dist/feed.xml`，不创建源目录生成物。

---

### Task 1: Build Atom XML from normalized Posts

**Files:**
- Create: `scripts/build-feed.js`
- Modify: `tests/content/build-site.test.js`

**Interfaces:**
- Produces: `renderInline(nodes: RichInline[]): string`
- Produces: `renderBlocks(blocks: RichBlock[]): string`
- Produces: `createAtomXml(postsDocument: PostsSectionDocument): string`
- Produces: `buildAtomFeed({ contentDirectory: string, outputPath: string }): Promise<void>`
- Consumed by Task 2: `scripts/build-site.js` imports `buildAtomFeed`.

- [ ] **Step 1: Add failing serialization tests**

Extend `tests/content/build-site.test.js` imports:

```js
import { buildAtomFeed, createAtomXml, renderBlocks } from '../../scripts/build-feed.js';
```

Add tests with complete supported shapes:

```js
test('renderBlocks serializes supported rich content with escaped values', () => {
  const html = renderBlocks([
    { type: 'heading', depth: 2, children: [{ type: 'text', value: 'A < B & C' }] },
    {
      type: 'paragraph',
      children: [
        { type: 'emphasis', children: [{ type: 'text', value: 'em' }] },
        { type: 'text', value: ' ' },
        { type: 'strong', children: [{ type: 'text', value: 'strong' }] },
        { type: 'text', value: ' ' },
        { type: 'delete', children: [{ type: 'text', value: 'delete' }] },
        { type: 'text', value: ' ' },
        { type: 'inlineCode', value: '<tag>' },
        { type: 'text', value: ' ' },
        { type: 'link', href: 'https://example.com/?a=1&b=2', children: [{ type: 'text', value: 'link' }] }
      ]
    },
    { type: 'quote', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'quoted' }] }] },
    { type: 'code', language: 'js"bad', value: 'const x = "<&";' },
    {
      type: 'list', ordered: true, start: 3,
      items: [[{ type: 'paragraph', children: [{ type: 'text', value: 'item' }] }]]
    },
    {
      type: 'table', align: ['left', 'right'],
      rows: [
        [[{ type: 'text', value: 'H1' }], [{ type: 'text', value: 'H2' }]],
        [[{ type: 'text', value: 'V1' }], [{ type: 'text', value: 'V2' }]]
      ]
    },
    { type: 'image', src: 'https://example.com/a.png?x=1&y=2', alt: 'A "quote"', title: 'T < X' },
    { type: 'divider' }
  ]);

  assert.match(html, /<h2>A &lt; B &amp; C<\/h2>/);
  assert.match(html, /<em>em<\/em> <strong>strong<\/strong> <del>delete<\/del>/);
  assert.match(html, /<code>&lt;tag&gt;<\/code>/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /<pre><code class="language-js&quot;bad">const x = &quot;&lt;&amp;&quot;;<\/code><\/pre>/);
  assert.match(html, /<ol start="3"><li><p>item<\/p><\/li><\/ol>/);
  assert.match(html, /<thead>.*<th style="text-align: left">H1<\/th>.*<\/thead>/);
  assert.match(html, /<tbody>.*<td style="text-align: right">V2<\/td>.*<\/tbody>/);
  assert.match(html, /src="https:\/\/example\.com\/a\.png\?x=1&amp;y=2"/);
  assert.match(html, /alt="A &quot;quote&quot;" title="T &lt; X"/);
  assert.match(html, /<hr>/);
});

test('createAtomXml uses Issue links, RFC 3339 dates, and XML-escaped complete HTML', () => {
  const xml = createAtomXml({
    version: 1,
    section: 'posts',
    title: 'Posts',
    subtitle: 'Published posts',
    updatedAt: '2026-08-24T08:00:00.000Z',
    data: {
      items: [{
        id: 'issue-42',
        date: '2026-08-20',
        title: 'A < B',
        summary: 'Summary',
        tags: [],
        detail: [{ type: 'paragraph', children: [{ type: 'text', value: 'Body & more' }] }],
        source: {
          issueNumber: 42,
          issueUrl: 'https://github.com/snxq/snxq.github.io/issues/42',
          updatedAt: '2026-08-21T02:00:00.000Z'
        }
      }]
    }
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<link rel="self" type="application\/atom\+xml" href="https:\/\/blog\.snxq\.cc\/feed\.xml">/);
  assert.match(xml, /<id>https:\/\/github\.com\/snxq\/snxq\.github\.io\/issues\/42<\/id>/);
  assert.match(xml, /<published>2026-08-20T00:00:00Z<\/published>/);
  assert.match(xml, /<updated>2026-08-21T02:00:00\.000Z<\/updated>/);
  assert.match(xml, /<title>A &lt; B<\/title>/);
  assert.match(xml, /<content type="html">&lt;p&gt;Body &amp;amp; more&lt;\/p&gt;<\/content>/);
});

test('createAtomXml creates a valid empty feed', () => {
  const xml = createAtomXml({
    version: 1,
    section: 'posts',
    title: 'Posts',
    subtitle: '',
    updatedAt: '2026-08-24T08:00:00.000Z',
    data: { items: [] }
  });

  assert.match(xml, /<updated>2026-08-24T08:00:00\.000Z<\/updated>/);
  assert.doesNotMatch(xml, /<entry>/);
});
```

- [ ] **Step 2: Run tests and verify module-not-found failure**

Run:

```bash
npm test -- --test-name-pattern="renderBlocks|createAtomXml"
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/build-feed.js`.

- [ ] **Step 3: Implement HTML and Atom serialization**

Create `scripts/build-feed.js` with:

```js
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { manifestSchema, sectionDocumentSchema } from './content/schema.js';

const SITE_URL = 'https://blog.snxq.cc/';
const FEED_URL = `${SITE_URL}feed.xml`;
const POSTS_FILENAME = /^posts\.([a-f0-9]{64})\.json$/u;

const escape = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function renderInline(nodes) {
  return nodes.map(node => {
    switch (node.type) {
      case 'text': return escape(node.value);
      case 'emphasis': return `<em>${renderInline(node.children)}</em>`;
      case 'strong': return `<strong>${renderInline(node.children)}</strong>`;
      case 'delete': return `<del>${renderInline(node.children)}</del>`;
      case 'inlineCode': return `<code>${escape(node.value)}</code>`;
      case 'link': return `<a href="${escape(node.href)}">${renderInline(node.children)}</a>`;
      default: throw new Error(`Unsupported rich inline type: ${node.type}`);
    }
  }).join('');
}

const aligned = (tag, cells, align) => `<${tag}${align ? ` style="text-align: ${align}"` : ''}>${renderInline(cells)}</${tag}>`;

export function renderBlocks(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case 'heading': return `<h${block.depth}>${renderInline(block.children)}</h${block.depth}>`;
      case 'paragraph': return `<p>${renderInline(block.children)}</p>`;
      case 'quote': return `<blockquote>${renderBlocks(block.children)}</blockquote>`;
      case 'code': {
        const className = block.language ? ` class="language-${escape(block.language)}"` : '';
        return `<pre><code${className}>${escape(block.value)}</code></pre>`;
      }
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        const start = block.ordered && block.start ? ` start="${block.start}"` : '';
        return `<${tag}${start}>${block.items.map(item => `<li>${renderBlocks(item)}</li>`).join('')}</${tag}>`;
      }
      case 'table': {
        if (block.rows.length === 0) return '<table></table>';
        const row = (cells, tag) => `<tr>${cells.map((cell, index) => aligned(tag, cell, block.align[index])).join('')}</tr>`;
        const [head, ...body] = block.rows;
        return `<table><thead>${row(head, 'th')}</thead>${body.length ? `<tbody>${body.map(cells => row(cells, 'td')).join('')}</tbody>` : ''}</table>`;
      }
      case 'image': {
        const title = block.title === null ? '' : ` title="${escape(block.title)}"`;
        return `<img src="${escape(block.src)}" alt="${escape(block.alt)}"${title}>`;
      }
      case 'divider': return '<hr>';
      default: throw new Error(`Unsupported rich block type: ${block.type}`);
    }
  }).join('');
}

const atomEntry = post => `  <entry>
    <id>${escape(post.source.issueUrl)}</id>
    <title>${escape(post.title)}</title>
    <link href="${escape(post.source.issueUrl)}"></link>
    <published>${post.date}T00:00:00Z</published>
    <updated>${escape(post.source.updatedAt)}</updated>
    <content type="html">${escape(renderBlocks(post.detail))}</content>
  </entry>`;

export function createAtomXml(document) {
  const entries = document.data.items.map(atomEntry).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${FEED_URL}</id>
  <title>snxq.cc posts</title>
  <updated>${escape(document.updatedAt)}</updated>
  <author><name>snxq</name></author>
  <link href="${SITE_URL}"></link>
  <link rel="self" type="application/atom+xml" href="${FEED_URL}"></link>
${entries}${entries ? '\n' : ''}</feed>
`;
}

export async function buildAtomFeed({ contentDirectory, outputPath }) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(contentDirectory, 'manifest.json'), 'utf8')));
  const filename = manifest.files.posts;
  const match = filename.match(POSTS_FILENAME);
  if (!match || basename(filename) !== filename) throw new Error('Posts manifest filename is invalid');

  const bytes = await readFile(join(contentDirectory, filename));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== match[1]) throw new Error('Posts content hash does not match its immutable filename');

  const document = sectionDocumentSchema.parse(JSON.parse(bytes.toString('utf8')));
  if (document.section !== 'posts') throw new Error('Posts manifest file must contain the posts section');
  await writeFile(outputPath, createAtomXml(document));
}
```

- [ ] **Step 4: Run serialization tests**

Run:

```bash
npm test -- --test-name-pattern="renderBlocks|createAtomXml"
```

Expected: all matching tests PASS.

- [ ] **Step 5: Add failing immutable-content boundary tests**

Add to `tests/content/build-site.test.js`:

```js
test('buildAtomFeed rejects unsafe or invalid Posts manifest targets', async t => {
  for (const variant of ['traversal', 'hash', 'section']) {
    await t.test(variant, async () => {
      const { rootDirectory, outputDirectory } = await createSourceSite();
      const contentDirectory = join(rootDirectory, 'generated', 'content');
      const { manifestPath, manifest } = await readManifest(rootDirectory);

      if (variant === 'traversal') {
        manifest.files.posts = '../posts.json';
        await writeFile(manifestPath, JSON.stringify(manifest));
        await assert.rejects(
          buildAtomFeed({ contentDirectory, outputPath: join(outputDirectory, 'feed.xml') }),
          /filename.*invalid/i
        );
        return;
      }

      const original = join(contentDirectory, manifest.files.posts);
      if (variant === 'hash') {
        await writeFile(original, `${await readFile(original, 'utf8')} `);
        await assert.rejects(
          buildAtomFeed({ contentDirectory, outputPath: join(outputDirectory, 'feed.xml') }),
          /hash/i
        );
        return;
      }

      const projects = JSON.parse(await readFile(join(contentDirectory, manifest.files.projects), 'utf8'));
      const bytes = `${JSON.stringify(projects, null, 2)}\n`;
      const hash = createHash('sha256').update(bytes).digest('hex');
      const filename = `posts.${hash}.json`;
      await writeFile(join(contentDirectory, filename), bytes);
      manifest.files.posts = filename;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(
        buildAtomFeed({ contentDirectory, outputPath: join(outputDirectory, 'feed.xml') }),
        /posts section/i
      );
    });
  }
});
```

Use `readManifest(rootDirectory)` deliberately: the helper resolves `generated/content/manifest.json` below the supplied directory.

- [ ] **Step 6: Run all Task 1 tests**

Run:

```bash
npm test -- --test-name-pattern="renderBlocks|createAtomXml|buildAtomFeed"
```

Expected: all matching tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add scripts/build-feed.js tests/content/build-site.test.js
git commit -m "feat: build Atom feed from published posts"
```

### Task 2: Integrate Feed into static build and validation

**Files:**
- Modify: `scripts/build-site.js:1-23`
- Modify: `scripts/check-static-site.js:1-99`
- Modify: `tests/content/build-site.test.js`
- Modify: `index.html:3-10`

**Interfaces:**
- Consumes: `buildAtomFeed({ contentDirectory, outputPath })` from Task 1.
- Produces: `dist/feed.xml` on every static build.
- Extends: `checkStaticSite(outputDirectory)` to require and validate the Feed.

- [ ] **Step 1: Add failing static-build and discovery tests**

Update the existing root-output test assertion:

```js
assert.deepEqual(entries, ['CNAME', 'favicon.svg', 'feed.xml', 'generated', 'index.html', 'src', 'styles.css']);
```

Add:

```js
test('buildStaticSite generates a feed from the published Posts document', async () => {
  const { outputDirectory } = await builtSite();
  const xml = await readFile(join(outputDirectory, 'feed.xml'), 'utf8');
  const { manifest } = await readManifest(outputDirectory);
  const posts = JSON.parse(await readFile(join(outputDirectory, 'generated/content', manifest.files.posts), 'utf8'));

  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  for (const post of posts.data.items) {
    assert.match(xml, new RegExp(`<id>${post.source.issueUrl.replaceAll('.', '\\.')}<\\/id>`));
  }
  assert.equal((xml.match(/<entry>/g) ?? []).length, posts.data.items.length);
});

test('checkStaticSite rejects a missing or malformed feed', async t => {
  await t.test('missing', async () => {
    const { outputDirectory } = await builtSite();
    await rm(join(outputDirectory, 'feed.xml'));
    await assert.rejects(checkStaticSite(outputDirectory), /feed\.xml/);
  });

  await t.test('malformed', async () => {
    const { outputDirectory } = await builtSite();
    await writeFile(join(outputDirectory, 'feed.xml'), '<not-atom>');
    await assert.rejects(checkStaticSite(outputDirectory), /Atom feed.*invalid/i);
  });
});

test('index advertises the Atom feed', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="alternate" type="application\/atom\+xml" title="snxq\.cc posts" href="feed\.xml">/);
});
```

Add `rm` to the existing `node:fs/promises` import.

- [ ] **Step 2: Run targeted tests and verify failures**

Run:

```bash
npm test -- --test-name-pattern="copies only deployable roots|generates a feed|missing or malformed feed|advertises the Atom feed"
```

Expected: failures because build does not generate Feed, checker does not require it, and index lacks discovery metadata.

- [ ] **Step 3: Generate Feed during static build**

Update `scripts/build-site.js`:

```js
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAtomFeed } from './build-feed.js';

const deployablePaths = ['CNAME', 'index.html', 'favicon.svg', 'styles.css', 'src', 'generated/content'];

export async function buildStaticSite({ rootDirectory, outputDirectory }) {
  await rm(outputDirectory, { force: true, recursive: true });

  for (const relativePath of deployablePaths) {
    await cp(join(rootDirectory, relativePath), join(outputDirectory, relativePath), {
      recursive: true
    });
  }

  await buildAtomFeed({
    contentDirectory: join(outputDirectory, 'generated/content'),
    outputPath: join(outputDirectory, 'feed.xml')
  });
}
```

- [ ] **Step 4: Require and validate Atom output**

In `scripts/check-static-site.js`, add `feed.xml` to `requiredPaths`, then add:

```js
async function validateFeed(outputDirectory) {
  const xml = await readFile(join(outputDirectory, 'feed.xml'), 'utf8');
  const valid = /^<\?xml version="1\.0" encoding="utf-8"\?>/u.test(xml)
    && xml.includes('<feed xmlns="http://www.w3.org/2005/Atom">')
    && xml.includes('<link rel="self" type="application/atom+xml" href="https://blog.snxq.cc/feed.xml"></link>')
    && [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gu)].every(([, entry]) =>
      /<id>https:\/\/github\.com\/[^<]+<\/id>/u.test(entry)
      && /<link href="https:\/\/github\.com\/[^"]+"><\/link>/u.test(entry)
      && /<published>\d{4}-\d{2}-\d{2}T00:00:00Z<\/published>/u.test(entry)
      && /<updated>[^<]+Z<\/updated>/u.test(entry)
      && /<content type="html">[\s\S]*<\/content>/u.test(entry)
    );
  if (!valid) throw new Error('Static Atom feed is invalid');
}
```

Call it after section validation:

```js
await validateSections(outputDirectory, manifest);
await validateFeed(outputDirectory);
```

- [ ] **Step 5: Advertise the Feed**

Insert after the favicon link in `index.html`:

```html
<link rel="alternate" type="application/atom+xml" title="snxq.cc posts" href="feed.xml">
```

- [ ] **Step 6: Run targeted and full tests**

Run:

```bash
npm test -- --test-name-pattern="copies only deployable roots|generates a feed|missing or malformed feed|advertises the Atom feed"
npm test
```

Expected: targeted tests PASS; full suite reports 0 failures.

- [ ] **Step 7: Run the full fixture build pipeline**

Run:

```bash
npm run content:build:fixture
npm run site:build
npm run site:check
```

Expected: all commands exit 0 and `dist/feed.xml` exists.

- [ ] **Step 8: Commit Task 2**

```bash
git add scripts/build-site.js scripts/check-static-site.js tests/content/build-site.test.js index.html
git commit -m "feat: publish and validate Atom feed"
```

### Task 3: Trigger rebuilds when Issues are deleted

**Files:**
- Modify: `.github/workflows/content-deploy.yml:6-8`

**Interfaces:**
- Extends existing workflow events only; no new job, permission, token, or script interface.

- [ ] **Step 1: Add the deleted Issue event**

Change:

```yaml
types: [opened, edited, closed, reopened, labeled, unlabeled]
```

To:

```yaml
types: [opened, edited, deleted, closed, reopened, labeled, unlabeled]
```

- [ ] **Step 2: Verify the workflow diff remains minimal**

Run:

```bash
git diff -- .github/workflows/content-deploy.yml
```

Expected: the only workflow change is insertion of `deleted`; existing PR fixture, tokens, validation comments, permissions and Pages deployment remain unchanged.

- [ ] **Step 3: Run end-to-end verification**

Run:

```bash
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
git diff --check
```

Expected: all commands exit 0; `git diff --check` has no output.

- [ ] **Step 4: Inspect final Feed contract**

Run:

```bash
grep -E '<feed |rel="self"|<entry>|<published>|<content type="html">' dist/feed.xml
```

Expected: Atom root, correct `https://blog.snxq.cc/feed.xml` self link, Entries, RFC 3339 publication dates and HTML content are present.

- [ ] **Step 5: Commit Task 3**

```bash
git add .github/workflows/content-deploy.yml
git commit -m "ci: rebuild content when issues are deleted"
```

### Task 4: Final whole-branch verification

**Files:**
- Verify: all Task 1–3 files
- Verify: `docs/superpowers/specs/2026-08-24-github-issues-atom-feed-design.md`
- Verify: `docs/superpowers/plans/2026-08-24-static-content-atom-feed.md`

**Interfaces:**
- Produces merge-readiness evidence; no new runtime interface.

- [ ] **Step 1: Run the complete deterministic pipeline**

```bash
npm test && npm run content:build:fixture && npm run site:build && npm run site:check
```

Expected: all tests and scripts pass.

- [ ] **Step 2: Validate repository state**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, no generated `dist` files, and no unrelated changes.

- [ ] **Step 3: Commit design and plan if still uncommitted**

```bash
git add docs/superpowers/specs/2026-08-24-github-issues-atom-feed-design.md docs/superpowers/plans/2026-08-24-static-content-atom-feed.md
git commit -m "docs: design static Atom feed"
```

Do not create an empty commit if the documents were already committed.
