# Authoring & Publishing Guide

This is the practical, step-by-step guide for how Charlie actually publishes
an article on ChazzasBlog, end to end — from writing a draft to it being live
on the internet. For the shape of the content itself, see
[`CONTENT_SCHEMA.md`](./CONTENT_SCHEMA.md); for why this flow is safe, see
[`SECURITY.md`](./SECURITY.md).

## One-time setup

### 1. Install dependencies

```
npm install
```

### 2. GitHub repository setting (required once, before the first deploy)

The deploy workflow (`.github/workflows/deploy.yml`) publishes via the
`actions/deploy-pages` action, which requires the repo to be configured to
deploy **from GitHub Actions**, not from a branch:

> **Settings → Pages → Source = "GitHub Actions"**

Without this one-time setting, the `deploy` job in the workflow will fail
even though the build succeeds. This only needs to be done once per
repository.

## Writing and publishing a new article

### 1. Run the local authoring tool

```
node tools/author/server.js
```

Then open **http://127.0.0.1:3001** in a browser. This tool only ever binds
to `127.0.0.1` (loopback) — it is not reachable from other devices, and it
is never deployed as part of the site (see `SECURITY.md`).

### 2. Fill in the form and submit

The form collects the article fields defined in
[`schema/article.schema.json`](../schema/article.schema.json) — title,
publish date/time, summary, tags, body (Markdown), etc. Submitting the form
writes a new file to `content/articles/<YYYY-MM-DD-slug>.json` on disk. This
step **does not publish anything** — it only changes files in your local
working tree.

### 3. Review the change before doing anything else

```
git status
git diff
```

Read the generated JSON like you'd review any other code change. Check in
particular that:

- `publishedAt` is correct (format `YYYY-MM-DDTHH:mm`, local time — this is
  the field the homepage sorts by, newest first).
- `slug` is unique and matches the filename.
- `draft` is `false` once you actually want it live (leave it `true` while
  still drafting, and optionally preview drafts locally with
  `INCLUDE_DRAFTS=1 npm run build`).

### 4. Commit and push to `main`

```
git add content/articles/<your-new-file>.json
git commit -m "Add article: <title>"
git push origin main
```

Pushing to `main` is what actually triggers the deploy — GitHub Actions
(`.github/workflows/deploy.yml`) checks out the repo, runs `npm ci` and
`npm run build`, and deploys the resulting `dist/` to GitHub Pages. There is
no separate "publish" button; a reviewed, pushed commit **is** the publish
step. You can watch the run under the repository's **Actions** tab, and the
deployed URL is also shown there once the `deploy` job finishes.

### 5. Verify

Once the workflow finishes (usually well under a minute for a site this
size), reload the live site and confirm the new article appears where
expected — it should sort in by `publishedAt` above anything older.

## Previewing locally before pushing

```
npm run build
npx serve dist
```

This builds the site exactly the way CI will and serves the static output
locally, so you can check formatting, links, and sanitized Markdown output
before it ever goes near `git push`.

## Editing or unpublishing an article

- **Edit:** change the JSON file directly (or via the authoring tool if it
  supports editing), review with `git diff`, commit, and push as above. Bump
  `updatedAt` if you want that reflected.
- **Unpublish:** either delete the article's JSON file, or set `"draft":
  true` — both remove it from the next production build. Either way,
  commit and push to take effect.

## Before going live

- [ ] **TODO — LinkedIn URL:** `content/about.json` currently has a
      **placeholder** LinkedIn link:
      `https://www.linkedin.com/in/REPLACE_ME`. This is intentionally an
      obviously-fake URL so nobody stumbles onto it by accident. **Charlie
      must replace this with his real LinkedIn profile URL** in
      `content/about.json` (`socialLinks[].url` where `type` is
      `"linkedin"`) before treating the site as publicly ready. See
      [`CONTENT_SCHEMA.md`](./CONTENT_SCHEMA.md#about--contentaboutjson) for
      the exact field shape.
- [ ] Confirm **Settings → Pages → Source = "GitHub Actions"** is set (see
      above).
- [ ] Confirm branch protection / 2FA per [`SECURITY.md`](./SECURITY.md#5-recommended-github-side-hardening)
      before treating `main` as the trusted publish trigger.
