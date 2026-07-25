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

function jsonResponse(value) {
  return { ok: true, status: 200, async json() { return value; } };
}

function configureFixture() {
  configureContentAdapterForTests({
    baseUrl: 'https://example.test/generated/content/',
    fetchImpl: async input => {
      const url = String(input);
      if (url.endsWith('/manifest.json')) return jsonResponse(manifest);
      if (url.includes(`/${hashedProjectsFilename}?v=`)) return jsonResponse(projects);
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });
}

test.beforeEach(configureFixture);
test.after(() => resetContentAdapterForTests());

test('projects returns an overview window', async () => {
  const response = await executeCommand('projects');
  assert.equal(response.ok, true);
  assert.equal(response.window.contentType, 'projects');
  assert.equal(response.window.view, 'overview');
});

test('Chinese alias resolves to projects', async () => {
  const response = await executeCommand('项目');
  assert.equal(response.ok, true);
  assert.equal(response.window.contentType, 'projects');
});

test('invalid command includes canonical command count', async () => {
  const response = await executeCommand('not-a-command');
  assert.equal(response.ok, false);
  assert.equal('window' in response, false);
  assert.equal(response.message, '当前命令无效，总计支持 10 种命令。');
});

test('project detail returns typed detail data', async () => {
  const response = await loadDetail('projects', 'signal-garden');
  assert.equal(response.contentType, 'projects');
  assert.equal(response.view, 'detail');
  assert.equal(response.data.id, 'signal-garden');
});
