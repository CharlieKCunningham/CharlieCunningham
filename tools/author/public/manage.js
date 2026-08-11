'use strict';

(function () {
  const listStatusEl = document.getElementById('list-status');
  const listEl = document.getElementById('article-list');
  const rowTemplate = document.getElementById('article-row-template');
  const messagesEl = document.getElementById('messages');
  const publishPanelEl = document.getElementById('publish-panel');

  function clearMessages() {
    messagesEl.textContent = '';
  }

  function renderMessage(kind, title, details) {
    const box = document.createElement('div');
    box.className = `message message--${kind}`;

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    box.appendChild(titleEl);

    if (details && details.length) {
      const list = document.createElement('ul');
      for (const item of details) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }
      box.appendChild(list);
    }

    messagesEl.appendChild(box);
  }

  function formatPublishedAt(value) {
    // publishedAt is the literal YYYY-MM-DDTHH:mm string (not timezone-aware) -
    // display it plainly rather than reinterpreting it through Date/timezone.
    return value ? value.replace('T', ' ') : '(no date)';
  }

  async function loadArticles() {
    listStatusEl.textContent = 'Loading articles...';
    listStatusEl.hidden = false;
    listEl.textContent = '';

    try {
      const response = await fetch('/api/articles');
      const articles = await response.json();

      if (!Array.isArray(articles)) {
        listStatusEl.textContent = 'Unexpected response from server while loading articles.';
        return;
      }

      if (articles.length === 0) {
        listStatusEl.textContent = 'No articles yet. Use "New Article" to create one.';
        return;
      }

      listStatusEl.hidden = true;

      for (const article of articles) {
        listEl.appendChild(renderArticleRow(article));
      }
    } catch (err) {
      listStatusEl.hidden = false;
      listStatusEl.textContent = `Could not load articles: ${err.message}`;
    }
  }

  function renderArticleRow(article) {
    const fragment = rowTemplate.content.cloneNode(true);
    const li = fragment.querySelector('.article-row');
    const titleEl = fragment.querySelector('.article-row__title');
    const draftBadge = fragment.querySelector('.article-row__draft-badge');
    const metaEl = fragment.querySelector('.article-row__meta');
    const editLink = fragment.querySelector('.article-row__edit-link');
    const deleteBtn = fragment.querySelector('.article-row__delete-btn');

    titleEl.textContent = article.title || '(untitled)';
    if (article.error) {
      titleEl.textContent = `${article.filename} - unreadable file`;
    }

    draftBadge.hidden = !article.draft;

    const metaParts = [];
    metaParts.push(`Published: ${formatPublishedAt(article.publishedAt)}`);
    if (article.updatedAt) {
      metaParts.push(`Updated: ${formatPublishedAt(article.updatedAt)}`);
    }
    metaParts.push(article.filename);
    metaEl.textContent = metaParts.join('  |  ');

    editLink.href = `/index.html?edit=${encodeURIComponent(article.filename)}`;
    editLink.textContent = 'Edit';

    deleteBtn.addEventListener('click', () => onDeleteClick(article, li));

    return fragment;
  }

  async function onDeleteClick(article, rowEl) {
    const confirmed = window.confirm(`Delete "${article.title || article.filename}"? This removes the article JSON file (and its image folder, if any) immediately.`);
    if (!confirmed) return;

    clearMessages();
    publishPanelEl.textContent = '';

    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(article.filename)}`, { method: 'DELETE' });
      const result = await response.json();

      if (!result.ok) {
        renderMessage('error', 'Could not delete article:', result.errors || ['Unknown error.']);
        return;
      }

      renderMessage('success', `Deleted: ${result.filename}`);

      const touchedPaths = [`content/articles/${result.filename}`];
      if (result.imageDirDeleted && result.slug) {
        touchedPaths.push(`content/images/articles/${result.slug}`);
      }
      window.AuthorPublish.renderPublishPanel(publishPanelEl, {
        paths: touchedPaths,
        defaultMessage: `Remove article: "${article.title || article.filename}"`,
      });

      await loadArticles();
    } catch (err) {
      renderMessage('error', `Request failed: ${err.message}`);
    }
  }

  loadArticles();
})();
