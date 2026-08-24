import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { calendarDateSchema, manifestSchema, sectionDocumentSchema } from './content/schema.js';

const SITE_URL = 'https://blog.snxq.cc/';
const FEED_URL = `${SITE_URL}feed.xml`;
const POSTS_FILENAME = /^posts\.([a-f0-9]{64})\.json$/u;

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeXml = value => {
  const text = String(value);
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    const valid = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!valid) throw new Error(`Value contains a character forbidden by XML 1.0: U+${codePoint.toString(16).toUpperCase()}`);
  }
  return escapeHtml(text);
};

export function renderInline(nodes) {
  return nodes.map(node => {
    switch (node.type) {
      case 'text': return escapeHtml(node.value);
      case 'emphasis': return `<em>${renderInline(node.children)}</em>`;
      case 'strong': return `<strong>${renderInline(node.children)}</strong>`;
      case 'delete': return `<del>${renderInline(node.children)}</del>`;
      case 'inlineCode': return `<code>${escapeHtml(node.value)}</code>`;
      case 'link': return `<a href="${escapeHtml(node.href)}">${renderInline(node.children)}</a>`;
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
        const className = block.language ? ` class="language-${escapeHtml(block.language)}"` : '';
        return `<pre><code${className}>${escapeHtml(block.value)}</code></pre>`;
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
        const title = block.title === null ? '' : ` title="${escapeHtml(block.title)}"`;
        return `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}"${title}>`;
      }
      case 'divider': return '<hr>';
      default: throw new Error(`Unsupported rich block type: ${block.type}`);
    }
  }).join('');
}

const atomEntry = post => `  <entry>
    <id>${escapeXml(post.source.issueUrl)}</id>
    <title>${escapeXml(post.title)}</title>
    <link href="${escapeXml(post.source.issueUrl)}"></link>
    <published>${escapeXml(calendarDateSchema.parse(post.date))}T00:00:00Z</published>
    <updated>${escapeXml(post.source.updatedAt)}</updated>
    <content type="html">${escapeXml(renderBlocks(post.detail))}</content>
  </entry>`;

export function createAtomXml(document) {
  const entries = document.data.items.map(atomEntry).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${FEED_URL}</id>
  <title>snxq.cc posts</title>
  <updated>${escapeXml(document.updatedAt)}</updated>
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
