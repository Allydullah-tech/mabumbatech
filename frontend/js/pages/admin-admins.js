let ADMINS_ME_ID = null;
let JOB_ROLES = [];
let ADMINS_LIST = [];

function jobRoleLabel(key) {
  if (!key) return 'Generic Administrator';
  const jr = JOB_ROLES.find(r => r.job_role_key === key);
  return jr ? jr.label : key;
}

async function loadAdmins() {
  const { data } = await apiGet('/admin/admins.php');
  ADMINS_ME_ID = data.me_id;
  JOB_ROLES = data.job_roles || [];
  ADMINS_LIST = data.admins || [];
  document.getElementById('adminCount').textContent = data.admins.length;

  const jobRoleOptions = JOB_ROLES.map(r => `<option value="${escapeHtml(r.job_role_key)}">${escapeHtml(r.label)}</option>`).join('');
  const createSelect = document.getElementById('createAdminJobRole');
  if (createSelect && !createSelect.dataset.filled) { createSelect.insertAdjacentHTML('beforeend', jobRoleOptions); createSelect.dataset.filled = '1'; }
  const changeSelect = document.getElementById('changeRoleSelect');
  if (changeSelect && !changeSelect.dataset.filled) { changeSelect.insertAdjacentHTML('beforeend', jobRoleOptions); changeSelect.dataset.filled = '1'; }

  document.getElementById('adminsTableBody').innerHTML = data.admins.map(a => {
    const isSelf = a.id === ADMINS_ME_ID;
    const isSuper = a.role === 'super_admin';
    let actions = '';
    if (isSuper) {
      actions = `<span class="small" title="Super Administrator cannot be suspended"><i class="bi bi-shield-check"></i> Protected</span>`;
    } else if (!isSelf) {
      actions = `<button class="btn btn-light btn-sm" onclick="toggleAdminStatus(${a.id})" title="Suspend/activate"><i class="bi bi-power"></i></button>
        <button class="btn btn-light btn-sm" onclick="openChangeRole(${a.id}, '${a.job_role_key || ''}')" title="Change job role"><i class="bi bi-person-gear"></i></button>`;
    }
    // Public Team Page visibility is a separate, always-available toggle —
    // it applies to every admin including the Super Administrator (CEO)
    // and your own account, unlike suspend/role changes above.
    actions += ` <button class="btn btn-light btn-sm" onclick="openAdminPublicProfile(${a.id})" title="Public team page profile"><i class="bi bi-globe"></i></button>`;
    return `
    <tr>
      <td class="row-name">
        <div class="avatar-sm" style="${isSuper ? 'background:var(--warn);' : ''}">${escapeHtml((a.full_name || '?').charAt(0).toUpperCase())}</div>
        <div><b>${escapeHtml(a.full_name)}</b><span>${escapeHtml(a.email)}</span></div>
        ${isSuper ? '<span class="badge badge-warn">Super Admin</span>' : ''}
        ${isSelf ? '<span class="badge badge-info">You</span>' : ''}
      </td>
      <td>${escapeHtml(a.username)}</td>
      <td>${escapeHtml(a.position_title || 'Administrator')}</td>
      <td>${isSuper ? '<span class="small">—</span>' : `<span class="tag-pill">${escapeHtml(jobRoleLabel(a.job_role_key))}</span>`}</td>
      <td>${escapeHtml(a.phone || '—')}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="small">${new Date(a.created_at.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td class="actions-cell">${actions}</td>
    </tr>`;
  }).join('');
}

async function toggleAdminStatus(id) {
  if (!confirm('Change status for this administrator?')) return;
  const { data } = await apiPost('/admin/admins.php', { action: 'toggle_status', admin_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadAdmins();
}

function openChangeRole(id, currentKey) {
  document.getElementById('changeRoleAdminId').value = id;
  document.getElementById('changeRoleSelect').value = currentKey || '';
  openModal('changeRoleModal');
}

function openAdminPublicProfile(id) {
  const a = ADMINS_LIST.find(x => x.id === id);
  if (!a) return;
  document.getElementById('adminPublicProfileName').textContent = a.full_name;
  document.getElementById('adminPublicProfileId').value = a.id;
  document.getElementById('adminPublicProfileToggle').checked = !!a.is_public_profile;
  document.getElementById('adminPublicProfileBio').value = a.public_bio || '';
  document.getElementById('adminPublicProfileSkills').value = a.public_skills || '';
  openModal('adminPublicProfileModal');
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Admin Accounts', crumb: 'Admin / People / Administrators', activeKey: 'admins', allowedRoles: ['admin'], fullAdminOnly: true });
  if (!user) return;

  // Client-side convenience redirect only — backend/api/admin/admins.php
  // already enforces this with api_require_full_admin(). A scoped admin
  // hitting this URL directly would get a 403 from the API regardless.
  if (!isFullAdmin(user)) {
    window.location.href = pageUrl('/company/directory.html');
    return;
  }

  await loadAdmins();

  document.getElementById('createAdminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'create_admin');
    const { data } = await apiPost('/admin/admins.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('createAdminModal'); e.target.reset(); loadAdmins(); }
  });

  const changeRoleForm = document.getElementById('changeRoleForm');
  if (changeRoleForm) {
    changeRoleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      form.append('action', 'update_job_role');
      const { data } = await apiPost('/admin/admins.php', form);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) { closeModal('changeRoleModal'); loadAdmins(); }
    });
  }

  document.getElementById('adminPublicProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'update_public_profile');
    if (document.getElementById('adminPublicProfileToggle').checked) form.append('is_public_profile', '1');
    const { data } = await apiPost('/admin/admins.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('adminPublicProfileModal'); loadAdmins(); }
  });
})();
