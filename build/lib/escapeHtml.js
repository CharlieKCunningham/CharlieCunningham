'use strict';

/**
 * Escapes the five characters that are unsafe to interpolate directly into
 * an HTML text (or attribute) context: & < > " '
 *
 * Use this for ANY untrusted or plain-text string being placed into HTML
 * (titles, summaries, tag names, alt text, etc). Do NOT use this on strings
 * that are already-rendered, sanitized HTML (e.g. markdown output) - those
 * should be inserted raw via the template engine's {{{...}}} syntax instead.
 *
 * @param {string} input
 * @returns {string}
 */
function escapeHtml(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = escapeHtml;
