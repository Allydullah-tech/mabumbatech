// Shared motion for the public inner pages (body.pm-page). Progressive enhancement: reveal classes are
// added here, so if this fails (or the visitor prefers reduced motion) everything simply stays visible.
// Also handles cards that other scripts inject later (team, portfolio, track results ...).
(function () {
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduced || !('IntersectionObserver' in window)) return;

  // [selector, direction class, base delay (s), step between siblings (s)]
  // Elements that already have their own entrance (portfolio cards, services .sv-reveal) are left out.
  const REVEALS = [
    ['.team-card', 'pm-zoom', 0, 0.09],
    ['.ct-info', 'pm-left', 0, 0],
    ['.ct-form', 'pm-right', 0.12, 0],
    ['.ct-list li', '', 0.35, 0.12],
    ['.tr-search', 'pm-zoom', 0, 0],
    ['.tr-step', '', 0.1, 0.14],
    ['.tr-card', '', 0, 0.1],
    ['.rs-card', 'pm-left', 0, 0],
    ['.rs-panel', 'pm-right', 0.15, 0.15],
    ['.rs-sec', '', 0.1, 0.12],
    ['#termsPageContent', 'pm-zoom', 0, 0],
    ['.terms-toc', '', 0.1, 0],
    ['.pfx-stats > div', '', 0.1, 0.12],
  ];
  const CLASSES = ['pm-rv', 'pm-in', 'pm-left', 'pm-right', 'pm-zoom'];

  // threshold 0 on purpose: very tall elements (the terms text) never reach a high intersection ratio.
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      el.classList.add('pm-in');
      const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
      // After the entrance, drop the classes so the element's own hover transitions are back to normal.
      setTimeout(function () {
        CLASSES.forEach(function (c) { el.classList.remove(c); });
        el.style.removeProperty('--d');
      }, (d + 0.9) * 1000);
    });
  }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });

  function scan(root) {
    REVEALS.forEach(function (r) {
      const found = [];
      if (root.matches && root.matches(r[0])) found.push(root);
      if (root.querySelectorAll) root.querySelectorAll(r[0]).forEach(function (el) { found.push(el); });
      let i = 0;
      found.forEach(function (el) {
        if (el.dataset.pm) return;           // already handled
        el.dataset.pm = '1';
        el.classList.add('pm-rv');
        if (r[1]) el.classList.add(r[1]);
        el.style.setProperty('--d', (r[2] + Math.min(i++, 8) * r[3]).toFixed(2) + 's');
        io.observe(el);
      });
    });
  }
  scan(document.body);

  // Pick up elements injected later by the page scripts (queued, one pass per frame).
  const queue = [];
  let scheduled = false;
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) { if (n.nodeType === 1) queue.push(n); });
    });
    if (scheduled || !queue.length) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      queue.splice(0).forEach(scan);
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Terms page: thin reading-progress bar at the top.
  if (document.getElementById('termsPageContent')) {
    const bar = document.createElement('div');
    bar.className = 'pm-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    let q = false;
    const upd = function () {
      q = false;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0).toFixed(4) + ')';
    };
    window.addEventListener('scroll', function () { if (!q) { q = true; requestAnimationFrame(upd); } }, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  }
})();
