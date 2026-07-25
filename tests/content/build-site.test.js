import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildStaticSite } from '../../scripts/build-site.js';
import { checkStaticSite } from '../../scripts/check-static-site.js';
import { buildContent } from '../../scripts/content/build-content.js';

const generatedAt = '2026-07-24T08:00:00.000Z';
const sectionNames = ['about', 'bookmarks', 'life', 'notes', 'now', 'opensource', 'posts', 'projects', 'uses'];

async function createSourceSite() {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'static-site-source-'));
  const outputDirectory = await mkdtemp(join(tmpdir(), 'static-site-output-'));

  await Promise.all([
    writeFile(join(rootDirectory, 'index.html'), '<!doctype html>'),
    writeFile(join(rootDirectory, 'CNAME'), 'blog.snxq.cc\n'),
    writeFile(join(rootDirectory, 'favicon.svg'), '<svg/>'),
    writeFile(join(rootDirectory, 'styles.css'), 'body {}'),
    mkdir(join(rootDirectory, 'src'), { recursive: true }),
    mkdir(join(rootDirectory, 'tests'), { recursive: true }),
    mkdir(join(rootDirectory, 'docs'), { recursive: true }),
    mkdir(join(rootDirectory, '.github'), { recursive: true }),
    mkdir(join(rootDirectory, 'node_modules'), { recursive: true }),
    mkdir(join(rootDirectory, 'scripts'), { recursive: true })
  ]);

  await Promise.all([
    writeFile(join(rootDirectory, 'src', 'app.js'), 'export {};'),
    writeFile(join(rootDirectory, 'src', 'content-api.js'), 'export {};'),
    writeFile(join(rootDirectory, 'tests', 'test.js'), ''),
    writeFile(join(rootDirectory, 'docs', 'guide.md'), ''),
    writeFile(join(rootDirectory, '.github', 'workflow.yml'), ''),
    writeFile(join(rootDirectory, 'node_modules', 'package.js'), ''),
    writeFile(join(rootDirectory, 'scripts', 'build.js'), '')
  ]);

  await buildContent({
    source: 'fixture',
    fixtures: new URL('../fixtures/issues/valid.json', import.meta.url).pathname,
    output: join(rootDirectory, 'generated', 'content'),
    repository: 'fixture/content',
    generatedAt
  });

  return { rootDirectory, outputDirectory };
}

async function builtSite() {
  const site = await createSourceSite();
  await buildStaticSite(site);
  return site;
}

async function readManifest(outputDirectory) {
  const manifestPath = join(outputDirectory, 'generated', 'content', 'manifest.json');
  return {
    manifestPath,
    manifest: JSON.parse(await readFile(manifestPath, 'utf8'))
  };
}

async function replaceSection(outputDirectory, section, mutate) {
  const { manifestPath, manifest } = await readManifest(outputDirectory);
  const contentDirectory = join(outputDirectory, 'generated', 'content');
  const document = JSON.parse(await readFile(join(contentDirectory, manifest.files[section]), 'utf8'));
  mutate(document);
  const bytes = `${JSON.stringify(document, null, 2)}\n`;
  const hash = createHash('sha256').update(bytes).digest('hex');
  const filename = `${section}.${hash}.json`;
  await writeFile(join(contentDirectory, filename), bytes);
  manifest.files[section] = filename;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test('checkStaticSite reports each missing required path', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'static-site-missing-'));

  await assert.rejects(
    checkStaticSite(outputDirectory),
    error => error.message.includes('index.html') && error.message.includes('generated/content/manifest.json')
  );
});

test('checkStaticSite accepts a complete canonical site', async () => {
  const { outputDirectory } = await builtSite();
  await checkStaticSite(outputDirectory);
});

test('checkStaticSite rejects malformed manifest JSON', async () => {
  const { outputDirectory } = await builtSite();
  const { manifestPath } = await readManifest(outputDirectory);
  await writeFile(manifestPath, '{not json');

  await assert.rejects(checkStaticSite(outputDirectory), /manifest.*JSON/i);
});

test('checkStaticSite validates the complete strict manifest schema', async t => {
  for (const variant of ['missing generatedAt', 'missing source', 'invalid source', 'unexpected key']) {
    await t.test(variant, async () => {
      const { outputDirectory } = await builtSite();
      const { manifestPath, manifest } = await readManifest(outputDirectory);
      if (variant === 'missing generatedAt') delete manifest.generatedAt;
      if (variant === 'missing source') delete manifest.source;
      if (variant === 'invalid source') manifest.source = { repository: '', issueCount: -1 };
      if (variant === 'unexpected key') manifest.unexpected = true;
      await writeFile(manifestPath, JSON.stringify(manifest));

      await assert.rejects(checkStaticSite(outputDirectory), /manifest.*invalid/i);
    });
  }
});

test('checkStaticSite requires exactly the canonical nine section keys', async t => {
  for (const variant of ['missing', 'extra']) {
    await t.test(variant, async () => {
      const { outputDirectory } = await builtSite();
      const { manifestPath, manifest } = await readManifest(outputDirectory);
      if (variant === 'missing') delete manifest.files.projects;
      else manifest.files.unexpected = manifest.files.projects;
      await writeFile(manifestPath, JSON.stringify(manifest));

      await assert.rejects(checkStaticSite(outputDirectory), /exactly.*nine|section keys/i);
    });
  }
});

test('checkStaticSite rejects unsupported manifest versions', async () => {
  const { outputDirectory } = await builtSite();
  const { manifestPath, manifest } = await readManifest(outputDirectory);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, version: 2 }));

  await assert.rejects(checkStaticSite(outputDirectory), /manifest.*invalid/i);
});

test('checkStaticSite rejects non-immutable manifest filenames', async () => {
  const { outputDirectory } = await builtSite();
  const { manifestPath, manifest } = await readManifest(outputDirectory);
  manifest.files.projects = '../projects.json';
  await writeFile(manifestPath, JSON.stringify(manifest));

  await assert.rejects(checkStaticSite(outputDirectory), /immutable section filename/);
});

test('checkStaticSite validates referenced section version and identity', async t => {
  for (const variant of ['version', 'section']) {
    await t.test(variant, async () => {
      const { outputDirectory } = await builtSite();
      await replaceSection(outputDirectory, 'projects', document => {
        if (variant === 'version') document.version = 2;
        else document.section = 'posts';
      });

      await assert.rejects(checkStaticSite(outputDirectory), /projects.*invalid|section.*projects/i);
    });
  }
});

test('checkStaticSite rejects a section whose exact bytes do not match its filename hash', async () => {
  const { outputDirectory } = await builtSite();
  const { manifest } = await readManifest(outputDirectory);
  const sectionPath = join(outputDirectory, 'generated', 'content', manifest.files.projects);
  await writeFile(sectionPath, `${await readFile(sectionPath, 'utf8')} `);

  await assert.rejects(checkStaticSite(outputDirectory), /hash.*projects|projects.*hash/i);
});

test('checkStaticSite reports a missing manifest-referenced section', async () => {
  const { outputDirectory } = await builtSite();
  const { manifestPath, manifest } = await readManifest(outputDirectory);
  manifest.files.projects = `projects.${'b'.repeat(64)}.json`;
  await writeFile(manifestPath, JSON.stringify(manifest));

  await assert.rejects(checkStaticSite(outputDirectory), new RegExp(manifest.files.projects.replaceAll('.', '\\.')));
});

test('buildStaticSite copies only deployable roots', async () => {
  const { rootDirectory, outputDirectory } = await createSourceSite();

  await buildStaticSite({ rootDirectory, outputDirectory });

  const entries = (await readdir(outputDirectory)).sort();
  assert.deepEqual(entries, ['CNAME', 'favicon.svg', 'generated', 'index.html', 'src', 'styles.css']);
  assert.equal(await readFile(join(outputDirectory, 'CNAME'), 'utf8'), 'blog.snxq.cc\n');

  for (const excludedPath of ['tests', 'docs', '.github', 'node_modules', 'scripts']) {
    await assert.rejects(access(join(outputDirectory, excludedPath)));
  }
  assert.deepEqual(sectionNames.sort(), Object.keys((await readManifest(outputDirectory)).manifest.files).sort());
});
