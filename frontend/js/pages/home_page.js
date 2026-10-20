// ---------------------------------------------------------------------------------------------
// Landing page motion: hero stats count up, "How it works" line draws on scroll, work tiles tilt.
// Everything here is progressive enhancement: with JS off (or reduced motion) the final content is shown.
// ---------------------------------------------------------------------------------------------
const LP_REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// --- Hero stats: count from 0 up to the value (8+, 40+ ...). The script sits at the end of <body>, so the
// elements already exist and we can zero them before the first paint of the numbers. ---
const lpStats = {};
function lpAnimateStat(st, to) {
  cancelAnimationFrame(st.raf);
  const from = st.shown, dur = 1600, t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    st.shown = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));   // ease-out
    st.el.textContent = st.shown + st.suffix;
    if (k < 1) st.raf = requestAnimationFrame(step);
  })(t0);
}
// Called again when the live numbers arrive from the API: re-animates smoothly to the new value.
function lpSetStat(id, n) {
  const st = lpStats[id];
  if (!st) return;
  st.target = Number(n);
  if (LP_REDUCED) { st.el.textContent = st.target + st.suffix; return; }
  if (st.started) lpAnimateStat(st, st.target);
}
(function initStats() {
  document.querySelectorAll('.lp-stats b').forEach(function (el) {
    const m = /^(\d+)(.*)$/.exec(el.textContent.trim());
    if (!m) return;
    const st = { el: el, target: +m[1], suffix: m[2], shown: 0, started: false, raf: 0 };
    lpStats[el.id || ('stat' + Object.keys(lpStats).length)] = st;
    if (LP_REDUCED) return;
    el.textContent = '0' + st.suffix;
    const start = function () {
      if (st.started) return;
      st.started = true;
      lpAnimateStat(st, st.target);
    };
    if (!('IntersectionObserver' in window)) { start(); return; }
    // Wait for the hero entrance (~0.7s) and for the numbers to actually be on screen.
    const io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setTimeout(start, Math.max(0, 750 - performance.now()));
    }, { threshold: 0.4 });
    io.observe(el);
  });
})();

// --- "How it works": steps appear one after another while the connecting line draws from 1 to 4. ---
(function initSteps() {
  const box = document.getElementById('lpSteps');
  if (!box || LP_REDUCED) return;
  const steps = Array.prototype.slice.call(box.querySelectorAll('.lp-step'));
  box.classList.add('lp-steps-anim');
  const wide = window.matchMedia('(min-width: 961px)');   // below this the line is hidden (2 / 1 columns)
  let queued = false;
  function update() {
    queued = false;
    const vh = window.innerHeight;
    if (wide.matches) {
      // Progress 0 -> 1 while the block travels from 82% down the viewport up to ~40%.
      const p = Math.min(1, Math.max(0, (vh * 0.82 - box.getBoundingClientRect().top) / (vh * 0.42)));
      box.style.setProperty('--lp-prog', p.toFixed(3));
      steps.forEach(function (el, i) {
        el.style.transitionDelay = '';
        el.classList.toggle('on', p > 0.02 && p >= i / (steps.length - 1) - 0.02);
      });
    } else {
      let n = 0;
      steps.forEach(function (el) {
        if (el.classList.contains('on') || el.getBoundingClientRect().top > vh * 0.9) return;
        el.style.transitionDelay = (n++ * 140) + 'ms';   // stagger those that enter together
        el.classList.add('on');
      });
    }
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();

// --- Featured work tiles tilt toward the mouse. The tiles are injected later by the API call below, so
// the listeners live on the grid (event delegation). Mouse/trackpad only. ---
(function initTilt() {
  const grid = document.getElementById('featuredWorkGrid');
  if (!grid || LP_REDUCED || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  grid.addEventListener('pointermove', function (e) {
    const t = e.target.closest && e.target.closest('.lp-work-tile');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    t.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
    t.style.setProperty('--rx', ((0.5 - py) * 8).toFixed(2) + 'deg');
    t.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    t.style.setProperty('--my', (py * 100).toFixed(1) + '%');
  });
  grid.addEventListener('pointerout', function (e) {
    const t = e.target.closest && e.target.closest('.lp-work-tile');
    if (!t || t.contains(e.relatedTarget)) return;
    t.style.removeProperty('--rx');
    t.style.removeProperty('--ry');
  });
})();

// Scroll-reveal for landing sections. Elements are only hidden by JS (the .reveal class is
// added here), so if this never runs the content simply stays visible.
document.addEventListener('DOMContentLoaded', function () {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  els.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
});

// Mobile nav toggle (header is static HTML on this page). Delegated, because the Login button area is
// re-rendered below for signed-in users, which replaces the hamburger button itself.
(function () {
  function setOpen(open) {
    const links = document.querySelector('.nav-links');
    const toggle = document.querySelector('.nav-toggle');
    if (!links) return;
    links.classList.toggle('open-mobile', open);
    links.style.display = open ? 'flex' : '';
    document.body.classList.toggle('sidebar-lock-scroll', open);
    if (toggle) {
      toggle.innerHTML = open ? '<i class="bi bi-x-lg"></i>' : '<i class="bi bi-list"></i>';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }
  document.addEventListener('click', function (e) {
    const links = document.querySelector('.nav-links');
    if (!links) return;
    if (e.target.closest('.nav-toggle')) { setOpen(!links.classList.contains('open-mobile')); return; }
    if (links.classList.contains('open-mobile') && (e.target.closest('.nav-links a') || !e.target.closest('.topbar'))) setOpen(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 960) setOpen(false); });
  window.addEventListener('pageshow', function () { setOpen(false); });   // Back button restores a closed menu
})();

(async function () {
  // Swap Login -> Dashboard if a session already exists. Never blocks the page —
  // if this fails for any reason, the static Login button underneath still works fine.
  try {
    await loadSession();
    if (CURRENT_USER) {
      // Customer accounts have been removed — the only accounts left are Staff/Admin.
      const home = CURRENT_USER.role === 'staff' ? 'staff/dashboard.html' : 'admin/dashboard.html';
      document.getElementById('navCta').innerHTML = `
        <a href="${home}" class="btn btn-primary btn-sm"><i class="bi bi-speedometer2"></i> Dashboard</a>
        <button class="nav-toggle" aria-label="Menu"><i class="bi bi-list"></i></button>`;
    }
  } catch (e) { /* keep the static Login button as-is */ }

  // Load live services + stats. On any failure, the static fallback content already in the HTML stays visible.
  try {
    const { data } = await apiGet('/public/home.php');

    if (data.staff_count) lpSetStat('statStaff', data.staff_count);
    if (data.done_count) lpSetStat('statDone', data.done_count);

    if (data.services && data.services.length) {
      const list = data.services.slice(0, 4);
      document.getElementById('servicesList').innerHTML = list.map((s) => `
        <div class="svc-item">
          <span class="svc-ic"><i class="bi ${escapeHtml(s.icon)}"></i></span>
          <h3>${escapeHtml(s.name)}</h3>
          <p>${escapeHtml(s.description || '')}</p>
        </div>`).join('');
    }

    // Only show the Featured Work section if there's real portfolio content —
    // no placeholder projects, per the "don't invent achievements" rule.
    if (data.portfolio && data.portfolio.length) {
      document.getElementById('featuredWorkSection').style.display = '';
      const catLabels = {
        web_dev: 'Web Development', app_dev: 'App Development', software_hardware: 'Software & Hardware',
        it_consultancy: 'IT Consultancy', ai_ml: 'AI/ML Projects', multimedia: 'Multimedia & Animation',
        graphics: 'Graphics Design', other_services: 'Digital Services',
      };
      document.getElementById('featuredWorkGrid').innerHTML = data.portfolio.slice(0, 4).map(p => `
        <a class="lp-work-tile" href="public/portfolio.html" title="${escapeHtml(p.title)}">
          <span class="lp-work-thumb">
            ${p.image ? `<img src="${APP_ROOT}/backend/uploads/portfolio/${encodeURIComponent(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy">` : `<i class="bi bi-image"></i>`}
            <span class="lp-work-cat">${escapeHtml(catLabels[p.category_key] || 'Project')}</span>
            <span class="lp-work-hover"><span>View project <i class="bi bi-arrow-right"></i></span></span>
          </span>
          <span class="lp-work-info">
            <span class="lp-work-title">
              <b>${escapeHtml(p.title)}</b>
              <i class="bi bi-arrow-up-right lp-work-go"></i>
            </span>
            ${p.client_name ? `<span class="lp-work-client">${escapeHtml(p.client_name)}</span>` : ''}
            ${p.description ? `<span class="lp-work-desc">${escapeHtml(p.description)}</span>` : ''}
          </span>
        </a>`).join('');
    }
  } catch (e) { /* keep the static fallback services already in the HTML */ }
})();

// Hero headline: the phrase after "Turning ideas into" types itself out, is deleted, and the next one is typed.
document.addEventListener('DOMContentLoaded', function () {
  const el = document.querySelector('#lpRot .lp-rot-word');
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // keep the static first phrase
  const phrases = ['smart solutions', 'digital growth', 'real results', 'working software', 'lasting impact'];
  let pi = 0, ci = phrases[0].length, deleting = false;
  (function tick() {
    const word = phrases[pi];
    let delay = deleting ? 45 : 95;
    if (!deleting && ci === word.length) { deleting = true; setTimeout(tick, 2000); return; } // pause on full phrase
    ci += deleting ? -1 : 1;
    el.textContent = word.slice(0, ci);
    if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; delay = 350; }
    setTimeout(tick, delay);
  })();
});
