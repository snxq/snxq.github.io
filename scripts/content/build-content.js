import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTENT_SCHEMA_VERSION, CONTENT_TYPES, FORM_FIELDS, SECTION_META } from './constants.js';
import { ContentValidationError } from './errors.js';
import { fetchAllIssues, fetchIssuesWithGh } from './fetch-issues.js';
import { normalizeIssue, validateCrossContent } from './normalize.js';
import { parseFormBody } from './parse-form.js';
import { manifestSchema, sectionDocumentSchema } from './schema.js';
import { classifyIssues } from './validate.js';

const SECTION_NAMES = Object.freeze(Object.keys(SECTION_META));
const SINGLETONS = new Set(['about', 'now']);

function contentLabel(issue) {
  return (issue.labels ?? [])
    .map(label => typeof label === 'string' ? label : label.name)
    .find(label => Object.hasOwn(CONTENT_TYPES, label));
}

function descendingIssue(a, b) {
  return b.item.source.issueNumber - a.item.source.issueNumber;
}

function descendingDate(a, b) {
  return b.item.date.localeCompare(a.item.date) || descendingIssue(a, b);
}

function descendingNoteDate(a, b) {
  return b.item.time.localeCompare(a.item.time) || descendingIssue(a, b);
}

function descendingYear(a, b) {
  return Number(b.item.year.slice(0, 4)) - Number(a.item.year.slice(0, 4)) || descendingIssue(a, b);
}

function latestUpdatedRecord(records) {
  if (!records.length) return null;
  return [...records].sort((a, b) => b.issue.updated_at.localeCompare(a.issue.updated_at))[0];
}

function latestUpdatedAt(records, generatedAt) {
  return latestUpdatedRecord(records)?.issue.updated_at ?? generatedAt;
}

function emptyData(section) {
  switch (section) {
    case 'about':
      return { name: '', role: '', bio: '', location: '', status: '', fields: [], links: [] };
    case 'now':
      return {
        summary: '',
        sections: [
          { code: 'BUILD', title: '正在做', items: [] },
          { code: 'LEARN', title: '正在理解', items: [] },
          { code: 'READ', title: '正在读 / 看', items: [] },
          { code: 'LOOP', title: '最近反复播放', items: [] }
        ]
      };
    case 'bookmarks': return { groups: [] };
    case 'uses': return { categories: [] };
    case 'opensource': return { contributions: [] };
    default: return { items: [] };
  }
}

function sectionData(section, records) {
  if (SINGLETONS.has(section)) return records[0]?.item ?? emptyData(section);

  if (section === 'bookmarks') {
    const groups = new Map();
    for (const record of records) {
      const group = groups.get(record.item.group) ?? [];
      group.push(record);
      groups.set(record.item.group, group);
    }
    return {
      groups: [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
        .map(([name, entries]) => ({
          name,
          description: '',
          links: entries.sort(descendingIssue).map(record => record.item)
        }))
    };
  }

  if (section === 'uses') {
    const categories = new Map();
    for (const record of records) {
      const category = categories.get(record.item.category) ?? [];
      category.push(record);
      categories.set(record.item.category, category);
    }
    return {
      categories: [...categories.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
        .map(([name, entries]) => ({
          name,
          items: entries.sort(descendingIssue).map(record => record.item)
        }))
    };
  }

  if (section === 'opensource') {
    return { contributions: [...records].sort(descendingYear).map(record => record.item) };
  }

  const sort = section === 'notes'
    ? descendingNoteDate
    : section === 'projects'
      ? descendingYear
      : descendingDate;
  return { items: [...records].sort(sort).map(record => record.item) };
}

function recordForSchemaPath(section, records, issuePath, updatedAtRecord = latestUpdatedRecord(records)) {
  if (issuePath.length === 1 && issuePath[0] === 'updatedAt') return updatedAtRecord ?? records[0];
  if (!issuePath.length || issuePath[0] !== 'data') return records[0];
  if (['posts', 'projects', 'notes', 'life'].includes(section) && issuePath[1] === 'items') {
    const sorted = [...records].sort(section === 'notes' ? descendingNoteDate : section === 'projects' ? descendingYear : descendingDate);
    return sorted[issuePath[2]] ?? records[0];
  }
  if (section === 'opensource' && issuePath[1] === 'contributions') {
    return [...records].sort(descendingYear)[issuePath[2]] ?? records[0];
  }
  if (section === 'bookmarks' && issuePath[1] === 'groups') {
    const groupNames = [...new Set(records.map(record => record.item.group))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const group = records.filter(record => record.item.group === groupNames[issuePath[2]]).sort(descendingIssue);
    return group[issuePath[4]] ?? records[0];
  }
  if (section === 'uses' && issuePath[1] === 'categories') {
    const categoryNames = [...new Set(records.map(record => record.item.category))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const category = records.filter(record => record.item.category === categoryNames[issuePath[2]]).sort(descendingIssue);
    return category[issuePath[4]] ?? records[0];
  }
  return records[0];
}

function schemaFailure(result, fallbackIssue, documentName, resolveIssue) {
  const errors = result.error.issues.map(issue => {
    const sourceIssue = resolveIssue?.(issue.path) ?? fallbackIssue;
    return {
      issueNumber: sourceIssue?.number ?? 0,
      title: sourceIssue?.title ?? documentName,
      field: issue.path.length ? issue.path.join('.') : '(root)',
      reason: `generated ${documentName} schema is invalid: ${issue.message}`,
      url: sourceIssue?.html_url ?? 'https://github.com/'
    };
  });
  throw new ContentValidationError(errors);
}

function validated(schema, value, fallbackIssue, documentName, resolveIssue) {
  const result = schema.safeParse(value);
  if (!result.success) schemaFailure(result, fallbackIssue, documentName, resolveIssue);
  return result.data;
}

function serializedDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function hashedSectionFilename(section, document) {
  const hash = createHash('sha256').update(serializedDocument(document)).digest('hex');
  return `${section}.${hash}.json`;
}

function structuralValidationError(issue, error) {
  if (error instanceof ContentValidationError) return error;
  const reason = formatThrown(error);
  const duplicateField = reason.match(/^duplicate Issue Form field "(.+)"$/u);
  return new ContentValidationError([{
    issueNumber: issue.number,
    title: issue.title,
    field: duplicateField?.[1] ?? 'Issue Form',
    reason,
    url: issue.html_url
  }]);
}

export function buildDocuments({ issues, repository, generatedAt }) {
  const timestamp = new Date(generatedAt).toISOString();
  const { published } = classifyIssues(issues);
  const records = published.map(issue => {
    const section = CONTENT_TYPES[contentLabel(issue)];
    try {
      const fields = parseFormBody(issue.body, FORM_FIELDS[section]);
      return { section, issue, item: normalizeIssue(issue, section, fields) };
    } catch (error) {
      throw structuralValidationError(issue, error);
    }
  });
  validateCrossContent(records);

  const sections = {};
  const files = {};
  const sectionValidation = {};
  for (const section of SECTION_NAMES) {
    const sectionRecords = records.filter(record => record.section === section);
    const updatedAtRecord = latestUpdatedRecord(sectionRecords);
    const resolveIssue = issuePath => recordForSchemaPath(section, sectionRecords, issuePath, updatedAtRecord)?.issue;
    const document = {
      version: CONTENT_SCHEMA_VERSION,
      section,
      ...SECTION_META[section],
      updatedAt: updatedAtRecord?.issue.updated_at ?? timestamp,
      data: sectionData(section, sectionRecords)
    };
    sections[section] = validated(
      sectionDocumentSchema,
      document,
      sectionRecords[0]?.issue,
      `${section}.json`,
      resolveIssue
    );
    sectionValidation[section] = { fallbackIssue: sectionRecords[0]?.issue, resolveIssue };
    files[section] = hashedSectionFilename(section, sections[section]);
  }

  const manifest = validated(manifestSchema, {
    version: CONTENT_SCHEMA_VERSION,
    generatedAt: timestamp,
    source: { repository, issueCount: published.length },
    files
  }, published[0], 'manifest.json');

  const documents = { manifest, sections };
  Object.defineProperty(documents, 'validation', {
    value: {
      manifest: { fallbackIssue: published[0] },
      sections: sectionValidation
    },
    enumerable: false
  });
  return documents;
}

async function readFixtureIssues(fixtures) {
  const fixturePath = fixtures.endsWith('.json') ? fixtures : path.join(fixtures, 'valid.json');
  const value = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`Fixture ${fixturePath} must contain an Issue array`);
  return value;
}

async function pathExists(value) {
  try {
    await access(value, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function formatThrown(value) {
  if (value instanceof Error) return value.message;
  try {
    return String(value);
  } catch {
    return 'unknown cleanup failure';
  }
}

function safeWarn(warn, message) {
  try {
    warn(message);
  } catch {
    // A diagnostic sink must never change the committed build result.
  }
}

async function writeDocumentsAtomically(output, documents, {
  cleanupBackup = value => rm(value, { recursive: true, force: true }),
  cleanupTemporary = value => rm(value, { recursive: true, force: true }),
  warn = console.warn,
  beforeFinalValidation
} = {}) {
  const parent = path.dirname(output);
  const base = path.basename(output);
  const temporary = path.join(parent, `.${base}.tmp-${process.pid}-${Date.now()}`);
  const backup = path.join(parent, `.${base}.backup-${process.pid}-${Date.now()}`);
  await mkdir(parent, { recursive: true });
  await mkdir(temporary);
  let committed = false;

  try {
    beforeFinalValidation?.(documents);
    const manifestContext = documents.validation?.manifest ?? {};
    const manifest = validated(
      manifestSchema,
      documents.manifest,
      manifestContext.fallbackIssue,
      'manifest.json',
      manifestContext.resolveIssue
    );
    const sections = Object.fromEntries(Object.entries(documents.sections).map(([section, document]) => {
      const context = documents.validation?.sections?.[section] ?? {};
      return [section, validated(
        sectionDocumentSchema,
        document,
        context.fallbackIssue,
        `${section}.json`,
        context.resolveIssue
      )];
    }));
    const writes = [
      writeFile(path.join(temporary, 'manifest.json'), serializedDocument(manifest)),
      ...Object.entries(sections).map(([section, document]) =>
        writeFile(path.join(temporary, manifest.files[section]), serializedDocument(document)))
    ];
    await Promise.all(writes);

    const hadOutput = await pathExists(output);
    if (hadOutput) await rename(output, backup);
    try {
      await rename(temporary, output);
      committed = true;
    } catch (error) {
      if (hadOutput && await pathExists(backup)) await rename(backup, output);
      throw error;
    }
    if (hadOutput) {
      try {
        await cleanupBackup(backup);
      } catch (error) {
        safeWarn(warn, `Content output committed, but backup cleanup failed for ${backup}: ${formatThrown(error)}`);
      }
    }
  } catch (error) {
    if (!committed) {
      try {
        await cleanupTemporary(temporary);
      } catch {
        // Preserve the validation, write, or replacement error that caused failure.
      }
    }
    throw error;
  } finally {
    if (committed) {
      try {
        await cleanupTemporary(temporary);
      } catch (error) {
        safeWarn(warn, `Content output committed, but temporary cleanup failed for ${temporary}: ${formatThrown(error)}`);
      }
    }
  }
}

export async function buildContent(options) {
  const source = options.source ?? 'gh';
  let repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  let issues;
  if (source === 'fixture') {
    if (!options.fixtures) throw new Error('Fixture source requires a fixtures directory');
    if (!repository) throw new Error('Fixture source requires an explicit repository');
    issues = await readFixtureIssues(options.fixtures);
  } else if (source === 'gh') {
    const token = options.token ?? process.env.GITHUB_TOKEN;
    if (token) {
      if (!repository) throw new Error('GitHub API content source requires a repository');
      issues = await fetchAllIssues({ repository, token, fetchImpl: options.fetchImpl });
    } else {
      const result = await fetchIssuesWithGh({ repository });
      repository = result.repository;
      issues = result.issues;
    }
  } else {
    throw new Error(`Unsupported content source "${source}"`);
  }

  const documents = buildDocuments({ issues, repository, generatedAt });
  await writeDocumentsAtomically(options.output, documents, {
    cleanupBackup: options.cleanupBackup,
    cleanupTemporary: options.cleanupTemporary,
    warn: options.warn,
    beforeFinalValidation: options.beforeFinalValidation
  });
  return { ...documents, output: options.output };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument "${argument}"`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return {
    source: options.source,
    fixtures: options.fixtures,
    output: options.output,
    repository: options.repository,
    generatedAt: options['generated-at'],
    reportFile: options['report-file']
  };
}

async function writeValidationReport(reportFile, entries) {
  await mkdir(path.dirname(reportFile), { recursive: true });
  await writeFile(reportFile, `${JSON.stringify({
    marker: 'snxq-content-validation',
    errors: entries
  }, null, 2)}\n`);
}

function formatValidationEntry(entry) {
  return `Issue #${entry.issueNumber} (${entry.title}) — ${entry.field}: ${entry.reason}\n${entry.url}`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  buildContent(options).catch(async error => {
    if (error instanceof ContentValidationError) {
      if (options.reportFile) {
        try {
          await writeValidationReport(options.reportFile, error.entries);
        } catch (reportError) {
          console.error(`Could not write validation report: ${formatThrown(reportError)}`);
        }
      }
      for (const entry of error.entries) console.error(formatValidationEntry(entry));
    } else {
      console.error(formatThrown(error));
    }
    process.exitCode = 1;
  });
}
