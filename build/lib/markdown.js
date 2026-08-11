'use strict';

/**
 * renderMarkdown(markdownSource) -> sanitized HTML string
 *
 * Pipeline: markdown-it (source -> HTML) -> sanitize-html (allowlist).
 *
 * IMPORTANT - SHARED SANITIZATION CONTRACT:
 * This module is the single source of truth for turning author-supplied
 * markdown into HTML that is safe to inject into the static site via the
 * template engine's raw {{{...}}} syntax. The local authoring tool
 * (tools/author/) MUST reuse this exact module - e.g.
 *   const renderMarkdown = require('../../build/lib/markdown');
 * - via a relative require, so that whatever HTML preview Charlie sees while
 * authoring is produced by the identical allowlist that the production
 * build will apply. Do NOT duplicate or fork this logic elsewhere; if the
 * allowlist ever needs to change, change it here only.
 */

const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');

const md = new MarkdownIt({
  html: false, // never trust raw HTML embedded in markdown source
  linkify: true,
  breaks: false,
});

const ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote',
  'code', 'pre',
  'strong', 'em',
  'a', 'img',
  'hr', 'br',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTRIBUTES = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title'],
};

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  // Only allow safe URL schemes; explicitly rejects things like javascript:
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
  disallowedTagsMode: 'discard',
  // Strip these entirely, along with their contents.
  exclusiveFilter: (frame) =>
    ['script', 'style', 'iframe', 'object', 'embed', 'form'].includes(frame.tag),
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const isSafe = /^(https?:|mailto:)/i.test(href) || href.startsWith('#') || href.startsWith('/');
      return {
        tagName: 'a',
        attribs: {
          ...(isSafe ? { href } : {}),
          ...(attribs.title ? { title: attribs.title } : {}),
          rel: 'noopener noreferrer',
        },
      };
    },
  },
};

/**
 * @param {string} markdownSource - raw markdown, as stored in article.body / about.body
 * @returns {string} sanitized HTML fragment safe for raw injection
 */
function renderMarkdown(markdownSource) {
  const rawHtml = md.render(markdownSource || '');
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

module.exports = renderMarkdown;
module.exports.SANITIZE_OPTIONS = SANITIZE_OPTIONS;
module.exports.ALLOWED_TAGS = ALLOWED_TAGS;
module.exports.ALLOWED_ATTRIBUTES = ALLOWED_ATTRIBUTES;
