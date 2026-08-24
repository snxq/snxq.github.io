import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifestSchema, sectionDocumentSchema } from './content/schema.js';

const SECTION_NAMES = Object.freeze([
  'about', 'bookmarks', 'life', 'notes', 'now', 'opensource', 'posts', 'projects', 'uses'
]);
const requiredPaths = [
  'index.html',
  'styles.css',
  'src/app.js',
  'src/content-api.js',
  'feed.xml',
  'generated/content/manifest.json'
];
const IMMUTABLE_FILENAME = /^([A-Za-z0-9][A-Za-z0-9_-]*)\.([a-f0-9]{64})\.json$/u;

async function readManifest(outputDirectory) {
  const manifestPath = join(outputDirectory, 'generated/content/manifest.json');
  let bytes;
  try {
    bytes = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  let manifest;
  try {
    manifest = JSON.parse(bytes);
  } catch (error) {
    throw new Error('Static content manifest contains invalid JSON', { cause: error });
  }
  const validation = manifestSchema.safeParse(manifest);
  if (!validation.success) throw new Error('Static content manifest is invalid');
  manifest = validation.data;
  const keys = Object.keys(manifest.files).sort();
  if (keys.length !== SECTION_NAMES.length || keys.some((key, index) => key !== SECTION_NAMES[index])) {
    throw new Error('Static content manifest must contain exactly the canonical nine section keys');
  }
  return manifest;
}

async function validateSections(outputDirectory, manifest) {
  const contentDirectory = join(outputDirectory, 'generated/content');
  for (const section of SECTION_NAMES) {
    const filename = manifest.files[section];
    const match = typeof filename === 'string' ? filename.match(IMMUTABLE_FILENAME) : null;
    if (!match || match[1] !== section) {
      throw new Error(`Static content manifest contains an invalid immutable section filename for ${section}`);
    }

    const filePath = join(contentDirectory, filename);
    let bytes;
    try {
      bytes = await readFile(filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Static site is missing required path:\ngenerated/content/${filename}`);
      throw error;
    }

    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== match[2]) throw new Error(`Static content hash mismatch for ${section}`);

    let document;
    try {
      document = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new Error(`Static content section ${section} contains invalid JSON`, { cause: error });
    }
    const result = sectionDocumentSchema.safeParse(document);
    if (!result.success || document.version !== 1 || document.section !== section) {
      throw new Error(`Static content section ${section} is invalid`);
    }
  }
}

async function validateFeed(outputDirectory) {
  const xml = await readFile(join(outputDirectory, 'feed.xml'), 'utf8');
  const valid = /^<\?xml version="1\.0" encoding="utf-8"\?>/u.test(xml)
    && xml.includes('<feed xmlns="http://www.w3.org/2005/Atom">')
    && xml.includes('<link rel="self" type="application/atom+xml" href="https://blog.snxq.cc/feed.xml"></link>')
    && [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gu)].every(([, entry]) =>
      /<id>https:\/\/github\.com\/[^<]+<\/id>/u.test(entry)
      && /<link href="https:\/\/github\.com\/[^"]+"><\/link>/u.test(entry)
      && /<published>\d{4}-\d{2}-\d{2}T00:00:00Z<\/published>/u.test(entry)
      && /<updated>[^<]+Z<\/updated>/u.test(entry)
      && /<content type="html">[\s\S]*<\/content>/u.test(entry)
    );
  if (!valid) throw new Error('Static Atom feed is invalid');
}

export async function checkStaticSite(outputDirectory) {
  const missingPaths = [];
  for (const requiredPath of requiredPaths) {
    try {
      await access(join(outputDirectory, requiredPath));
    } catch {
      missingPaths.push(requiredPath);
    }
  }
  if (missingPaths.length > 0) {
    throw new Error(`Static site is missing required paths:\n${missingPaths.join('\n')}`);
  }

  const manifest = await readManifest(outputDirectory);
  await validateSections(outputDirectory, manifest);
  await validateFeed(outputDirectory);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
  await checkStaticSite(join(rootDirectory, 'dist'));
}
