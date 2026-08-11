'use strict';

(function () {
  const form = document.getElementById('article-form');
  const titleInput = document.getElementById('title');
  const slugInput = document.getElementById('slug');
  const publishedAtInput = document.getElementById('publishedAt');
  const updatedAtInput = document.getElementById('updatedAt');
  const updatedAtHint = document.getElementById('updatedAt-hint');
  const summaryInput = document.getElementById('summary');
  const summaryCount = document.getElementById('summary-count');
  const bodyInput = document.getElementById('body');
  const imageInput = document.getElementById('coverImage');
  const currentImageHint = document.getElementById('current-image-hint');
  const altInput = document.getElementById('alt');
  const tagsInput = document.getElementById('tags');
  const authorInput = document.getElementById('author');
  const draftInput = document.getElementById('draft');
  const submitBtn = document.getElementById('submit-btn');
  const cancelEditLink = document.getElementById('cancel-edit-link');
  const messagesEl = document.getElementById('messages');
  const publishPanelEl = document.getElementById('publish-panel');
  const pageHeading = document.getElementById('page-heading');
  const pageHint = document.getElementById('page-hint');

  let slugManuallyEdited = false;

  // --- Edit mode detection (?edit=<filename>) ---
  const params = new URLSearchParams(window.location.search);
  const editFilename = params.get('edit');
  const editMode = Boolean(editFilename);
  let originalArticle = null; // populated by loadForEdit()

  // --- Client-side slugify (advisory only - server re-slugifies authoritatively) ---
  function slugify(input) {
    return String(input || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  titleInput.addEventListener('input', () => {
    if (!slugManuallyEdited) {
      slugInput.value = slugify(titleInput.value);
    }
  });

  slugInput.addEventListener('input', () => {
    slugManuallyEdited = true;
  });

  // --- Default publishedAt to "now" in local time ---
  function localDatetimeValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  // --- Live summary character counter ---
  function updateSummaryCount() {
    const len = summaryInput.value.length;
    summaryCount.textContent = String(len);
    summaryCount.classList.toggle('over-limit', len > 300);
  }
  summaryInput.addEventListener('input', updateSummaryCount);
  updateSummaryCount();

  // --- Message rendering (never innerHTML on untrusted text) ---
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

  // --- Edit-mode setup ---
  function applyEditModeChrome() {
    pageHeading.textContent = 'Edit Article';
    pageHint.textContent =
      'Editing an existing article. "Updated" is set automatically when you save - review the changes, submit, ' +
      'then review what changed and click "Push to GitHub" when you\'re happy with it.';
    submitBtn.textContent = 'Save Changes';
    cancelEditLink.hidden = false;
    updatedAtInput.disabled = true;
    updatedAtHint.textContent = '(set automatically to now when you save this edit)';
  }

  async function loadForEdit() {
    applyEditModeChrome();
    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(editFilename)}`);
      const result = await response.json();
      if (!result.ok) {
        renderMessage('error', 'Could not load article for editing:', result.errors || ['Unknown error.']);
        return;
      }
      originalArticle = result.article;

      titleInput.value = originalArticle.title || '';
      slugInput.value = originalArticle.slug || '';
      slugManuallyEdited = true; // don't clobber the loaded slug as the title is re-edited
      publishedAtInput.value = originalArticle.publishedAt || '';
      updatedAtInput.value = originalArticle.updatedAt || '';
      summaryInput.value = originalArticle.summary || '';
      updateSummaryCount();
      bodyInput.value = originalArticle.body || '';
      tagsInput.value = Array.isArray(originalArticle.tags) ? originalArticle.tags.join(', ') : '';
      authorInput.value = originalArticle.author || '';
      draftInput.checked = Boolean(originalArticle.draft);

      if (originalArticle.coverImage) {
        altInput.value = originalArticle.coverImage.alt || '';
        currentImageHint.textContent = `Current image: ${originalArticle.coverImage.src}. Choose a new file above to replace it, or leave blank to keep it.`;
      } else {
        currentImageHint.textContent = '';
      }
    } catch (err) {
      renderMessage('error', `Could not load article for editing: ${err.message}`);
    }
  }

  if (editMode) {
    loadForEdit();
  } else {
    publishedAtInput.value = localDatetimeValue(new Date());
  }

  // --- UX-nicety client-side validation (server validates authoritatively too) ---
  function clientValidate() {
    const errors = [];
    if (!titleInput.value.trim()) errors.push('Title is required.');
    if (!publishedAtInput.value.trim()) errors.push('Published date/time is required.');
    if (!summaryInput.value.trim()) errors.push('Summary is required.');
    if (summaryInput.value.length > 300) errors.push('Summary must be 300 characters or fewer.');
    if (!bodyInput.value.trim()) errors.push('Body is required.');
    const hasNewImage = imageInput.files && imageInput.files.length > 0;
    const hasExistingImage = editMode && originalArticle && originalArticle.coverImage;
    if ((hasNewImage || (hasExistingImage && !hasNewImage)) && !altInput.value.trim()) {
      errors.push('Alt text is required when a cover image is present.');
    }
    return errors;
  }

  /**
   * Works out exactly which content/ paths this save touched, for the
   * publish-verification panel. Mirrors the server's own rename/replace
   * logic in lib/saveArticle.js so the paths shown line up with reality.
   */
  function computeTouchedPaths(result, imageFileSelected) {
    const paths = [`content/articles/${result.fileName}`];
    if (result.previousFileName) {
      paths.push(`content/articles/${result.previousFileName}`);
    }

    const slugChanged = Boolean(result.previousFileName);
    const hadOldImage = Boolean(originalArticle && originalArticle.coverImage && originalArticle.coverImage.src);

    if (imageFileSelected) {
      paths.push(`content/images/articles/${result.slug}`);
      if (hadOldImage && slugChanged) {
        paths.push(`content/images/articles/${originalArticle.slug}`);
      }
    } else if (hadOldImage) {
      if (slugChanged) {
        paths.push(`content/images/articles/${originalArticle.slug}`);
      }
      paths.push(`content/images/articles/${result.slug}`);
    }

    return paths;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessages();
    publishPanelEl.textContent = '';

    const clientErrors = clientValidate();
    if (clientErrors.length > 0) {
      renderMessage('error', 'Please fix the following before submitting:', clientErrors);
      return;
    }

    const imageFileSelected = Boolean(imageInput.files && imageInput.files.length > 0);

    submitBtn.disabled = true;
    submitBtn.textContent = editMode ? 'Saving...' : 'Saving...';

    try {
      const formData = new FormData(form);
      if (editMode) {
        // updatedAt is always server-computed on edit; don't send the
        // (disabled, stale) field value.
        formData.delete('updatedAt');
      }

      const url = editMode ? `/api/articles/${encodeURIComponent(editFilename)}` : '/api/articles';
      const method = editMode ? 'PUT' : 'POST';

      const response = await fetch(url, { method, body: formData });

      let result;
      try {
        result = await response.json();
      } catch (parseErr) {
        renderMessage('error', 'Server returned an unreadable response.');
        return;
      }

      if (result.ok) {
        renderMessage('success', `Saved: ${result.path}`);
        if (result.warnings && result.warnings.length > 0) {
          renderMessage('warning', 'Warnings:', result.warnings);
        }

        const touchedPaths = computeTouchedPaths(result, imageFileSelected);
        const defaultMessage = editMode
          ? `Update article: "${titleInput.value.trim()}"`
          : `Publish article: "${titleInput.value.trim()}"`;
        window.AuthorPublish.renderPublishPanel(publishPanelEl, { paths: touchedPaths, defaultMessage });

        if (!editMode) {
          form.reset();
          publishedAtInput.value = localDatetimeValue(new Date());
          slugManuallyEdited = false;
          updateSummaryCount();
        }
      } else {
        renderMessage('error', 'Could not save article:', result.errors || ['Unknown error.']);
      }
    } catch (err) {
      renderMessage('error', `Request failed: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editMode ? 'Save Changes' : 'Save Article';
    }
  });
})();
