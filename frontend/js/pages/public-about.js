// About page motion. Progressive enhancement: every hidden/animated state is applied here, so if this
// script fails (or the visitor prefers reduced motion) the page simply stays fully visible.
(function () {
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hasIO = 'IntersectionObserver' in window;

  // ---------- Scroll reveal with staggered delays ----------
  // [selector, direction class, base delay (s), step between siblings (s)]
  const REVEALS = [
    ['.ab-motto-panel', 'ab-zoom', 0, 0],
    ['.ab-motto-word', '', 0.3, 0.16],
    ['.ab-head', '', 0, 0],
    ['.ab-mission', 'ab-left', 0, 0],
    ['.ab-vision', 'ab-right', 0.12, 0],
    ['.ab-stats', 'ab-zoom', 0, 0],
    ['.ab-values', 'ab-zoom', 0, 0],
    ['.ab-value', 'ab-fade', 0.25, 0.12],
    ['.ab-who-item', '', 0, 0.12],
    ['.ab-cta', 'ab-zoom', 0, 0],
  ];
  if (hasIO && !reduced) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        el.classList.add('ab-in');
        // Once the entrance has finished, drop the reveal classes so the element's own hover
        // transitions (and their timing) are back to normal.
        const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
        setTimeout(function () {
          el.classList.remove('ab-rv', 'ab-in', 'ab-left', 'ab-right', 'ab-zoom', 'ab-fade');
          el.style.removeProperty('--d');
        }, (d + 0.9) * 1000);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });

    REVEALS.forEach(function (r) {
      document.querySelectorAll(r[0]).forEach(function (el, i) {
        el.classList.add('ab-rv');
        if (r[1]) el.classList.add(r[1]);
        el.style.setProperty('--d', (r[2] + i * r[3]).toFixed(2) + 's');
        io.observe(el);
      });
    });
  }

  // ---------- Stats: count up from 0 ----------
  const stats = {};
  function animate(st, to) {
    cancelAnimationFrame(st.raf);
    const from = st.shown, t0 = performance.now(), dur = 1700;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      st.shown = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      st.el.textContent = st.shown + st.suffix;
      if (k < 1) st.raf = requestAnimationFrame(step);
    })(t0);
  }
  function setStat(id, n) {
    const st = stats[id];
    if (!st) return;
    st.target = Number(n);
    if (reduced || !hasIO) { st.el.textContent = st.target + st.suffix; return; }
    if (st.started) animate(st, st.target);
  }
  ['abStaff', 'abDone', 'abCats'].forEach(function (id) {
    const el = document.getElementById(id);
    const m = el && /^(\d+)(.*)$/.exec(el.textContent.trim());
    if (!m) return;
    const st = stats[id] = { el: el, target: +m[1], suffix: m[2], shown: 0, started: false, raf: 0 };
    if (reduced || !hasIO) return;
    el.textContent = '0' + st.suffix;
    const io2 = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io2.disconnect();
      st.started = true;
      animate(st, st.target);
    }, { threshold: 0.5 });
    io2.observe(el);
  });
  // Live numbers (same endpoint the home page uses). On any failure the static values stay.
  (async function () {
    try {
      const res = await apiGet('/public/home.php');
      const data = res && res.data ? res.data : {};
      if (data.staff_count) setStat('abStaff', data.staff_count);
      if (data.done_count) setStat('abDone', data.done_count);
    } catch (e) { /* keep static numbers */ }
  })();

  // ---------- How we work: steps appear in turn while the line draws ----------
  const box = document.getElementById('abSteps');
  if (box && !reduced) {
    const steps = Array.prototype.slice.call(box.querySelectorAll('.ab-step'));
    box.classList.add('ab-steps-anim');
    const wide = window.matchMedia('(min-width: 961px)');   // the line is only shown in the 4-column layout
    let queued = false;
    const update = function () {
      queued = false;
      const vh = window.innerHeight;
      if (wide.matches) {
        const p = Math.min(1, Math.max(0, (vh * 0.82 - box.getBoundingClientRect().top) / (vh * 0.42)));
        box.style.setProperty('--ab-prog', p.toFixed(3));
        steps.forEach(function (el, i) {
          el.style.transitionDelay = '';
          el.classList.toggle('on', p > 0.02 && p >= i / (steps.length - 1) - 0.02);
        });
      } else {
        let n = 0;
        steps.forEach(function (el) {
          if (el.classList.contains('on') || el.getBoundingClientRect().top > vh * 0.9) return;
          el.style.transitionDelay = (n++ * 140) + 'ms';
          el.classList.add('on');
        });
      }
    };
    const queue = function () { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }
})();
