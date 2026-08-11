'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const {
  ARTICLES_CONTENT_DIR,
  ABOUT_CONTENT_FILE,
  ARTICLE_SCHEMA_FILE,
  ABOUT_SCHEMA_FILE,
} = require('./paths');

/**
 * Thrown when one or more content files fail validation. `.errors` is an
 * array of human-readable strings, each already prefixed with the offending
 * filename, suitable for printing directly to the console.
 */
class ContentValidationError extends Error {
  constructor(errors) {
    super(`Content validation failed with ${errors.length} error(s):\n` + errors.map((e) => `  - ${e}`).join('\n'));
    this.name = 'ContentValidationError';
    this.errors = errors;
  }
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function ajvErrorsToMessages(filename, ajvErrors) {
  return (ajvErrors || []).map((err) => {
    const field = err.instancePath ? err.instancePath.replace(/^\//, '') : '(root)';
    return `${filename}: field "${field}" ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`;
  });
}

/**
 * Loads and AJV-validates content/about.json and every content/articles/*.json
 * against schema/about.schema.json and schema/article.schema.json.
 *
 * @returns {{ about: Object, articles: Object[] }}
 * @throws {ContentValidationError} if any file is missing, malformed JSON,
 *   fails schema validation, or if two articles share a slug.
 */
function readContent() {
  const errors = [];

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const aboutSchema = loadJson(ABOUT_SCHEMA_FILE);
  const articleSchema = loadJson(ARTICLE_SCHEMA_FILE);
  const validateAbout = ajv.compile(aboutSchema);
  const validateArticle = ajv.compile(articleSchema);

  // ---- about.json ----
  let about = null;
  if (!fs.existsSync(ABOUT_CONTENT_FILE)) {
    errors.push(`content/about.json: file not found`);
  } else {
    try {
      about = loadJson(ABOUT_CONTENT_FILE);
      const valid = validateAbout(about);
      if (!valid) {
        errors.push(...ajvErrorsToMessages('content/about.json', validateAbout.errors));
      }
    } catch (err) {
      errors.push(`content/about.json: could not parse JSON (${err.message})`);
    }
  }

  // ---- articles/*.json ----
  const articles = [];
  const slugToFilenames = new Map();

  if (!fs.existsSync(ARTICLES_CONTENT_DIR)) {
    errors.push(`content/articles/: directory not found`);
  } else {
    const files = fs
      .readdirSync(ARTICLES_CONTENT_DIR)
      .filter((f) => f.toLowerCase().endsWith('.json'))
      .sort();

    for (const filename of files) {
      const relLabel = `content/articles/${filename}`;
      const fullPath = path.join(ARTICLES_CONTENT_DIR, filename);
      let article;
      try {
        article = loadJson(fullPath);
      } catch (err) {
        errors.push(`${relLabel}: could not parse JSON (${err.message})`);
        continue;
      }

      const valid = validateArticle(article);
      if (!valid) {
        errors.push(...ajvErrorsToMessages(relLabel, validateArticle.errors));
        continue;
      }

      const existing = slugToFilenames.get(article.slug);
      if (existing) {
        errors.push(
          `${relLabel}: duplicate slug "${article.slug}" also used by ${existing}`
        );
        continue;
      }
      slugToFilenames.set(article.slug, relLabel);

      articles.push({ ...article, __sourceFile: relLabel });
    }
  }

  if (errors.length > 0) {
    throw new ContentValidationError(errors);
  }

  return { about, articles };
}

module.exports = readContent;
module.exports.ContentValidationError = ContentValidationError;
