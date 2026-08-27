import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildContent, buildDocuments } from '../../scripts/content/build-content.js';
import { ContentValidationError } from '../../scripts/content/errors.js';
import { buildSectionDocumentSchema, manifestSchema, sectionDocumentSchema } from '../../scripts/content/schema.js';
import {
  fetchQrPng,
  materializeAboutAsset,
  validatePng,
  validateSourceUrl
} from '../../scripts/content/qr-asset.js';

const generatedAt = '2026-07-24T08:00:00.000Z';
const assetFixtures = new URL('../fixtures/assets', import.meta.url).pathname;

async function fixtureIssues(name = 'valid.json') {
  return JSON.parse(await readFile(new URL(`../fixtures/issues/${name}`, import.meta.url), 'utf8'));
}

test('validates QR source URL and rejects unsafe variants', () => {
  assert.equal(
    validateSourceUrl('https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000').hostname,
    'github.com'
  );
  for (const value of [
    'http://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000',
    'https://evil.example/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000',
    'https://github.com/user-attachments/assets/not-a-uuid',
    'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000?raw=1',
    'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000/extra'
  ]) {
    assert.throws(() => validateSourceUrl(value), /WeChat QR Code URL|GitHub user attachment/i);
  }
});

test('downloads one allowed redirect and validates PNG metadata', async () => {
  const bytes = await readFile(new URL('../fixtures/assets/wechat-qr.png', import.meta.url));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://github-production-user-asset-6210df.s3.amazonaws.com/file.png' }
      });
    }
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) }
    });
  };
  const result = await fetchQrPng(
    'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000',
    { fetchImpl }
  );

  assert.equal(result.bytes.length, bytes.length);
  assert.deepEqual(result.size, { width: 2, height: 2 });
  assert.equal(calls[0].options.redirect, 'manual');
  assert.deepEqual(calls[0].options.headers, {});
});

test('rejects bad QR responses and disallowed redirects', async () => {
  const url = 'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000';
  await assert.rejects(
    fetchQrPng(url, {
      fetchImpl: async () => new Response('x', { status: 200, headers: { 'content-type': 'text/plain' } })
    }),
    /PNG|Content-Type/i
  );
  await assert.rejects(
    fetchQrPng(url, {
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/file.png' } })
    }),
    /redirect|host/i
  );
});

test('rejects redirect and response size limit violations', async () => {
  const url = 'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000';
  const redirect = () => new Response(null, { status: 302, headers: { location: url } });
  await assert.rejects(fetchQrPng(url, { fetchImpl: async () => redirect() }), /too many redirects/i);
  await assert.rejects(fetchQrPng(url, {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://github.com/file.png' } })
  }), /redirect host/i);
  await assert.rejects(fetchQrPng(url, {
    fetchImpl: async () => new Response(null, { status: 200, headers: {
      'content-type': 'image/png', 'content-length': String(1024 * 1024 + 1)
    } })
  }), /1 MiB/i);
  await assert.rejects(fetchQrPng(url, {
    fetchImpl: async () => new Response(new Uint8Array(1024 * 1024 + 1), {
      status: 200, headers: { 'content-type': 'image/png' }
    })
  }), /1 MiB/i);
});

test('rejects malformed PNG metadata variants', async () => {
  const valid = new Uint8Array(await readFile(new URL('../fixtures/assets/wechat-qr.png', import.meta.url)));
  const variants = [
    ['signature', bytes => { bytes[0] = 0; }],
    ['IHDR', bytes => { bytes[12] = 0; }],
    ['square', bytes => { new DataView(bytes.buffer).setUint32(20, 3); }],
    ['zero', bytes => { new DataView(bytes.buffer).setUint32(16, 0); }],
    ['maximum', bytes => { new DataView(bytes.buffer).setUint32(16, 2049); new DataView(bytes.buffer).setUint32(20, 2049); }]
  ];
  for (const [name, mutate] of variants) {
    const bytes = valid.slice();
    mutate(bytes);
    assert.throws(() => validatePng(bytes, 'image/png'), new RegExp(`PNG|square|2048|${name}`, 'i'));
  }
});
test('materializes fixture QR as a content-hashed same-origin asset', async () => {
  const issue = {
    number: 40,
    title: '[about] Profile',
    html_url: 'https://github.com/snxq/snxq.cc/issues/40'
  };
  const result = await materializeAboutAsset({
    issue,
    sourceUrl: 'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000',
    assetFixtures: new URL('../fixtures/assets', import.meta.url).pathname
  });

  assert.match(result.path, /^\/generated\/content\/assets\/wechat-qr\.[a-f0-9]{64}\.png$/u);
  assert.ok(result.bytes.length > 0);
});
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
    assert.equal(buildSectionDocumentSchema.safeParse(document).success, true);
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
      assetFixtures,
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
    repository: 'snxq/snxq.cc', generatedAt, assetFixtures
  });

  assert.equal(result.output, output);
  const entries = await readdir(output);
  assert.equal(entries.length, 11);
  assert.equal(entries.includes('assets'), true);
  assert.equal(entries.includes('manifest.json'), true);
  assert.equal(entries.filter(name => /^(about|bookmarks|life|notes|now|opensource|posts|projects|uses)\.[a-f0-9]{64}\.json$/.test(name)).length, 9);
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const posts = JSON.parse(await readFile(path.join(output, manifest.files.posts), 'utf8'));
  const about = JSON.parse(await readFile(path.join(output, manifest.files.about), 'utf8'));
  assert.equal(posts.data.items[0].id, 'issue-101');
  assert.match(about.data.wechatQrCodeUrl, /^\/generated\/content\/assets\/wechat-qr\.[a-f0-9]{64}\.png$/u);
  assert.ok((await readFile(path.join(output, 'assets', path.basename(about.data.wechatQrCodeUrl)))).length > 0);
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
    repository: 'snxq/snxq.cc', generatedAt, assetFixtures,
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
    repository: 'snxq/snxq.cc', generatedAt, assetFixtures,
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
      repository: 'snxq/snxq.cc', generatedAt, assetFixtures,
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

test('requires fixture assets for a non-empty QR and preserves previous output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  await mkdir(output);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');

  await assert.rejects(
    buildContent({
      source: 'fixture',
      fixtures: new URL('../fixtures/issues/valid.json', import.meta.url).pathname,
      output,
      repository: 'snxq/snxq.cc',
      generatedAt
    }),
    error => {
      assert.equal(error instanceof ContentValidationError, true);
      assert.equal(error.entries[0].field, 'WeChat QR Code URL');
      assert.match(error.entries[0].title, /about/i);
      return true;
    }
  );
  assert.equal(await readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'previous');
});
test('does not use the network when an explicit fixture asset is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  const emptyAssets = path.join(root, 'assets');
  await mkdir(output);
  await mkdir(emptyAssets);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');
  let fetchCalls = 0;

  await assert.rejects(buildContent({
    source: 'fixture',
    fixtures: new URL('../fixtures/issues/valid.json', import.meta.url).pathname,
    assetFixtures: emptyAssets,
    fetchImpl: async () => { fetchCalls += 1; throw new Error('network must not run'); },
    output,
    repository: 'snxq/snxq.cc',
    generatedAt
  }), error => {
    assert.equal(error instanceof ContentValidationError, true);
    assert.equal(error.entries[0].field, 'WeChat QR Code URL');
    assert.match(error.entries[0].title, /about/i);
    assert.match(error.entries[0].url, /issues\//u);
    return true;
  });
  assert.equal(fetchCalls, 0);
  assert.equal(await readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'previous');
});
test('attributes QR download validation to the About Issue and preserves output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-content-'));
  const output = path.join(root, 'content');
  await mkdir(output);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');

  await assert.rejects(buildContent({
    source: 'fixture',
    fixtures: new URL('../fixtures/issues/valid.json', import.meta.url).pathname,
    assetFixtures,
    output,
    repository: 'snxq/snxq.cc',
    generatedAt,
    writeAssetImpl: async () => { throw new Error('asset write denied'); }
  }), error => {
    assert.equal(error instanceof ContentValidationError, true);
    assert.equal(error.entries[0].field, 'WeChat QR Code URL');
    assert.match(error.entries[0].reason, /asset write denied/);
    assert.match(error.entries[0].title, /about/i);
    return true;
  });
  assert.equal(await readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'previous');
});

test('attributes downloaded QR validation failures to the About Issue', async () => {
  const issues = await fixtureIssues();
  await assert.rejects(buildContent({
    source: 'gh',
    token: 'test-token',
    repository: 'snxq/snxq.cc',
    output: path.join(await mkdtemp(path.join(tmpdir(), 'snxq-content-')), 'content'),
    generatedAt,
    fetchImpl: async () => new Response(JSON.stringify(issues), {
      status: 200, headers: { 'content-type': 'application/json' }
    }),
    assetFetchImpl: async () => new Response('not png', {
      status: 200, headers: { 'content-type': 'text/plain' }
    })
  }), error => {
    assert.equal(error instanceof ContentValidationError, true);
    assert.equal(error.entries[0].field, 'WeChat QR Code URL');
    return true;
  });
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
