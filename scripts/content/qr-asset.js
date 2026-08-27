import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const MAX_BYTES = 1024 * 1024;
const MAX_DIMENSION = 2048;
const SOURCE_PATH = /^\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ASSET_PATH = /^\/generated\/content\/assets\/wechat-qr\.([a-f0-9]{64})\.png$/u;
const GITHUB_ASSET_HOST = /^github-production-user-asset-[a-z0-9]+\.s3\.amazonaws\.com$/iu;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const fail = message => { throw new Error(`WeChat QR Code URL: ${message}`); };

export function validateSourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('must be a valid GitHub user attachment URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !SOURCE_PATH.test(url.pathname) || url.search || url.hash) {
    fail('must be https://github.com/user-attachments/assets/<uuid> without query or fragment');
  }
  return url;
}

function allowedRedirect(url) {
  return url.protocol === 'https:'
    && (url.hostname === 'github.com' || GITHUB_ASSET_HOST.test(url.hostname));
}

async function readResponseBytes(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) fail('image exceeds 1 MiB');
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) fail('image exceeds 1 MiB');
    return bytes;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) fail('image exceeds 1 MiB');
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function validatePng(bytes, contentType) {
  if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'image/png') fail('Content-Type must be image/png');
  if (bytes.length > MAX_BYTES || bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) fail('must be a valid PNG under 1 MiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail('PNG IHDR is invalid');
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width !== height) fail('PNG must be square and 1–2048px');
  return { width, height };
}

export function assetPathFor(bytes) {
  return `/generated/content/assets/wechat-qr.${createHash('sha256').update(bytes).digest('hex')}.png`;
}

export function validateAssetPath(bytes, value) {
  const match = ASSET_PATH.exec(value);
  if (!match || match[1] !== createHash('sha256').update(bytes).digest('hex')) fail('asset path hash is invalid');
  return value;
}

export async function fetchQrPng(value, { fetchImpl = fetch, maxRedirects = 3 } = {}) {
  let url = validateSourceUrl(value);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(url, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRedirects) fail('too many redirects');
      const location = response.headers.get('location');
      if (!location) fail('redirect has no Location');
      url = new URL(location, url);
      if (!allowedRedirect(url)) fail('redirect host is not allowed');
      continue;
    }
    if (!response.ok) fail(`download failed with HTTP ${response.status}`);
    const bytes = await readResponseBytes(response);
    const size = validatePng(bytes, response.headers.get('content-type'));
    return { bytes, size };
  }
}

export async function materializeAboutAsset({ issue, sourceUrl, assetFixtures, fetchImpl }) {
  let result;
  try {
    if (assetFixtures) {
      validateSourceUrl(sourceUrl);
      result = { bytes: new Uint8Array(await readFile(`${assetFixtures}/wechat-qr.png`)) };
      result.size = validatePng(result.bytes, 'image/png');
    } else {
      result = await fetchQrPng(sourceUrl, { fetchImpl });
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WeChat QR Code URL:')) throw error;
    throw new Error(`WeChat QR Code URL: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return { path: assetPathFor(result.bytes), bytes: result.bytes, size: result.size, issue };
}

export async function materializeContentAssets({ documents, records, assetFixtures, fetchImpl }) {
  const aboutRecord = records.find(record => record.section === 'about');
  const sourceUrl = aboutRecord?.item.wechatQrCodeUrl;
  if (!sourceUrl) return [];
  const asset = await materializeAboutAsset({ issue: aboutRecord.issue, sourceUrl, assetFixtures, fetchImpl });
  documents.sections.about.data.wechatQrCodeUrl = asset.path;
  documents.manifest.files.about = `about.${createHash('sha256').update(`${JSON.stringify(documents.sections.about, null, 2)}\n`).digest('hex')}.json`;
  return [asset];
}
