# Architecture / Contracts Reference

This is the single reference doc for Tasks B (styling/`public/`), C (authoring
tool in `tools/author/`), and D (real content). Read this instead of the full
build implementation to know what to build against.

## Folder layout

```
ChazzasBlog/
├── schema/                 # JSON Schemas (draft-07, validated with AJV)
│   ├── article.schema.json
│   └── about.schema.json
├── content/                 # Source of truth content, hand- or tool-edited
│   ├── about.json
│   ├── articles/<YYYY-MM-DD-slug>.json
│   └── images/{articles,site}/   # copied verbatim to dist/images/
├── build/                   # Node static site generator (Task A, this task)
│   ├── build.js
│   ├── lib/                 # readContent, markdown, templateEngine, escapeHtml, paths, formatDate
│   └── templates/           # layout.html, index.html, article.html, partials/*.html
├── public/                   # Task B's job: static assets copied verbatim into dist/
│   ├── css/{variables,base,layout,components,responsive}.css
│   ├── js/main.js
│   ├── favicon.ico
│   ├── site.webmanifest
│   └── robots.txt
├── tools/author/              # Task C's job: local-only authoring tool (never deployed)
├── dist/                      # Build OUTPUT. Gitignored. Never hand-edit.
└── docs/
    └── ARCHITECTURE.md        # this file
```

Run the build with `npm install && npm run build`. Output goes to `dist/`.
Set `INCLUDE_DRAFTS=1` in the environment to include `draft: true` articles
(useful for local preview; the production build should NOT set this).

## Content schemas

### `content/articles/*.json` (validated against `schema/article.schema.json`)

Filename convention: `YYYY-MM-DD-slug.json` (the date prefix is just for
human sorting in the file browser; `publishedAt` inside the file is the
canonical sort key used by the build).

| field         | type    | required | notes |
|---------------|---------|----------|-------|
| `slug`        | string  | yes      | kebab-case, pattern `^[a-z0-9]+(-[a-z0-9]+)*$`; must be unique across all articles; used in URL `/articles/<slug>/` |
| `title`       | string  | yes      | |
| `publishedAt` | string  | yes      | `YYYY-MM-DDTHH:mm` (the literal value an HTML `datetime-local` input produces - local time, NOT timezone-aware). Canonical sort key, descending. |
| `updatedAt`   | string  | no       | same format as `publishedAt` |
| `summary`     | string  | yes      | max length 300 |
| `body`        | string  | yes      | **markdown source**, not HTML |
| `coverImage`  | object  | no       | `{ src: string, alt: string }` - `alt` is required if `coverImage` is present |
| `tags`        | string[]| no       | |
| `author`      | string  | no       | |
| `draft`       | boolean | no       | default `false`; draft articles are excluded from the build unless `INCLUDE_DRAFTS=1` |

### `content/about.json` (validated against `schema/about.schema.json`)

| field         | type    | required | notes |
|---------------|---------|----------|-------|
| `heading`     | string  | yes      | e.g. "About Me" |
| `body`        | string  | yes      | markdown source |
| `tagline`     | string  | no       | short one-liner shown next to the site title in the header |
| `photo`       | object  | no       | `{ src, alt }` - `alt` required if `photo` present |
| `socialLinks` | array   | yes      | minItems 2; each `{ label, url, type }` where `type` is one of `email \| linkedin \| github \| twitter \| other`. Must contain at least one `email` entry and at least one `linkedin` entry. |

Seed `content/about.json` uses a placeholder LinkedIn URL
(`https://www.linkedin.com/in/REPLACE_ME`) - Task D should replace this with
Charlie's real profile URL and a real bio.

## Build pipeline behavior (`build/build.js`)

1. Wipes and recreates `dist/`.
2. Loads + validates all content via `build/lib/readContent.js`. Any schema
   violation, malformed JSON, or duplicate article `slug` prints a clear
   `file: field "x" message` list and exits non-zero - the build never
   produces output from invalid content.
3. Filters out `draft: true` articles unless `INCLUDE_DRAFTS=1`.
4. Sorts remaining articles by `publishedAt` descending, tie-broken by
   `slug` descending.
5. Renders each article to `dist/articles/<slug>/index.html`.
6. Copies `content/images/**` → `dist/images/**` if present.
7. Copies `public/css/**`, `public/js/**`, `public/favicon.ico`,
   `public/site.webmanifest`, `public/robots.txt` → the matching `dist/`
   path, **if they exist**. Missing `public/` assets only log a note - they
   do not fail the build (so Task A can build before Task B lands).
8. Renders `dist/index.html` (about section + featured article + vertical
   list of the rest).
9. Renders `dist/404.html`.

### Markdown sanitization (`build/lib/markdown.js`)

`renderMarkdown(markdownSource)` runs `markdown-it` → `sanitize-html` with a
fixed allowlist:

- Allowed tags: `p, h2, h3, h4, ul, ol, li, blockquote, code, pre, strong, em, a, img, hr, br, table, thead, tbody, tr, th, td`
- Allowed attributes: `a` → `href, title` (forces `rel="noopener noreferrer"`, rejects non `http(s)/mailto` URLs incl. `javascript:`); `img` → `src, alt, title`
- `script, style, iframe, object, embed, form` and all `on*` attributes are stripped entirely.

**Task C must reuse this exact module** (`require('../../build/lib/markdown')`
or equivalent relative path) so the authoring-tool preview and the production
build apply byte-identical sanitization. Do not fork this logic.

## Template token contract

Templates live in `build/templates/`. The tiny engine in
`build/lib/templateEngine.js` supports `{{key}}` (HTML-escaped) and
`{{{key}}}` (raw, trusted HTML only - e.g. sanitized markdown output or
pre-joined partial HTML).

- **`layout.html`** (page shell): `{{PAGE_TITLE}}`, `{{PAGE_DESCRIPTION}}`,
  `{{{NAV_HTML}}}`, `{{{CONTACT_LINKS_HTML}}}`, `{{{PAGE_CONTENT_HTML}}}`,
  `{{{FOOTER_HTML}}}`. Contact links render in the header, next to the site
  title, on every page.
- **`index.html`** (homepage content): `{{ABOUT_HEADING}}`,
  `{{{ABOUT_BODY_HTML}}}`, `{{{FEATURED_ARTICLE_HTML}}}`,
  `{{{ARTICLES_LIST_HTML}}}`.
- **`article.html`** (article page content): `{{TITLE}}`,
  `{{PUBLISHED_AT_DISPLAY}}`, `{{PUBLISHED_AT_ISO}}`, `{{{TAGS_HTML}}}`,
  `{{{COVER_IMAGE_HTML}}}`, `{{{BODY_HTML}}}`.
- **`partials/article-featured.html`** and **`partials/article-list-item.html`**
  (identical token set for both): `{{TITLE}}`, `{{URL}}`,
  `{{PUBLISHED_AT_DISPLAY}}`, `{{PUBLISHED_AT_ISO}}`, `{{SUMMARY}}`,
  `{{{COVER_IMAGE_HTML}}}` (empty string if no cover image).
- **`partials/contact-links.html`**: `{{{LINKS_HTML}}}` - build.js
  pre-renders each social link as an `<li><a>` (email uses the `mailto:`
  URL).
- **`partials/nav.html`, `footer.html`, `about.html`, `tag-chip.html`**:
  simple supporting partials (nav menu, site footer, about-photo figure,
  single tag chip).

## CSS contract (Task B must produce these exact class names + files)

Stylesheet files referenced by `<link>` tags in `build/templates/layout.html`,
in this order, all under `/css/` (i.e. `public/css/*.css` → copied verbatim
to `dist/css/*.css`):

```
/css/variables.css
/css/base.css
/css/layout.css
/css/components.css
/css/responsive.css
```

Also referenced from `layout.html`: `/js/main.js` (deferred script),
`/favicon.ico`, `/site.webmanifest`.

Exact CSS class hooks baked into the templates (Task B: style against these,
do not rename):

```
.site-header
.site-nav
.nav-toggle
.contact-links
.about-section
.featured-article
.article-list          (vertical list container - NOT a grid)
.article-list-item     (vertical list item - NOT a grid)
.article-page
.article-page__body
.tag-chip
.site-footer
```

Previous/older articles render as a vertical list (`<ul class="article-list">`
containing `<li class="article-list-item">` entries) - this is intentionally
a list, not a card grid.

## Security notes

- Content Security Policy is set via `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; object-src 'none'; base-uri 'self';">` in `layout.html`.
- There is no public write endpoint anywhere in the deployed site. All
  content is baked in at build time from files committed to the repo.
- All markdown body content passes through the shared sanitize pipeline
  described above before being injected as raw HTML.
- Plain-text fields (titles, summaries, tag text, alt text, link labels) are
  interpolated via `{{...}}` (HTML-escaped) or explicitly escaped with
  `build/lib/escapeHtml.js` before being placed inside raw HTML attributes
  built manually in `build.js`.
