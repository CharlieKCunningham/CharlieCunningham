#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const paths = require('./lib/paths');
const readContent = require('./lib/readContent');
const { ContentValidationError } = readContent;
const renderMarkdown = require('./lib/markdown');
const { render } = require('./lib/templateEngine');
const escapeHtml = require('./lib/escapeHtml');
const { formatDateDisplay, formatDateIso } = require('./lib/formatDate');

const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === '1';

// ---------------------------------------------------------------------------
// Template loading helpers
// ---------------------------------------------------------------------------

function readTemplate(...segments) {
  return fs.readFileSync(path.join(paths.TEMPLATES_DIR, ...segments), 'utf8');
}

function readPartial(name) {
  return fs.readFileSync(path.join(paths.PARTIALS_DIR, name), 'utf8');
}

const TPL = {
  layout: readTemplate('layout.html'),
  index: readTemplate('index.html'),
  article: readTemplate('article.html'),
};

const PARTIAL = {
  nav: readPartial('nav.html'),
  footer: readPartial('footer.html'),
  about: readPartial('about.html'),
  contactLinks: readPartial('contact-links.html'),
  articleFeatured: readPartial('article-featured.html'),
  articleListItem: readPartial('article-list-item.html'),
  tagChip: readPartial('tag-chip.html'),
};

// ---------------------------------------------------------------------------
// Small render helpers shared across pages
// ---------------------------------------------------------------------------

function renderNavHtml() {
  return render(PARTIAL.nav, {});
}

function renderFooterHtml() {
  return render(PARTIAL.footer, { YEAR: String(new Date().getFullYear()) });
}

function renderContactLinksHtml(socialLinks) {
  const linksHtml = (socialLinks || [])
    .map((link) => {
      const href = escapeHtml(link.url);
      const label = escapeHtml(link.label);
      return `<li class="contact-links__item contact-links__item--${escapeHtml(link.type)}"><a href="${href}"${
        link.type === 'email' ? '' : ' rel="noopener noreferrer" target="_blank"'
      }>${label}</a></li>`;
    })
    .join('\n    ');
  return render(PARTIAL.contactLinks, { LINKS_HTML: linksHtml });
}

function renderCoverImageHtml(coverImage) {
  if (!coverImage) return '';
  const src = escapeHtml(coverImage.src);
  const alt = escapeHtml(coverImage.alt);
  return `<img class="cover-image" src="${src}" alt="${alt}" loading="lazy">`;
}

function renderTagsHtml(tags) {
  if (!tags || tags.length === 0) return '';
  const chips = tags.map((tag) => render(PARTIAL.tagChip, { TAG: tag })).join('\n    ');
  return `<ul class="article-page__tags">\n    ${chips
    .split('\n')
    .map((line) => (line.trim() ? `<li>${line.trim()}</li>` : line))
    .join('\n')}\n  </ul>`;
}

function articleUrl(slug) {
  return `/articles/${slug}/`;
}

function renderLayout({ pageTitle, pageDescription, pageContentHtml, about }) {
  return render(TPL.layout, {
    PAGE_TITLE: pageTitle,
    PAGE_DESCRIPTION: pageDescription,
    NAV_HTML: renderNavHtml(),
    CONTACT_LINKS_HTML: renderContactLinksHtml(about.socialLinks),
    PAGE_CONTENT_HTML: pageContentHtml,
    FOOTER_HTML: renderFooterHtml(),
  });
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf8');
}

/**
 * Copies srcDir -> destDir if srcDir exists. Never throws if srcDir is
 * missing - just logs a note and returns false. This lets the build succeed
 * even when public/ (Task B) or content/images/ have not been populated yet.
 */
function copyIfExists(srcPath, destPath, label) {
  if (!fs.existsSync(srcPath)) {
    console.log(`[build] note: ${label} not found at ${srcPath}, skipping.`);
    return false;
  }
  ensureDir(path.dirname(destPath));
  fs.cpSync(srcPath, destPath, { recursive: true });
  return true;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function main() {
  // 1. Reset dist/
  if (fs.existsSync(paths.DIST_DIR)) {
    fs.rmSync(paths.DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(paths.DIST_DIR);

  // 2. Validate + load content
  let content;
  try {
    content = readContent();
  } catch (err) {
    if (err instanceof ContentValidationError) {
      console.error('\nBuild failed: invalid content.\n');
      for (const message of err.errors) {
        console.error(`  - ${message}`);
      }
      console.error('');
    } else {
      console.error('Build failed while reading content:', err);
    }
    process.exit(1);
    return;
  }

  const { about, articles: allArticles } = content;

  // 3. Filter drafts
  const nonDraftArticles = allArticles.filter((a) => INCLUDE_DRAFTS || a.draft !== true);

  // 4. Sort by publishedAt desc, tie-break slug desc
  const articles = [...nonDraftArticles].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      return a.publishedAt < b.publishedAt ? 1 : -1;
    }
    return a.slug < b.slug ? 1 : -1;
  });

  // 5. Render each article page
  for (const article of articles) {
    const bodyHtml = renderMarkdown(article.body);
    const pageContentHtml = render(TPL.article, {
      TITLE: article.title,
      PUBLISHED_AT_DISPLAY: formatDateDisplay(article.publishedAt),
      PUBLISHED_AT_ISO: formatDateIso(article.publishedAt),
      TAGS_HTML: renderTagsHtml(article.tags),
      COVER_IMAGE_HTML: renderCoverImageHtml(article.coverImage),
      BODY_HTML: bodyHtml,
    });

    const pageHtml = renderLayout({
      pageTitle: `${article.title} - Chazza's Blog`,
      pageDescription: article.summary,
      pageContentHtml,
      about,
    });

    writeFile(path.join(paths.DIST_DIR, 'articles', article.slug, 'index.html'), pageHtml);
  }

  // 6. Copy content images
  copyIfExists(paths.IMAGES_CONTENT_DIR, path.join(paths.DIST_DIR, 'images'), 'content/images');

  // 7. Copy public/ assets (Task B may not have produced these yet)
  copyIfExists(path.join(paths.PUBLIC_DIR, 'css'), path.join(paths.DIST_DIR, 'css'), 'public/css');
  copyIfExists(path.join(paths.PUBLIC_DIR, 'js'), path.join(paths.DIST_DIR, 'js'), 'public/js');
  copyIfExists(
    path.join(paths.PUBLIC_DIR, 'favicon.ico'),
    path.join(paths.DIST_DIR, 'favicon.ico'),
    'public/favicon.ico'
  );
  copyIfExists(
    path.join(paths.PUBLIC_DIR, 'site.webmanifest'),
    path.join(paths.DIST_DIR, 'site.webmanifest'),
    'public/site.webmanifest'
  );
  copyIfExists(
    path.join(paths.PUBLIC_DIR, 'robots.txt'),
    path.join(paths.DIST_DIR, 'robots.txt'),
    'public/robots.txt'
  );

  // 8. Homepage
  const aboutPhotoHtml = about.photo
    ? render(PARTIAL.about, { SRC: escapeHtml(about.photo.src), ALT: escapeHtml(about.photo.alt) })
    : '';
  const aboutBodyHtml = aboutPhotoHtml + renderMarkdown(about.body);

  const featured = articles[0];
  const rest = articles.slice(1);

  const featuredArticleHtml = featured
    ? render(PARTIAL.articleFeatured, {
        TITLE: featured.title,
        URL: articleUrl(featured.slug),
        PUBLISHED_AT_DISPLAY: formatDateDisplay(featured.publishedAt),
        PUBLISHED_AT_ISO: formatDateIso(featured.publishedAt),
        SUMMARY: featured.summary,
        COVER_IMAGE_HTML: renderCoverImageHtml(featured.coverImage),
      })
    : '<p class="no-articles">No articles published yet. Check back soon.</p>';

  const articlesListHtml = rest
    .map((article) =>
      render(PARTIAL.articleListItem, {
        TITLE: article.title,
        URL: articleUrl(article.slug),
        PUBLISHED_AT_DISPLAY: formatDateDisplay(article.publishedAt),
        PUBLISHED_AT_ISO: formatDateIso(article.publishedAt),
        SUMMARY: article.summary,
        COVER_IMAGE_HTML: renderCoverImageHtml(article.coverImage),
      })
    )
    .join('\n');

  const homeContentHtml = render(TPL.index, {
    ABOUT_HEADING: about.heading,
    ABOUT_BODY_HTML: aboutBodyHtml,
    FEATURED_ARTICLE_HTML: featuredArticleHtml,
    ARTICLES_LIST_HTML: articlesListHtml,
  });

  const homeHtml = renderLayout({
    pageTitle: `Chazza's Blog${about.tagline ? ' - ' + about.tagline : ''}`,
    pageDescription: about.tagline || about.heading,
    pageContentHtml: homeContentHtml,
    about,
  });

  writeFile(path.join(paths.DIST_DIR, 'index.html'), homeHtml);

  // 9. 404 page
  const notFoundContentHtml = `
    <section class="not-found">
      <h1>Page not found</h1>
      <p>Sorry, that page doesn't exist. <a href="/">Go back home</a>.</p>
    </section>
  `;
  const notFoundHtml = renderLayout({
    pageTitle: "Page not found - Chazza's Blog",
    pageDescription: 'Page not found.',
    pageContentHtml: notFoundContentHtml,
    about,
  });
  writeFile(path.join(paths.DIST_DIR, '404.html'), notFoundHtml);

  // 10. Done
  console.log(`Built ${articles.length} articles, wrote dist/`);
  process.exit(0);
}

main();
