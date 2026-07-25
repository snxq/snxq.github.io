import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';

import { ContentValidationError } from './errors.js';
import { richBlockSchema } from './schema.js';

const parser = unified().use(remarkParse).use(remarkGfm);
const linkProtocols = new Set(['https:', 'http:', 'mailto:']);

function validationError(context, reason) {
  return new ContentValidationError([{
    issueNumber: context.issueNumber,
    title: context.title,
    field: context.field,
    reason,
    url: context.url
  }]);
}

function unsupported(context, node) {
  throw validationError(context, `unsupported Markdown node: ${node.type}`);
}

function normalizedUrl(value, protocols, context, reason) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw validationError(context, reason);
  }
  if (!protocols.has(url.protocol)) throw validationError(context, reason);
  return url.href;
}

function convertInline(node, context) {
  switch (node.type) {
    case 'text':
      return { type: 'text', value: node.value };
    case 'emphasis':
    case 'strong':
    case 'delete':
      return { type: node.type, children: node.children.map(child => convertInline(child, context)) };
    case 'inlineCode':
      return { type: 'inlineCode', value: node.value };
    case 'link':
      return {
        type: 'link',
        href: normalizedUrl(node.url, linkProtocols, context, 'URL protocol is not allowed'),
        children: node.children.map(child => convertInline(child, context))
      };
    case 'html':
      throw validationError(context, 'raw HTML is not allowed');
    default:
      unsupported(context, node);
  }
}

function convertBlocks(nodes, context, { inList = false } = {}) {
  return nodes.map(node => convertBlock(node, context, { inList }));
}

function convertBlock(node, context, options) {
  switch (node.type) {
    case 'heading':
      if (node.depth < 2 || node.depth > 4) {
        throw validationError(context, 'heading depth must be between 2 and 4');
      }
      return { type: 'heading', depth: node.depth, children: node.children.map(child => convertInline(child, context)) };
    case 'paragraph':
      if (node.children.length === 1 && node.children[0].type === 'image') {
        const image = node.children[0];
        return {
          type: 'image',
          src: normalizedUrl(image.url, new Set(['https:']), context, 'image URL must use https'),
          alt: image.alt ?? '',
          title: image.title ?? null
        };
      }
      return { type: 'paragraph', children: node.children.map(child => convertInline(child, context)) };
    case 'blockquote':
      return { type: 'quote', children: convertBlocks(node.children, context, options) };
    case 'code':
      return { type: 'code', language: node.lang ?? null, value: node.value };
    case 'list': {
      if (options.inList) throw validationError(context, 'nested lists are not allowed');
      if (node.children.some(item => item.checked !== null)) {
        throw validationError(context, 'task-list checkboxes are not allowed');
      }
      return {
        type: 'list',
        ordered: node.ordered,
        ...(node.ordered ? { start: node.start } : {}),
        items: node.children.map(item => convertBlocks(item.children, context, { inList: true }))
      };
    }
    case 'table':
      return {
        type: 'table',
        align: node.align,
        rows: node.children.map(row => row.children.map(cell => cell.children.map(child => convertInline(child, context))))
      };
    case 'thematicBreak':
      return { type: 'divider' };
    case 'image':
      return {
        type: 'image',
        src: normalizedUrl(node.url, new Set(['https:']), context, 'image URL must use https'),
        alt: node.alt ?? '',
        title: node.title ?? null
      };
    case 'html':
      throw validationError(context, 'raw HTML is not allowed');
    default:
      unsupported(context, node);
  }
}

function schemaError(context, result) {
  const issue = result.error.issues[0];
  const path = issue.path.length ? issue.path.join('.') : '(root)';
  throw validationError(context, `generated rich block schema is invalid at ${path}: ${issue.message}`);
}

export function markdownToBlocks(markdown, context) {
  const tree = parser.parse(markdown);
  const blocks = convertBlocks(tree.children, context);
  const result = richBlockSchema.array().safeParse(blocks);
  if (!result.success) schemaError(context, result);
  return result.data;
}
