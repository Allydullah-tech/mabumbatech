let ALL_PORTFOLIO = [];
let CURRENT_LIST = [];

function categoryLabel(key) {
  const map = {
    web_dev: 'Web Development', app_dev: 'App Development', software_hardware: 'Software & Hardware Solutions',
    it_consultancy: 'IT Consultancy', ai_ml: 'AI/ML Projects', multimedia: 'Multimedia/Animation Projects',
    graphics: 'Graphics Designing', other_services: 'All Other Digital Services',
  };
  return map[key] || key;
}

/** Only real web links are ever turned into a clickable "Visit website" button. */
function safeProjectUrl(u) {
  const url = (u || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function pfDate(d) {
  if (!d) return '';
  const dt = new Date(String(d).replace(' ', 'T'));
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function pfTechList(p) {
  return (p.technologies || '').split(',').map(t => t.trim()).filter(Boolean);
}

function pfImage(p, cls) {
  return p.image
    ? `<img class="${cls || ''}" src="${APP_ROOT}/backend/uploads/portfolio/${encodeURIComponent(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy">`
    : `<i class="bi bi-briefcase"></i>`;
}

function renderPortfolioGrid(list) {
  const container = document.getElementById('portfolioContainer');
  CURRENT_LIST = list;
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><i class="bi bi-folder2-open"></i><p>No projects in this category yet.</p></div>`;
    return;
  }
  container.innerHTML = `<div class="pfx-grid">` + list.map((p, i) => {
    const tech = pfTechList(p);
    const url = safeProjectUrl(p.project_url);
    const date = pfDate(p.completion_date);
    return `
    <article class="pfx-card" style="--i:${i}" data-i="${i}" tabindex="0" role="button" aria-label="View details: ${escapeHtml(p.title)}">
      <div class="pfx-thumb">
        ${pfImage(p)}
        <span class="pfx-cat">${p.category_key ? escapeHtml(categoryLabel(p.category_key)) : 'Project'}</span>
        ${Number(p.is_featured) === 1 ? `<span class="pfx-feat"><i class="bi bi-star-fill"></i> Featured</span>` : ''}
        <span class="pfx-hover"><span>View details <i class="bi bi-arrow-right"></i></span></span>
      </div>
      <div class="pfx-body">
        <h3>${escapeHtml(p.title)}</h3>
        ${p.client_name ? `<span class="pfx-client"><i class="bi bi-building"></i> ${escapeHtml(p.client_name)}</span>` : ''}
        ${p.description ? `<p class="pfx-desc">${escapeHtml(p.description)}</p>` : ''}
        ${tech.length ? `<div class="pfx-tech">${tech.slice(0, 4).map(t => `<span>${escapeHtml(t)}</span>`).join('')}${tech.length > 4 ? `<span class="more">+${tech.length - 4}</span>` : ''}</div>` : ''}
      </div>
      <div class="pfx-foot">
        <span class="pfx-date">${date ? `<i class="bi bi-calendar3"></i> ${escapeHtml(date)}` : ''}</span>
        ${url
          ? `<a class="pfx-visit" href="${escapeHtml(url)}" target="_blank" rel="noopener">Visit website <i class="bi bi-arrow-up-right"></i></a>`
          : `<span class="pfx-more">Details <i class="bi bi-arrow-right"></i></span>`}
      </div>
    </article>`;
  }).join('') + `</div>`;

  container.querySelectorAll('.pfx-card').forEach(card => {
    const open = () => openProjectModal(Number(card.dataset.i));
    card.addEventListener('click', (e) => { if (e.target.closest('.pfx-visit')) return; open(); });
    card.addEventListener('keydown', (e) => {
      if (e.target !== card) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

/* ---------- Project detail (case study) popup ---------- */
let pfxLastFocus = null;

function ensureProjectModal() {
  let m = document.getElementById('pfxModal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'pfxModal';
  m.className = 'pfx-modal';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-labelledby', 'pfxModalTitle');
  m.innerHTML = `<div class="pfx-modal-box"><button type="button" class="pfx-close" aria-label="Close"><i class="bi bi-x-lg"></i></button><div id="pfxModalContent"></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.pfx-close')) closeProjectModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProjectModal(); });
  return m;
}

function openProjectModal(i) {
  const p = CURRENT_LIST[i];
  if (!p) return;
  const m = ensureProjectModal();
  const tech = pfTechList(p);
  const url = safeProjectUrl(p.project_url);
  const date = pfDate(p.completion_date);
  pfxLastFocus = document.activeElement;
  document.getElementById('pfxModalContent').innerHTML = `
    <div class="pfx-m-grid">
      <div class="pfx-m-media">${pfImage(p)}</div>
      <div class="pfx-m-info">
        <span class="pfx-m-cat">${p.category_key ? escapeHtml(categoryLabel(p.category_key)) : 'Project'}</span>
        <h3 id="pfxModalTitle">${escapeHtml(p.title)}</h3>
        <div class="pfx-m-meta">
          ${p.client_name ? `<span><i class="bi bi-building"></i> ${escapeHtml(p.client_name)}</span>` : ''}
          ${date ? `<span><i class="bi bi-calendar3"></i> ${escapeHtml(date)}</span>` : ''}
        </div>
        ${p.description ? `<h4>About the project</h4><p>${escapeHtml(p.description)}</p>` : ''}
        ${p.project_outcome ? `<div class="pfx-m-outcome"><h4><i class="bi bi-trophy"></i> Outcome</h4><p>${escapeHtml(p.project_outcome)}</p></div>` : ''}
        ${tech.length ? `<h4>Technologies</h4><div class="pfx-tech">${tech.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${url ? `<a class="btn btn-primary pfx-m-visit" href="${escapeHtml(url)}" target="_blank" rel="noopener">Visit website <i class="bi bi-arrow-up-right"></i></a>` : ''}
      </div>
    </div>`;
  m.classList.add('show');
  document.body.classList.add('pfx-lock');
  const close = m.querySelector('.pfx-close');
  if (close) close.focus();
}

function closeProjectModal() {
  const m = document.getElementById('pfxModal');
  if (!m || !m.classList.contains('show')) return;
  m.classList.remove('show');
  document.body.classList.remove('pfx-lock');
  if (pfxLastFocus && pfxLastFocus.focus) pfxLastFocus.focus();
}

function applyPortfolioFilter(category) {
  document.querySelectorAll('#portfolioFilterTabs a').forEach(a => a.classList.toggle('active', a.dataset.cat === category));
  const list = category === 'all' ? ALL_PORTFOLIO : ALL_PORTFOLIO.filter(p => p.category_key === category);
  renderPortfolioGrid(list);
}

/** Real numbers only (from the portfolio itself): projects, categories, clients. */
function renderPortfolioStats() {
  const head = document.querySelector('.section-head');
  if (!head || head.querySelector('.pfx-stats')) return;
  const cats = new Set(ALL_PORTFOLIO.map(p => p.category_key).filter(Boolean)).size;
  const clients = new Set(ALL_PORTFOLIO.map(p => (p.client_name || '').trim().toLowerCase()).filter(Boolean)).size;
  const items = [[ALL_PORTFOLIO.length, ALL_PORTFOLIO.length === 1 ? 'Project' : 'Projects']];
  if (cats) items.push([cats, cats === 1 ? 'Category' : 'Categories']);
  if (clients) items.push([clients, clients === 1 ? 'Client' : 'Clients']);
  head.insertAdjacentHTML('beforeend', `<div class="pfx-stats">${items.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>`);
}

(async function () {
  await initPublicLayout('portfolio');
  const { data } = await apiGet('/public/portfolio.php');
  ALL_PORTFOLIO = data.portfolio || [];
  const container = document.getElementById('portfolioContainer');

  if (!ALL_PORTFOLIO.length) {
    container.innerHTML = `<div class="empty-state"><i class="bi bi-folder2-open"></i><p>Portfolio items will appear here once added by our team.</p></div>`;
    return;
  }
  renderPortfolioStats();

  // Only show filter tabs for categories that actually have at least one project.
  const presentCats = [...new Set(ALL_PORTFOLIO.map(p => p.category_key).filter(Boolean))];
  if (presentCats.length > 1) {
    const count = c => c === 'all' ? ALL_PORTFOLIO.length : ALL_PORTFOLIO.filter(p => p.category_key === c).length;
    const tabsHtml = ['all', ...presentCats].map(c =>
      `<a href="#" data-cat="${c}" class="${c === 'all' ? 'active' : ''}">${c === 'all' ? 'All Projects' : escapeHtml(categoryLabel(c))} <span class="n">${count(c)}</span></a>`
    ).join('');
    document.getElementById('portfolioFilterTabs').innerHTML = tabsHtml;
    document.querySelectorAll('#portfolioFilterTabs a').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); applyPortfolioFilter(a.dataset.cat); });
    });
  }

  renderPortfolioGrid(ALL_PORTFOLIO);
})();
