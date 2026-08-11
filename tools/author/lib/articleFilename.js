'use strict';

/**
 * Article JSON filenames are the stable identifier used by the
 * edit/delete routes (NOT slug alone - slug is only guaranteed unique
 * within a given date prefix in theory). This pattern is intentionally
 * strict: date prefix + kebab-case slug + ".json", nothing else, which
 * also rules out any path traversal characters ("..", "/", "\") by
 * construction. We still explicitly re-check for those as defense in
 * depth before ever touching the filesystem with a client-supplied value.
 */
const FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.json$/;

function isValidFilename(name) {
  if (typeof name !== 'string' || !name) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  return FILENAME_PATTERN.test(name);
}

module.exports = { FILENAME_PATTERN, isValidFilename };
