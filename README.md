# ChazzasBlog

Charlie Cunningham's personal blog — a static site generated from plain JSON
content files, with no server, no database, and no public write endpoint.
Articles are written locally, reviewed as a git diff, and published by
pushing to `main`, which GitHub Actions builds and deploys to GitHub Pages.

## Quick start

```
npm install
npm run build
npx serve dist
```

- `npm install` — installs the build pipeline's dependencies (`ajv`,
  `markdown-it`, `sanitize-html`, …).
- `npm run build` — validates everything in `content/` against
  `schema/*.json`, renders it to static HTML, and writes the result to
  `dist/` (gitignored, always rebuilt from scratch — never hand-edit it).
- `npx serve dist` — serves the built output locally so you can preview the
  site exactly as it will appear once deployed.

Set `INCLUDE_DRAFTS=1` before `npm run build` to include `draft: true`
articles in the output — handy for local preview, but this must **not** be
set for production builds (the CI workflow does not set it).

## Project layout

```
ChazzasBlog/
├── schema/                # JSON Schemas for article & about content (draft-07, AJV-validated)
├── content/                # Source of truth content — hand- or tool-edited JSON + images
│   ├── about.json
│   ├── articles/<YYYY-MM-DD-slug>.json
│   └── images/{articles,site}/
├── build/                   # Node static site generator
├── public/                   # Static assets copied verbatim into dist/ (CSS, JS, favicon, …)
├── tools/author/              # Local-only authoring tool (loopback only, never deployed)
├── dist/                      # Build output — gitignored, never hand-edited
└── .github/workflows/          # CI/CD (GitHub Actions → GitHub Pages)
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full technical
reference (build pipeline behavior, template token contract, CSS class
hooks).

## Writing and publishing an article

Short version: run the local authoring tool, fill in the form, review the
resulting JSON with `git diff`, then commit and push to `main` — the push is
what triggers the deploy.

```
node tools/author/server.js
# open http://127.0.0.1:3001, fill in the form, submit

git diff
git add content/articles/<new-file>.json
git commit -m "Add article: <title>"
git push origin main
```

Full walkthrough, including the one-time GitHub repo setting required before
the first deploy, is in [`docs/AUTHORING.md`](./docs/AUTHORING.md).

## Documentation

| Doc | Covers |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Folder layout, build pipeline internals, template token contract, CSS class hooks |
| [`docs/CONTENT_SCHEMA.md`](./docs/CONTENT_SCHEMA.md) | Human-readable field reference for `content/articles/*.json` and `content/about.json` |
| [`docs/AUTHORING.md`](./docs/AUTHORING.md) | Step-by-step publishing workflow, one-time GitHub Pages setup |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Tamper-resistance model — why this static architecture is hard to compromise, and what the actual remaining risk is |

## Security model (summary)

There is no write endpoint anywhere on the deployed site — GitHub Pages
serves only pre-rendered static files baked at build time from files
committed to the repo. The only code that can write article content
(`tools/author/server.js`) binds exclusively to `127.0.0.1` and is never
part of `dist/` or the CI pipeline. Publishing always passes through a human
review step (`git diff`) and a manual push to `main`, which is recorded
permanently in git history. Given that, the realistic remaining attack
surface is **GitHub account / branch compromise, not the website itself** —
see [`docs/SECURITY.md`](./docs/SECURITY.md) for the full write-up and
hardening recommendations (2FA, branch protection).

## CI/CD

`.github/workflows/deploy.yml` runs on every push to `main` (and manually via
`workflow_dispatch`): checkout → `npm ci` → `npm run build` → upload
`dist/` as a Pages artifact → deploy via `actions/deploy-pages`. Requires
**Settings → Pages → Source = "GitHub Actions"** to be set once on the
repository (see `docs/AUTHORING.md`).
