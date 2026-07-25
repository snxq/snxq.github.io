const publicSections = [
  { type: 'about', label: '关于 snxq', title: '关于', subtitle: 'IDENTITY SHEET', aliases: ['about', '关于', '关于你', '你是谁'] },
  { type: 'projects', label: '项目与实验', title: '项目', subtitle: 'BUILT SIGNALS', aliases: ['projects', 'project', '项目', '作品', '看看你的项目'] },
  { type: 'posts', label: '长文章', title: '文章', subtitle: 'LONG-FORM TRANSMISSIONS', aliases: ['posts', 'articles', '文章', '博客', '看看文章'] },
  { type: 'notes', label: '短笔记与碎片', title: '短笔记', subtitle: 'FIELD SIGNALS', aliases: ['notes', '笔记', '随想', '碎片'] },
  { type: 'now', label: '最近在做什么', title: '此刻', subtitle: 'CURRENT STATE', aliases: ['now', '近况', '最近在做什么', '你最近在做什么', '最近在干嘛'] },
  { type: 'bookmarks', label: '收藏的坐标', title: '收藏', subtitle: 'SAVED COORDINATES', aliases: ['bookmarks', '收藏', '书签', '推荐一些网站'] },
  { type: 'uses', label: '设备与工具', title: '使用清单', subtitle: 'DAILY INSTRUMENTS', aliases: ['uses', '装备', '工具', '你在用什么'] },
  { type: 'life', label: '生活切片', title: '生活切片', subtitle: 'OFFLINE FRAGMENTS', aliases: ['life', '生活', '照片', '生活切片'] },
  { type: 'opensource', label: '开源与技术轨迹', title: '开源与技术轨迹', subtitle: 'PUBLIC WORK', aliases: ['opensource', 'open source', '开源', '技术经历'] }
];

const helpDefinition = {
  type: 'help',
  title: '公开频道',
  subtitle: 'COMMAND LEDGER',
  aliases: ['help', '帮助', '命令', '你会什么']
};
const commandDefinitions = [helpDefinition, ...publicSections];
const definitionsByType = new Map(commandDefinitions.map(definition => [definition.type, definition]));
const aliases = new Map(commandDefinitions.flatMap(definition => (
  definition.aliases.map(alias => [alias, definition.type])
)));

const defaultBaseUrl = new URL('../generated/content/', import.meta.url);
let fetchImplementation = globalThis.fetch;
let contentBaseUrl = defaultBaseUrl;
let manifestPromise;
let manifestValue;
const sectionPromises = new Map();
let requestSequence = 0;

function requestId() {
  requestSequence += 1;
  return `req-${String(requestSequence).padStart(4, '0')}`;
}

function normalizeInput(input) {
  return String(input ?? '').trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ');
}

function contentUrl(path) {
  return new URL(path, contentBaseUrl);
}

function sectionUrl(filename, contentType) {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*\.[a-f0-9]{64}\.json$/u.test(filename)) {
    throw new Error(`Invalid content section filename: ${contentType}`);
  }

  const baseUrl = contentUrl('.');
  const url = new URL(filename, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
    throw new Error(`Content section is outside the content base URL: ${contentType}`);
  }
  return url;
}

function requireFetch() {
  if (typeof fetchImplementation !== 'function') {
    throw new Error('Content adapter requires fetch');
  }
  return fetchImplementation;
}

async function fetchJson(url) {
  const response = await requireFetch()(url, { redirect: 'error' });
  if (!response?.ok) {
    throw new Error(`Static content request failed: ${response?.status ?? 'unknown'}`);
  }
  return response.json();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateManifest(value) {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.generatedAt !== 'string'
    || !isRecord(value.files)) {
    throw new Error('Invalid content manifest');
  }
  return value;
}

function validateSection(value, contentType) {
  if (!isRecord(value)
    || value.version !== 1
    || value.section !== contentType
    || typeof value.title !== 'string'
    || typeof value.subtitle !== 'string'
    || typeof value.updatedAt !== 'string'
    || !isRecord(value.data)) {
    throw new Error(`Invalid content section: ${contentType}`);
  }
  return value;
}

function cacheSuccessfulPromise(getCurrent, setCurrent, operation) {
  const current = getCurrent();
  if (current) return current;

  const pending = Promise.resolve().then(operation);
  setCurrent(pending);
  pending.catch(() => {
    if (getCurrent() === pending) setCurrent(undefined);
  });
  return pending;
}

function loadManifest() {
  return cacheSuccessfulPromise(
    () => manifestPromise,
    value => { manifestPromise = value; },
    async () => {
      const manifest = validateManifest(await fetchJson(contentUrl('manifest.json')));
      manifestValue = manifest;
      return manifest;
    }
  );
}

async function loadSection(contentType) {
  const cached = sectionPromises.get(contentType);
  if (cached) return cached;

  const pending = (async () => {
    const manifest = await loadManifest();
    const filename = manifest.files[contentType];
    const url = sectionUrl(filename, contentType);
    url.searchParams.set('v', manifest.generatedAt);
    return validateSection(await fetchJson(url), contentType);
  })();

  sectionPromises.set(contentType, pending);
  pending.catch(() => {
    if (sectionPromises.get(contentType) === pending) sectionPromises.delete(contentType);
  });
  return pending;
}

function helpSection() {
  return {
    version: 1,
    section: 'help',
    title: helpDefinition.title,
    subtitle: helpDefinition.subtitle,
    updatedAt: '刚刚',
    data: {
      intro: '命令由静态内容信号台解释。下面是当前公开的入口。',
      commands: publicSections.map(({ type, label }) => [type, label])
    }
  };
}

function overviewFor(contentType, id, section) {
  return {
    requestId: id,
    id: `window-${contentType}`,
    title: section.title,
    subtitle: section.subtitle,
    updatedAt: section.updatedAt,
    contentType,
    view: 'overview',
    data: section.data
  };
}

function unavailableOverview(contentType, id) {
  const definition = definitionsByType.get(contentType);
  return {
    requestId: id,
    id: `window-${contentType}`,
    title: definition.title,
    subtitle: definition.subtitle,
    updatedAt: manifestValue?.generatedAt ?? '未知',
    contentType,
    view: 'overview',
    data: {
      unavailable: true,
      reference: `request ${id} · content ${manifestValue?.version ?? 'unknown'}`
    }
  };
}

export function configureContentAdapterForTests({ fetchImpl, baseUrl } = {}) {
  fetchImplementation = fetchImpl ?? globalThis.fetch;
  contentBaseUrl = baseUrl === undefined ? defaultBaseUrl : new URL(baseUrl, import.meta.url);
  manifestPromise = undefined;
  manifestValue = undefined;
  sectionPromises.clear();
  requestSequence = 0;
}

export function resetContentAdapterForTests() {
  fetchImplementation = globalThis.fetch;
  contentBaseUrl = defaultBaseUrl;
  manifestPromise = undefined;
  manifestValue = undefined;
  sectionPromises.clear();
  requestSequence = 0;
}

export async function executeCommand(input) {
  const id = requestId();
  const contentType = aliases.get(normalizeInput(input));

  if (!contentType) {
    return {
      requestId: id,
      ok: false,
      message: `当前命令无效，总计支持 ${commandDefinitions.length} 种命令。`
    };
  }

  if (contentType === 'help') {
    const section = helpSection();
    return {
      requestId: id,
      ok: true,
      message: `已打开「${section.title}」`,
      window: overviewFor(contentType, id, section)
    };
  }

  try {
    const section = await loadSection(contentType);
    return {
      requestId: id,
      ok: true,
      message: `已打开「${section.title}」`,
      window: overviewFor(contentType, id, section)
    };
  } catch {
    return {
      requestId: id,
      ok: true,
      message: `「${definitionsByType.get(contentType).title}」暂时不可用`,
      window: unavailableOverview(contentType, id)
    };
  }
}

export async function loadDetail(contentType, itemId) {
  const id = requestId();
  const section = await loadSection(contentType);
  const collection = section.data.items;
  const item = Array.isArray(collection) ? collection.find(entry => entry.id === itemId) : undefined;

  if (!item) {
    throw new Error(`Detail not found: ${contentType}/${itemId}`);
  }

  return {
    requestId: id,
    id: `window-${contentType}-${itemId}`,
    title: item.name ?? item.title,
    subtitle: `${section.subtitle} / DETAIL`,
    updatedAt: item.date ?? item.year ?? item.source?.updatedAt ?? section.updatedAt,
    contentType,
    view: 'detail',
    data: item
  };
}
