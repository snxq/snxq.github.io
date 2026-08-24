import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildAtomFeed, createAtomXml, renderBlocks } from '../../scripts/build-feed.js';
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

test('renderBlocks serializes supported rich content with escaped values', () => {
  const html = renderBlocks([
    { type: 'heading', depth: 2, children: [{ type: 'text', value: 'A < B & C' }] },
    {
      type: 'paragraph',
      children: [
        { type: 'emphasis', children: [{ type: 'text', value: 'em' }] },
        { type: 'text', value: ' ' },
        { type: 'strong', children: [{ type: 'text', value: 'strong' }] },
        { type: 'text', value: ' ' },
        { type: 'delete', children: [{ type: 'text', value: 'delete' }] },
        { type: 'text', value: ' ' },
        { type: 'inlineCode', value: '<tag>' },
        { type: 'text', value: ' ' },
        { type: 'link', href: 'https://example.com/?a=1&b=2', children: [{ type: 'text', value: 'link' }] }
      ]
    },
    { type: 'quote', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'quoted' }] }] },
    { type: 'code', language: 'js"bad', value: 'const x = "<&";' },
    {
      type: 'list', ordered: true, start: 3,
      items: [[{ type: 'paragraph', children: [{ type: 'text', value: 'item' }] }]]
    },
    {
      type: 'table', align: ['left', 'right'],
      rows: [
        [[{ type: 'text', value: 'H1' }], [{ type: 'text', value: 'H2' }]],
        [[{ type: 'text', value: 'V1' }], [{ type: 'text', value: 'V2' }]]
      ]
    },
    { type: 'image', src: 'https://example.com/a.png?x=1&y=2', alt: 'A "quote"', title: 'T < X' },
    { type: 'divider' }
  ]);

  assert.match(html, /<h2>A &lt; B &amp; C<\/h2>/);
  assert.match(html, /<em>em<\/em> <strong>strong<\/strong> <del>delete<\/del>/);
  assert.match(html, /<code>&lt;tag&gt;<\/code>/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /<pre><code class="language-js&quot;bad">const x = &quot;&lt;&amp;&quot;;<\/code><\/pre>/);
  assert.match(html, /<ol start="3"><li><p>item<\/p><\/li><\/ol>/);
  assert.match(html, /<thead>.*<th style="text-align: left">H1<\/th>.*<\/thead>/);
  assert.match(html, /<tbody>.*<td style="text-align: right">V2<\/td>.*<\/tbody>/);
  assert.match(html, /src="https:\/\/example\.com\/a\.png\?x=1&amp;y=2"/);
  assert.match(html, /alt="A &quot;quote&quot;" title="T &lt; X"/);
  assert.match(html, /<hr>/);
});

test('createAtomXml uses Issue links, RFC 3339 dates, and XML-escaped complete HTML', () => {
  const xml = createAtomXml({
    version: 1,
    section: 'posts',
    title: 'Posts',
    subtitle: 'Published posts',
    updatedAt: '2026-08-24T08:00:00.000Z',
    data: {
      items: [{
        id: 'issue-42',
        date: '2026-08-20',
        title: 'A < B',
        summary: 'Summary',
        tags: [],
        detail: [{ type: 'paragraph', children: [{ type: 'text', value: 'Body & more' }] }],
        source: {
          issueNumber: 42,
          issueUrl: 'https://github.com/snxq/snxq.github.io/issues/42',
          updatedAt: '2026-08-21T02:00:00.000Z'
        }
      }]
    }
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<link rel="self" type="application\/atom\+xml" href="https:\/\/blog\.snxq\.cc\/feed\.xml">/);
  assert.match(xml, /<id>https:\/\/github\.com\/snxq\/snxq\.github\.io\/issues\/42<\/id>/);
  assert.match(xml, /<published>2026-08-20T00:00:00Z<\/published>/);
  assert.match(xml, /<updated>2026-08-21T02:00:00\.000Z<\/updated>/);
  assert.match(xml, /<title>A &lt; B<\/title>/);
  assert.match(xml, /<content type="html">&lt;p&gt;Body &amp;amp; more&lt;\/p&gt;<\/content>/);
});

test('createAtomXml creates a valid empty feed', () => {
  const xml = createAtomXml({
    version: 1,
    section: 'posts',
    title: 'Posts',
    subtitle: '',
    updatedAt: '2026-08-24T08:00:00.000Z',
    data: { items: [] }
  });

  assert.match(xml, /<updated>2026-08-24T08:00:00\.000Z<\/updated>/);
  assert.doesNotMatch(xml, /<entry>/);
});

test('buildAtomFeed rejects unsafe or invalid Posts manifest targets', async t => {
  for (const variant of ['traversal', 'hash', 'section']) {
    await t.test(variant, async () => {
      const { rootDirectory, outputDirectory } = await createSourceSite();
      const contentDirectory = join(rootDirectory, 'generated', 'content');
      const { manifestPath, manifest } = await readManifest(rootDirectory);

      if (variant === 'traversal') {
        manifest.files.posts = '../posts.json';
        await writeFile(manifestPath, JSON.stringify(manifest));
        await assert.rejects(
          buildAtomFeed({ contentDirectory, outputPath: join(outputDirectory, 'feed.xml') }),
          /filename.*invalid/i
        );
        return;
      }

      const original = join(contentDirectory, manifest.files.posts);
      if (variant === 'hash') {
        await writeFile(original, `${await readFile(original, 'utf8')} `);
        await assert.rejects(
          buildAtomFeed({ contentDirectory, outputPath: join(outputDirectory, 'feed.xml') }),
          /hash/i
        );
        return;
      }

      const projects = JSON.parse(await readFile(join(contentDirectory, manifest.files.projects), 'utf8'));
      const bytes = `${JSON.stringify(projects, null, 2)}\n`;
      const hash = createHash('sha256').update(bytes).digest('hex');
      const filename = `posts.${hash}.json`;
      await writeFile(join(contentDirectory, filename), bytes);
      manifest.files.posts = filename;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await assert.rejects(
        buildAtomFeed({ contentDirectory, outputPath: join(outputDirectory, 'feed.xml') }),
        /posts section/i
      );
    });
  }
});

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
  assert.deepEqual(entries, ['CNAME', 'favicon.svg', 'feed.xml', 'generated', 'index.html', 'src', 'styles.css']);
  assert.equal(await readFile(join(outputDirectory, 'CNAME'), 'utf8'), 'blog.snxq.cc\n');

  for (const excludedPath of ['tests', 'docs', '.github', 'node_modules', 'scripts']) {
    await assert.rejects(access(join(outputDirectory, excludedPath)));
  }
  assert.deepEqual(sectionNames.sort(), Object.keys((await readManifest(outputDirectory)).manifest.files).sort());
});

test('buildStaticSite generates a feed from the published Posts document', async () => {
  const { outputDirectory } = await builtSite();
  const xml = await readFile(join(outputDirectory, 'feed.xml'), 'utf8');
  const { manifest } = await readManifest(outputDirectory);
  const posts = JSON.parse(await readFile(join(outputDirectory, 'generated/content', manifest.files.posts), 'utf8'));

  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  for (const post of posts.data.items) {
    assert.match(xml, new RegExp(`<id>${post.source.issueUrl.replaceAll('.', '\\.')}<\\/id>`));
  }
  assert.equal((xml.match(/<entry>/g) ?? []).length, posts.data.items.length);
});

test('checkStaticSite rejects a missing or malformed feed', async t => {
  await t.test('missing', async () => {
    const { outputDirectory } = await builtSite();
    await rm(join(outputDirectory, 'feed.xml'));
    await assert.rejects(checkStaticSite(outputDirectory), /feed\.xml/);
  });

  await t.test('malformed', async () => {
    const { outputDirectory } = await builtSite();
    await writeFile(join(outputDirectory, 'feed.xml'), '<not-atom>');
    await assert.rejects(checkStaticSite(outputDirectory), /Atom feed.*invalid/i);
  });
});

test('index advertises the Atom feed', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="alternate" type="application\/atom\+xml" title="snxq\.cc posts" href="feed\.xml">/);
});
