/* ═══════════════════════════════════════════════════════════════════
   SAOS · Domain — shared site behavior (Task 14-b, mobile revolution)
   One mobile menu for every front of this home, zero dependencies:

   - .nhead fronts: injects a 44px burger into the header and turns the
     page's own .links row into an accessible dropdown (each page keeps
     its own links — nothing is duplicated here).
   - fronts without any nav (gate, net, acid): injects burger + panel
     with the shared cross-site link set below.
   - Menu discipline: aria-expanded + aria-controls, Escape closes,
     outside tap closes, link tap closes, closes on hash navigation.
   - Skips index.html (it carries its own wired SPA menu, #burger).

   Progressive enhancement: the `js` class lands on <html> only here,
   so a JS-less browser keeps the plain inline link row. Defer-loaded.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  doc.documentElement.classList.add('js');

  /* shared cross-site links for fronts that ship without a nav row.
     Depth-aware (Task 15-a): hub/ inner pages and market/ resolve back
     to the site root; at the root the prefix is empty → identical
     hrefs to the ones the root fronts always used. */
  var BASE = (function () {
    var path = location.pathname;
    var seg = path.split('/').filter(Boolean);
    var i = seg.indexOf('Domain'); /* GitHub Pages project-path home */
    var isDir = path.slice(-1) === '/'; /* /Domain/hub/ must count its dir */
    var depth = (i >= 0) ? (seg.length - i - (isDir ? 1 : 2))
                         : (seg.length - (isDir ? 0 : 1));
    return depth > 0 ? '../'.repeat(depth) : '';
  })();
  var SHARED_LINKS = [
    { href: 'index.html',  label: 'הקונסולה · Console' },
    { href: 'truth.html',  label: 'שער האמת · Truth' },
    { href: 'net.html',    label: 'הרשת החיה · Network' },
    { href: 'money.html',  label: 'נתיב הכסף · Money' },
    { href: 'wallet.html', label: 'ארנק · Wallet' },
    { href: 'reports.html',label: 'דוחות מצב · Reports' },
    { href: 'hub/index.html', label: 'מרכז התוכן · Content Hub' },
    { href: 'about/',      label: 'אודות · About' }
  ].map(function (item) {
    return { href: BASE + item.href, label: item.label };
  });

  function el(tag, cls, html) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  var BURGER_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  function markActive(link) {
    var here = location.pathname.replace(/\/[^/]*$/, '/');
    var href = link.getAttribute('href') || '';
    try {
      var target = new URL(href, location.href).pathname;
      if (target === location.pathname) link.setAttribute('aria-current', 'page');
    } catch (e) { /* relative resolution never throws here, kept honest */ }
  }

  function buildPanel(linksSource) {
    var panel = el('nav', 'sitenav-panel');
    panel.setAttribute('aria-label', 'תפריט האתר · Site menu');
    var links = linksSource || SHARED_LINKS;
    links.forEach(function (item) {
      var a = el('a', null, item.label);
      a.href = item.href;
      markActive(a);
      panel.appendChild(a);
    });
    return panel;
  }

  function wireToggle(btn, panel, header) {
    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      panel.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!header.classList.contains('nav-open'));
    });
    panel.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('a')) setOpen(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    doc.addEventListener('click', function (e) {
      if (header.classList.contains('nav-open') &&
          !header.contains(e.target)) setOpen(false);
    });
    window.addEventListener('hashchange', function () { setOpen(false); });
  }

  function enhanceNhead(header) {
    if (header.querySelector('.sitenav-btn')) return; // already wired
    var wrap = header.querySelector('.wrap') || header;
    var links = header.querySelector('.links');

    var btn = el('button', 'sitenav-btn', BURGER_SVG);
    btn.type = 'button';
    btn.setAttribute('aria-label', 'תפריט · Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'sitenav-panel');
    wrap.appendChild(btn);

    var panel;
    if (links) {
      /* reuse the page's own links as the panel content */
      panel = el('nav', 'sitenav-panel');
      panel.id = 'sitenav-panel';
      panel.setAttribute('aria-label', 'תפריט האתר · Site menu');
      links.querySelectorAll('a').forEach(function (a) {
        var clone = a.cloneNode(true);
        markActive(clone);
        panel.appendChild(clone);
      });
    } else {
      panel = buildPanel();
      panel.id = 'sitenav-panel';
    }
    wrap.appendChild(panel);
    wireToggle(btn, panel, header);
  }

  function enhanceGateHead(header) {
    if (header.querySelector('.sitenav-btn')) return;
    var wrap = header.querySelector('.wrap') || header;
    var btn = el('button', 'sitenav-btn', BURGER_SVG);
    btn.type = 'button';
    btn.setAttribute('aria-label', 'תפריט · Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'sitenav-panel');
    wrap.appendChild(btn);
    var panel = buildPanel();
    panel.id = 'sitenav-panel';
    wrap.appendChild(panel);
    wireToggle(btn, panel, header);
  }

  function init() {
    /* index.html owns its SPA menu (#burger + #mobnav) — never double-wire */
    if (doc.getElementById('burger')) return;
    /* Task 15-a: nav.nhead = the market/ fixed bars (same contract,
       different element); hub/ pages carry header.nhead already */
    var nhead = doc.querySelector('header.nhead, nav.nhead');
    if (nhead) { enhanceNhead(nhead); return; }
    var gateHead = doc.querySelector('header.gate-head');
    if (gateHead) { enhanceGateHead(gateHead); return; }
    /* other fronts (truth, wallet, about) keep their header actions;
       CSS alone lifts them to 44px touch targets */
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
