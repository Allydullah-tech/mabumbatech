let DEPARTMENTS = [];
let STAFF_LIST = [];

function deptMap() {
  const map = {};
  DEPARTMENTS.forEach(d => { map[d.dept_key] = d; });
  return map;
}

function fillDeptSelect(selectEl) {
  selectEl.innerHTML = DEPARTMENTS.map(d => `<option value="${d.dept_key}">${escapeHtml(d.label)}</option>`).join('');
}

async function loadStaff() {
  const { data } = await apiGet('/admin/staff.php');
  DEPARTMENTS = data.departments;
  STAFF_LIST = data.staff;

  document.getElementById('categorySelect').innerHTML = '<option value="">Select department…</option>' + DEPARTMENTS.map(d => `<option value="${d.dept_key}">${escapeHtml(d.label)}</option>`).join('');
  fillDeptSelect(document.getElementById('editCatSelect'));
  document.getElementById('deptFilter').innerHTML = '<option value="">All Departments</option>' + DEPARTMENTS.map(d => `<option value="${d.dept_key}">${escapeHtml(d.label)}</option>`).join('');

  applyStaffFilters();
}

function applyStaffFilters() {
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const dept = document.getElementById('deptFilter').value;
  const status = document.getElementById('statusFilter').value;

  const filtered = STAFF_LIST.filter(s => {
    if (dept && s.staff_category !== dept) return false;
    if (status && s.status !== status) return false;
    if (q) {
      const hay = `${s.full_name} ${s.email} ${s.username}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderStaffTable(filtered);
}

function renderStaffTable(list) {
  const depts = deptMap();
  document.getElementById('staffCount').textContent = list.length;
  const body = document.getElementById('staffTableBody');

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="bi bi-person-x"></i>No staff accounts match your filters.</td></tr>`;
    return;
  }

  body.innerHTML = list.map(s => {
    const cat = depts[s.staff_category] || { icon: 'bi-briefcase', label: s.staff_category };
    return `
    <tr>
      <td class="row-name">
        <div class="avatar-sm" style="background:var(--blue-600);">${escapeHtml((s.full_name || '?').charAt(0).toUpperCase())}</div>
        <div><b>${escapeHtml(s.full_name)}</b><span>${escapeHtml(s.email)}</span></div>
      </td>
      <td>${escapeHtml(s.username)}</td>
      <td><span class="tag-pill"><i class="bi ${escapeHtml(cat.icon)}"></i> ${escapeHtml(s.position_title || cat.label)}</span></td>
      <td>${escapeHtml(s.phone || '—')}</td>
      <td>${statusBadge(s.status)}${s.must_reset == 1 ? ' <span class="badge badge-warn">Reset Pending</span>' : ''}</td>
      <td class="small">${new Date(s.created_at.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td class="actions-cell">
        <button class="btn btn-light btn-sm" title="Edit position" onclick="openEditCat(${s.id})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-light btn-sm" title="Reset password" onclick="resetStaffPassword(${s.id})"><i class="bi bi-key"></i></button>
        <button class="btn btn-light btn-sm" title="Suspend / Activate" onclick="toggleStaffStatus(${s.id})"><i class="bi bi-power"></i></button>
        <button class="btn btn-light btn-sm" title="Public team page profile" onclick="openPublicProfile(${s.id})"><i class="bi bi-globe"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function openEditCat(id) {
  const s = STAFF_LIST.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editCatName').textContent = s.full_name;
  document.getElementById('editCatStaffId').value = s.id;
  document.getElementById('editCatSelect').value = s.staff_category;
  document.getElementById('editCatPosition').value = s.position_title || '';
  openModal('editCatModal');
}

function openPublicProfile(id) {
  const s = STAFF_LIST.find(x => x.id === id);
  if (!s) return;
  document.getElementById('publicProfileName').textContent = s.full_name;
  document.getElementById('publicProfileStaffId').value = s.id;
  document.getElementById('publicProfileToggle').checked = !!s.is_public_profile;
  document.getElementById('publicProfileBio').value = s.public_bio || '';
  document.getElementById('publicProfileSkills').value = s.public_skills || '';
  openModal('publicProfileModal');
}

async function resetStaffPassword(id) {
  if (!confirm('Generate a new one-digit reset code for this staff member?')) return;
  const { data } = await apiPost('/admin/staff.php', { action: 'reset_password', staff_id: id });
  if (data.success) {
    showFlash(`Password reset for ${data.staff_name}. Give them this one-digit code to log in: ${data.temp_code}. They will be asked to set a new password on next login.`, 'success');
    loadStaff();
  } else {
    showFlash(data.message || 'Reset failed.', 'error');
  }
}

async function toggleStaffStatus(id) {
  if (!confirm('Change status for this staff member?')) return;
  const { data } = await apiPost('/admin/staff.php', { action: 'toggle_status', staff_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadStaff();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Staff Accounts', crumb: 'Admin / People / Staff', activeKey: 'staff', allowedRoles: ['admin'], fullAdminOnly: true });
  if (!user) return;

  // Client-side convenience redirect only — backend/api/admin/staff.php
  // already enforces this with api_require_full_admin(). A scoped admin
  // hitting this URL directly would get a 403 from the API regardless.
  if (!isFullAdmin(user)) {
    window.location.href = pageUrl('/company/directory.html');
    return;
  }

  await loadStaff();

  document.getElementById('searchInput').addEventListener('input', applyStaffFilters);
  document.getElementById('deptFilter').addEventListener('change', applyStaffFilters);
  document.getElementById('statusFilter').addEventListener('change', applyStaffFilters);

  document.getElementById('createStaffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'create_staff');
    const { data } = await apiPost('/admin/staff.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('createStaffModal'); e.target.reset(); loadStaff(); }
  });

  document.getElementById('editCatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'update_category');
    const { data } = await apiPost('/admin/staff.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('editCatModal'); loadStaff(); }
  });

  document.getElementById('addDeptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'add');
    const { data } = await apiPost('/admin/departments.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      e.target.reset();
      closeModal('addDeptModal');
      await loadStaff();
      document.getElementById('categorySelect').value = data.dept_key;
    }
  });
  document.getElementById('publicProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'update_public_profile');
    if (document.getElementById('publicProfileToggle').checked) form.append('is_public_profile', '1');
    const { data } = await apiPost('/admin/staff.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('publicProfileModal'); loadStaff(); }
  });
})();
