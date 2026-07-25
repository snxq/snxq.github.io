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

test('reports duplicate Issue Form fields with Issue context and preserves output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'snxq-form-report-'));
  const output = path.join(root, 'content');
  const fixture = path.join(root, 'issues.json');
  const report = path.join(root, 'report.json');
  await mkdir(output);
  await writeFile(path.join(output, 'sentinel.txt'), 'previous');
  await writeFile(fixture, JSON.stringify([{
    number: 77,
    title: 'Duplicate field',
    state: 'open',
    labels: [{ name: 'content:post' }],
    author_association: 'OWNER',
    html_url: 'https://example.test/issues/77',
    updated_at: '2026-07-24T08:00:00Z',
    body: '### Slug\n\nduplicate-field\n\n### Summary\n\nFirst.\n\n### Summary\n\nSecond.\n\n### Date\n\n2026-07-24\n\n### Body\n\nBody.'
  }]));

  const result = await runCli([
    '--source', 'fixture', '--fixtures', fixture, '--output', output,
    '--repository', 'example/site', '--report-file', report
  ]);

  assert.equal(result.code, 1);
  assert.equal(await readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'previous');
  assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), {
    marker: 'snxq-content-validation',
    errors: [{
      issueNumber: 77,
      title: 'Duplicate field',
      field: 'Summary',
      reason: 'duplicate Issue Form field "Summary"',
      url: 'https://example.test/issues/77'
    }]
  });
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
      updated_at: '2026-07-24T08:00:00Z',
      body: '### Slug\n\nexample\n\n### Summary\n\nFirst.\n\n### Date\n\n2026-07-24\n\n### Tags\n\n\n\n### Cover Image URL\n\n\n\n### Body\n\nFirst body.'
    },
    {
      number: 42,
      title: 'Example',
      state: 'open',
      labels: [{ name: 'content:project' }],
      author_association: 'OWNER',
      html_url: 'https://example.test/issues/42',
      updated_at: '2026-07-24T08:00:00Z',
      body: '### Slug\n\nexample\n\n### Summary\n\nExample.\n\n### Status\n\nACTIVE\n\n### Year\n\n2026\n\n### Tags\n\n\n\n### Project URL\n\n\n\n### Body\n\nExample body.'
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
      reason: 'duplicate slug "example"; already used by issue #31',
      url: 'https://example.test/issues/42'
    }]
  });
  assert.match(result.stderr, /Issue #42 \(Example\).*Slug.*duplicate slug/s);
});
