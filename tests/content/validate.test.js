import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentValidationError } from '../../scripts/content/errors.js';
import { classifyIssues } from '../../scripts/content/validate.js';

const issue = ({ number, state = 'open', labels = [], authorAssociation = 'OWNER' }) => ({
  number,
  title: `Issue ${number}`,
  state,
  labels: labels.map(name => ({ name })),
  author_association: authorAssociation,
  body: '',
  html_url: `https://example.test/issues/${number}`
});

test('publishes only open, typed, non-draft Issues', () => {
  const result = classifyIssues([
    issue({ number: 1, state: 'closed', labels: ['content:post'] }),
    issue({ number: 2, labels: ['content:post', 'draft'] }),
    issue({ number: 3, labels: [] }),
    issue({ number: 4, labels: ['content:post'] })
  ]);
  assert.deepEqual(result.published.map(item => item.number), [4]);
  assert.deepEqual(result.ignored.map(item => item.number), [1, 2, 3]);
});

test('publishes Issues only from trusted repository associations', () => {
  const trusted = ['OWNER', 'MEMBER', 'COLLABORATOR'];
  const untrusted = ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER', 'MANNEQUIN'];
  const result = classifyIssues([
    ...trusted.map((authorAssociation, index) => issue({
      number: index + 10, labels: ['content:post'], authorAssociation
    })),
    ...untrusted.map((authorAssociation, index) => issue({
      number: index + 20, labels: ['content:post'], authorAssociation
    }))
  ]);

  assert.deepEqual(result.published.map(item => item.author_association), trusted);
  assert.deepEqual(result.ignored.map(item => item.author_association), untrusted);
});

test('rejects multiple content labels before filtering state', () => {
  assert.throws(
    () => classifyIssues([issue({ number: 5, state: 'closed', labels: ['content:post', 'content:note'] })]),
    /exactly one content:\* label is allowed/
  );
});

test('ContentValidationError reports structured entries', () => {
  const error = new ContentValidationError([{
    issueNumber: 42,
    title: 'Example',
    field: 'Slug',
    reason: 'duplicate slug "example"; already used by issue #31',
    url: 'https://github.com/org/repo/issues/42'
  }]);

  assert.equal(error.name, 'ContentValidationError');
  assert.deepEqual(error.entries, [{
    issueNumber: 42,
    title: 'Example',
    field: 'Slug',
    reason: 'duplicate slug "example"; already used by issue #31',
    url: 'https://github.com/org/repo/issues/42'
  }]);
  assert.equal(error.message, `Content validation failed

Issue #42 "Example"
Field: Slug
Error: duplicate slug "example"; already used by issue #31
URL: https://github.com/org/repo/issues/42`);
});
