'use strict';

/**
 * slugify(input) -> kebab-case slug matching schema/article.schema.json's
 * slug pattern: ^[a-z0-9]+(-[a-z0-9]+)*$
 *
 * - Lowercases the input.
 * - Replaces any run of characters outside [a-z0-9] with a single '-'.
 * - Collapses repeated dashes.
 * - Trims leading/trailing dashes.
 *
 * Used both for the (advisory) live client-side preview and, authoritatively,
 * server-side on every save - the client-provided slug is always re-run
 * through this exact function before being trusted.
 */
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = slugify;
