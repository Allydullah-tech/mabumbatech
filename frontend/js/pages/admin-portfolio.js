let PORTFOLIO_ITEMS = [];
let LINKABLE_REQUESTS = [];

function populateLinkedRequestSelect(selectEl, selectedId) {
  selectEl.innerHTML = '<option value="">— None —</option>' + LINKABLE_REQUESTS.map(r =>
    `<option value="${r.id}" ${selectedId == r.id ? 'selected' : ''}>${escapeHtml(r.tracking_code)} — ${escapeHtml(r.subject)}</option>`
  ).join('');
}

async function loadPortfolio() {
  const { data } = await apiGet('/admin/portfolio.php');
  const categories = data.categories || {};
  const portfolio = data.portfolio || [];
  PORTFOLIO_ITEMS = portfolio;
  LINKABLE_REQUESTS = data.linkable_requests || [];

  const catOptions = '<option value="">General</option>' + Object.entries(categories)
    .filter(([key]) => key !== 'other_services')
    .map(([key, c]) => `<option value="${key}">${escapeHtml(c.label)}</option>`).join('');
  document.getElementById('categorySelect').innerHTML = catOptions;
  document.getElementById('editCategorySelect').innerHTML = catOptions;
  populateLinkedRequestSelect(document.getElementById('linkedRequestSelect'), null);

  document.getElementById('portfolioGrid').innerHTML = portfolio.map(p => `
    <div class="card portfolio-card">
      <div class="thumb">
        ${p.image ? `<img src="${APP_ROOT}/backend/uploads/portfolio/${encodeURIComponent(p.image)}" alt="">` : `<i class="bi bi-image"></i>`}
      </div>
      <div class="body">
        <span class="cat">${p.category_key ? escapeHtml((categories[p.category_key] || {}).label || p.category_key) : 'General'}</span>
        <h3>${escapeHtml(p.title)} ${p.is_featured == 1 ? '<span class="badge badge-ok">Featured</span>' : ''}</h3>
        <p>${escapeHtml(p.description || '')}</p>
        ${p.technologies ? `<p class="small"><i class="bi bi-code-slash"></i> ${escapeHtml(p.technologies)}</p>` : ''}
        ${p.completion_date ? `<p class="small"><i class="bi bi-calendar-check"></i> Completed ${escapeHtml(p.completion_date)}</p>` : ''}
        ${p.linked_request_id ? '<p class="small"><i class="bi bi-link-45deg"></i> Linked to a project</p>' : ''}
        <div style="display:flex;gap:6px;">
          <button class="btn btn-light btn-sm" style="flex:1;" onclick="openEditPortfolio(${p.id})"><i class="bi bi-pencil"></i> Edit</button>
          <button class="btn btn-light btn-sm" style="flex:1;" onclick="toggleFeatured(${p.id})"><i class="bi bi-star${p.is_featured == 1 ? '-fill' : ''}"></i> ${p.is_featured == 1 ? 'Unfeature' : 'Feature'}</button>
        </div>
        <button class="btn btn-light btn-sm btn-block" style="margin-top:6px;color:var(--danger);" onclick="deletePortfolioItem(${p.id})"><i class="bi bi-trash"></i> Remove</button>
      </div>
    </div>`).join('');
}

function openEditPortfolio(id) {
  const p = PORTFOLIO_ITEMS.find(x => x.id == id);
  if (!p) return;
  const form = document.getElementById('editPortfolioForm');
  form.portfolio_id.value = p.id;
  form.title.value = p.title;
  form.category_key.value = p.category_key || '';
  form.client_name.value = p.client_name || '';
  form.project_url.value = p.project_url || '';
  form.description.value = p.description || '';
  form.technologies.value = p.technologies || '';
  form.project_outcome.value = p.project_outcome || '';
  form.completion_date.value = p.completion_date || '';
  form.is_featured.checked = p.is_featured == 1;
  populateLinkedRequestSelect(document.getElementById('editLinkedRequestSelect'), p.linked_request_id);
  openModal('editPortfolioModal');
}

async function toggleFeatured(id) {
  const { data } = await apiPost('/admin/portfolio.php', { action: 'toggle_featured', portfolio_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadPortfolio();
}

async function deletePortfolioItem(id) {
  if (!confirm('Delete this portfolio item?')) return;
  const { data } = await apiPost('/admin/portfolio.php', { action: 'delete', portfolio_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadPortfolio();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Portfolio', crumb: 'Admin / Operations / Portfolio', activeKey: 'portfolio', allowedRoles: ['admin'], anyPermission: ['portfolio.manage'] });
  if (!user) return;
  await loadPortfolio();

  document.getElementById('addPortfolioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'add');
    const { data } = await apiPost('/admin/portfolio.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { e.target.reset(); loadPortfolio(); }
  });

  document.getElementById('editPortfolioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'update');
    const { data } = await apiPost('/admin/portfolio.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('editPortfolioModal'); loadPortfolio(); }
  });
})();
