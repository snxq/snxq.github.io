import assert from 'node:assert/strict';
import test from 'node:test';

import { markdownToBlocks } from '../../scripts/content/markdown.js';
import { manifestSchema, richBlockSchema, sectionDocumentSchema } from '../../scripts/content/schema.js';

const context = {
  issueNumber: 42,
  title: 'Safe Markdown',
  field: 'Body',
  url: 'https://github.com/snxq/snxq.cc/issues/42'
};

test('converts supported GFM blocks and inline formatting', () => {
  const markdown = [
    '## Heading',
    '',
    'A *small* **strong** ~~deleted~~ [link](https://example.com/path) and `code`.',
    '',
    '```js',
    'const answer = 42;',
    '```',
    '',
    '- one',
    '- two',
    '',
    '1. first',
    '2. second',
    '',
    '> quoted',
    '',
    '| Name | Value |',
    '| --- | ---: |',
    '| left | right |',
    '',
    '![Alt text](https://example.com/image.png "Image title")',
    '',
    '---'
  ].join('\n');

  assert.deepEqual(markdownToBlocks(markdown, context), [
    { type: 'heading', depth: 2, children: [{ type: 'text', value: 'Heading' }] },
    {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'A ' },
        { type: 'emphasis', children: [{ type: 'text', value: 'small' }] },
        { type: 'text', value: ' ' },
        { type: 'strong', children: [{ type: 'text', value: 'strong' }] },
        { type: 'text', value: ' ' },
        { type: 'delete', children: [{ type: 'text', value: 'deleted' }] },
        { type: 'text', value: ' ' },
        { type: 'link', href: 'https://example.com/path', children: [{ type: 'text', value: 'link' }] },
        { type: 'text', value: ' and ' },
        { type: 'inlineCode', value: 'code' },
        { type: 'text', value: '.' }
      ]
    },
    { type: 'code', language: 'js', value: 'const answer = 42;' },
    {
      type: 'list',
      ordered: false,
      items: [
        [{ type: 'paragraph', children: [{ type: 'text', value: 'one' }] }],
        [{ type: 'paragraph', children: [{ type: 'text', value: 'two' }] }]
      ]
    },
    {
      type: 'list',
      ordered: true,
      start: 1,
      items: [
        [{ type: 'paragraph', children: [{ type: 'text', value: 'first' }] }],
        [{ type: 'paragraph', children: [{ type: 'text', value: 'second' }] }]
      ]
    },
    { type: 'quote', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'quoted' }] }] },
    {
      type: 'table',
      align: [null, 'right'],
      rows: [
        [[{ type: 'text', value: 'Name' }], [{ type: 'text', value: 'Value' }]],
        [[{ type: 'text', value: 'left' }], [{ type: 'text', value: 'right' }]]
      ]
    },
    { type: 'image', src: 'https://example.com/image.png', alt: 'Alt text', title: 'Image title' },
    { type: 'divider' }
  ]);
});

test('normalizes permitted link protocols', () => {
  assert.deepEqual(markdownToBlocks('[mail](mailto:me@example.com)', context), [{
    type: 'paragraph',
    children: [{ type: 'link', href: 'mailto:me@example.com', children: [{ type: 'text', value: 'mail' }] }]
  }]);
});

test('rejects raw HTML and unsafe URLs', () => {
  assert.throws(() => markdownToBlocks('<script>alert(1)</script>', context), /raw HTML is not allowed/);
  assert.throws(() => markdownToBlocks('[bad](javascript:alert(1))', context), /URL protocol is not allowed/);
  assert.throws(() => markdownToBlocks('![bad](data:image/png;base64,x)', context), /image URL must use https/);
});

test('rejects unsupported Markdown nodes with issue context', () => {
  for (const markdown of ['[reference][id]\n\n[id]: https://example.com', '[^note]\n\n[^note]: footnote', '- [ ] task', '- parent\n  - child']) {
    assert.throws(() => markdownToBlocks(markdown, context), error => (
      error.name === 'ContentValidationError'
      && error.message.includes('Issue #42 "Safe Markdown"')
      && error.message.includes('Field: Body')
      && error.message.includes('URL: https://github.com/snxq/snxq.cc/issues/42')
    ));
  }
});

test('rejects unsafe URLs and nested lists in schema values', () => {
  assert.equal(richBlockSchema.safeParse({
    type: 'paragraph',
    children: [{ type: 'link', href: 'javascript:alert(1)', children: [{ type: 'text', value: 'bad' }] }]
  }).success, false);
  assert.equal(richBlockSchema.safeParse({
    type: 'image', src: 'http://example.com/image.png', alt: '', title: null
  }).success, false);
  assert.equal(richBlockSchema.safeParse({
    type: 'list', ordered: false, items: [[{
      type: 'quote', children: [{
        type: 'list', ordered: false, items: [[{ type: 'paragraph', children: [] }]]
      }]
    }]]
  }).success, false);
});

test('rejects a quoted nested list inside a list item', () => {
  assert.throws(() => markdownToBlocks('- parent\n\n  > - child', context), /nested lists are not allowed/);
});

test('validates strict versioned section envelopes and manifests with Zod', () => {
  const posts = {
    version: 1,
    section: 'posts',
    title: '文章',
    subtitle: 'LONG-FORM TRANSMISSIONS',
    updatedAt: '2026-07-24T08:00:00.000Z',
    data: { items: [] }
  };
  assert.equal(sectionDocumentSchema.safeParse(posts).success, true);
  assert.equal(sectionDocumentSchema.safeParse({ ...posts, generatedAt: '2026-07-24T08:00:00.000Z' }).success, false);
  assert.equal(sectionDocumentSchema.safeParse({ ...posts, data: { groups: [] } }).success, false);
  assert.equal(manifestSchema.safeParse({
    version: 1,
    generatedAt: '2026-07-24T08:00:00Z',
    source: { repository: 'snxq/snxq.cc', issueCount: 0 },
    files: { posts: 'posts.json' }
  }).success, true);
  assert.equal(manifestSchema.safeParse({
    version: 1,
    generatedAt: '2026-07-24T08:00:00Z',
    source: { repository: 'snxq/snxq.cc', issueCount: 0, unexpected: true },
    files: { posts: 'posts.json' }
  }).success, false);
});
