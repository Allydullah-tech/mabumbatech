let CURRENT_PAGE = 1;
let DEBOUNCE_TIMER = null;

function actorRoleLabel(role) {
  if (!role) return 'System';
  const map = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', customer: 'Customer' };
  return map[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderLogs(data) {
  document.getElementById('logCount').textContent = data.total;
  const body = document.getElementById('logBody');

  if (!data.logs.length) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-clock-history"></i>No activity matches your search.</div>`;
    document.getElementById('pager').innerHTML = '';
    return;
  }

  body.innerHTML = `
    <table class="tbl">
      <thead><tr><th>When</th><th>Who</th><th>Role</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
      <tbody>
        ${data.logs.map(l => `
          <tr>
            <td style="white-space:nowrap;">${escapeHtml(formatLogTime(l.created_at))}</td>
            <td>${escapeHtml(l.actor_name || 'Deleted account')}</td>
            <td>${escapeHtml(actorRoleLabel(l.actor_role))}</td>
            <td>${escapeHtml(l.action)}</td>
            <td>${escapeHtml(l.details || '—')}</td>
            <td style="white-space:nowrap;color:var(--ink-soft);">${escapeHtml(l.ip_address || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  renderPager(data);
}

function formatLogTime(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderPager(data) {
  const pager = document.getElementById('pager');
  if (data.total_pages <= 1) { pager.innerHTML = ''; return; }
  pager.innerHTML = `
    <button class="btn btn-light btn-sm" id="prevPageBtn" ${data.page <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Prev</button>
    <span class="meta">Page ${data.page} of ${data.total_pages}</span>
    <button class="btn btn-light btn-sm" id="nextPageBtn" ${data.page >= data.total_pages ? 'disabled' : ''}>Next <i class="bi bi-chevron-right"></i></button>`;
  document.getElementById('prevPageBtn')?.addEventListener('click', () => { CURRENT_PAGE--; loadLogs(); });
  document.getElementById('nextPageBtn')?.addEventListener('click', () => { CURRENT_PAGE++; loadLogs(); });
}

function populateActionFilter(actions, keepValue) {
  const select = document.getElementById('actionFilter');
  if (select.dataset.populated) return;
  select.dataset.populated = '1';
  actions.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    select.appendChild(opt);
  });
  if (keepValue) select.value = keepValue;
}

async function loadLogs() {
  const params = new URLSearchParams();
  const q = document.getElementById('searchInput').value.trim();
  const action = document.getElementById('actionFilter').value;
  const from = document.getElementById('fromFilter').value;
  const to = document.getElementById('toFilter').value;
  if (q) params.set('q', q);
  if (action) params.set('action', action);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('page', CURRENT_PAGE);

  const { data } = await apiGet('/admin/activity-log.php?' + params.toString());
  if (!data.logs) return;
  populateActionFilter(data.actions, action);
  renderLogs(data);
}

function debounceLoadLogs() {
  CURRENT_PAGE = 1;
  clearTimeout(DEBOUNCE_TIMER);
  DEBOUNCE_TIMER = setTimeout(loadLogs, 350);
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Activity Log', crumb: 'Admin / System / Activity Log', activeKey: 'activity-log', allowedRoles: ['admin'], fullAdminOnly: true });
  if (!user) return;

  // Client-side convenience redirect only — backend already enforces this
  // with api_require_full_admin(); a scoped admin hitting this URL directly
  // would get a 403 from the API regardless of what happens here.
  if (!isFullAdmin(user)) {
    window.location.href = pageUrl('/company/directory.html');
    return;
  }

  await loadLogs();
  document.getElementById('searchInput').addEventListener('input', debounceLoadLogs);
  document.getElementById('actionFilter').addEventListener('change', debounceLoadLogs);
  document.getElementById('fromFilter').addEventListener('change', debounceLoadLogs);
  document.getElementById('toFilter').addEventListener('change', debounceLoadLogs);
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('actionFilter').value = '';
    document.getElementById('fromFilter').value = '';
    document.getElementById('toFilter').value = '';
    debounceLoadLogs();
  });
})();
