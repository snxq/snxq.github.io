import { CONTENT_TYPES } from './constants.js';
import { ContentValidationError } from './errors.js';

const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

function labelNames(issue) {
  return (Array.isArray(issue.labels) ? issue.labels : [])
    .map(label => typeof label === 'string' ? label : label.name)
    .filter(Boolean);
}

function validationEntry(issue) {
  return {
    issueNumber: issue.number,
    title: issue.title,
    field: 'Labels',
    reason: 'exactly one content:* label is allowed',
    url: issue.html_url
  };
}

export function classifyIssues(issues) {
  const published = [];
  const ignored = [];
  const errors = [];

  for (const issue of issues) {
    const labels = labelNames(issue);
    const contentLabels = labels.filter(label => Object.hasOwn(CONTENT_TYPES, label));

    if (contentLabels.length > 1) {
      errors.push(validationEntry(issue));
      continue;
    }

    if (contentLabels.length !== 1
      || issue.state !== 'open'
      || labels.includes('draft')
      || !TRUSTED_AUTHOR_ASSOCIATIONS.has(issue.author_association)) {
      ignored.push(issue);
      continue;
    }

    published.push(issue);
  }

  if (errors.length) throw new ContentValidationError(errors);
  return { published, ignored };
}
