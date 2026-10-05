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

// Mobile nav toggle (header is static HTML on this page, so wire it up directly)
document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open-mobile');
      links.style.display = links.classList.contains('open-mobile') ? 'flex' : '';
    });
  }
});

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

    if (data.staff_count) document.getElementById('statStaff').textContent = data.staff_count + '+';
    if (data.done_count) document.getElementById('statDone').textContent = data.done_count + '+';

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
