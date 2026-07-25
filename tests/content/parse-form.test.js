import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormBody } from '../../scripts/content/parse-form.js';

test('parses fixed fields and keeps Markdown headings inside final Body', () => {
  const fields = parseFormBody(
    '### Slug\nquiet-systems\n\n### Summary\nA quiet interface.\n\n### Body\n## Section\n\n### Subsection\n\nText.',
    ['Slug', 'Summary', 'Body']
  );

  assert.deepEqual(fields, {
    Slug: 'quiet-systems',
    Summary: 'A quiet interface.',
    Body: '## Section\n\n### Subsection\n\nText.'
  });
});

test('rejects duplicate known fields', () => {
  assert.throws(
    () => parseFormBody('### Summary\nOne\n\n### Summary\nTwo', ['Summary']),
    /duplicate Issue Form field "Summary"/
  );
});
