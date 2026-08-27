# About WeChat QR Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让唯一的 `content:about` Issue 可配置“深夜旅行”微信公众号二维码，并在 About 页面资料与链接之后以不可点击的信息卡展示。

**Architecture:** 在现有 About 结构化字段中增加可选 HTTPS 图片 URL，内容规范化始终输出 `null | URL`，Schema 兼容旧文档缺失字段。客户端 renderer 直接消费透传数据并条件渲染二维码卡片；自动测试覆盖内容合同，浏览器 smoke test 覆盖 DOM 行为和响应式布局。

**Tech Stack:** Node.js 22、现有 Issue Form/内容解析器、Zod、原生 DOM、CSS、Node `node:test`、Chrome DevTools/Playwright 浏览器 smoke test。

## Global Constraints

- 字段名固定为 `WeChat QR Code URL`，规范化属性固定为 `wechatQrCodeUrl`。
- 字段可选；新生成文档始终输出 `null | HTTPS URL`。
- Schema 使用 `imageUrlSchema.nullable().optional()` 兼容旧 About 文档。
- 公众号名称固定为“深夜旅行”，类型固定为“微信公众号”，提示固定为“扫码关注”。
- 图片 `alt` 固定为“深夜旅行微信公众号二维码”。
- 图片不可点击，不添加链接、弹窗、下载或放大交互。
- 图片使用 `loading="lazy"` 与 `decoding="async"`。
- 图片加载失败时隐藏整张二维码卡片。
- 桌面端为横向信息卡；窄屏为居中纵向布局。
- 不修改 `src/content-api.js`，不新增依赖或 DOM 测试框架。
- 不建设通用图片或多图模型，不修改其他内容类型。

---

### Task 1: Extend the About content contract

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/content-about.yml:31-41`
- Modify: `scripts/content/constants.js:26-36`
- Modify: `scripts/content/normalize.js:259-268`
- Modify: `scripts/content/schema.js:86-89`
- Modify: `tests/content/normalize.test.js:161-177`
- Modify: `tests/content/schema.test.js`
- Modify: `tests/content/templates.test.js`
- Modify: `tests/fixtures/issues/valid.json:176-190`

**Interfaces:**
- Produces: About normalized field `wechatQrCodeUrl: string | null`.
- Produces: About Schema field `wechatQrCodeUrl?: string | null`.
- Consumed by Task 2: `renderAbout(data)` reads `data.wechatQrCodeUrl ?? null`.

- [ ] **Step 1: Add failing normalization tests**

Update the existing About test in `tests/content/normalize.test.js`:

```js
test('normalizes about newline fields, links, and optional WeChat QR code', () => {
  const about = normalizeIssue(issue(10, '[about] Profile'), 'about', {
    'Display Name': 'snxq', Role: 'builder', Bio: 'Bio', Location: 'UTC+8', Status: 'building',
    Fields: 'Software\n\nDesign', Links: 'GitHub | https://github.com/snxq\nEmail | mailto:hi@example.com',
    'WeChat QR Code URL': 'https://github.com/user-attachments/assets/qr-code'
  });
  assert.deepEqual(about.fields, ['Software', 'Design']);
  assert.deepEqual(about.links, [
    ['GitHub', 'https://github.com/snxq'],
    ['Email', 'mailto:hi@example.com']
  ]);
  assert.equal(about.wechatQrCodeUrl, 'https://github.com/user-attachments/assets/qr-code');

  const withoutQrCode = normalizeIssue(issue(11, '[about] Profile'), 'about', {
    'Display Name': 'snxq', Role: 'builder', Bio: 'Bio', Location: '', Status: '',
    Fields: '', Links: '', 'WeChat QR Code URL': ''
  });
  assert.equal(withoutQrCode.wechatQrCodeUrl, null);

  for (const value of ['http://example.com/qr.png', 'not-a-url']) {
    assert.throws(
      () => normalizeIssue(issue(12, '[about] Profile'), 'about', {
        'Display Name': 'snxq', Role: 'builder', Bio: 'Bio', Location: '', Status: '',
        Fields: '', Links: '', 'WeChat QR Code URL': value
      }),
      /WeChat QR Code URL/
    );
  }
});
```

Keep the existing broken `Links` assertion as a separate test named `rejects malformed About links` so both behaviors remain covered.

- [ ] **Step 2: Add failing Schema compatibility tests**

Locate the About document Schema test in `tests/content/schema.test.js` and add:

```js
test('About schema accepts optional HTTPS WeChat QR code URLs only', () => {
  const base = {
    name: 'snxq', role: 'builder', bio: 'Bio', location: '', status: '', fields: [], links: []
  };
  const envelope = data => ({
    version: 1,
    section: 'about',
    title: '关于',
    subtitle: 'IDENTITY SHEET',
    updatedAt: '2026-08-27T00:00:00Z',
    data
  });

  assert.equal(sectionDocumentSchema.safeParse(envelope(base)).success, true);
  assert.equal(sectionDocumentSchema.safeParse(envelope({ ...base, wechatQrCodeUrl: null })).success, true);
  assert.equal(sectionDocumentSchema.safeParse(envelope({ ...base, wechatQrCodeUrl: 'https://example.com/qr.png' })).success, true);
  assert.equal(sectionDocumentSchema.safeParse(envelope({ ...base, wechatQrCodeUrl: 'http://example.com/qr.png' })).success, false);
});
```

If the repository has no `tests/content/schema.test.js`, add this test to `tests/content/markdown.test.js`, which already imports `sectionDocumentSchema`; do not create a new single-test file.

- [ ] **Step 3: Add a failing template assertion**

Append to `tests/content/templates.test.js`:

```js
test('About template offers an optional WeChat QR code URL', async () => {
  const source = await readFile(new URL('content-about.yml', templates), 'utf8');
  assert.match(source, /id: wechat-qr-code-url/u);
  assert.match(source, /label: WeChat QR Code URL/u);
  assert.match(source, /description: HTTPS image URL for the 深夜旅行 official account QR code\./u);
});
```

- [ ] **Step 4: Update the valid fixture and verify tests fail**

In the About body inside `tests/fixtures/issues/valid.json`, append:

```text

### WeChat QR Code URL

https://github.com/user-attachments/assets/qr-code
```

Run:

```bash
npm test -- --test-name-pattern="WeChat QR|optional WeChat|normalizes about"
```

Expected: FAIL because the field is not accepted, normalized, or declared in Schema/template.

- [ ] **Step 5: Add the Issue Form field and parser allowlist**

Append to `.github/ISSUE_TEMPLATE/content-about.yml`:

```yaml
  - type: input
    id: wechat-qr-code-url
    attributes:
      label: WeChat QR Code URL
      description: HTTPS image URL for the 深夜旅行 official account QR code.
```

Update `FORM_FIELDS.about` in `scripts/content/constants.js`:

```js
about: ['Display Name', 'Role', 'Bio', 'Location', 'Status', 'Fields', 'Links', 'WeChat QR Code URL'],
```

- [ ] **Step 6: Normalize the optional HTTPS image URL**

Update the About branch in `scripts/content/normalize.js`:

```js
case 'about':
  return {
    name: required(issue, fields, 'Display Name'),
    role: required(issue, fields, 'Role'),
    bio: required(issue, fields, 'Bio'),
    location: optional(fields, 'Location'),
    status: optional(fields, 'Status'),
    fields: lines(optional(fields, 'Fields')),
    links: normalizeLinks(issue, optional(fields, 'Links')),
    wechatQrCodeUrl: url(issue, 'WeChat QR Code URL', optional(fields, 'WeChat QR Code URL'), {
      protocols: new Set(['https:'])
    })
  };
```

Reuse the existing `url()` function; do not add a QR-specific validator.

- [ ] **Step 7: Extend the strict About Schema compatibly**

Update `aboutSchema` in `scripts/content/schema.js`:

```js
const aboutSchema = z.object({
  name: z.string(), role: z.string(), bio: z.string(), location: z.string(), status: z.string(),
  fields: z.array(z.string()), links: z.array(z.tuple([z.string(), linkUrlSchema])),
  wechatQrCodeUrl: imageUrlSchema.nullable().optional()
}).strict();
```

- [ ] **Step 8: Run focused and full automated tests**

Run:

```bash
npm test -- --test-name-pattern="WeChat QR|optional WeChat|normalizes about|malformed About links"
npm test
npm run content:build:fixture
```

Expected: focused tests PASS; full suite has 0 failures; fixture content build succeeds and generated About data contains the HTTPS URL.

- [ ] **Step 9: Commit Task 1**

```bash
git add .github/ISSUE_TEMPLATE/content-about.yml scripts/content/constants.js scripts/content/normalize.js scripts/content/schema.js tests/content/normalize.test.js tests/content/markdown.test.js tests/content/templates.test.js tests/fixtures/issues/valid.json
git commit -m "feat: add About WeChat QR content field"
```

If the Schema test was placed in another existing test file, stage that file instead of `tests/content/markdown.test.js`.

### Task 2: Render the non-interactive QR information card

**Files:**
- Modify: `src/app.js:186-193`
- Modify: `styles.css:163-172,279-310`

**Interfaces:**
- Consumes: `data.wechatQrCodeUrl?: string | null` from Task 1.
- Produces: conditional `.wechat-card` containing an `<img>` and fixed descriptive copy.
- Browser behavior: image `error` hides the `.wechat-card`; no `<a>` or click handler exists.

- [ ] **Step 1: Add the minimal renderer code**

Add before `renderAbout` in `src/app.js`:

```js
function wechatQrCard(url) {
  const resolved = safeHref(url, ['https:']);
  if (!resolved) return null;

  const card = el('div', { className: 'wechat-card' });
  const image = el('img', {
    className: 'wechat-qr',
    attrs: {
      src: resolved,
      alt: '深夜旅行微信公众号二维码',
      loading: 'lazy',
      decoding: 'async'
    },
    on: { error: () => { card.hidden = true; } }
  });
  card.append(image, el('div', { className: 'wechat-copy' }, [
    text('strong', '深夜旅行'),
    text('span', '微信公众号'),
    text('small', '扫码关注')
  ]));
  return card;
}
```

Update `renderAbout` so the links and optional card remain in the right column:

```js
function renderAbout(data) {
  if (!data || !Array.isArray(data.fields) || !Array.isArray(data.links)) return unavailableState();
  const facts = [['LOCATION', data.location], ['NOW', data.status], ['FIELDS', data.fields.join(' · ')]];
  const qrCard = wechatQrCard(data.wechatQrCodeUrl ?? null);
  return el('div', { className: 'identity' }, [
    text('div', 'sx', 'identity-monogram'),
    el('div', { className: 'identity-copy' }, [
      text('p', data.role, 'role'),
      text('h3', data.name),
      text('p', data.bio, 'bio'),
      el('div', { className: 'fact-list' }, facts.map(([key, value]) =>
        el('div', { className: 'fact' }, [text('strong', key), text('span', value)])
      )),
      el('div', { className: 'link-row' }, data.links.map(([label, href]) => safeLink(`${label} ↗`, href))),
      qrCard
    ])
  ]);
}
```

The existing `el()` helper skips `null` children, so no extra conditional branch is needed.

- [ ] **Step 2: Add desktop card styles**

Append after `.text-link` in `styles.css`:

```css
.wechat-card {
  display: flex;
  align-items: center;
  gap: 18px;
  width: fit-content;
  margin-top: 24px;
  padding: 14px;
  border: 1px solid var(--line);
  background: rgba(233,224,206,.018);
}
.wechat-card[hidden] { display: none; }
.wechat-qr { display: block; width: 112px; height: 112px; object-fit: contain; background: #fff; }
.wechat-copy { display: grid; gap: 7px; min-width: 110px; }
.wechat-copy strong { font-size: 15px; font-weight: 500; }
.wechat-copy span { color: var(--paper-dim); font-size: 12px; }
.wechat-copy small { color: var(--rust); font: 400 8px/1.4 var(--mono); letter-spacing: .14em; }
```

- [ ] **Step 3: Add the narrow-screen layout**

Inside the existing `@media (max-width: 640px)` block, add:

```css
.wechat-card { width: 100%; flex-direction: column; text-align: center; }
.wechat-copy { justify-items: center; }
```

- [ ] **Step 4: Run automated regression checks**

Run:

```bash
npm test
npm run content:build:fixture
npm run site:build
npm run site:check
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/app.js styles.css
git commit -m "feat: render About WeChat QR card"
```

### Task 3: Browser smoke test the QR card

**Files:**
- Verify only: generated fixture site and Task 2 files

**Interfaces:**
- Consumes: fixture About document containing `wechatQrCodeUrl`.
- Produces: browser evidence for desktop/mobile layout and error behavior; no code unless a verified defect is found.

- [ ] **Step 1: Build and launch the fixture site**

Run:

```bash
npm run content:build:fixture
npm run site:build
npm run serve
```

Keep the server running at `http://localhost:4173`.

- [ ] **Step 2: Verify the desktop About card in a browser**

At a desktop viewport around `1280 × 900`:

1. Open `http://localhost:4173`.
2. Enter the `about` command.
3. Confirm `.wechat-card` exists after `.link-row`.
4. Confirm `.wechat-card a` count is `0`.
5. Confirm the image has:
   - `alt="深夜旅行微信公众号二维码"`
   - `loading="lazy"`
   - `decoding="async"`
6. Confirm fixed text “深夜旅行 / 微信公众号 / 扫码关注”。
7. Capture and inspect a screenshot; the QR card must remain secondary to the name and Bio.

- [ ] **Step 3: Verify image failure behavior**

In the browser console or automation evaluate:

```js
const image = document.querySelector('.wechat-qr');
image.dispatchEvent(new Event('error'));
document.querySelector('.wechat-card').hidden;
```

Expected: result is `true`, and the card disappears without affecting the About content.

- [ ] **Step 4: Verify the narrow-screen layout**

Resize to approximately `390 × 844` and reopen About if necessary.

Expected:

- Existing `.identity` becomes one column.
- `.wechat-card` remains inside the right/content column flow.
- Card content is vertically stacked and centered.
- QR image stays `112 × 112px` without clipping or horizontal page scrolling.

Capture and inspect a mobile screenshot.

- [ ] **Step 5: Verify absence compatibility**

Temporarily use browser script to remove/reload data without `wechatQrCodeUrl`, or build a fixture variant with the field omitted.

Expected: About remains available and `.wechat-card` is absent. Do not commit temporary fixture changes.

### Task 4: Final verification and documentation commit

**Files:**
- Verify: all Task 1–2 files
- Verify: `docs/superpowers/specs/2026-08-27-about-wechat-qr-code-design.md`
- Verify: `docs/superpowers/plans/2026-08-27-about-wechat-qr-code.md`

**Interfaces:**
- Produces merge-readiness evidence; no new runtime interface.

- [ ] **Step 1: Run the complete automated pipeline**

```bash
npm test && npm run content:build:fixture && npm run site:build && npm run site:check
```

Expected: 0 test failures and every build/check command exits 0.

- [ ] **Step 2: Validate repository state**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, no generated `dist` files, and no unrelated changes.

- [ ] **Step 3: Commit the plan if still uncommitted**

```bash
git add docs/superpowers/plans/2026-08-27-about-wechat-qr-code.md
git commit -m "docs: plan About WeChat QR card"
```

Do not create an empty commit if the plan was already committed.
