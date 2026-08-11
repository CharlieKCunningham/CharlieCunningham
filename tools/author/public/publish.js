'use strict';

/**
 * Shared "Ready to publish?" panel used by both the New Article / Edit
 * Article form (form.js) and Manage Articles (manage.js).
 *
 * Nothing in this file runs on page load. renderPublishPanel() is only
 * called by form.js/manage.js after a successful save/edit/delete, and the
 * network call to POST /api/git/publish only happens if Charlie explicitly
 * clicks the "Push to GitHub" button after reviewing the git status shown
 * here. This IS the verification step - render everything from the server
 * with textContent, never innerHTML.
 */
window.AuthorPublish = (function () {
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, opts) {
    const node = document.createElement(tag);
    if (opts) {
      if (opts.className) node.className = opts.className;
      if (opts.text !== undefined) node.textContent = opts.text;
    }
    return node;
  }

  function renderErrorList(container, title, errors) {
    const box = el('div', { className: 'message message--error' });
    box.appendChild(el('div', { text: title }));
    const list = el('ul');
    for (const e of errors && errors.length ? errors : ['Unknown error.']) {
      list.appendChild(el('li', { text: e }));
    }
    box.appendChild(list);
    container.appendChild(box);
  }

  /**
   * @param {HTMLElement} container - element to render the panel into (its contents are replaced)
   * @param {{ paths: string[], defaultMessage: string }} options
   *   paths - the content/ paths this save/edit/delete touched (relative to repo root, e.g. "content/articles/2026-08-11-hello-world.json")
   *   defaultMessage - pre-filled, editable commit message
   */
  async function renderPublishPanel(container, { paths, defaultMessage }) {
    clear(container);

    if (!paths || paths.length === 0) {
      return;
    }

    container.appendChild(el('h2', { text: 'Ready to publish?' }));

    const statusBox = el('div', { className: 'publish-status' });
    statusBox.textContent = 'Checking git status...';
    container.appendChild(statusBox);

    let statusResult;
    try {
      const response = await fetch('/api/git/status');
      statusResult = await response.json();
    } catch (err) {
      clear(statusBox);
      statusBox.textContent = `Could not check git status: ${err.message}`;
      return;
    }

    clear(statusBox);

    if (!statusResult.ok) {
      renderErrorList(statusBox, 'Not set up for publishing yet:', statusResult.errors);
      return;
    }

    const isRelevant = (filePath) =>
      paths.some((p) => {
        const normalized = p.replace(/\/+$/, '');
        return filePath === normalized || filePath.startsWith(`${normalized}/`);
      });

    const relevantFiles = (statusResult.files || []).filter((f) => isRelevant(f.path));

    statusBox.appendChild(el('div', { className: 'publish-status__heading', text: 'Changed files (from git status):' }));

    if (relevantFiles.length === 0) {
      statusBox.appendChild(
        el('div', { className: 'hint', text: 'git reports no changes for these paths - there may be nothing to publish.' })
      );
    } else {
      const list = el('ul', { className: 'publish-file-list' });
      for (const f of relevantFiles) {
        list.appendChild(el('li', { text: `${f.status || '?'}  ${f.path}` }));
      }
      statusBox.appendChild(list);
    }

    const messageField = el('div', { className: 'field' });
    const messageLabel = el('label', { text: 'Commit message' });
    messageLabel.setAttribute('for', 'publish-message');
    const messageInput = document.createElement('textarea');
    messageInput.id = 'publish-message';
    messageInput.rows = 2;
    messageInput.value = defaultMessage || 'Publish article';
    messageField.appendChild(messageLabel);
    messageField.appendChild(messageInput);
    container.appendChild(messageField);

    const publishBtn = el('button', { text: 'Push to GitHub', className: 'publish-btn' });
    publishBtn.type = 'button';
    container.appendChild(publishBtn);

    const resultBox = el('div', { className: 'publish-result' });
    container.appendChild(resultBox);

    publishBtn.addEventListener('click', async () => {
      publishBtn.disabled = true;
      publishBtn.textContent = 'Pushing...';
      clear(resultBox);

      try {
        const response = await fetch('/api/git/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, message: messageInput.value }),
        });

        let result;
        try {
          result = await response.json();
        } catch (parseErr) {
          resultBox.appendChild(el('div', { className: 'message message--error', text: 'Server returned an unreadable response.' }));
          publishBtn.disabled = false;
          publishBtn.textContent = 'Push to GitHub';
          return;
        }

        if (result.ok) {
          resultBox.appendChild(el('div', { className: 'message message--success', text: `Published: ${result.commit}` }));
          publishBtn.textContent = 'Pushed';
        } else {
          renderErrorList(resultBox, 'Publish failed:', result.errors);
          publishBtn.disabled = false;
          publishBtn.textContent = 'Push to GitHub';
        }
      } catch (err) {
        resultBox.appendChild(el('div', { className: 'message message--error', text: `Request failed: ${err.message}` }));
        publishBtn.disabled = false;
        publishBtn.textContent = 'Push to GitHub';
      }
    });
  }

  return { renderPublishPanel };
})();
