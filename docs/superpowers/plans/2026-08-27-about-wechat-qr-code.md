# Same-Origin WeChat QR Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在内容构建阶段安全下载 About 二维码并发布为同源静态 PNG，避免访客浏览器请求 GitHub 或任意第三方域名。

**Architecture:** 保留 Issue 中的 GitHub 用户附件 URL 作为构建期输入；新增共享 `qr-asset.js` 负责 URL/redirect/PNG 校验、hash 命名和同源路径验证。`build-content.js` 在规范化后、原子写入前物化图片并替换 About 字段，fixture 使用本地 PNG；最终 Schema、`site:check` 和 renderer 只接受同源 hash 路径。

**Tech Stack:** Node.js 22、Node 标准库 `fetch`/`crypto`/`fs`、Zod、现有 `node:test`、GitHub Actions、原生 DOM/CSS。

## Global Constraints

- 输入 URL 严格为 `https://github.com/user-attachments/assets/<uuid>`，UUID 为十六进制标准 36 字符格式；不得有 query、fragment 或额外路径。
- 下载使用 `redirect: 'manual'`，逐跳校验 HTTPS 和允许 host，最多 3 次；允许 GitHub 用户附件入口及 `github-production-user-asset-<字母或数字>.s3.amazonaws.com`。
- 不向图片请求发送 `GITHUB_TOKEN` 或其他认证头。
- 只接受 `image/png`，最大 1 MiB；同时检查 `Content-Length` 与实际流式字节数。
- PNG 必须有正确 8 字节签名、合法 IHDR、正方形尺寸，边长 1–2048px。
- 文件命名为 `assets/wechat-qr.<sha256>.png`，About 发布值为 `/generated/content/assets/wechat-qr.<sha256>.png`。
- 构建中间态只接受远程 GitHub 用户附件 URL；最终发布态只接受 `null` 或严格同源 asset path；物化后重新 Schema 校验。
- 所有资源错误关联 About Issue，转换为 `ContentValidationError`；失败时不替换旧 `generated/content`。
- PR fixture 不访问网络，显式使用 `tests/fixtures/assets/wechat-qr.png`；缺少 fixture 必须失败。
- 浏览器 renderer 只加载同源 hash 路径，继续保持不可点击、lazy、async、错误隐藏和响应式布局。
- 不增加依赖，不修改 `src/content-api.js`，不建设通用图片或多图模型。

---

### Task 1: Add shared QR asset validation and fixture support

**Files:**
- Create: `scripts/content/qr-asset.js`
- Create: `tests/fixtures/assets/wechat-qr.png`
- Modify: `scripts/content/build-content.js`
- Modify: `package.json:5-13`
- Modify: `tests/content/build-content.test.js`

**Interfaces:**
- Produces: `validateSourceUrl(value): URL`
- Produces: `fetchQrPng(url, { fetchImpl }): Promise<Uint8Array>`
- Produces: `validatePng(bytes, contentType): { width, height }`
- Produces: `assetPathFor(bytes): string`
- Produces: `materializeAboutAsset({ issue, sourceUrl, assetFixtures, fetchImpl }): Promise<{ path, bytes }>`
- Produces: `materializeContentAssets({ documents, records, assetFixtures, fetchImpl }): Promise<void>`
- Consumes: `buildDocuments()` output and About record metadata.

- [ ] **Step 1: Create a real deterministic PNG fixture**

Add a small valid square PNG under `tests/fixtures/assets/wechat-qr.png`. Generate it with a checked-in base64 payload or a binary write script, but commit the resulting PNG only under `tests/fixtures/assets/`. The fixture must be a valid PNG, square, and no larger than 1 MiB; do not use a placeholder URL or fake production value.

- [ ] **Step 2: Write failing resource-validation tests**

Add tests to `tests/content/build-content.test.js` using injected `fetchImpl` responses and the fixture:

```js
test('validates QR source URL and rejects unsafe variants', async () => {
  for (const value of [
    'http://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000',
    'https://evil.example/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000',
    'https://github.com/user-attachments/assets/not-a-uuid',
    'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000?raw=1',
    'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000/extra'
  ]) {
    assert.throws(() => validateSourceUrl(value), /WeChat QR Code URL|GitHub user attachment/i);
  }
});

test('downloads one allowed redirect and validates PNG metadata', async () => {
  const bytes = await readFile(new URL('../fixtures/assets/wechat-qr.png', import.meta.url));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return new Response(null, { status: 302, headers: { location: 'https://github-production-user-asset-6210df.s3.amazonaws.com/file.png' } });
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) } });
  };
  const result = await fetchQrPng('https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000', { fetchImpl });

  assert.equal(result.bytes.length, bytes.length);
  assert.deepEqual(result.size, { width: 2, height: 2 });
  assert.equal(calls[0].options.redirect, 'manual');
});

test('rejects bad QR responses and disallowed redirects', async () => {
  const response = (body, headers = {}) => new Response(body, { status: 200, headers });
  await assert.rejects(fetchQrPng('https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000', { fetchImpl: async () => response('x', { 'content-type': 'text/plain' }) }), /PNG|Content-Type/i);
  await assert.rejects(fetchQrPng('https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000', { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/file.png' } }) }), /redirect|host/i);
});

test('materializes fixture QR as a content-hashed same-origin asset', async () => {
  const issue = { number: 40, title: '[about] Profile', html_url: 'https://github.com/snxq/snxq.cc/issues/40' };
  const result = await materializeAboutAsset({ issue, sourceUrl: 'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000', assetFixtures: new URL('../fixtures/assets', import.meta.url).pathname });

  assert.match(result.path, /^\/generated\/content\/assets\/wechat-qr\.[a-f0-9]{64}\.png$/);
  assert.ok(result.bytes.length > 0);
});
```

Import the named functions under test and `readFile`/`Response` from Node globals as required by the existing test style.

- [ ] **Step 3: Run focused tests to verify failure**

Run:

```bash
npm test -- --test-name-pattern="QR source|allowed redirect|bad QR|materializes fixture"
```

Expected: FAIL because `scripts/content/qr-asset.js` and fixture integration do not exist.

- [ ] **Step 4: Implement shared URL, redirect, byte, and PNG validation**

Create `scripts/content/qr-asset.js` with these exact rules:

```js
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const MAX_BYTES = 1024 * 1024;
const MAX_DIMENSION = 2048;
const SOURCE_PATH = /^\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ASSET_PATH = /^\/generated\/content\/assets\/wechat-qr\.([a-f0-9]{64})\.png$/u;
const GITHUB_ASSET_HOST = /^github-production-user-asset-[a-z0-9]+\.s3\.amazonaws\.com$/iu;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const fail = message => { throw new Error(`WeChat QR Code URL: ${message}`); };

export function validateSourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('must be a valid GitHub user attachment URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !SOURCE_PATH.test(url.pathname) || url.search || url.hash) {
    fail('must be https://github.com/user-attachments/assets/<uuid> without query or fragment');
  }
  return url;
}

function allowedRedirect(url) {
  return url.protocol === 'https:'
    && (url.hostname === 'github.com' || GITHUB_ASSET_HOST.test(url.hostname));
}

async function readResponseBytes(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) fail('image exceeds 1 MiB');
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) fail('image exceeds 1 MiB');
    return bytes;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) fail('image exceeds 1 MiB');
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function validatePng(bytes, contentType) {
  if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'image/png') fail('Content-Type must be image/png');
  if (bytes.length > MAX_BYTES || bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) fail('must be a valid PNG under 1 MiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail('PNG IHDR is invalid');
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width !== height) fail('PNG must be square and 1–2048px');
  return { width, height };
}

export function assetPathFor(bytes) {
  return `/generated/content/assets/wechat-qr.${createHash('sha256').update(bytes).digest('hex')}.png`;
}

export function validateAssetPath(bytes, value) {
  const match = ASSET_PATH.exec(value);
  if (!match || match[1] !== createHash('sha256').update(bytes).digest('hex')) fail('asset path hash is invalid');
  return value;
}

export async function fetchQrPng(value, { fetchImpl = fetch, maxRedirects = 3 } = {}) {
  let url = validateSourceUrl(value);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(url, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRedirects) fail('too many redirects');
      const location = response.headers.get('location');
      if (!location) fail('redirect has no Location');
      url = new URL(location, url);
      if (!allowedRedirect(url)) fail('redirect host is not allowed');
      continue;
    }
    if (!response.ok) fail(`download failed with HTTP ${response.status}`);
    const bytes = await readResponseBytes(response);
    const size = validatePng(bytes, response.headers.get('content-type'));
    return { bytes, size };
  }
}

export async function materializeAboutAsset({ issue, sourceUrl, assetFixtures, fetchImpl }) {
  let result;
  try {
    if (assetFixtures) {
      result = { bytes: new Uint8Array(await readFile(`${assetFixtures}/wechat-qr.png`)) };
      result.size = validatePng(result.bytes, 'image/png');
    } else {
      result = await fetchQrPng(sourceUrl, { fetchImpl });
    }
  } catch (error) {
    if (error.message.startsWith('WeChat QR Code URL:')) throw error;
    throw new Error(`WeChat QR Code URL: ${error.message}`, { cause: error });
  }
  return { path: assetPathFor(result.bytes), bytes: result.bytes, size: result.size, issue };
}
```

The caller wraps the thrown Error with the About Issue context as `ContentValidationError`; this module remains reusable by `site:check`.

- [ ] **Step 5: Thread fixture option through the CLI**

Modify `buildContent(options)` and `parseArguments(argv)` in `scripts/content/build-content.js`:

```js
// buildContent()
const assetFixtures = options.assetFixtures;
// after buildDocuments()
await materializeContentAssets({ documents, records: documents.records, assetFixtures, fetchImpl: options.fetchImpl });
```

The implementation must retain the About source Issue metadata needed for error attribution. If `buildDocuments()` currently discards records, add a non-enumerable `records` property to its returned `documents` object so manifest bytes and existing equality tests remain unchanged.

Add `--asset-fixtures` to the returned CLI options:

```js
assetFixtures: options['asset-fixtures']
```

Update `package.json`:

```json
"content:build:fixture": "node scripts/content/build-content.js --source fixture --fixtures tests/fixtures/issues --asset-fixtures tests/fixtures/assets --output generated/content --repository fixture/content"
```

Production `content:build` leaves `assetFixtures` unset and downloads the validated Issue URL.

- [ ] **Step 6: Write assets into the same atomic temporary directory**

Update `writeDocumentsAtomically()` to accept `assets`, create `temporary/assets`, and write every hashed PNG before the temporary directory is renamed. The generated About document must already contain the same-origin path before final manifest/section serialization and Schema validation.

- [ ] **Step 7: Run focused and full content tests**

Run:

```bash
npm test -- --test-name-pattern="QR|About|atomic|fixture"
npm test
npm run content:build:fixture
```

Expected: all tests pass, fixture build writes `generated/content/assets/wechat-qr.<sha256>.png`, and generated About JSON stores only the same-origin path.

- [ ] **Step 8: Commit Task 1**

```bash
git add scripts/content/qr-asset.js scripts/content/build-content.js package.json tests/fixtures/assets/wechat-qr.png tests/content/build-content.test.js
 git commit -m "feat: materialize About QR as same-origin asset"
```

### Task 2: Enforce published asset Schema and static checks

**Files:**
- Modify: `scripts/content/schema.js:1-124`
- Modify: `scripts/check-static-site.js:1-117`
- Modify: `tests/content/schema.test.js` or existing schema test location
- Modify: `tests/content/build-site.test.js`

**Interfaces:**
- Consumes: `validateAssetPath`, PNG validation and generated `assets` directory from Task 1.
- Produces: final published About schema rejects remote URLs; static checker verifies asset existence, hash, PNG constraints.

- [ ] **Step 1: Add failing final-contract tests**

Add tests asserting:

```js
assert.equal(publishedAboutSchema.safeParse({ ...base, wechatQrCodeUrl: null }).success, true);
assert.equal(publishedAboutSchema.safeParse({ ...base, wechatQrCodeUrl: '/generated/content/assets/wechat-qr.' + 'a'.repeat(64) + '.png' }).success, true);
assert.equal(publishedAboutSchema.safeParse({ ...base, wechatQrCodeUrl: 'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000' }).success, false);
```

Add static-site cases for missing asset and hash mismatch; `checkStaticSite` must reject them.

- [ ] **Step 2: Implement separate build and published About schemas**

Export `aboutBuildSchema` with optional nullable strict GitHub source URL and `aboutPublishedSchema` with optional nullable strict same-origin path. Use the published schema in final `sectionDocumentSchema`; use the build schema for the pre-materialization About document validation in `build-content.js`, then published schema after replacement.

Do not use a permissive union that allows remote URLs in final output.

- [ ] **Step 3: Validate assets in `site:check`**

After section validation, read the published About document and, when the path is non-null:

1. Match strict asset path and extract hash.
2. Resolve only under `dist/generated/content/assets`.
3. Read bytes and verify SHA-256 equals extracted hash.
4. Reuse `validatePng(bytes, 'image/png')` and require valid size/signature/dimensions.
5. Reject any remote URL or missing asset.

- [ ] **Step 4: Add tests and run full checks**

Run:

```bash
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
git diff --check
```

Expected: all commands exit 0 and deployed About JSON contains same-origin path plus matching asset.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/content/schema.js scripts/check-static-site.js tests/content/schema.test.js tests/content/build-site.test.js
git commit -m "test: enforce same-origin QR assets"
```

### Task 3: Restrict About renderer to same-origin assets

**Files:**
- Modify: `src/app.js:186-212`
- Modify: `styles.css:163-172,279-310`

**Interfaces:**
- Consumes: `wechatQrCodeUrl?: string | null` final published path.
- Produces: same existing `.wechat-card`, but no remote URL request.

- [ ] **Step 1: Add strict path guard**

Replace the current renderer guard:

```js
const WECHAT_QR_PATH = /^\/generated\/content\/assets\/wechat-qr\.[a-f0-9]{64}\.png$/u;

function wechatQrCard(url) {
  if (typeof url !== 'string' || !WECHAT_QR_PATH.test(url)) return null;
  const card = el('div', { className: 'wechat-card' });
  // retain the existing image attributes, fixed copy, error handler, and no anchor
}
```

- [ ] **Step 2: Run automated and browser checks**

Run:

```bash
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
```

Then use the existing local fixture server at `http://localhost:4173` and verify:

- About QR `src` starts with `http://localhost:4173/generated/content/assets/`.
- `card.querySelectorAll('a').length === 0`.
- fixed alt/copy/loading/decoding remain correct.
- dispatching `error` sets `card.hidden === true`.
- desktop row and 390px mobile column remain intact.
- no document horizontal overflow.

- [ ] **Step 3: Commit Task 3**

```bash
git add src/app.js styles.css
git commit -m "fix: keep About QR image same-origin"
```

### Task 4: Final verification and documentation

**Files:**
- Verify: all implementation files above
- Modify if needed: `docs/superpowers/specs/2026-08-27-about-wechat-qr-code-design.md`
- Verify: `docs/superpowers/plans/2026-08-27-about-wechat-qr-code.md`

- [ ] **Step 1: Run complete verification**

```bash
npm test && npm run content:build:fixture && npm run site:build && npm run site:check && git diff --check
```

Expected: all tests pass and no whitespace errors.

- [ ] **Step 2: Inspect generated contract**

```bash
python -c 'import json, pathlib, re; m=json.load(open("generated/content/manifest.json")); d=json.load(open(pathlib.Path("generated/content")/m["files"]["about"])); print(d["data"]["wechatQrCodeUrl"]); print(sorted(pathlib.Path("generated/content/assets").iterdir()))'
```

Expected: printed path matches `/generated/content/assets/wechat-qr.<64 lowercase hex>.png`, and exactly that asset exists.

- [ ] **Step 3: Review repository state**

```bash
git status --short
git diff --stat
```

Expected: generated/ and dist/ remain ignored; only intended implementation, tests, docs, and plan changes exist.

- [ ] **Step 4: Commit updated design and plan**

```bash
git add docs/superpowers/specs/2026-08-27-about-wechat-qr-code-design.md docs/superpowers/plans/2026-08-27-about-wechat-qr-code.md
git commit -m "docs: plan same-origin QR asset pipeline"
```

Do not create an empty commit when already committed.
