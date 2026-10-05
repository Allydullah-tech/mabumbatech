let DEPARTMENTS = [];
let SERVICES = [];

function deptMap() {
  const map = {};
  DEPARTMENTS.forEach(d => { map[d.dept_key] = d; });
  return map;
}

async function loadServices() {
  const { data } = await apiGet('/admin/services.php');
  DEPARTMENTS = data.departments;
  SERVICES = data.services;
  const depts = deptMap();

  const deptOptions = DEPARTMENTS.map(d => `<option value="${d.dept_key}">${escapeHtml(d.label)}</option>`).join('');
  document.getElementById('deptSelect').innerHTML = deptOptions;
  document.getElementById('editDeptSelect').innerHTML = deptOptions;

  document.getElementById('servicesGrid').innerHTML = SERVICES.map((s, i) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div class="ic" style="width:34px;height:34px;border-radius:8px;background:var(--blue-100);color:var(--blue-700);display:flex;align-items:center;justify-content:center;margin-bottom:8px;"><i class="bi ${escapeHtml(s.icon)}"></i></div>
        <div style="display:flex;gap:4px;align-items:center;">
          ${s.is_active == 1 ? '<span class="badge badge-ok">Active</span>' : '<span class="badge badge-off">Suspended</span>'}
          <button class="btn btn-light btn-sm" style="padding:2px 7px;" title="Move up" onclick="reorderService(${s.id}, 'move_up')" ${i === 0 ? 'disabled' : ''}><i class="bi bi-arrow-up"></i></button>
          <button class="btn btn-light btn-sm" style="padding:2px 7px;" title="Move down" onclick="reorderService(${s.id}, 'move_down')" ${i === SERVICES.length - 1 ? 'disabled' : ''}><i class="bi bi-arrow-down"></i></button>
        </div>
      </div>
      <h3>${escapeHtml(s.name)}</h3>
      <span class="small">${escapeHtml((depts[s.category_key] || {}).label || s.category_key)}</span>
      ${s.is_broadcast == 1 ? '<span class="badge badge-info" style="margin:6px 0;display:inline-block;">Goes to all staff</span>' : ''}
      ${s.is_custom == 1 ? '<span class="badge badge-cat" style="margin:6px 0 6px 4px;display:inline-block;">Custom</span>' : ''}
      <p class="small" style="margin:8px 0;">${escapeHtml(s.description || 'No description yet.')}</p>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-light btn-sm" style="flex:1;" onclick="openEditService(${s.id})"><i class="bi bi-pencil"></i> Edit</button>
        <button class="btn btn-light btn-sm" style="flex:1;" onclick="toggleServiceActive(${s.id})">
          <i class="bi bi-${s.is_active == 1 ? 'pause-circle' : 'play-circle'}"></i> ${s.is_active == 1 ? 'Suspend' : 'Reactivate'}
        </button>
      </div>
      ${s.is_custom == 1 ? `<button class="btn btn-light btn-sm btn-block" style="margin-top:6px;color:var(--danger);" onclick="deleteService(${s.id})"><i class="bi bi-trash"></i> Delete</button>` : ''}
    </div>`).join('');
}

function openEditService(id) {
  const s = SERVICES.find(x => x.id == id);
  if (!s) return;
  const form = document.getElementById('editServiceForm');
  form.service_id.value = s.id;
  form.name.value = s.name;
  form.category_key.value = s.category_key;
  form.icon.value = s.icon;
  form.description.value = s.description || '';
  openModal('editServiceModal');
}

async function reorderService(id, direction) {
  const { data } = await apiPost('/admin/services.php', { action: direction, service_id: id });
  if (!data.success) showFlash(data.message, 'error');
  loadServices();
}

async function toggleServiceActive(id) {
  const { data } = await apiPost('/admin/services.php', { action: 'toggle_active', service_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadServices();
}

async function deleteService(id) {
  if (!confirm('Delete this service permanently? This cannot be undone.')) return;
  const { data } = await apiPost('/admin/services.php', { action: 'delete_service', service_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadServices();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Services Catalogue', crumb: 'Admin / Operations / Services', activeKey: 'services', allowedRoles: ['admin'], anyPermission: ['services.manage'] });
  if (!user) return;
  await loadServices();

  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('action', 'add_service');
    const { data } = await apiPost('/admin/services.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { e.target.reset(); loadServices(); }
  });

  document.getElementById('editServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('action', 'update_service');
    const { data } = await apiPost('/admin/services.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('editServiceModal'); loadServices(); }
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
      await loadServices();
      document.getElementById('deptSelect').value = data.dept_key;
    }
  });
})();
