import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRenderableBlock,
  normalizeRenderableInline
} from '../src/render-contract.js';

test('normalizeRenderableInline preserves supported recursive inline shapes', () => {
  const node = {
    type: 'strong',
    children: [
      { type: 'text', value: 'safe ' },
      { type: 'inlineCode', value: '<code>' },
      { type: 'link', href: 'mailto:hello@example.com', children: [{ type: 'emphasis', children: [{ type: 'text', value: 'mail' }] }] }
    ]
  };

  assert.deepEqual(normalizeRenderableInline(node), node);
});

test('normalizeRenderableInline rejects unknown types and unsafe links', () => {
  assert.equal(normalizeRenderableInline({ type: 'script', value: 'alert(1)' }), null);
  assert.equal(normalizeRenderableInline({ type: 'link', href: 'javascript:alert(1)', children: [] }), null);
  assert.equal(normalizeRenderableInline({ type: 'link', href: '/relative', children: [] }), null);
});

test('normalizeRenderableBlock preserves supported block fields', () => {
  const blocks = [
    { type: 'heading', depth: 4, children: [{ type: 'text', value: 'Heading' }] },
    { type: 'paragraph', children: [{ type: 'delete', children: [{ type: 'text', value: 'old' }] }] },
    { type: 'quote', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'quoted' }] }] },
    { type: 'code', language: 'js', value: 'const safe = true;' },
    { type: 'list', ordered: true, start: 3, items: [[{ type: 'paragraph', children: [{ type: 'text', value: 'third' }] }]] },
    { type: 'table', align: ['left', null], rows: [[[ { type: 'text', value: 'A' } ], [{ type: 'strong', children: [{ type: 'text', value: 'B' }] }]]] },
    { type: 'image', src: 'https://images.example.test/a.png', alt: 'A', title: null },
    { type: 'divider' }
  ];

  for (const block of blocks) assert.deepEqual(normalizeRenderableBlock(block), block);
});

test('normalizeRenderableBlock rejects unknown or malformed shapes and unsafe images', () => {
  assert.equal(normalizeRenderableBlock({ type: 'html', value: '<b>unsafe</b>' }), null);
  assert.equal(normalizeRenderableBlock({ type: 'heading', depth: 1, children: [] }), null);
  assert.equal(normalizeRenderableBlock({ type: 'image', src: 'http://images.example.test/a.png', alt: '', title: null }), null);
  assert.equal(normalizeRenderableBlock({ type: 'paragraph', children: [{ type: 'unknown' }] }), null);
});
