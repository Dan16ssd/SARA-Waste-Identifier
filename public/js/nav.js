(function () {
  'use strict';

  const nav = document.querySelector('nav');
  if (!nav) return;

  // ── Build the hamburger toggle button ─────────────────────────────────────
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML =
    '<span class="nav-toggle-bar"></span>' +
    '<span class="nav-toggle-bar"></span>' +
    '<span class="nav-toggle-bar"></span>';

  const brand = nav.querySelector('.brand');
  if (brand) {
    brand.insertAdjacentElement('afterend', toggle);
  } else {
    nav.appendChild(toggle);
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function openMenu() {
    nav.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    nav.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    if (nav.classList.contains('nav-open')) closeMenu();
    else openMenu();
  });

  // Close on link click, outside click, or Escape
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', function (e) {
    if (nav.classList.contains('nav-open') && !nav.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('nav-open')) closeMenu();
  });
})();
