# Interactive Frontend Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, responsive, static prototype for `snxq.cc` that demonstrates command input, session history, simulated backend responses, one-at-a-time in-page content windows, and list-to-detail navigation.

**Architecture:** Use dependency-free HTML, CSS, and ES modules so the prototype opens through any static HTTP server. Keep mock command handling isolated in `mock-api.js`, UI state and rendering in `app.js`, sample content in `mock-data.js`, and the complete visual system in `styles.css`; the mock response shape should resemble the future gRPC-Web view model without pretending to implement transport code.

**Tech Stack:** Semantic HTML5, modern CSS, vanilla JavaScript ES modules, Node.js built-in test runner, static HTTP server for manual browser verification.

## Global Constraints

- Commands and aliases belong to the backend; the prototype may simulate them only inside the mock API boundary.
- The production frontend must render typed response data and must not infer content type from display titles.
- At most one content window is visible at a time.
- Lists and details switch within the same window without page navigation.
- Command history contains only the original input and brief response text.
- Desktop uses a centered in-page window; mobile uses a near-full-screen window.
- Do not render arbitrary backend HTML or Markdown.
- The prototype must clearly separate mock transport behavior from UI rendering.

---

## File Structure

- `index.html` — semantic application shell, atmosphere layers, command history, command form, window portal.
- `styles.css` — complete visual language, typography, layout, animation, responsive behavior, reduced-motion and focus states.
- `src/mock-data.js` — representative structured content for each window template.
- `src/mock-api.js` — simulated unary command execution and detail lookup; the only file containing prototype command aliases.
- `src/app.js` — state management, safe DOM rendering, history behavior, window navigation, keyboard and pointer interactions.
- `tests/mock-api.test.js` — executable tests for valid, invalid, alias and detail responses.
- `README.md` — prototype launch instructions and the boundary between mock behavior and future gRPC-Web integration.

### Task 1: Build the semantic shell and visual system

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Produces DOM hooks: `#command-history`, `#command-form`, `#command-input`, `#submit-command`, `#window-layer`, and `#live-region`.
- Produces CSS component contracts used by `src/app.js`: `.history-entry`, `.content-window`, `.window-bar`, `.window-body`, `.content-grid`, `.content-card`, `.detail-view`, `.empty-state`, `.loading-line`, and `.is-open`.

- [ ] **Step 1: Create the HTML application shell**

Create `index.html` with semantic landmarks, a concise initial invitation, a form that works with Enter, an accessible live region, and an empty window layer. Load `src/app.js` with `type="module"` and `styles.css` from the document head.

- [ ] **Step 2: Implement the visual direction**

Create `styles.css` with a dark “signal archive” aesthetic: near-black ink background, warm paper text, oxidized orange as the single accent, fine cartographic grid lines, subtle film grain, asymmetric editorial typography, and a blinking command caret. Use CSS variables and avoid generic purple gradients, glass-card repetition, and dashboard layouts.

- [ ] **Step 3: Add responsive and accessibility states**

Add `:focus-visible`, high-contrast controls, `aria-live` compatible visibility, `@media (prefers-reduced-motion: reduce)`, desktop centered windows, and mobile near-full-screen windows. Ensure long code, URLs, and media stay inside the window.

- [ ] **Step 4: Run a static markup check**

Run:

```bash
python -m http.server 4173 --directory /home/jiutong/src/snxq/snxq.cc
```

Expected: `http://localhost:4173/` serves the shell without missing-file responses for `index.html` and `styles.css`.

### Task 2: Add typed mock content and command responses

**Files:**
- Create: `src/mock-data.js`
- Create: `src/mock-api.js`
- Create: `tests/mock-api.test.js`

**Interfaces:**
- Produces `executeCommand(input: string): Promise<CommandResponse>`.
- Produces `loadDetail(contentType: string, itemId: string): Promise<WindowResponse>`.
- `CommandResponse` shape: `{ requestId, ok, message, window? }`.
- `WindowResponse` shape: `{ id, title, subtitle, updatedAt, contentType, view, data }`.
- `view` is exactly `'overview'` or `'detail'`.

- [ ] **Step 1: Write failing command API tests**

Test these exact behaviors with `node:test` and `node:assert/strict`:

```js
await executeCommand('projects')
// ok === true; window.contentType === 'projects'; window.view === 'overview'

await executeCommand('项目')
// resolves to the same contentType as projects

await executeCommand('not-a-command')
// ok === false; no window; message matches 当前命令无效，总计支持 \d+ 种命令。

await loadDetail('projects', 'signal-garden')
// contentType === 'projects'; view === 'detail'; data.id === 'signal-garden'
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/mock-api.test.js
```

Expected: FAIL because `src/mock-api.js` does not exist.

- [ ] **Step 3: Create representative structured content**

In `src/mock-data.js`, provide compact sample data for `help`, `about`, `projects`, `posts`, `notes`, `now`, `bookmarks`, `uses`, `life`, `opensource`, and one `custom` easter egg. Include enough variety to exercise cards, timelines, links, tags, image placeholders, code blocks, and list/detail behavior without turning the prototype into an actual CMS.

- [ ] **Step 4: Implement the mock API boundary**

In `src/mock-api.js`, keep aliases private, normalize trimmed lowercase input, add an artificial 280–520 ms delay, return unique deterministic request IDs, and return complete response objects. Keep the invalid-command count based on canonical commands, including the hidden easter egg but excluding aliases.

- [ ] **Step 5: Run tests and verify success**

Run:

```bash
node --test tests/mock-api.test.js
```

Expected: all tests PASS.

### Task 3: Implement command history and window state

**Files:**
- Create: `src/app.js`

**Interfaces:**
- Consumes `executeCommand` and `loadDetail` from `src/mock-api.js`.
- Consumes the DOM hooks and CSS component contracts from Task 1.
- Produces user interactions: submit command, open/replace/close window, open detail, return to overview, replay successful history entries.

- [ ] **Step 1: Define the application state**

Use one state object containing `pending`, `history`, `window`, and `navigation`. Store the overview payload and scroll position before entering detail. Do not persist state to local storage.

- [ ] **Step 2: Implement safe DOM helpers**

Build elements with `document.createElement`, `textContent`, attributes, and explicit child composition. Do not inject backend-like content through `innerHTML`.

- [ ] **Step 3: Implement command submission**

On submit, preserve the original text, append a pending history entry, disable the input and button, await `executeCommand`, replace the pending message, and open a window only when `response.ok` and `response.window` are both present. Restore and focus the input afterward.

- [ ] **Step 4: Implement window behavior**

Render one `.content-window` inside `#window-layer`. A new successful command replaces the current window. Close removes the window. Escape closes it. Focus moves to the window heading on open and back to the command input on close.

- [ ] **Step 5: Implement list/detail navigation**

Cards with a detail ID call `loadDetail`. Before switching, record the overview object and `.window-body` scroll position. The back action restores both. Do not change the browser URL in the prototype.

- [ ] **Step 6: Implement replayable history**

Successful history response labels are buttons. Replaying calls the mock API with the original input and appends a new history event, rather than mutating the earlier entry. Invalid and failed entries are plain text.

### Task 4: Implement content-specific renderers

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes `window.contentType`, `window.view`, and `window.data`.
- Produces `renderWindowContent(windowResponse): HTMLElement` with an exhaustive renderer map and a fallback renderer.

- [ ] **Step 1: Add overview renderers**

Implement distinct, structurally appropriate templates:

- `help`: command ledger with examples.
- `about`: editorial identity sheet.
- `projects`: dense project cards with status and tags.
- `posts`: publication index with reading time.
- `notes`: timestamped signal stream.
- `now`: current-state modules.
- `bookmarks`: grouped annotated links.
- `uses`: categorized inventory.
- `life`: image-led field notes.
- `opensource`: contribution and experience timeline.
- `custom`: reusable rich blocks.

- [ ] **Step 2: Add detail renderers**

Use a shared structured-block renderer for headings, paragraphs, quote, code, list, callout, image placeholder, gallery, link, and divider blocks. Project, post, and life details reuse this renderer while keeping distinct metadata headers.

- [ ] **Step 3: Add empty and unsupported states**

An empty dataset renders the backend-provided message inside `.empty-state`. Unknown `contentType` renders “当前内容暂时无法展示” with the request ID, without throwing.

- [ ] **Step 4: Refine animation and content density**

Add one orchestrated window entrance, stagger card reveals, restrained hover motion, and immediate reduced-motion fallbacks. Keep the command area visually dominant when no window is open and subordinate when a window is present.

### Task 5: Document and verify the prototype

**Files:**
- Create: `README.md`

**Interfaces:**
- Documents local launch, test command, supported demo inputs, and future replacement of `mock-api.js` with generated gRPC-Web clients.

- [ ] **Step 1: Write launch and architecture documentation**

Document:

```bash
python -m http.server 4173
node --test tests/mock-api.test.js
```

List public demo commands and state explicitly that aliases and command counts exist only in the mock API for prototype demonstration.

- [ ] **Step 2: Run automated tests**

Run:

```bash
node --test tests/mock-api.test.js
```

Expected: all tests PASS.

- [ ] **Step 3: Launch the prototype**

Run:

```bash
python -m http.server 4173 --directory /home/jiutong/src/snxq/snxq.cc
```

Expected: server listens on port 4173 and the prototype loads at `http://localhost:4173/`.

- [ ] **Step 4: Verify desktop interactions**

Check `help`, `projects`, Chinese alias `项目`, invalid input, project detail/back, history replay, close, Escape, and focus restoration. Expected: one window at a time, no navigation, correct history messages, and no console errors.

- [ ] **Step 5: Verify mobile layout**

At a 390 × 844 viewport, verify the window is near full-screen, close/back controls remain visible, command input is usable, and long content does not create body-level horizontal overflow.

- [ ] **Step 6: Record limitations honestly**

In the final report, state that transport is simulated, content is sample data, no gRPC-Web client is generated, and exact visual/content fields remain subject to prototype feedback.
