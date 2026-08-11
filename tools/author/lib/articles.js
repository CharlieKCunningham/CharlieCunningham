'use strict';

const fs = require('fs');
const path = require('path');

const { ARTICLES_DIR, IMAGES_ARTICLES_DIR } = require('./paths');
const { isValidFilename } = require('./articleFilename');

function listArticleFiles() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs.readdirSync(ARTICLES_DIR).filter((f) => f.toLowerCase().endsWith('.json'));
}

/**
 * Returns a summary of every article in content/articles/, sorted by
 * publishedAt descending. Malformed article files are included with an
 * `error: true` flag rather than crashing the whole listing.
 */
function listArticles() {
  const files = listArticleFiles();
  const summaries = [];

  for (const filename of files) {
    const filePath = path.join(ARTICLES_DIR, filename);
    try {
      const article = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      summaries.push({
        filename,
        slug: typeof article.slug === 'string' ? article.slug : '',
        title: typeof article.title === 'string' ? article.title : '',
        publishedAt: typeof article.publishedAt === 'string' ? article.publishedAt : '',
        updatedAt: typeof article.updatedAt === 'string' ? article.updatedAt : undefined,
        draft: Boolean(article.draft),
        summary: typeof article.summary === 'string' ? article.summary : '',
      });
    } catch (err) {
      summaries.push({
        filename,
        slug: '',
        title: `(unreadable file: ${err.message})`,
        publishedAt: '',
        updatedAt: undefined,
        draft: false,
        summary: '',
        error: true,
      });
    }
  }

  summaries.sort((a, b) => {
    if (a.publishedAt === b.publishedAt) return 0;
    return a.publishedAt < b.publishedAt ? 1 : -1;
  });

  return summaries;
}

/**
 * @returns {{ ok: true, article: object, filename: string } | { ok: false, status: number, errors: string[] }}
 */
function getArticleByFilename(filename) {
  if (!isValidFilename(filename)) {
    return { ok: false, status: 400, errors: ['Invalid article filename.'] };
  }
  const filePath = path.join(ARTICLES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return { ok: false, status: 404, errors: ['Article not found.'] };
  }
  try {
    const article = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, article, filename };
  } catch (err) {
    return { ok: false, status: 500, errors: [`Article file is corrupt: ${err.message}`] };
  }
}

/**
 * Deletes an article JSON file and its content/images/articles/<slug>/
 * folder (if any).
 *
 * @returns {{ ok: true, filename: string, slug?: string, imageDirDeleted: boolean } | { ok: false, status: number, errors: string[] }}
 */
function deleteArticleByFilename(filename) {
  if (!isValidFilename(filename)) {
    return { ok: false, status: 400, errors: ['Invalid article filename.'] };
  }
  const filePath = path.join(ARTICLES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return { ok: false, status: 404, errors: ['Article not found.'] };
  }

  let article = null;
  try {
    article = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    article = null; // still allow deleting a corrupt file; just can't clean up its image folder confidently
  }

  fs.unlinkSync(filePath);

  let imageDirDeleted = false;
  if (article && typeof article.slug === 'string' && article.slug) {
    const imageDir = path.join(IMAGES_ARTICLES_DIR, article.slug);
    if (fs.existsSync(imageDir)) {
      fs.rmSync(imageDir, { recursive: true, force: true });
      imageDirDeleted = true;
    }
  }

  return { ok: true, filename, slug: article ? article.slug : undefined, imageDirDeleted };
}

module.exports = { listArticles, getArticleByFilename, deleteArticleByFilename };
