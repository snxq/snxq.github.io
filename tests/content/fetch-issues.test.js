import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllIssues } from '../../scripts/content/fetch-issues.js';

function response({ status = 200, body, link = null }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'link' ? link : null },
    json: async () => body
  };
}

test('fetchAllIssues follows next pages and excludes pull requests', async () => {
  const requests = [];
  const issues = await fetchAllIssues({
    repository: 'org/repo',
    token: 'secret',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? response({
          body: [{ number: 1 }, { number: 2, pull_request: { url: 'https://example.test/pr/2' } }],
          link: '<https://api.github.com/repos/org/repo/issues?state=all&per_page=100&page=2>; rel="next", <https://api.github.com/repos/org/repo/issues?state=all&per_page=100&page=2>; rel="last"'
        })
        : response({ body: [{ number: 3 }] });
    }
  });

  assert.deepEqual(issues.map(issue => issue.number), [1, 3]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.github.com/repos/org/repo/issues?state=all&per_page=100');
  assert.deepEqual(requests[0].options.headers, {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: 'Bearer secret'
  });
});

test('fetchAllIssues follows a next relation with additional parameters', async () => {
  const requests = [];
  const issues = await fetchAllIssues({
    repository: 'org/repo',
    fetchImpl: async url => {
      requests.push(url);
      return requests.length === 1
        ? response({
          body: [{ number: 1 }],
          link: '<https://api.github.com/repos/org/repo/issues?state=all&per_page=100&page=2>; rel="next"; type="application/json"'
        })
        : response({ body: [{ number: 2 }] });
    }
  });

  assert.deepEqual(issues.map(issue => issue.number), [1, 2]);
  assert.equal(requests.length, 2);
});

test('fetchAllIssues rejects malformed Link headers', async () => {
  await assert.rejects(
    fetchAllIssues({
      repository: 'org/repo',
      fetchImpl: async () => response({ body: [{ number: 1 }], link: 'not-a-valid-link-header' })
    }),
    /malformed GitHub Link header/
  );
});

test('fetchAllIssues rejects failed HTTP responses', async () => {
  await assert.rejects(
    fetchAllIssues({ repository: 'org/repo', fetchImpl: async () => response({ status: 403, body: [] }) }),
    /GitHub Issues request failed.*403/
  );
});

test('fetchAllIssues rejects malformed JSON response bodies', async () => {
  await assert.rejects(
    fetchAllIssues({ repository: 'org/repo', fetchImpl: async () => response({ body: { number: 1 } }) }),
    /expected an array/
  );
});
