/*
 * main.js
 *
 * Vanilla JS, mobile nav toggle ONLY.
 *
 * SECURITY: this script must never fetch, parse, or render article content,
 * must never use innerHTML with any dynamic/remote data, and must contain
 * no logic that could load or mutate article content client-side. All
 * article content is baked into the HTML at build time. This file's only
 * job is UI chrome: toggling the mobile nav menu.
 */

(function () {
  'use strict';

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.site-nav');

  if (!toggle || !nav) {
    return;
  }

  toggle.addEventListener('click', function () {
    var isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
})();
