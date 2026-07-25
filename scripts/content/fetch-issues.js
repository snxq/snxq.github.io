import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

const LINK_PARAM = '[!#$%&\'*+\\-.^_`|~0-9A-Za-z]+';
const LINK_VALUE = new RegExp(
  `^\\s*<([^>\\s]+)>\\s*((?:;\\s*${LINK_PARAM}(?:\\s*=\\s*(?:"(?:[^"\\\\]|\\\\.)*"|${LINK_PARAM}))?)*)\\s*$`
);
const LINK_PARAMETERS = new RegExp(
  `;\\s*(${LINK_PARAM})(?:\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|${LINK_PARAM}))?`,
  'g'
);

function nextLink(linkHeader) {
  if (!linkHeader) return null;

  const links = linkHeader.split(',').map(link => {
    const match = link.match(LINK_VALUE);
    if (!match) throw new Error('Received malformed GitHub Link header');

    const relations = [];
    for (const parameter of match[2].matchAll(LINK_PARAMETERS)) {
      if (parameter[1].toLowerCase() !== 'rel' || !parameter[2]) continue;
      const value = parameter[2].startsWith('"')
        ? parameter[2].slice(1, -1).replace(/\\(.)/g, '$1')
        : parameter[2];
      relations.push(...value.split(/\\s+/));
    }

    return { url: match[1], relations };
  });

  return links.find(link => link.relations.includes('next'))?.url ?? null;
}

function withoutPullRequests(issues) {
  return issues.filter(issue => !Object.hasOwn(issue, 'pull_request'));
}

export async function fetchAllIssues({ repository, token, fetchImpl = fetch }) {
  let url = `${GITHUB_API_URL}/repos/${repository}/issues?state=all&per_page=100`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const issues = [];
  while (url) {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub Issues request failed with status ${response.status}`);
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error('GitHub Issues response expected an array');
    }

    issues.push(...withoutPullRequests(page));
    url = nextLink(response.headers.get('link'));
  }

  return issues;
}

export async function resolveRepository(repository) {
  if (repository) return repository;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

  let stdout;
  try {
    ({ stdout } = await execFileAsync('gh', [
      'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'
    ]));
  } catch (error) {
    throw new Error('Unable to resolve GitHub repository; pass --repository or run inside a gh-connected checkout', { cause: error });
  }
  const resolved = stdout.trim();
  if (!resolved) throw new Error('Unable to resolve GitHub repository');
  return resolved;
}

export async function fetchIssuesWithGh({ repository } = {}) {
  const resolvedRepository = await resolveRepository(repository);
  const { stdout } = await execFileAsync('gh', [
    'api', '--paginate', '--slurp',
    `repos/${resolvedRepository}/issues?state=all&per_page=100`
  ]);

  let pages;
  try {
    pages = JSON.parse(stdout);
  } catch {
    throw new Error('gh api returned malformed JSON');
  }

  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error('gh api response expected an array of issue arrays');
  }

  return { repository: resolvedRepository, issues: withoutPullRequests(pages.flat()) };
}
