# CLAUDE.md

This file provides operational guidance for Claude Code when working in this repository.

## Project overview

`snxq.cc` is a statically published personal “signal archive.” The browser UI accepts English and Chinese commands and opens accessible in-page windows for about, projects, posts, notes, now, bookmarks, uses, life, and open-source history.

Production content is authored with GitHub Issues: posts use a native full-body Markdown editor while other content types use structured Issue Forms. CI validates Issues, converts them to `generated/content/*.json`, and deploys static files. The production browser adapter is `src/content-api.js`. Do not introduce mock, fake, sample, or placeholder components, data, or naming into production code or documentation. Test fixtures and test doubles are permitted only under tests.

Visitors never access the GitHub API. Browser network access must remain limited to same-origin static assets. GitHub credentials and Issue fetching belong only in the local/CI content build.

## Commands

```bash
npm ci

# Fixture-only development content; never reads real Issues
npm run content:build:fixture

# Real repository content; uses authenticated gh locally
npm run content:build

# Complete automated tests
npm test

# One test file
node --test tests/content/report.test.js

# Build and verify deployable static output
npm run site:build
npm run site:check

# Serve after generating fixture content
npm run dev
```

For a real local build, use `gh auth login`, verify with `gh auth status`, and run `npm run content:build` from a checkout connected to the intended repository. The build resolves it with `gh repo view`; `--repository owner/repo` can select it explicitly. Token-based API builds require both `GITHUB_TOKEN` and `GITHUB_REPOSITORY`. Never invent or fall back to a repository name.

Ignored build outputs are `node_modules/`, `generated/`, `dist/`, and `.content-validation-report.json`.

## Content authoring and publication

- Posts use `.github/ISSUE_TEMPLATE/content-post.yml`: the Issue title is the post title and the complete Issue body is the Markdown article. Other content types retain their structured Issue Form headings.
- Only open Issues with exactly one supported content label, no `draft` label, and `author_association` of `OWNER`, `MEMBER`, or `COLLABORATOR` publish. Untrusted author associations are ignored. Pull Requests never publish.
- `content:post` always uses ID `issue-<number>`, the UTC date from `created_at`, source `updated_at`, and full body Markdown. Its summary is the first valid text paragraph, whitespace-collapsed and truncated to about 160 characters; headings, images, code, dividers, and tables are skipped. Display tags are non-system labels, excluding all `content:*`, `draft`, and `blog-post`. Never parse visible or hidden body metadata overrides for posts.
- `about` and `now` are singleton sections.
- Structured detail Slugs must not collide with post `issue-<number>` IDs or other detail Slugs. They are stable public identities; do not change a published Slug. A blank structured Slug becomes `issue-<number>`.
- Supported Markdown is intentionally constrained: headings levels 2–4, paragraphs, emphasis/strong/strikethrough, inline and fenced code, blockquotes, one-level lists, tables, thematic breaks, links using `http`, `https`, or `mailto`, and images using `https`.
- Raw HTML, task lists, nested lists, unsafe protocols, and non-HTTPS images must continue to fail validation.
- Content validation failures must not replace the last generated output. CLI `--report-file <path>` writes `{ marker: "snxq-content-validation", errors }` for Issue feedback.

Fixture data under `tests/fixtures/` exists only for deterministic development and Pull Request validation. Do not copy fixture content into production source or documentation as published content.

## Architecture

- `scripts/content/fetch-issues.js` reads repository Issues for the build process.
- `scripts/content/parse-form.js`, `normalize.js`, `markdown.js`, `validate.js`, and `schema.js` implement the publication contract and safe rich-content model.
- `scripts/content/build-content.js` serializes each canonical section document, hashes those exact bytes with SHA-256, writes immutable `<section>.<hash>.json` files, points the manifest to them, and atomically replaces `generated/content/` only after validation.
- `src/content-api.js` loads the same-origin manifest and section JSON while preserving the overview/detail window contract consumed by `src/app.js`.
- `src/render-contract.js` validates generated content at the rendering boundary.
- `scripts/build-site.js` creates `dist/`; `scripts/check-static-site.js` reads the version 1 manifest and verifies every referenced immutable section file.
- `.github/workflows/content-deploy.yml` uses fixture content for Pull Requests and real Issue content for production events, comments on affected Issues after validation failure, and deploys only validated `dist/` output.

## Implementation constraints

- Construct rendered content with DOM APIs and `textContent`; keep URL protocol checks and rich-block validation intact.
- Preserve dialog accessibility: inert background, focus transfer and restoration, Tab trapping, Escape/backdrop close behavior, and stale detail-request protection.
- Keep generated content deterministic and schema-valid. Validate before any output replacement.
- Production workflow changes must preserve the fixture-only Pull Request path, prevent deployment after any failed check, and avoid subscribing to Issue comments.
- GitHub Pages must be configured with the “GitHub Actions” source before the first production deployment.
