'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Reuse the exact schema Task A's build validates content against, so an
// article this tool considers valid is guaranteed to also pass the build's
// own readContent validation.
const ARTICLE_SCHEMA_PATH = path.join(__dirname, '..', '..', '..', 'schema', 'article.schema.json');
const articleSchema = JSON.parse(fs.readFileSync(ARTICLE_SCHEMA_PATH, 'utf8'));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateAgainstSchema = ajv.compile(articleSchema);

const PUBLISHED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Validates an assembled article object.
 *
 * Runs the AJV schema compiled from schema/article.schema.json, plus a
 * handful of explicit extra checks called out in the task spec (some of
 * these duplicate what the schema already enforces, but are checked
 * explicitly so validation failures are easy to explain to the caller).
 *
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateArticle(article) {
  const errors = [];

  if (!article || typeof article !== 'object') {
    return { ok: false, errors: ['Article payload must be an object.'] };
  }

  if (!article.title || typeof article.title !== 'string' || !article.title.trim()) {
    errors.push('Title is required.');
  }

  if (!article.slug || typeof article.slug !== 'string' || !article.slug.trim()) {
    errors.push('Slug is required.');
  }

  if (!article.publishedAt || !PUBLISHED_AT_PATTERN.test(article.publishedAt)) {
    errors.push('publishedAt must match YYYY-MM-DDTHH:mm (the format an HTML datetime-local input produces).');
  }

  if (article.updatedAt && !PUBLISHED_AT_PATTERN.test(article.updatedAt)) {
    errors.push('updatedAt must match YYYY-MM-DDTHH:mm.');
  }

  if (!article.summary || typeof article.summary !== 'string' || !article.summary.trim()) {
    errors.push('Summary is required.');
  } else if (article.summary.length > 300) {
    errors.push('Summary must be 300 characters or fewer.');
  }

  if (!article.body || typeof article.body !== 'string' || !article.body.trim()) {
    errors.push('Body (markdown) is required.');
  }

  if (article.coverImage && !article.coverImage.alt) {
    errors.push('Alt text is required when a cover image is present.');
  }

  // Run the shared JSON Schema last so its (more exhaustive) errors are
  // appended after the friendlier explicit checks above.
  const schemaValid = validateAgainstSchema(article);
  if (!schemaValid) {
    for (const err of validateAgainstSchema.errors || []) {
      const field = err.instancePath ? err.instancePath.replace(/^\//, '') : '(root)';
      errors.push(`schema: field "${field}" ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

module.exports = { validateArticle, PUBLISHED_AT_PATTERN };
