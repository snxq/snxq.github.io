import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildContent, buildDocuments } from '../../scripts/content/build-content.js';
import { ContentValidationError } from '../../scripts/content/errors.js';
import { manifestSchema, sectionDocumentSchema } from '../../scripts/content/schema.js';

const generatedAt = '2026-07-24T08:00:00.000Z';

async function fixtureIssues(name = 'valid.json') {
  return JSON.parse(await readFile(new URL(`../fixtures/issues/${name}`, import.meta.url), 'utf8'));
}

test('builds deterministic schema-valid documents for all nine sections', async () => {
  const issues = await fixtureIssues();
  const first = buildDocuments({ issues, repository: 'snxq/snxq.cc', generatedAt });
  const second = buildDocuments({ issues: [...issues].reverse(), repository: 'snxq/snxq.cc', generatedAt });

  assert.deepEqual(second, first);
  assert.equal(first.manifest.version, 1);
  assert.match(first.manifest.files.posts, /^posts\.[a-f0-9]{64}\.json$/);
  const postsBytes = `${JSON.stringify(first.sections.posts, null, 2)}\n`;
  assert.equal(
    first.manifest.files.posts,
    `posts.${createHash('sha256').update(postsBytes).digest('hex')}.json`
  );
  assert.equal(first.manifest.source.issueCount, issues.length);
  assert.equal(first.sections.posts.data.items[0].id, 'issue-101');
  assert.equal(first.sections.posts.data.items[0].date, '2026-07-24');
  assert.equal(first.sections.posts.data.items[0].summary, 'A quiet system.');
  assert.deepEqual(first.sections.posts.data.items[0].tags, ['design', 'systems']);
  assert.deepEqual(first.sections.uses.data.categories, []);
  assert.equal(Object.keys(first.sections).length, 9);
  assert.equal(manifestSchema.safeParse(first.manifest).success, true);
  for (const document of Object.values(first.sections)) {
    assert.equal(sectionDocumentSchema.safeParse(document).success, true);
  }
});

test('attributes a section schema failure to the item at the failing path', async () => {
  const issues = await fixtureIssues();
  const posts = issues.filter(issue => issue.labels[0].name === 'content:post');
  posts[1] = { ...posts[1], updated_at: 'not-an-instant' };

  assert.throws(
    () => buildDocuments({ issues: posts, repository: 'snxq/snxq.cc', generatedAt }),
    error => {
      assert.equal(error instanceof ContentValidationError, true);
      const itemEntry = error.entries.find(entry => /data\.items\.1\.source\.updatedAt/.test(entry.field));
      assert.ok(itemEntry);
      assert.equal(itemEntry.issueNumber, posts[1].number);
      assert.equal(itemEntry.url, posts[1].html_url);
      return true;
    }
  );
});

test('attributes final pre-write envelope validation to the Issue supplying updatedAt', async () => {
  const issues = await fixtureIssues();
  const posts = issues.filter(issue => issue.labels[0].name === 'content:post');
  const latest = posts.find(issue => issue.number === 101);
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  const fixturesDirectory = path.join(root, 'fixtures');
  await mkdir(fixturesDirectory);
  await writeFile(path.join(fixturesDirectory, 'valid.json'), JSON.stringify(posts));

  await assert.rejects(
    buildContent({
      source: 'fixture', fixtures: fixturesDirectory, output,
      repository: 'snxq/snxq.cc', generatedAt,
      beforeFinalValidation: documents => { documents.sections.posts.updatedAt = 'invalid'; }
    }),
    error => {
      assert.equal(error instanceof ContentValidationError, true);
      const entry = error.entries.find(item => item.field === 'updatedAt');
      assert.ok(entry);
      assert.equal(entry.issueNumber, latest.number);
      assert.equal(entry.title, latest.title);
      assert.equal(entry.url, latest.html_url);
      return true;
    }
  );
});

test('sorts section data and grouped entries deterministically', async () => {
  const { sections } = buildDocuments({
    issues: await fixtureIssues(), repository: 'snxq/snxq.cc', generatedAt
  });

  assert.deepEqual(sections.posts.data.items.map(item => item.id), ['issue-101', 'issue-100']);
  assert.deepEqual(sections.projects.data.items.map(item => item.name), ['New Project', 'Old Project']);
  assert.deepEqual(sections.bookmarks.data.groups.map(group => group.name), ['工具', '网络']);
  assert.deepEqual(sections.bookmarks.data.groups[0].links.map(link => link.name), ['New Tool', 'Old Tool']);
  assert.deepEqual(sections.opensource.data.contributions.map(item => item.title), ['Recent OSS', 'Older OSS']);
});

test('rejects fixture duplicate slugs and duplicate singleton content', async () => {
  for (const [fixture, message] of [
    ['invalid-duplicate-slug.json', /duplicate slug/],
    ['invalid-singleton.json', /only one published about/]
  ]) {
    assert.throws(
      () => buildDocuments({ issues: awaitValue(fixture), repository: 'snxq/snxq.cc', generatedAt }),
      message
    );
  }

  function awaitValue(name) {
    const fixture = fixtures[name];
    assert.ok(fixture);
    return fixture;
  }
});

const fixtures = {};
test.before(async () => {
  for (const name of ['invalid-duplicate-slug.json', 'invalid-singleton.json']) {
    fixtures[name] = await fixtureIssues(name);
  }
});

test('writes manifest and all section files atomically from fixture input', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  const fixturesDirectory = path.join(root, 'fixtures');
  await mkdir(fixturesDirectory);
  await writeFile(path.join(fixturesDirectory, 'valid.json'), JSON.stringify(await fixtureIssues()));

  const result = await buildContent({
    source: 'fixture', fixtures: fixturesDirectory, output,
    repository: 'snxq/snxq.cc', generatedAt
  });

  assert.equal(result.output, output);
  const entries = await readdir(output);
  assert.equal(entries.length, 10);
  assert.equal(entries.includes('manifest.json'), true);
  assert.equal(entries.filter(name => /^(about|bookmarks|life|notes|now|opensource|posts|projects|uses)\.[a-f0-9]{64}\.json$/.test(name)).length, 9);
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const posts = JSON.parse(await readFile(path.join(output, manifest.files.posts), 'utf8'));
  assert.equal(posts.data.items[0].id, 'issue-101');
});

test('does not report a committed replacement as failed when backup cleanup fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  const fixturesDirectory = path.join(root, 'fixtures');
  await mkdir(output);
  await mkdir(fixturesDirectory);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');
  await writeFile(path.join(fixturesDirectory, 'valid.json'), JSON.stringify(await fixtureIssues()));

  const warnings = [];
  const result = await buildContent({
    source: 'fixture', fixtures: fixturesDirectory, output,
    repository: 'snxq/snxq.cc', generatedAt,
    cleanupBackup: async () => { throw new Error('cleanup denied'); },
    warn: message => warnings.push(message)
  });

  assert.equal(result.output, output);
  assert.equal((await readdir(output)).includes('manifest.json'), true);
  assert.deepEqual(warnings.length, 1);
  assert.match(warnings[0], /backup cleanup failed/);
});

test('keeps a committed replacement successful when post-install cleanup and warning fail', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  const fixturesDirectory = path.join(root, 'fixtures');
  await mkdir(output);
  await mkdir(fixturesDirectory);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');
  await writeFile(path.join(fixturesDirectory, 'valid.json'), JSON.stringify(await fixtureIssues()));

  const result = await buildContent({
    source: 'fixture', fixtures: fixturesDirectory, output,
    repository: 'snxq/snxq.cc', generatedAt,
    cleanupTemporary: async () => { throw new Error('temporary cleanup denied'); },
    warn: () => { throw new Error('warning sink denied'); }
  });

  assert.equal(result.output, output);
  assert.equal((await readdir(output)).includes('manifest.json'), true);
  assert.equal((await readdir(output)).includes('sentinel.txt'), false);
});

test('keeps committed output active when cleanup rejects with unknown values', async () => {
  for (const [cleanupName, thrownValue] of [
    ['cleanupBackup', null],
    ['cleanupTemporary', undefined]
  ]) {
    const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
    const output = path.join(root, 'content');
    const fixturesDirectory = path.join(root, 'fixtures');
    await mkdir(output);
    await mkdir(fixturesDirectory);
    await writeFile(path.join(output, 'sentinel.txt'), 'previous');
    await writeFile(path.join(fixturesDirectory, 'valid.json'), JSON.stringify(await fixtureIssues()));

    const warnings = [];
    const result = await buildContent({
      source: 'fixture', fixtures: fixturesDirectory, output,
      repository: 'snxq/snxq.cc', generatedAt,
      [cleanupName]: async () => { throw thrownValue; },
      warn: message => warnings.push(message)
    });

    assert.equal(result.output, output);
    assert.equal((await readdir(output)).includes('manifest.json'), true);
    assert.equal((await readdir(output)).includes('sentinel.txt'), false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /cleanup failed/);
  }
});

test('preserves previous output directory when validation fails before replacement', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  const fixturesDirectory = path.join(root, 'fixtures');
  await mkdir(output);
  await mkdir(fixturesDirectory);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');
  await writeFile(path.join(fixturesDirectory, 'valid.json'), JSON.stringify(fixtures['invalid-duplicate-slug.json']));

  await assert.rejects(
    buildContent({ source: 'fixture', fixtures: fixturesDirectory, output, repository: 'snxq/snxq.cc', generatedAt }),
    ContentValidationError
  );
  assert.equal(await readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'previous');
});
