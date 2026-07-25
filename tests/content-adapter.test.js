import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureContentAdapterForTests,
  executeCommand,
  loadDetail,
  resetContentAdapterForTests
} from '../src/content-api.js';

const generatedAt = '2026-07-24T10:56:52.835Z';
const hashedProjectsFilename = `projects.${'a'.repeat(64)}.json`;
const manifest = {
  version: 1,
  generatedAt,
  source: { repository: 'snxq/snxq.cc', issueCount: 1 },
  files: { projects: hashedProjectsFilename }
};
const projects = {
  version: 1,
  section: 'projects',
  title: '项目',
  subtitle: 'BUILT SIGNALS',
  updatedAt: '2026-07-11T07:00:00Z',
  data: {
    items: [{
      id: 'signal-garden',
      name: 'Signal Garden',
      summary: 'A project.',
      year: '2026',
      source: { updatedAt: '2026-07-12T08:00:00Z' },
      detail: []
    }]
  }
};

function jsonResponse(value, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return value; } };
}

function fixtureFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = String(input);
    calls.push({ url, options });
    if (url === 'https://example.test/generated/content/manifest.json') return jsonResponse(manifest);
    if (url === `https://example.test/generated/content/${hashedProjectsFilename}?v=${encodeURIComponent(generatedAt)}`) return jsonResponse(projects);
    if (overrides[url]) return overrides[url]();
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { calls, fetchImpl };
}

test.beforeEach(() => resetContentAdapterForTests());
test.after(() => resetContentAdapterForTests());

test('English and Chinese aliases share one lazily loaded section', async () => {
  const fixture = fixtureFetch();
  configureContentAdapterForTests({ fetchImpl: fixture.fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const english = await executeCommand(' projects ');
  const chinese = await executeCommand('项目');

  assert.equal(english.ok, true);
  assert.equal(chinese.ok, true);
  assert.equal(english.window.contentType, 'projects');
  assert.equal(chinese.window.contentType, 'projects');
  assert.deepEqual(fixture.calls, [
    { url: 'https://example.test/generated/content/manifest.json', options: { redirect: 'error' } },
    { url: `https://example.test/generated/content/${hashedProjectsFilename}?v=${encodeURIComponent(generatedAt)}`, options: { redirect: 'error' } }
  ]);
});

test('overview preserves the public window contract', async () => {
  const fixture = fixtureFetch();
  configureContentAdapterForTests({ fetchImpl: fixture.fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const response = await executeCommand('projects');

  assert.equal(response.ok, true);
  assert.match(response.requestId, /^req-\d{4}$/);
  assert.deepEqual(response.window, {
    requestId: response.requestId,
    id: 'window-projects',
    title: '项目',
    subtitle: 'BUILT SIGNALS',
    updatedAt: '2026-07-11T07:00:00Z',
    contentType: 'projects',
    view: 'overview',
    data: projects.data
  });
});

test('detail lookup uses the item slug and source timestamp fallback', async () => {
  const fixture = fixtureFetch();
  configureContentAdapterForTests({ fetchImpl: fixture.fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const detail = await loadDetail('projects', 'signal-garden');

  assert.equal(detail.id, 'window-projects-signal-garden');
  assert.equal(detail.title, 'Signal Garden');
  assert.equal(detail.subtitle, 'BUILT SIGNALS / DETAIL');
  assert.equal(detail.updatedAt, '2026');
  assert.equal(detail.view, 'detail');
  assert.equal(detail.data.id, 'signal-garden');
});

test('invalid command count comes from the shared public command definitions', async () => {
  const fixture = fixtureFetch();
  configureContentAdapterForTests({ fetchImpl: fixture.fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const invalid = await executeCommand('stay curious');
  const help = await executeCommand('help');

  assert.equal(invalid.ok, false);
  assert.equal(invalid.message, '当前命令无效，总计支持 10 种命令。');
  assert.equal(help.window.data.commands.length, 9);
  assert.equal(help.window.data.commands.some(([command]) => command === 'custom'), false);
  assert.deepEqual(fixture.calls, []);
});

test('empty collection is returned as a valid overview', async () => {
  const fixture = fixtureFetch();
  const emptyProjects = structuredClone(projects);
  emptyProjects.data.items = [];
  const sectionUrl = `https://example.test/generated/content/${hashedProjectsFilename}?v=${encodeURIComponent(generatedAt)}`;
  fixture.fetchImpl = async input => {
    const url = String(input);
    fixture.calls.push(url);
    if (url.endsWith('/manifest.json')) return jsonResponse(manifest);
    if (url === sectionUrl) return jsonResponse(emptyProjects);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  configureContentAdapterForTests({ fetchImpl: fixture.fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const response = await executeCommand('projects');

  assert.deepEqual(response.window.data.items, []);
});

test('failed section requests are retryable and never fall back to GitHub', async () => {
  const calls = [];
  let sectionAttempts = 0;
  const fetchImpl = async input => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/manifest.json')) return jsonResponse(manifest);
    sectionAttempts += 1;
    if (sectionAttempts === 1) return jsonResponse({}, { ok: false, status: 503 });
    return jsonResponse(projects);
  };
  configureContentAdapterForTests({ fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const unavailable = await executeCommand('projects');
  const retried = await executeCommand('projects');

  assert.equal(unavailable.ok, true);
  assert.equal(unavailable.window.data.unavailable, true);
  assert.equal(unavailable.window.data.reference, `request ${unavailable.requestId} · content 1`);
  assert.equal(retried.window.data.items[0].id, 'signal-garden');
  assert.equal(calls.filter(url => url.endsWith('/manifest.json')).length, 1);
  assert.equal(sectionAttempts, 2);
  assert.equal(calls.some(url => url.includes('api.github.com')), false);
});

test('rejected manifest requests are retryable', async () => {
  let manifestAttempts = 0;
  const fetchImpl = async input => {
    const url = String(input);
    if (url.endsWith('/manifest.json')) {
      manifestAttempts += 1;
      if (manifestAttempts === 1) throw new Error('offline');
      return jsonResponse(manifest);
    }
    return jsonResponse(projects);
  };
  configureContentAdapterForTests({ fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const unavailable = await executeCommand('projects');
  const retried = await executeCommand('projects');

  assert.equal(unavailable.window.data.reference, `request ${unavailable.requestId} · content unknown`);
  assert.equal(retried.window.data.items[0].id, 'signal-garden');
  assert.equal(manifestAttempts, 2);
});

test('cross-origin manifest section URLs are rejected without requesting them', async () => {
  const calls = [];
  const externalManifest = { ...manifest, files: { projects: 'https://api.github.com/repos/snxq/snxq.cc/issues' } };
  configureContentAdapterForTests({
    baseUrl: 'https://example.test/generated/content/',
    fetchImpl: async input => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/manifest.json')) return jsonResponse(externalManifest);
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });

  const response = await executeCommand('projects');

  assert.equal(response.window.data.unavailable, true);
  assert.deepEqual(calls, ['https://example.test/generated/content/manifest.json']);
});

test('manifest section entries only accept simple JSON filenames', async t => {
  const invalidFilenames = [
    '/projects.json',
    '../projects.json',
    'nested/projects.json',
    'nested\\projects.json',
    'projects.json?source=other',
    'projects.json#other',
    'projects.json',
    'projects.abc123.json',
    'projects.txt'
  ];

  for (const filename of invalidFilenames) {
    await t.test(`rejects ${filename}`, async () => {
      resetContentAdapterForTests();
      const calls = [];
      const invalidManifest = { ...manifest, files: { projects: filename } };
      configureContentAdapterForTests({
        baseUrl: 'https://example.test/generated/content/',
        fetchImpl: async (input, options) => {
          calls.push({ url: String(input), options });
          return jsonResponse(invalidManifest);
        }
      });

      const response = await executeCommand('projects');

      assert.equal(response.window.data.unavailable, true);
      assert.deepEqual(calls, [{
        url: 'https://example.test/generated/content/manifest.json',
        options: { redirect: 'error' }
      }]);
    });
  }
});

test('valid simple JSON filename resolves strictly beneath the content base URL', async () => {
  const fixture = fixtureFetch();
  configureContentAdapterForTests({ fetchImpl: fixture.fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  const response = await executeCommand('projects');

  assert.equal(response.window.data.items[0].id, 'signal-garden');
  assert.equal(fixture.calls[1].url, `https://example.test/generated/content/${hashedProjectsFilename}?v=${encodeURIComponent(generatedAt)}`);
});

test('manifest and section envelopes require supported version 1', async () => {
  let manifestAttempts = 0;
  let sectionAttempts = 0;
  const fetchImpl = async input => {
    const url = String(input);
    if (url.endsWith('/manifest.json')) {
      manifestAttempts += 1;
      return jsonResponse(manifestAttempts === 1 ? { ...manifest, version: 2 } : manifest);
    }
    sectionAttempts += 1;
    return jsonResponse(sectionAttempts === 1 ? { ...projects, version: 2 } : projects);
  };
  configureContentAdapterForTests({ fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  assert.equal((await executeCommand('projects')).window.data.unavailable, true);
  assert.equal((await executeCommand('projects')).window.data.unavailable, true);
  assert.equal((await executeCommand('projects')).window.data.items.length, 1);
});

test('invalid section envelopes become unavailable and remain retryable', async () => {
  let sectionAttempts = 0;
  const invalid = { ...projects, section: 'posts' };
  const fetchImpl = async input => {
    const url = String(input);
    if (url.endsWith('/manifest.json')) return jsonResponse(manifest);
    sectionAttempts += 1;
    return jsonResponse(sectionAttempts === 1 ? invalid : projects);
  };
  configureContentAdapterForTests({ fetchImpl, baseUrl: 'https://example.test/generated/content/' });

  assert.equal((await executeCommand('projects')).window.data.unavailable, true);
  assert.equal((await executeCommand('projects')).window.data.items.length, 1);
  assert.equal(sectionAttempts, 2);
});
