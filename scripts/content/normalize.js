import { ContentValidationError } from './errors.js';
import { markdownToBlocks } from './markdown.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_PATTERN = /^(\d{4})(?:—(\d{4})?)?$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SUMMARY_LIMIT = 160;
const SYSTEM_LABELS = new Set(['draft', 'blog-post']);
const TITLE_PREFIX = /^\[[^\]]+\]\s*/;
const DETAIL_SECTIONS = new Set(['posts', 'projects', 'life']);
const SINGLETON_SECTIONS = new Set(['about', 'now']);
const NOW_TITLES = {
  BUILD: '正在做',
  LEARN: '正在理解',
  READ: '正在读 / 看',
  LOOP: '最近反复播放'
};

function contextFor(issue, field) {
  return {
    issueNumber: issue?.number ?? 0,
    title: issue?.title ?? 'Unknown',
    field,
    url: issue?.html_url ?? 'https://github.com/'
  };
}

function fail(issue, field, reason) {
  throw new ContentValidationError([{ ...contextFor(issue, field), reason }]);
}

function required(issue, fields, field) {
  const value = fields[field]?.trim();
  if (!value) fail(issue, field, 'field is required');
  return value;
}

function optional(fields, field) {
  const value = fields[field]?.trim();
  return value || '';
}

export function validateDate(value, issue) {
  if (!DATE_PATTERN.test(value)) fail(issue, 'Date', 'must use YYYY-MM-DD format and be a valid calendar date');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail(issue, 'Date', 'must use YYYY-MM-DD format and be a valid calendar date');
  }
  return value;
}

export function validateYear(value, issue) {
  const match = value.match(YEAR_PATTERN);
  if (!match || (match[2] && Number(match[2]) < Number(match[1]))) {
    fail(issue, 'Year', 'must be YYYY, YYYY—YYYY, or YYYY— with an ascending range');
  }
  return value;
}

function slug(issue, value) {
  const normalized = value.trim() || `issue-${issue.number}`;
  if (!SLUG_PATTERN.test(normalized)) {
    fail(issue, 'Slug', 'must contain lowercase letters or numbers separated by single hyphens');
  }
  return normalized;
}

function url(issue, field, value, { protocols = HTTP_PROTOCOLS, required: isRequired = false } = {}) {
  const normalized = value.trim();
  if (!normalized) {
    if (isRequired) fail(issue, field, 'field is required');
    return null;
  }
  try {
    const parsed = new URL(normalized);
    if (!protocols.has(parsed.protocol)) throw new Error('protocol');
    return parsed.href;
  } catch {
    fail(issue, field, `must be a valid ${[...protocols].join(' or ')} URL`);
  }
}

function tags(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function lines(value) {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

function postTitle(issue) {
  const value = String(issue.title ?? '').trim();
  if (!value) fail(issue, 'Title', 'title is required');
  return value;
}

function title(issue) {
  const value = String(issue.title ?? '').replace(TITLE_PREFIX, '').trim();
  if (!value) fail(issue, 'Title', 'title is required after the content prefix');
  return value;
}

function source(issue) {
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    updatedAt: issue.updated_at
  };
}

function detail(issue, body) {
  return markdownToBlocks(body, contextFor(issue, 'Body'));
}

function inlineText(nodes) {
  return nodes.map(node => {
    if (node.type === 'text' || node.type === 'inlineCode') return node.value;
    return inlineText(node.children ?? []);
  }).join('');
}

function issueLabels(issue) {
  return (Array.isArray(issue.labels) ? issue.labels : [])
    .map(label => typeof label === 'string' ? label : label.name)
    .filter(label => label && !label.startsWith('content:') && !SYSTEM_LABELS.has(label));
}

function postSummary(blocks) {
  const paragraph = blocks.find(block => block.type === 'paragraph');
  if (!paragraph) return '';
  const text = inlineText(paragraph.children).replace(/\s+/gu, ' ').trim();
  if (text.length <= SUMMARY_LIMIT) return text;
  return `${text.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…`;
}

function postDate(issue) {
  const value = String(issue.created_at ?? '').slice(0, 10);
  return validateDate(value, issue);
}

function noteText(issue, body) {
  const blocks = detail(issue, body);
  if (!blocks.length || blocks.some(block => block.type !== 'paragraph')) {
    fail(issue, 'Body', 'short note Body may contain only paragraphs and inline formatting');
  }
  return blocks.map(block => inlineText(block.children)).join('\n\n');
}

function grouped(item, key, value) {
  Object.defineProperty(item, key, { value, enumerable: false });
  return item;
}

function normalizeLinks(issue, value) {
  return lines(value).map(entry => {
    const separator = entry.indexOf('|');
    if (separator < 1 || separator === entry.length - 1 || entry.indexOf('|', separator + 1) !== -1) {
      fail(issue, 'Links', 'each line must use Label | URL');
    }
    const label = entry.slice(0, separator).trim();
    const href = entry.slice(separator + 1).trim();
    if (!label || !href) fail(issue, 'Links', 'each line must use Label | URL');
    return [label, url(issue, 'Links', href, { protocols: LINK_PROTOCOLS, required: true })];
  });
}

export function normalizeIssue(issue, section, fields) {
  const itemSource = source(issue);
  switch (section) {
    case 'posts': {
      const blocks = detail(issue, String(issue.body ?? ''));
      return {
        id: `issue-${issue.number}`,
        date: postDate(issue),
        title: postTitle(issue),
        summary: postSummary(blocks),
        tags: issueLabels(issue),
        detail: blocks,
        source: itemSource
      };
    }
    case 'projects':
      return {
        id: slug(issue, optional(fields, 'Slug')),
        name: title(issue),
        summary: required(issue, fields, 'Summary'),
        status: required(issue, fields, 'Status'),
        tags: tags(optional(fields, 'Tags')),
        year: validateYear(required(issue, fields, 'Year'), issue),
        url: url(issue, 'Project URL', optional(fields, 'Project URL')),
        detail: detail(issue, required(issue, fields, 'Body')),
        source: itemSource
      };
    case 'notes':
      return {
        time: validateDate(required(issue, fields, 'Date'), issue),
        text: noteText(issue, required(issue, fields, 'Body')),
        tags: tags(optional(fields, 'Tags')),
        source: itemSource
      };
    case 'life':
      return {
        id: slug(issue, optional(fields, 'Slug')),
        date: validateDate(required(issue, fields, 'Date'), issue),
        title: title(issue),
        summary: required(issue, fields, 'Summary'),
        tone: optional(fields, 'Tone'),
        imageUrl: url(issue, 'Image URL', optional(fields, 'Image URL'), { protocols: new Set(['https:']) }),
        detail: detail(issue, required(issue, fields, 'Body')),
        source: itemSource
      };
    case 'bookmarks':
      return grouped({
        name: title(issue),
        description: required(issue, fields, 'Description'),
        url: url(issue, 'URL', required(issue, fields, 'URL'), { required: true }),
        source: itemSource
      }, 'group', required(issue, fields, 'Group'));
    case 'uses':
      return grouped({
        name: title(issue),
        description: required(issue, fields, 'Description'),
        url: url(issue, 'URL', optional(fields, 'URL')),
        source: itemSource
      }, 'category', required(issue, fields, 'Category'));
    case 'opensource':
      return {
        year: validateYear(required(issue, fields, 'Year'), issue),
        title: title(issue),
        text: required(issue, fields, 'Description'),
        tags: tags(optional(fields, 'Tags')),
        url: url(issue, 'URL', optional(fields, 'URL')),
        source: itemSource
      };
    case 'about':
      return {
        name: required(issue, fields, 'Display Name'),
        role: required(issue, fields, 'Role'),
        bio: required(issue, fields, 'Bio'),
        location: optional(fields, 'Location'),
        status: optional(fields, 'Status'),
        fields: lines(optional(fields, 'Fields')),
        links: normalizeLinks(issue, optional(fields, 'Links'))
      };
    case 'now':
      return {
        summary: required(issue, fields, 'Summary'),
        sections: Object.entries(NOW_TITLES).map(([code, sectionTitle]) => ({
          code,
          title: sectionTitle,
          items: lines(optional(fields, code))
        }))
      };
    default:
      fail(issue, 'Labels', `unsupported content section "${section}"`);
  }
}

export function validateCrossContent(items) {
  const slugs = new Map();
  const singletons = new Map();
  const errors = [];

  for (const record of items) {
    if (DETAIL_SECTIONS.has(record.section)) {
      const previous = slugs.get(record.item.id);
      if (previous) {
        errors.push({
          ...contextFor(record.issue, 'Slug'),
          reason: `duplicate slug "${record.item.id}"; already used by issue #${previous.issue.number}`
        });
      } else {
        slugs.set(record.item.id, record);
      }
    }

    if (SINGLETON_SECTIONS.has(record.section)) {
      const previous = singletons.get(record.section);
      if (previous) {
        errors.push({
          ...contextFor(record.issue, 'Labels'),
          reason: `only one published ${record.section} Issue is allowed; already used by issue #${previous.issue.number}`
        });
      } else {
        singletons.set(record.section, record);
      }
    }
  }

  if (errors.length) throw new ContentValidationError(errors);
}
