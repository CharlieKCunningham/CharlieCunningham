'use strict';

const fs = require('fs');
const path = require('path');

const slugify = require('./slugify');
const { validateArticle, PUBLISHED_AT_PATTERN } = require('./validate');
const { ARTICLES_DIR, IMAGES_ARTICLES_DIR } = require('./paths');
const { isValidFilename } = require('./articleFilename');

// Reuse the build's exact shared markdown/sanitize module - do not fork it.
// tools/author/lib/ -> tools/author/ -> tools/ -> repo root -> build/lib/markdown
const renderMarkdown = require('../../../build/lib/markdown');

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Current local date-time in the exact YYYY-MM-DDTHH:mm format the schema
 * requires - used to auto-stamp `updatedAt` on every edit.
 */
function currentLocalDatetime() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/**
 * Dry-runs the shared markdown/sanitize pipeline and returns any warnings
 * about content that will be stripped at build time. Shared by create and
 * update so both paths warn identically.
 */
function sanitizerWarnings(bodyRaw) {
  const warnings = [];
  if (/<script[\s>]/i.test(bodyRaw) || /<\/script>/i.test(bodyRaw)) {
    warnings.push('The body contained a <script> tag; it will be stripped by the sanitizer and will not appear on the published site.');
  }
  const RAW_DISALLOWED_TAG_RE = /<\/?(script|style|iframe|object|embed|form|on\w+)\b/i;
  if (RAW_DISALLOWED_TAG_RE.test(bodyRaw) && !/<script[\s>]/i.test(bodyRaw)) {
    warnings.push('The body contained HTML that the sanitizer will strip (script/style/iframe/object/embed/form tags are never allowed).');
  }
  return warnings;
}

/**
 * Derives the YYYY-MM-DD date prefix used in the article filename from the
 * publishedAt value (which is itself YYYY-MM-DDTHH:mm), falling back to
 * today's local date if publishedAt is somehow missing/malformed.
 */
function datePrefixFrom(publishedAt) {
  if (typeof publishedAt === 'string' && PUBLISHED_AT_PATTERN.test(publishedAt)) {
    return publishedAt.slice(0, 10);
  }
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Sanitizes an uploaded filename down to a safe basename: lowercase,
 * alphanumeric/dot/dash/underscore only, collapsed, with the original
 * extension preserved (already validated against the allowlist by caller).
 */
function sanitizeFilename(originalName, extension) {
  const base = path.basename(originalName, path.extname(originalName));
  const safeBase =
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'cover';
  return `${safeBase}${extension}`;
}

/**
 * Picks a target article filename `content/articles/<date>-<slug>.json`
 * that does not already exist, auto-suffixing the slug (-2, -3, ...) on
 * collision rather than overwriting an existing article file.
 *
 * @returns {{ finalSlug: string, filePath: string, fileName: string }}
 */
function resolveTargetFile(baseSlug, datePrefix) {
  let attempt = 0;
  for (;;) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const fileName = `${datePrefix}-${candidateSlug}.json`;
    const filePath = path.join(ARTICLES_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return { finalSlug: candidateSlug, filePath, fileName };
    }
    attempt += 1;
  }
}

/**
 * Validates and saves an uploaded cover image under
 * content/images/articles/<slug>/<safe-filename>.
 *
 * @param {object} imageFile - multer memory-storage file: { originalname, mimetype, size, buffer }
 * @param {string} slug - final article slug, used as the image subdirectory
 * @returns {{ src: string, fileName: string }}
 * @throws {Error} with a user-facing message if validation fails
 */
function saveCoverImage(imageFile, slug) {
  const ext = path.extname(imageFile.originalname || '').toLowerCase();

  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      `Cover image has an unsupported file extension "${ext || '(none)'}". Allowed: .jpg, .jpeg, .png, .webp, .gif`
    );
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.has(imageFile.mimetype)) {
    throw new Error(`Cover image has an unsupported content type "${imageFile.mimetype}".`);
  }
  if (imageFile.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Cover image is too large (${(imageFile.size / (1024 * 1024)).toFixed(2)}MB). Max allowed is 5MB.`
    );
  }

  const safeFileName = sanitizeFilename(imageFile.originalname, ext);
  const destDir = path.join(IMAGES_ARTICLES_DIR, slug);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, safeFileName);
  fs.writeFileSync(destPath, imageFile.buffer);

  return { src: `/images/articles/${slug}/${safeFileName}`, fileName: safeFileName };
}

/**
 * Assembles, validates, and writes a new article JSON file to
 * content/articles/, and (if an image was supplied) the cover image to
 * content/images/articles/<slug>/.
 *
 * Never touches git - this function only writes files to disk.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} [input.slug] - client-suggested slug; always re-slugified server-side
 * @param {string} input.publishedAt
 * @param {string} [input.updatedAt]
 * @param {string} input.summary
 * @param {string} input.body - markdown source
 * @param {string[]} [input.tags]
 * @param {string} [input.author]
 * @param {boolean} [input.draft]
 * @param {string} [input.alt] - required if imageFile present
 * @param {object} [input.imageFile] - multer memory-storage file object
 * @returns {{ ok: true, path: string, warnings: string[] } | { ok: false, errors: string[] }}
 */
function saveArticle(input) {
  const warnings = [];

  // 1. Slugify the title (or client-provided slug), never trusting either raw.
  const requestedSlug = input.slug && input.slug.trim() ? input.slug : input.title;
  const baseSlug = slugify(requestedSlug);

  if (!baseSlug) {
    return { ok: false, errors: ['Could not derive a valid slug from the title/slug provided.'] };
  }

  const datePrefix = datePrefixFrom(input.publishedAt);

  // 2. Resolve a non-colliding target filename (auto-suffix on collision).
  const { finalSlug, filePath, fileName } = resolveTargetFile(baseSlug, datePrefix);

  // 3. Handle optional cover image upload.
  let coverImage;
  if (input.imageFile) {
    if (!input.alt || !input.alt.trim()) {
      return { ok: false, errors: ['Alt text is required when a cover image is uploaded.'] };
    }
    try {
      const saved = saveCoverImage(input.imageFile, finalSlug);
      coverImage = { src: saved.src, alt: input.alt.trim() };
    } catch (err) {
      return { ok: false, errors: [err.message] };
    }
  }

  // 4. Dry-run the shared markdown/sanitize pipeline to warn about anything
  // stripped (e.g. a raw <script> tag pasted into the markdown body).
  const bodyRaw = input.body || '';
  const sanitizedPreview = renderMarkdown(bodyRaw);
  warnings.push(...sanitizerWarnings(bodyRaw));

  // 5. Assemble the final article object matching the schema exactly.
  const article = {
    slug: finalSlug,
    title: input.title,
    publishedAt: input.publishedAt,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    summary: input.summary,
    body: bodyRaw,
    ...(coverImage ? { coverImage } : {}),
    tags: Array.isArray(input.tags) ? input.tags : [],
    ...(input.author ? { author: input.author } : {}),
    draft: Boolean(input.draft),
  };

  const result = validateArticle(article);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  // 6. Write the article JSON file. Never touches git.
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(article, null, 2) + '\n', 'utf8');

  return { ok: true, path: filePath, fileName, slug: finalSlug, warnings, sanitizedPreviewLength: sanitizedPreview.length };
}

/**
 * Updates an existing article JSON file in place, reusing the same
 * validation/save pipeline as saveArticle(). Never touches git.
 *
 * - `updatedAt` is always set to the current local date-time; the client
 *   never needs to (and cannot) set it manually.
 * - If the (re-slugified) title/slug differs from the existing article's
 *   slug, the file (and its content/images/articles/<old-slug>/ folder, if
 *   any) is renamed/moved to the new slug, using the same collision-
 *   avoidance suffixing as creation. If the slug is unchanged, the existing
 *   file is simply overwritten in place.
 * - If a new cover image is uploaded, it replaces the old one (the old
 *   image file, or whole old-slug image folder on a rename, is removed).
 *   If no new image is uploaded, the existing `coverImage` is kept as-is.
 *
 * @param {string} existingFileName - the article JSON filename being edited (e.g. "2026-08-11-hello-world.json")
 * @param {object} input - same shape as saveArticle()'s input
 * @returns {{ ok: true, path: string, fileName: string, slug: string, warnings: string[], sanitizedPreviewLength: number, previousFileName?: string } | { ok: false, errors: string[] }}
 */
function updateArticle(existingFileName, input) {
  if (!isValidFilename(existingFileName)) {
    return { ok: false, errors: ['Invalid article filename.'] };
  }

  const existingPath = path.join(ARTICLES_DIR, existingFileName);
  if (!fs.existsSync(existingPath)) {
    return { ok: false, errors: ['Article not found.'] };
  }

  let existingArticle;
  try {
    existingArticle = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  } catch (err) {
    return { ok: false, errors: [`Existing article file is corrupt and cannot be edited: ${err.message}`] };
  }

  const warnings = [];
  const oldSlug = typeof existingArticle.slug === 'string' ? existingArticle.slug : '';
  const oldCoverImage = existingArticle.coverImage;

  // 1. Slugify the title (or client-provided slug), never trusting either raw.
  const requestedSlug = input.slug && input.slug.trim() ? input.slug : input.title;
  const baseSlug = slugify(requestedSlug);
  if (!baseSlug) {
    return { ok: false, errors: ['Could not derive a valid slug from the title/slug provided.'] };
  }

  const slugChanged = baseSlug !== oldSlug;

  // 2. Resolve the target file: same file in place if the slug is
  // unchanged, otherwise a fresh non-colliding filename (same
  // collision-avoidance suffixing as creation).
  let finalSlug;
  let filePath;
  let fileName;
  if (!slugChanged) {
    finalSlug = oldSlug;
    filePath = existingPath;
    fileName = existingFileName;
  } else {
    const datePrefix = datePrefixFrom(input.publishedAt);
    const resolved = resolveTargetFile(baseSlug, datePrefix);
    finalSlug = resolved.finalSlug;
    filePath = resolved.filePath;
    fileName = resolved.fileName;
  }

  // 3. Handle the cover image.
  let coverImage = oldCoverImage;
  const oldImageDir = oldSlug ? path.join(IMAGES_ARTICLES_DIR, oldSlug) : undefined;

  if (input.imageFile) {
    if (!input.alt || !input.alt.trim()) {
      return { ok: false, errors: ['Alt text is required when a cover image is uploaded.'] };
    }
    let saved;
    try {
      saved = saveCoverImage(input.imageFile, finalSlug);
    } catch (err) {
      return { ok: false, errors: [err.message] };
    }
    coverImage = { src: saved.src, alt: input.alt.trim() };

    // Remove whatever the old image was now that it's been replaced.
    if (oldCoverImage && oldImageDir) {
      if (slugChanged) {
        // Whole old-slug folder is now orphaned.
        if (fs.existsSync(oldImageDir)) {
          fs.rmSync(oldImageDir, { recursive: true, force: true });
        }
      } else {
        // Same folder as the new image - only remove the old file if its
        // name differs from the newly-saved one (otherwise it was just
        // overwritten in place).
        const oldFileName = path.basename(oldCoverImage.src || '');
        if (oldFileName && oldFileName !== saved.fileName) {
          const oldFilePath = path.join(oldImageDir, oldFileName);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
      }
    }
  } else if (slugChanged && oldCoverImage && oldImageDir && fs.existsSync(oldImageDir)) {
    // No new image, but the slug changed - move the existing image folder
    // over to the new slug and rewrite its src to match.
    const newImageDir = path.join(IMAGES_ARTICLES_DIR, finalSlug);
    fs.mkdirSync(IMAGES_ARTICLES_DIR, { recursive: true });
    fs.renameSync(oldImageDir, newImageDir);
    const oldSrcPrefix = `/images/articles/${oldSlug}/`;
    const newSrcPrefix = `/images/articles/${finalSlug}/`;
    coverImage = {
      ...oldCoverImage,
      src: oldCoverImage.src && oldCoverImage.src.startsWith(oldSrcPrefix)
        ? newSrcPrefix + oldCoverImage.src.slice(oldSrcPrefix.length)
        : oldCoverImage.src,
    };
  }

  // 4. Dry-run the shared markdown/sanitize pipeline for warnings.
  const bodyRaw = input.body || '';
  const sanitizedPreview = renderMarkdown(bodyRaw);
  warnings.push(...sanitizerWarnings(bodyRaw));

  // 5. Assemble the final article object. updatedAt is always the current
  // local time - the caller's input.updatedAt (if any) is ignored.
  const updatedAt = currentLocalDatetime();
  const article = {
    slug: finalSlug,
    title: input.title,
    publishedAt: input.publishedAt,
    updatedAt,
    summary: input.summary,
    body: bodyRaw,
    ...(coverImage ? { coverImage } : {}),
    tags: Array.isArray(input.tags) ? input.tags : [],
    ...(input.author ? { author: input.author } : {}),
    draft: Boolean(input.draft),
  };

  const result = validateArticle(article);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  // 6. Write the (possibly renamed) file, then remove the old one if it
  // moved. Never touches git.
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(article, null, 2) + '\n', 'utf8');

  if (slugChanged && filePath !== existingPath && fs.existsSync(existingPath)) {
    fs.unlinkSync(existingPath);
  }

  return {
    ok: true,
    path: filePath,
    fileName,
    slug: finalSlug,
    warnings,
    sanitizedPreviewLength: sanitizedPreview.length,
    ...(slugChanged ? { previousFileName: existingFileName } : {}),
  };
}

module.exports = saveArticle;
module.exports.resolveTargetFile = resolveTargetFile;
module.exports.saveCoverImage = saveCoverImage;
module.exports.updateArticle = updateArticle;
