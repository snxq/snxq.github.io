import test from 'node:test';
import assert from 'node:assert/strict';

import { ContentValidationError } from '../../scripts/content/errors.js';
import {
  normalizeIssue,
  validateCrossContent,
  validateDate,
  validateYear
} from '../../scripts/content/normalize.js';

function issue(number, title = '[post] Example') {
  return {
    number,
    title,
    html_url: `https://github.com/acme/site/issues/${number}`,
    updated_at: '2026-07-24T08:00:00Z'
  };
}

const postFields = {
  Slug: 'quiet-systems',
  Summary: 'A quiet summary',
  Date: '2026-07-24',
  Tags: 'design, systems, 设计',
  'Cover Image URL': 'https://example.com/cover.png',
  Body: 'A **quiet** paragraph.'
};

test('accepts strict calendar dates and supported year values', () => {
  assert.doesNotThrow(() => validateDate('2024-02-29'));
  for (const year of ['2026', '2024—2026', '2024—']) {
    assert.doesNotThrow(() => validateYear(year));
  }
  for (const date of ['2026-7-24', '2026-02-30', '24-07-24']) {
    assert.throws(() => validateDate(date), ContentValidationError);
  }
  for (const year of ['26', '2024-2026', '2026—2024', ' 2026']) {
    assert.throws(() => validateYear(year), ContentValidationError);
  }
});

test('normalizes a post with tags, blocks, source and canonical URLs', () => {
  assert.deepEqual(normalizeIssue(issue(12), 'posts', postFields), {
    id: 'quiet-systems',
    date: '2026-07-24',
    title: 'Example',
    summary: 'A quiet summary',
    readingTime: null,
    tags: ['design', 'systems', '设计'],
    coverImage: 'https://example.com/cover.png',
    detail: [{
      type: 'paragraph',
      children: [
        { type: 'text', value: 'A ' },
        { type: 'strong', children: [{ type: 'text', value: 'quiet' }] },
        { type: 'text', value: ' paragraph.' }
      ]
    }],
    source: {
      issueNumber: 12,
      issueUrl: 'https://github.com/acme/site/issues/12',
      updatedAt: '2026-07-24T08:00:00Z'
    }
  });
});

test('uses issue-number slugs and rejects invalid explicit slugs and URLs', () => {
  assert.equal(normalizeIssue(issue(7), 'posts', { ...postFields, Slug: '' }).id, 'issue-7');
  for (const slug of ['Upper', 'two words', '-edge', 'edge-', 'two--hyphens']) {
    assert.throws(() => normalizeIssue(issue(7), 'posts', { ...postFields, Slug: slug }), /Slug/);
  }
  assert.throws(
    () => normalizeIssue(issue(7), 'posts', { ...postFields, 'Cover Image URL': 'http://example.com/a.png' }),
    /Cover Image URL/
  );
  assert.throws(
    () => normalizeIssue(issue(7, '[project] Project'), 'projects', {
      Slug: '', Summary: 'Summary', Status: 'ACTIVE', Year: '2026', Tags: '',
      'Project URL': 'javascript:alert(1)', Body: 'Text'
    }),
    /Project URL/
  );
});

test('normalizes all collection entry types to published shapes', () => {
  const project = normalizeIssue(issue(2, '[project] Tool'), 'projects', {
    Slug: 'tool', Summary: 'Summary', Status: 'ACTIVE', Year: '2024—', Tags: 'cli, go',
    'Project URL': 'https://example.com/tool', Body: 'Details'
  });
  assert.deepEqual(Object.keys(project), ['id', 'name', 'summary', 'status', 'tags', 'year', 'url', 'detail', 'source']);

  const life = normalizeIssue(issue(3, '[life] Rain'), 'life', {
    Slug: 'rain', Date: '2026-07-01', Summary: 'Summary', Tone: 'blue',
    'Image URL': '', Body: 'Details'
  });
  assert.equal(life.imageUrl, null);

  const bookmark = normalizeIssue(issue(4, '[bookmark] Reference'), 'bookmarks', {
    URL: 'https://example.com/reference', Description: 'Useful', Group: '工具'
  });
  assert.deepEqual(bookmark.group, '工具');
  assert.equal(bookmark.name, 'Reference');

  const use = normalizeIssue(issue(5, '[use] Editor'), 'uses', {
    Description: 'Daily editor', Category: 'SOFTWARE', URL: ''
  });
  assert.equal(use.category, 'SOFTWARE');
  assert.equal(use.url, null);

  const opensource = normalizeIssue(issue(6, '[opensource] Packaging'), 'opensource', {
    Year: '2024—2026', Description: 'Maintained packages', Tags: 'linux, packaging', URL: ''
  });
  assert.deepEqual(opensource.tags, ['linux', 'packaging']);
  assert.equal(opensource.text, 'Maintained packages');
});

test('derives note text from paragraphs and inline formatting only', () => {
  const note = normalizeIssue(issue(8, '[note] ignored'), 'notes', {
    Date: '2026-07-23', Tags: 'thought', Body: 'First **strong** line.\n\nSecond [link](https://example.com).'
  });
  assert.equal(note.text, 'First strong line.\n\nSecond link.');
  assert.throws(
    () => normalizeIssue(issue(9, '[note] ignored'), 'notes', {
      Date: '2026-07-23', Tags: '', Body: '- rich\n- list'
    }),
    /short note/
  );
});

test('normalizes about newline fields, Label | URL links, and now lists', () => {
  const about = normalizeIssue(issue(10, '[about] Profile'), 'about', {
    'Display Name': 'snxq', Role: 'builder', Bio: 'Bio', Location: 'UTC+8', Status: 'building',
    Fields: 'Software\n\nDesign', Links: 'GitHub | https://github.com/snxq\nEmail | mailto:hi@example.com'
  });
  assert.deepEqual(about.fields, ['Software', 'Design']);
  assert.deepEqual(about.links, [
    ['GitHub', 'https://github.com/snxq'],
    ['Email', 'mailto:hi@example.com']
  ]);
  assert.throws(
    () => normalizeIssue(issue(10, '[about] Profile'), 'about', {
      'Display Name': 'snxq', Role: 'builder', Bio: 'Bio', Location: '', Status: '', Fields: '',
      Links: 'broken entry'
    }),
    /Links/
  );

  const now = normalizeIssue(issue(11, '[now] Current'), 'now', {
    Summary: 'Current summary', BUILD: 'One\nTwo', LEARN: '', READ: 'Book', LOOP: 'Rain'
  });
  assert.deepEqual(now.sections, [
    { code: 'BUILD', title: '正在做', items: ['One', 'Two'] },
    { code: 'LEARN', title: '正在理解', items: [] },
    { code: 'READ', title: '正在读 / 看', items: ['Book'] },
    { code: 'LOOP', title: '最近反复播放', items: ['Rain'] }
  ]);
});

test('rejects missing required fields and duplicate global slugs or singletons', () => {
  assert.throws(() => normalizeIssue(issue(1), 'posts', { ...postFields, Summary: '' }), /Summary/);

  const first = normalizeIssue(issue(20), 'posts', postFields);
  const second = normalizeIssue(issue(21, '[life] Same'), 'life', {
    Slug: 'quiet-systems', Date: '2026-07-01', Summary: 'Summary', Tone: '', 'Image URL': '', Body: 'Body'
  });
  assert.throws(() => validateCrossContent([
    { section: 'posts', issue: issue(20), item: first },
    { section: 'life', issue: issue(21, '[life] Same'), item: second }
  ]), /duplicate slug/);

  assert.throws(() => validateCrossContent([
    { section: 'about', issue: issue(30, '[about] One'), item: {} },
    { section: 'about', issue: issue(31, '[about] Two'), item: {} }
  ]), /only one published about/);
});
