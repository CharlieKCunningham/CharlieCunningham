#!/usr/bin/env node
'use strict';

/**
 * Local-only authoring tool for ChazzasBlog.
 *
 * SECURITY: This server MUST only ever bind to 127.0.0.1 (loopback). It has
 * no authentication and writes directly to the content/ directory on disk.
 * It is never run by CI/CD, never bundled into dist/, and must never be
 * exposed to a network or the internet. See README.md.
 */

const path = require('path');
const express = require('express');
const multer = require('multer');

const saveArticle = require('./lib/saveArticle');
const slugify = require('./lib/slugify');
const { listArticles, getArticleByFilename, deleteArticleByFilename } = require('./lib/articles');
const { isValidFilename } = require('./lib/articleFilename');
const git = require('./lib/git');

const app = express();
const PORT = 3001;
const HOST = '127.0.0.1'; // loopback ONLY - never 0.0.0.0, never omitted

const PUBLIC_DIR = path.join(__dirname, 'public');

// Accept a single optional image file in memory (never written to disk
// until saveArticle validates it) plus the rest of the form as text fields.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap, enforced again in saveArticle
});

app.disable('x-powered-by');

// Parses application/json bodies (used only by /api/git/publish). Does not
// interfere with the multipart/form-data routes below, which multer parses.
app.use(express.json({ limit: '256kb' }));

// GET / and static assets (index.html, manage.html, form.css, form.js, manage.js)
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

/**
 * Builds the saveArticle()/updateArticle() input object from a parsed
 * multipart form body + optional uploaded file. Shared by POST and PUT so
 * both routes parse the form identically.
 */
function buildArticleInput(body, file) {
  const tags = String(body.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const draft = body.draft === 'on' || body.draft === 'true' || body.draft === '1';

  // Never trust the client's slug blindly - re-slugify it through the
  // exact same function the client used for its live preview.
  const rawSlug = typeof body.slug === 'string' ? slugify(body.slug) : '';

  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    slug: rawSlug,
    publishedAt: typeof body.publishedAt === 'string' ? body.publishedAt.trim() : '',
    updatedAt: typeof body.updatedAt === 'string' && body.updatedAt.trim() ? body.updatedAt.trim() : undefined,
    summary: typeof body.summary === 'string' ? body.summary.trim() : '',
    body: typeof body.body === 'string' ? body.body : '',
    tags,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : undefined,
    draft,
    alt: typeof body.alt === 'string' ? body.alt.trim() : '',
    imageFile: file || undefined,
  };
}

function handleUpload(req, res, next) {
  upload.single('coverImage')(req, res, (uploadErr) => {
    if (uploadErr) {
      const message =
        uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Cover image is too large. Max allowed is 5MB.'
          : `Upload error: ${uploadErr.message}`;
      return res.status(400).json({ ok: false, errors: [message] });
    }
    next();
  });
}

app.get('/api/articles', (req, res) => {
  try {
    return res.status(200).json(listArticles());
  } catch (err) {
    console.error('[author-tool] Unexpected error handling GET /api/articles:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

app.get('/api/articles/:filename', (req, res) => {
  try {
    const result = getArticleByFilename(req.params.filename);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, errors: result.errors });
    }
    return res.status(200).json({ ok: true, filename: result.filename, article: result.article });
  } catch (err) {
    console.error('[author-tool] Unexpected error handling GET /api/articles/:filename:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

app.post('/api/articles', handleUpload, (req, res) => {
  try {
    const input = buildArticleInput(req.body || {}, req.file);
    const result = saveArticle(input);

    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  } catch (err) {
    console.error('[author-tool] Unexpected error handling POST /api/articles:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

app.put('/api/articles/:filename', (req, res, next) => {
  if (!isValidFilename(req.params.filename)) {
    return res.status(400).json({ ok: false, errors: ['Invalid article filename.'] });
  }
  next();
}, handleUpload, (req, res) => {
  try {
    const input = buildArticleInput(req.body || {}, req.file);
    const result = saveArticle.updateArticle(req.params.filename, input);

    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[author-tool] Unexpected error handling PUT /api/articles/:filename:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

app.delete('/api/articles/:filename', (req, res) => {
  try {
    const result = deleteArticleByFilename(req.params.filename);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, errors: result.errors });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[author-tool] Unexpected error handling DELETE /api/articles/:filename:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

// --- Git "publish" step: explicit, Charlie-confirmed, NEVER automatic. ---
// Nothing above this line ever touches git. Only these two routes do, and
// only when the frontend explicitly calls them after a second confirming
// click (see public/manage.js / public/form.js).

app.get('/api/git/status', async (req, res) => {
  try {
    const result = await git.getStatus();
    return res.status(200).json(result);
  } catch (err) {
    console.error('[author-tool] Unexpected error handling GET /api/git/status:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

app.post('/api/git/publish', async (req, res) => {
  try {
    const body = req.body || {};
    const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string') : [];
    const message = typeof body.message === 'string' ? body.message : '';
    const fallbackMessage = typeof body.fallbackMessage === 'string' ? body.fallbackMessage : undefined;

    const result = await git.publish({ paths, message, fallbackMessage });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[author-tool] Unexpected error handling POST /api/git/publish:', err);
    return res.status(500).json({ ok: false, errors: ['Unexpected server error. See server console for details.'] });
  }
});

app.listen(PORT, HOST, () => {
  const banner = [
    '',
    '################################################################',
    '#                                                              #',
    '#   ChazzasBlog LOCAL AUTHORING TOOL                           #',
    '#                                                              #',
    '#   This server is LOCAL-ONLY DEVELOPMENT TOOLING.             #',
    '#   It has NO authentication and writes directly to content/.  #',
    '#                                                              #',
    '#   * NEVER expose this to the internet.                       #',
    '#   * NEVER deploy this alongside the public site.             #',
    '#   * NEVER bind it to anything but 127.0.0.1.                 #',
    '#                                                              #',
    `#   Listening on: http://${HOST}:${PORT}                        `,
    '#                                                              #',
    '################################################################',
    '',
  ].join('\n');
  console.log(banner);
});
