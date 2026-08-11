'use strict';

const escapeHtml = require('./escapeHtml');

/**
 * render(templateString, data) -> string
 *
 * A deliberately minimal token-substitution engine. Two token forms:
 *   {{key}}   - HTML-escaped substitution, for plain text values
 *   {{{key}}} - raw substitution, for values that are ALREADY sanitized/
 *               trusted HTML (e.g. output of build/lib/markdown.js, or
 *               HTML strings assembled from other partial renders)
 *
 * There is no looping or conditional syntax. Build lists/conditionals in
 * build.js by pre-building joined HTML strings (or '' for "nothing here")
 * and passing the result in as a single {{{...}}} value.
 *
 * Missing keys render as an empty string (with a console warning) rather
 * than throwing, so a template can be reused across pages that don't all
 * supply every optional token.
 *
 * @param {string} templateString
 * @param {Object<string,string>} data
 * @returns {string}
 */
function render(templateString, data = {}) {
  // Single combined pass over the ORIGINAL templateString only. Raw ({{{key}}})
  // and escaped ({{key}}) tokens are matched in one regex (raw alternative
  // first, so {{{key}}} isn't mistaken for {{key}}) so that substituted
  // values are never re-scanned for tokens. Two sequential .replace() calls
  // would re-scan the output of the first pass in the second, which incorrectly
  // strips any literal "{{...}}"-looking text that happens to appear inside
  // inserted content (e.g. an article body that mentions template syntax).
  return templateString.replace(
    /\{\{\{\s*([A-Za-z0-9_]+)\s*\}\}\}|\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (match, rawKey, escapedKey) => {
      if (rawKey !== undefined) {
        if (!(rawKey in data)) {
          console.warn(`[templateEngine] missing raw token {{{${rawKey}}}}`);
          return '';
        }
        const value = data[rawKey];
        return value === null || value === undefined ? '' : String(value);
      }

      if (!(escapedKey in data)) {
        console.warn(`[templateEngine] missing token {{${escapedKey}}}`);
        return '';
      }
      return escapeHtml(data[escapedKey]);
    }
  );
}

module.exports = { render };
