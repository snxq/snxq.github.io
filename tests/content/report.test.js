import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cli = new URL('../../scripts/content/build-content.js', import.meta.url);

function runCli(arguments_, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli.pathname, ...arguments_], {
      cwd: new URL('../..', import.meta.url),
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('real source fails without an explicit or resolvable repository', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-repository-'));
  const result = await runCli([
    '--source', 'gh',
    '--output', path.join(root, 'content')
  ], {
    GITHUB_REPOSITORY: '',
    GITHUB_TOKEN: '',
    PATH: ''
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /repository/i);
  assert.doesNotMatch(result.stderr, /snxq\/snxq\.cc/);
});

test('native post bodies are not parsed as Issue Form metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-form-report-'));
  const output = path.join(root, 'content');
  const fixture = path.join(root, 'issues.json');
  await writeFile(fixture, JSON.stringify([{
    number: 77,
    title: 'Native post',
    state: 'open',
    labels: [{ name: 'content:post' }],
    author_association: 'OWNER',
    html_url: 'https://example.test/issues/77',
    created_at: '2026-07-24T07:00:00Z',
    updated_at: '2026-07-24T08:00:00Z',
    body: '### Summary\n\nFirst.\n\n### Summary\n\nSecond.'
  }]));

  const result = await runCli([
    '--source', 'fixture', '--fixtures', fixture, '--output', output,
    '--repository', 'example/site'
  ]);

  assert.equal(result.code, 0);
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const posts = JSON.parse(await readFile(path.join(output, manifest.files.posts), 'utf8'));
  assert.equal(posts.data.items[0].summary, 'First.');
  assert.equal(posts.data.items[0].detail.filter(block => block.type === 'heading').length, 2);
});

test('classic post template body is published without an injected Body heading', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-classic-template-'));
  const output = path.join(root, 'content');
  const fixture = path.join(root, 'issues.json');
  await writeFile(fixture, JSON.stringify([{
    number: 78,
    title: 'Classic template post',
    state: 'open',
    labels: [{ name: 'content:post' }],
    author_association: 'OWNER',
    html_url: 'https://example.test/issues/78',
    created_at: '2026-07-24T07:00:00Z',
    updated_at: '2026-07-24T08:00:00Z',
    body: 'First paragraph.\n\n## Section'
  }]));

  const result = await runCli([
    '--source', 'fixture', '--fixtures', fixture, '--output', output,
    '--repository', 'example/site'
  ]);

  assert.equal(result.code, 0);
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const posts = JSON.parse(await readFile(path.join(output, manifest.files.posts), 'utf8'));
  assert.equal(posts.data.items[0].detail[0].type, 'paragraph');
  assert.equal(posts.data.items[0].detail.some(block => block.type === 'heading' && block.children[0]?.value === 'Body'), false);
});

test('writes a structured validation report and preserves generated output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-report-'));
  const output = path.join(root, 'content');
  const fixture = path.join(root, 'issues.json');
  const report = path.join(root, 'report.json');
  await mkdir(output);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');
  await writeFile(fixture, JSON.stringify([
    {
      number: 31,
      title: 'First',
      state: 'open',
      labels: [{ name: 'content:post' }],
      author_association: 'OWNER',
      html_url: 'https://example.test/issues/31',
      created_at: '2026-07-24T07:00:00Z',
      updated_at: '2026-07-24T08:00:00Z',
      body: 'First body.'
    },
    {
      number: 42,
      title: 'Example',
      state: 'open',
      labels: [{ name: 'content:project' }],
      author_association: 'OWNER',
      html_url: 'https://example.test/issues/42',
      updated_at: '2026-07-24T08:00:00Z',
      body: '### Slug\n\nissue-31\n\n### Summary\n\nExample.\n\n### Status\n\nACTIVE\n\n### Year\n\n2026\n\n### Tags\n\n\n\n### Project URL\n\n\n\n### Body\n\nExample body.'
    }
  ]));

  const result = await runCli([
    '--source', 'fixture',
    '--fixtures', fixture,
    '--output', output,
    '--repository', 'example/site',
    '--report-file', report
  ]);

  assert.equal(result.code, 1);
  assert.equal(await readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'previous');
  assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), {
    marker: 'snxq-content-validation',
    errors: [{
      issueNumber: 42,
      title: 'Example',
      field: 'Slug',
      reason: 'duplicate slug "issue-31"; already used by issue #31',
      url: 'https://example.test/issues/42'
    }]
  });
  assert.match(result.stderr, /Issue #42 \(Example\).*Slug.*duplicate slug/s);
});
