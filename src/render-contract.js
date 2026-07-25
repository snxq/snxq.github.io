const LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeAbsoluteUrl(value, protocols) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return protocols.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeInlineChildren(children) {
  if (!Array.isArray(children)) return null;
  const normalized = children.map(normalizeRenderableInline);
  return normalized.some(node => node === null) ? null : normalized;
}

export function normalizeRenderableInline(node) {
  if (!isRecord(node) || typeof node.type !== 'string') return null;

  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return typeof node.value === 'string' ? { type: node.type, value: node.value } : null;
    case 'emphasis':
    case 'strong':
    case 'delete': {
      const children = normalizeInlineChildren(node.children);
      return children ? { type: node.type, children } : null;
    }
    case 'link': {
      const href = safeAbsoluteUrl(node.href, LINK_PROTOCOLS);
      const children = normalizeInlineChildren(node.children);
      return href && children ? { type: 'link', href, children } : null;
    }
    default:
      return null;
  }
}

function normalizeBlockChildren(children) {
  if (!Array.isArray(children)) return null;
  const normalized = children.map(normalizeRenderableBlock);
  return normalized.some(block => block === null) ? null : normalized;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return null;
  const normalized = [];
  for (const row of rows) {
    if (!Array.isArray(row)) return null;
    const cells = [];
    for (const cell of row) {
      const children = normalizeInlineChildren(cell);
      if (!children) return null;
      cells.push(children);
    }
    normalized.push(cells);
  }
  return normalized;
}

export function normalizeRenderableBlock(block) {
  if (!isRecord(block) || typeof block.type !== 'string') return null;

  switch (block.type) {
    case 'heading': {
      if (![2, 3, 4].includes(block.depth)) return null;
      const children = normalizeInlineChildren(block.children);
      return children ? { type: 'heading', depth: block.depth, children } : null;
    }
    case 'paragraph': {
      const children = normalizeInlineChildren(block.children);
      return children ? { type: 'paragraph', children } : null;
    }
    case 'quote': {
      const children = normalizeBlockChildren(block.children);
      return children ? { type: 'quote', children } : null;
    }
    case 'code':
      return (block.language === null || typeof block.language === 'string') && typeof block.value === 'string'
        ? { type: 'code', language: block.language, value: block.value }
        : null;
    case 'list': {
      if (typeof block.ordered !== 'boolean' || !Array.isArray(block.items)) return null;
      if (block.ordered && block.start !== undefined && (!Number.isInteger(block.start) || block.start < 1)) return null;
      const items = [];
      for (const item of block.items) {
        const normalized = normalizeBlockChildren(item);
        if (!normalized) return null;
        items.push(normalized);
      }
      return {
        type: 'list',
        ordered: block.ordered,
        ...(block.ordered && block.start !== undefined ? { start: block.start } : {}),
        items
      };
    }
    case 'table': {
      if (!Array.isArray(block.align) || block.align.some(value => value !== null && !['left', 'right', 'center'].includes(value))) return null;
      const rows = normalizeRows(block.rows);
      return rows ? { type: 'table', align: [...block.align], rows } : null;
    }
    case 'image': {
      const src = safeAbsoluteUrl(block.src, new Set(['https:']));
      if (!src || typeof block.alt !== 'string' || (block.title !== null && typeof block.title !== 'string')) return null;
      return { type: 'image', src, alt: block.alt, title: block.title };
    }
    case 'divider':
      return { type: 'divider' };
    default:
      return null;
  }
}
