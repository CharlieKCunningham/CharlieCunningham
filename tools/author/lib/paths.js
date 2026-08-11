'use strict';

const path = require('path');

// tools/author/lib/paths.js -> lib -> tools/author -> tools -> repo root
const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const ARTICLES_DIR = path.join(CONTENT_DIR, 'articles');
const IMAGES_ARTICLES_DIR = path.join(CONTENT_DIR, 'images', 'articles');

module.exports = { ROOT_DIR, CONTENT_DIR, ARTICLES_DIR, IMAGES_ARTICLES_DIR };
