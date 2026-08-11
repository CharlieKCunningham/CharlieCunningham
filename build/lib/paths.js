'use strict';

const path = require('path');

// Repo root is two levels up from build/lib/
const ROOT_DIR = path.join(__dirname, '..', '..');

const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const ARTICLES_CONTENT_DIR = path.join(CONTENT_DIR, 'articles');
const ABOUT_CONTENT_FILE = path.join(CONTENT_DIR, 'about.json');
const IMAGES_CONTENT_DIR = path.join(CONTENT_DIR, 'images');

const SCHEMA_DIR = path.join(ROOT_DIR, 'schema');
const ARTICLE_SCHEMA_FILE = path.join(SCHEMA_DIR, 'article.schema.json');
const ABOUT_SCHEMA_FILE = path.join(SCHEMA_DIR, 'about.schema.json');

const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const TEMPLATES_DIR = path.join(ROOT_DIR, 'build', 'templates');
const PARTIALS_DIR = path.join(TEMPLATES_DIR, 'partials');

module.exports = {
  ROOT_DIR,
  CONTENT_DIR,
  ARTICLES_CONTENT_DIR,
  ABOUT_CONTENT_FILE,
  IMAGES_CONTENT_DIR,
  SCHEMA_DIR,
  ARTICLE_SCHEMA_FILE,
  ABOUT_SCHEMA_FILE,
  DIST_DIR,
  PUBLIC_DIR,
  TEMPLATES_DIR,
  PARTIALS_DIR,
};
