import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const templates = new URL('../../.github/ISSUE_TEMPLATE/', import.meta.url);

test('uses eight structured YAML forms and one classic Markdown post template', async () => {
  const names = (await readdir(templates)).sort();
  assert.equal(names.filter(name => name.endsWith('.yml')).length, 8);
  assert.equal(names.includes('content-post.yml'), false);
  assert.equal(names.includes('content-post.md'), true);
});

test('About template offers an optional WeChat QR code URL', async () => {
  const source = await readFile(new URL('content-about.yml', templates), 'utf8');
  assert.match(source, /id: wechat-qr-code-url/u);
  assert.match(source, /label: WeChat QR Code URL/u);
  assert.match(source, /description: HTTPS image URL for the 深夜旅行 official account QR code\./u);
});

test('classic post template has content:post front matter and an empty body', async () => {
  const source = await readFile(new URL('content-post.md', templates), 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  assert.ok(match);
  assert.match(match[1], /^name: Content — Post$/mu);
  assert.match(match[1], /^about: .+$/mu);
  assert.match(match[1], /^title: ''$/mu);
  assert.match(match[1], /^labels: 'content:post'$/mu);
  assert.match(match[1], /^assignees: ''$/mu);
  assert.equal(match[2], '');
  assert.doesNotMatch(source, /^### Body$/mu);
});
