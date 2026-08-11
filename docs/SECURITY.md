# Security Model / Tamper-Resistance

This document explains why ChazzasBlog is hard to tamper with, and what the
realistic remaining risk actually is. See [`ARCHITECTURE.md`](./ARCHITECTURE.md)
for the full folder layout and build pipeline details referenced below.

## 1. There is no write endpoint on the deployed site

The site that the public reaches at `https://<user>.github.io/...` (or a
custom domain) is served entirely by **GitHub Pages**, which only serves
pre-rendered static files out of the `dist/` build output. There is:

- no server-side code running behind the deployed site,
- no database,
- no API route, form handler, or admin panel reachable from the internet.

Every HTML page in `dist/` is generated once, at build time, from the JSON
files in `content/`. Nothing on the live site reads a query string, a cookie,
or any other request-time input to decide what content to render — the HTML
a visitor receives is byte-identical to what the last successful build
produced. There is simply no code path on the deployed site through which a
visitor's request could cause different content to be written or served.

## 2. Content is baked in at build time, not fetched or mutated client-side

Articles and the about page are not loaded via `fetch()`/XHR from the
browser, and they are not assembled or mutated in the DOM at runtime. The
build script (`build/build.js`) reads `content/*.json`, validates it, renders
Markdown to sanitized HTML, and stamps the result directly into static HTML
files. Because the browser never re-parses or re-renders content JSON on the
client, there is no client-side injection surface (no "read a slug from the
URL and inject it into the page" pattern, no query-string-driven rendering)
for an attacker to exploit.

## 3. The only write-capable code never leaves Charlie's machine

`tools/author/server.js` is the *only* piece of code in this project able to
write article files to disk. It is a small local HTTP server used to fill in
the article form and save the resulting JSON into `content/articles/`. It is
hard-bound to `127.0.0.1` (loopback) — it is never bound to `0.0.0.0` or any
externally reachable interface, so it cannot be reached from the network,
even by other devices on the same LAN.

Just as importantly:

- `tools/author/` is **never** included in `dist/` (the build script does not
  read from or copy it).
- `tools/author/` is **never** invoked by the CI/CD pipeline
  (`.github/workflows/deploy.yml` only runs `npm ci` and `npm run build`).

So even a full compromise of the GitHub Actions runner, or of the GitHub
Pages CDN, would not expose a path back to the authoring tool — it simply
isn't part of the deployed system.

## 4. Publishing requires a human checkpoint, and git is the audit trail

Publishing a new article is intentionally a multi-step, human-mediated flow:

1. Charlie runs the authoring tool locally and submits the form.
2. The tool writes a new `content/articles/<slug>.json` file to the working
   tree — nothing is published yet.
3. Charlie reviews the change with `git diff` before doing anything else.
4. Charlie manually runs `git add`, `git commit`, and `git push origin main`.
5. Only the push to `main` triggers GitHub Actions, which rebuilds the site
   from source and deploys the fresh `dist/` output.

There is no "auto-publish" step anywhere in this chain. Every change that
ever reaches the live site passed through a commit that Charlie reviewed and
authored, and that commit is permanently recorded in git history — giving a
complete, tamper-evident audit trail of every piece of content ever
published (who/when/what changed), which a database-backed CMS typically
does not give you for free.

## 5. Recommended GitHub-side hardening

Because publishing is gated entirely on pushes to `main`, the security of
the whole system reduces to the security of that branch and the GitHub
account that can push to it. Recommended settings:

- **Branch protection on `main`** — at minimum, require pull request review
  before merging (or, if Charlie is the sole contributor, require signed
  commits / restrict who can push directly) so a single leaked credential
  can't silently rewrite history.
- **Two-factor authentication (2FA) on the GitHub account** that owns this
  repository — this is the single highest-leverage protection available,
  because...

**GitHub account compromise is the realistic remaining attack surface, not
the website itself.** There is no database to breach, no server to exploit,
and no write API to abuse on the live site — but anyone who gains push
access to `main` (via a compromised GitHub account, a leaked personal
access token, or a compromised CI secret) *can* publish arbitrary content,
because that's the system working as designed. Protecting the GitHub
account and the `main` branch is therefore the actual security boundary of
this project, not any code in `build/` or `tools/`.

## 6. Content Security Policy (best-effort, not a substitute for the above)

`build/templates/layout.html` sets:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; object-src 'none'; base-uri 'self';">
```

on every rendered page. This is a genuinely useful defense-in-depth layer
against injected scripts (e.g. if sanitization were ever bypassed) — but it
comes with an important caveat: **GitHub Pages does not allow setting custom
HTTP response headers.** A CSP delivered via `<meta http-equiv>` is weaker
than one delivered as a real `Content-Security-Policy` response header —
notably, some directives (`frame-ancestors`, `report-uri`/`report-to`,
`sandbox`, and anything governing how the *document itself* may be framed or
loaded) are explicitly ignored by browsers when set via `<meta>`, because by
the time the meta tag is parsed the document has already started loading.
Treat the CSP meta tag as a best-effort backstop, not as the primary
defense — the primary defense is that there is nothing on the deployed site
capable of executing attacker-controlled script in the first place (see
sections 1–2 above and the sanitization pipeline below).

## 7. Defense-in-depth content sanitization

Even though Charlie is the only person who will ever author content, all
Markdown `body` text (articles and the about page) is still passed through a
fixed sanitization pipeline (`build/lib/markdown.js`: `markdown-it` →
`sanitize-html`) before being injected as raw HTML:

- Only a small allowlist of tags is permitted (`p, h2, h3, h4, ul, ol, li,
  blockquote, code, pre, strong, em, a, img, hr, br, table, thead, tbody,
  tr, th, td`).
- `a` links only keep `href`/`title`, always get `rel="noopener noreferrer"`
  forced on, and any URL that isn't `http:`, `https:`, or `mailto:` (e.g.
  `javascript:`) is rejected.
- `img` only keeps `src`/`alt`/`title`.
- `script`, `style`, `iframe`, `object`, `embed`, `form`, and every `on*`
  event-handler attribute are stripped entirely, unconditionally.

This isn't there to defend against Charlie — it's there so that a typo, a
pasted snippet from somewhere untrusted, or a future contributor doesn't
accidentally introduce a stored-XSS-shaped payload into `content/`. The
authoring tool (`tools/author/`) reuses this exact same sanitization module
for its live preview, so what Charlie previews locally matches what the
production build renders byte-for-byte — see
[`ARCHITECTURE.md`](./ARCHITECTURE.md#markdown-sanitization-buildlibmarkdownjs).

## 8. The deployed artifact is always freshly built, never hand-edited

`dist/` and `node_modules/` are listed in `.gitignore` — they are never
committed to the repository. This means:

- There is no way for `dist/` to drift from what `content/` + `build/` +
  `public/` actually produce, because it is deleted and regenerated from
  scratch (`build/build.js` wipes `dist/` at the start of every build; see
  [`ARCHITECTURE.md`](./ARCHITECTURE.md#build-pipeline-behavior-buildbuildjs)).
- A hand-edit to a file inside `dist/` (even if someone had local access to
  make one) could never survive a redeploy, and could never itself be
  committed as "the source of truth" — the CI pipeline is the only thing
  that ever produces the deployed output, straight from the reviewed,
  committed source in `content/`, `build/`, and `public/`.

## Summary

| Layer | Protection |
|---|---|
| Deployed site | Static files only, no write endpoint, no server-side code |
| Rendering | Content baked in at build time, never fetched/mutated client-side |
| Authoring tool | Loopback-only (`127.0.0.1`), excluded from `dist/` and CI |
| Publishing | Human review (`git diff`) + manual commit/push required |
| History | Full git audit trail of every published change |
| GitHub account | 2FA + branch protection on `main` (recommended, not automatic) |
| Transport/runtime | Best-effort CSP `<meta>` tag (headers unavailable on GitHub Pages) |
| Content | `sanitize-html` allowlist strips scripts/handlers regardless of source |
| Build output | `dist/` gitignored — always freshly rebuilt, never hand-edited |

The realistic threat model for this project is **not** "someone hacks the
static site" — there is nothing there to hack. It is "someone gains push
access to the `main` branch." Harden the GitHub account and branch
protection accordingly.
