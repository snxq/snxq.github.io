import { executeCommand, loadDetail } from './content-api.js';
import { normalizeRenderableBlock, normalizeRenderableInline } from './render-contract.js';

const elements = {
  form: document.querySelector('#command-form'), input: document.querySelector('#command-input'),
  submit: document.querySelector('#submit-command'), history: document.querySelector('#command-history'),
  layer: document.querySelector('#window-layer'), live: document.querySelector('#live-region'), clock: document.querySelector('#clock')
};

const state = { pending: false, history: [], window: null, navigation: null, detailToken: 0 };
const backgroundRegions = [document.querySelector('.site-mark'), document.querySelector('.shell'), document.querySelector('.coordinates')].filter(Boolean);

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) Object.entries(options.attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (options.on) Object.entries(options.on).forEach(([event, handler]) => node.addEventListener(event, handler));
  for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
  return node;
}

const text = (tag, value, className) => el(tag, { text: value, className });

function safeHref(value, allowedProtocols = ['https:', 'http:', 'mailto:']) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return allowedProtocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function safeLink(label, href, className = 'text-link') {
  const resolved = safeHref(href);
  if (!resolved) return text('span', label, className);
  const external = resolved.startsWith('http:') || resolved.startsWith('https:');
  return el('a', { className, text: label, attrs: { href: resolved, target: external ? '_blank' : '_self', rel: external ? 'noreferrer' : '' } });
}

function emptyState(message = '这里暂时没有内容。') {
  return el('div', { className: 'empty-state' }, text('p', message));
}

function setBackgroundInert(value) {
  for (const region of backgroundRegions) region.inert = value;
}

function setPending(value) {
  state.pending = value;
  elements.input.disabled = value;
  elements.submit.disabled = value;
}

function addHistory(input) {
  const item = { input, status: 'pending', message: '正在接收远端信号…', replayable: false };
  state.history.push(item);
  renderHistory();
  return item;
}

function renderHistory() {
  elements.history.replaceChildren(...state.history.map(item => {
    const response = el('div', { className: `history-response${item.status === 'error' ? ' is-error' : ''}${item.status === 'pending' ? ' loading-line' : ''}` });
    if (item.replayable) response.append(el('button', { text: item.message, attrs: { type: 'button' }, on: { click: () => submitInput(item.input) } }));
    else response.textContent = item.message;
    return el('div', { className: 'history-entry' }, [text('div', item.input, 'history-input'), response]);
  }));
  elements.history.scrollTop = elements.history.scrollHeight;
}

function announce(message) { elements.live.textContent = ''; requestAnimationFrame(() => { elements.live.textContent = message; }); }

async function submitInput(rawInput) {
  const input = String(rawInput ?? '').trim();
  if (!input || state.pending) return;
  const historyItem = addHistory(input);
  setPending(true);
  try {
    const response = await executeCommand(input);
    historyItem.status = response.ok ? 'success' : 'error';
    historyItem.message = response.message;
    historyItem.replayable = Boolean(response.ok && response.window);
    renderHistory();
    announce(response.message);
    if (response.ok && response.window) openWindow(response.window);
  } catch (error) {
    historyItem.status = 'error';
    historyItem.message = '信号暂时中断，请稍后重试。';
    renderHistory();
    console.error(error);
  } finally {
    setPending(false);
    elements.input.focus();
  }
}

function openWindow(windowData) {
  state.window = windowData;
  state.navigation = null;
  renderWindow();
}

function closeWindow() {
  state.detailToken += 1;
  state.window = null;
  state.navigation = null;
  elements.layer.classList.remove('is-open');
  elements.layer.replaceChildren();
  setBackgroundInert(false);
  elements.input.focus();
}

async function openDetail(contentType, itemId) {
  if (state.pending) return;
  const body = elements.layer.querySelector('.window-body');
  const sourceWindow = state.window;
  state.navigation = { overview: sourceWindow, scrollTop: body?.scrollTop ?? 0 };
  const token = ++state.detailToken;
  setPending(true);
  try {
    const detail = await loadDetail(contentType, itemId);
    if (token !== state.detailToken || !state.window || state.window !== sourceWindow) return;
    state.window = detail;
    renderWindow();
  } catch (error) {
    if (token === state.detailToken) announce('详情加载失败。');
    console.error(error);
  } finally { setPending(false); }
}

function backToOverview() {
  if (!state.navigation) return;
  const { overview, scrollTop } = state.navigation;
  state.window = overview;
  state.navigation = null;
  renderWindow();
  requestAnimationFrame(() => { const body = elements.layer.querySelector('.window-body'); if (body) body.scrollTop = scrollTop; });
}

function renderWindow() {
  if (!state.window) return closeWindow();
  const back = state.window.view === 'detail' ? el('button', { className: 'window-control', text: '← 返回', attrs: { type: 'button', 'aria-label': '返回列表' }, on: { click: backToOverview } }) : null;
  const heading = el('div', { className: 'window-heading', attrs: { tabindex: '-1' } }, [
    text('p', state.window.subtitle ?? 'ARCHIVE'), text('h2', state.window.title)
  ]);
  const bar = el('header', { className: 'window-bar' }, [
    el('div', { className: 'window-bar-side' }, back), heading,
    el('div', { className: 'window-bar-side' }, el('button', { className: 'window-control', text: '关闭 ×', attrs: { type: 'button', 'aria-label': '关闭窗口' }, on: { click: closeWindow } }))
  ]);
  const body = el('div', { className: 'window-body' }, renderWindowContent(state.window));
  const footer = el('footer', { className: 'window-footer' }, [text('span', `UPDATED / ${state.window.updatedAt ?? 'UNKNOWN'}`), text('span', state.window.requestId)]);
  elements.layer.replaceChildren(el('section', { className: 'content-window', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': state.window.title } }, [bar, body, footer]));
  elements.layer.classList.add('is-open');
  setBackgroundInert(true);
  const initialControl = elements.layer.querySelector('.window-control');
  (initialControl ?? heading).focus();
}

function tags(values = []) { return el('div', { className: 'tags' }, values.map(value => text('span', value, 'tag'))); }

function detailCard(item, contentType, mode = 'default') {
  const title = item.name ?? item.title;
  const imageUrl = safeHref(mode === 'life' ? item.imageUrl : item.coverImage, ['https:']);
  const visualClass = mode === 'life' ? `image-field ${item.tone ?? ''}` : 'card-cover';
  const visual = imageUrl ? el('img', { className: visualClass, attrs: { src: imageUrl, alt: '', loading: 'lazy' } })
    : mode === 'life' ? el('div', { className: visualClass }, text('span', `${item.date} / FIELD RECORD`)) : null;
  const cardBody = el('div', { className: mode === 'life' ? 'life-copy' : '' }, [
    el('div', { className: 'card-kicker' }, [text('span', item.index ?? item.date ?? item.year), text('span', item.status ?? item.readingTime ?? 'OPEN')]),
    text('h3', title), text('p', item.summary), tags(item.tags), text('span', '↗', 'arrow-mark')
  ]);
  return el('button', { className: `content-card${mode === 'life' ? ' life-card' : ''}`, attrs: { type: 'button', 'aria-label': `打开 ${title}` }, on: { click: () => openDetail(contentType, item.id) } }, [visual, cardBody]);
}

function unavailableState(requestId = state.window?.requestId) {
  return el('div', { className: 'empty-state' }, [text('p', '当前内容暂时无法展示'), text('code', requestId ?? 'unknown-request')]);
}

function renderHelp(data) {
  if (!data || !Array.isArray(data.commands)) return unavailableState();
  if (data.commands.length === 0) return emptyState(data.emptyMessage);
  return [text('p', data.intro, 'section-intro'), el('div', { className: 'command-ledger' }, data.commands.map(([command, description]) => el('div', { className: 'command-row' }, [text('code', command), text('span', description), el('button', { text: '执行 ↗', attrs: { type: 'button' }, on: { click: () => { closeWindow(); submitInput(command); } } })])) )];
}

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

function renderAbout(data) {
  if (!data || !Array.isArray(data.fields) || !Array.isArray(data.links)) return unavailableState();
  const facts = [['LOCATION', data.location], ['NOW', data.status], ['FIELDS', data.fields.join(' · ')]];
  const qrCard = wechatQrCard(data.wechatQrCodeUrl ?? null);
  return el('div', { className: 'identity' }, [
    text('div', 'sx', 'identity-monogram'),
    el('div', { className: 'identity-copy' }, [
      text('p', data.role, 'role'), text('h3', data.name), text('p', data.bio, 'bio'),
      el('div', { className: 'fact-list' }, facts.map(([key, value]) => el('div', { className: 'fact' }, [text('strong', key), text('span', value)]))),
      el('div', { className: 'link-row' }, data.links.map(([label, href]) => safeLink(`${label} ↗`, href))),
      qrCard
    ])
  ]);
}

function renderCards(data, contentType, mode) {
  if (!data || !Array.isArray(data.items)) return unavailableState();
  if (data.items.length === 0) return emptyState(data.emptyMessage);
  return el('div', { className: mode === 'life' ? 'life-grid' : 'content-grid' }, data.items.map(item => detailCard(item, contentType, mode)));
}

function renderNotes(data) {
  if (!data || !Array.isArray(data.items)) return unavailableState();
  if (data.items.length === 0) return emptyState(data.emptyMessage);
  return el('div', { className: 'stream' }, data.items.map(item => el('article', { className: 'stream-item' }, [text('p', item.time, 'stream-time'), text('p', item.text, 'stream-text'), tags(item.tags)])));
}

function renderNow(data) {
  if (!data || !Array.isArray(data.sections)) return unavailableState();
  if (data.sections.length === 0) return emptyState(data.emptyMessage);
  return [text('p', data.summary, 'now-lead'), el('div', { className: 'now-grid' }, data.sections.map(section => el('section', { className: 'now-section' }, [text('span', section.code, 'now-code'), text('h3', section.title), el('ul', {}, (section.items ?? []).map(item => text('li', item)))])))];
}

function renderBookmarks(data) {
  if (!data || !Array.isArray(data.groups)) return unavailableState();
  if (data.groups.length === 0) return emptyState(data.emptyMessage);
  return data.groups.map(group => el('section', { className: 'group' }, [el('header', { className: 'group-head' }, [text('h3', group.name), text('p', group.description)]), ...(group.links ?? []).map(item => {
    const resolved = safeHref(item.url, ['https:', 'http:']);
    const children = [text('strong', item.name), text('span', item.description), text('i', resolved ? '↗' : '—')];
    return resolved ? el('a', { className: 'bookmark', attrs: { href: resolved, target: '_blank', rel: 'noreferrer' } }, children) : el('div', { className: 'bookmark' }, children);
  })]));
}

function renderUses(data) {
  if (!data || !Array.isArray(data.categories)) return unavailableState();
  if (data.categories.length === 0) return emptyState(data.emptyMessage);
  return data.categories.map(category => el('section', { className: 'inventory-category' }, [text('h3', category.name), el('div', {}, (category.items ?? []).map(item => el('div', { className: 'inventory-item' }, [item.url ? safeLink(item.name, item.url, 'inventory-link') : text('strong', item.name), text('span', item.description)]))) ]));
}

function renderOpenSource(data) {
  if (!data || !Array.isArray(data.contributions)) return unavailableState();
  if (data.contributions.length === 0) return emptyState(data.emptyMessage);
  return el('div', { className: 'timeline' }, data.contributions.map(item => el('article', { className: 'timeline-item' }, [text('span', item.year, 'timeline-year'), el('div', { className: 'timeline-content' }, [el('h3', {}, item.url ? safeLink(item.title, item.url, 'timeline-link') : item.title), text('p', item.text), tags(item.tags)])])));
}

function renderInline(children = []) {
  if (!Array.isArray(children)) return [];
  return children.map(normalizeRenderableInline).filter(Boolean).map(node => {
    switch (node.type) {
      case 'text': return document.createTextNode(node.value);
      case 'inlineCode': return text('code', node.value);
      case 'emphasis': return el('em', {}, renderInline(node.children));
      case 'strong': return el('strong', {}, renderInline(node.children));
      case 'delete': return el('del', {}, renderInline(node.children));
      case 'link': {
        const resolved = safeHref(node.href);
        if (!resolved) return el('span', {}, renderInline(node.children));
        const external = resolved.startsWith('http:') || resolved.startsWith('https:');
        return el('a', { attrs: { href: resolved, target: external ? '_blank' : '_self', rel: external ? 'noreferrer' : '' } }, renderInline(node.children));
      }
      default: return null;
    }
  }).filter(Boolean);
}

function renderNormalizedBlocks(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case 'heading': return el(`h${block.depth}`, {}, renderInline(block.children));
      case 'paragraph': return el('p', {}, renderInline(block.children));
      case 'quote': return el('blockquote', {}, renderNormalizedBlocks(block.children));
      case 'code': return el('pre', {}, text('code', block.value));
      case 'list': return el(block.ordered ? 'ol' : 'ul', { attrs: block.ordered && block.start !== undefined ? { start: String(block.start) } : {} }, block.items.map(item => el('li', {}, renderNormalizedBlocks(item))));
      case 'table': {
        const [header = [], ...body] = block.rows;
        const renderRow = (row, cellTag) => el('tr', {}, row.map((cell, index) => el(cellTag, { attrs: block.align[index] ? { style: `text-align: ${block.align[index]}` } : {} }, renderInline(cell))));
        return el('div', { className: 'rich-table-wrap' }, el('table', {}, [el('thead', {}, renderRow(header, 'th')), el('tbody', {}, body.map(row => renderRow(row, 'td')))]));
      }
      case 'image': return el('img', { className: 'rich-image', attrs: { src: block.src, alt: block.alt, loading: 'lazy', ...(block.title ? { title: block.title } : {}) } });
      case 'divider': return el('hr', { className: 'rich-divider' });
      default: return null;
    }
  }).filter(Boolean);
}

function renderRichBlocks(blocks = []) {
  const normalized = Array.isArray(blocks) ? blocks.map(normalizeRenderableBlock).filter(Boolean) : [];
  return el('div', { className: 'rich-content' }, renderNormalizedBlocks(normalized));
}

function renderDetail(windowData) {
  const item = windowData.data;
  const imageUrl = safeHref(item.coverImage ?? item.imageUrl, ['https:']);
  return [el('header', { className: 'detail-header' }, [text('span', `${item.date ?? item.year ?? 'ARCHIVE'} / ${item.status ?? item.readingTime ?? 'DETAIL'}`, 'meta'), text('h3', item.name ?? item.title), text('p', item.summary ?? ''), item.url ? safeLink('访问项目 ↗', item.url, 'rich-link') : null, imageUrl ? el('img', { className: 'rich-image detail-image', attrs: { src: imageUrl, alt: '', loading: 'lazy' } }) : null]), renderRichBlocks(item.detail ?? [])];
}

const renderers = {
  help: data => renderHelp(data), about: data => renderAbout(data),
  projects: data => renderCards(data, 'projects'), posts: data => renderCards(data, 'posts'),
  notes: data => renderNotes(data), now: data => renderNow(data), bookmarks: data => renderBookmarks(data),
  uses: data => renderUses(data), life: data => renderCards(data, 'life', 'life'), opensource: data => renderOpenSource(data)
};

function renderWindowContent(windowData) {
  try {
    if (windowData.data?.unavailable) return [unavailableState(windowData.requestId)];
    if (windowData.view === 'detail') return renderDetail(windowData);
    const renderer = renderers[windowData.contentType];
    if (!renderer) return [unavailableState(windowData.requestId)];
    const result = renderer(windowData.data);
    return Array.isArray(result) ? result : [result];
  } catch (error) {
    console.error('Unable to render window response', error);
    return [unavailableState(windowData.requestId)];
  }
}

elements.form.addEventListener('submit', event => { event.preventDefault(); const value = elements.input.value; elements.input.value = ''; submitInput(value); });
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => submitInput(button.dataset.command)));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.window) closeWindow();
  if (event.key === '/' && !state.window && document.activeElement !== elements.input) { event.preventDefault(); elements.input.focus(); }
  if (event.key === 'Tab' && state.window) {
    const focusable = [...elements.layer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
elements.layer.addEventListener('mousedown', event => { if (event.target === elements.layer) closeWindow(); });

function tickClock() { elements.clock.textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()); }
tickClock(); setInterval(tickClock, 1000);
setTimeout(() => elements.input.focus(), 700);
