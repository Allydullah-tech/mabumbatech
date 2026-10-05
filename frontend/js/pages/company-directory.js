let ALL_MEMBERS = [];

function memberAvatar(m) {
  const initial = escapeHtml((m.full_name || '?').charAt(0).toUpperCase());
  if (m.avatar) {
    return `<img src="${APP_ROOT}/backend/uploads/avatars/${encodeURIComponent(m.avatar)}" alt="${escapeHtml(m.full_name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  }
  return initial;
}

function memberRoleBadge(role) {
  const map = { super_admin: 'badge-warn', admin: 'badge-info', staff: 'badge-ok' };
  const labels = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff' };
  return `<span class="badge ${map[role] || 'badge-info'}">${labels[role] || role}</span>`;
}

function renderDirectory(list) {
  document.getElementById('memberCount').textContent = list.length;
  const body = document.getElementById('directoryBody');

  if (!list.length) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-people"></i>No company members match your search.</div>`;
    return;
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:0 16px 16px;">
      ${list.map(m => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div class="avatar-sm" style="width:48px;height:48px;font-size:1.1rem;">${memberAvatar(m)}</div>
            <div style="min-width:0;">
              <h4 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.full_name)}</h4>
              <span class="meta">${escapeHtml(m.department || '')}</span>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">${memberRoleBadge(m.role)}</div>
          <div style="font-size:.82rem;display:flex;flex-direction:column;gap:4px;color:var(--ink-soft);">
            <span><i class="bi bi-envelope"></i> ${escapeHtml(m.email)}</span>
            ${m.phone ? `<span><i class="bi bi-telephone"></i> ${escapeHtml(m.phone)}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

function applyDirectorySearch() {
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  if (!q) { renderDirectory(ALL_MEMBERS); return; }
  const filtered = ALL_MEMBERS.filter(m =>
    (m.full_name || '').toLowerCase().includes(q) ||
    (m.department || '').toLowerCase().includes(q) ||
    (m.email || '').toLowerCase().includes(q) ||
    (m.phone || '').toLowerCase().includes(q)
  );
  renderDirectory(filtered);
}

async function loadDirectory() {
  const { data } = await apiGet('/company/directory.php');
  ALL_MEMBERS = data.members || [];
  applyDirectorySearch();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Company Directory', crumb: 'Company Directory', activeKey: 'directory', allowedRoles: ['admin', 'staff'] });
  if (!user) return;
  await loadDirectory();
  document.getElementById('searchInput').addEventListener('input', applyDirectorySearch);
})();
