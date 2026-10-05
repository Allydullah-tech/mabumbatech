async function loadEmployees() {
  const { data } = await apiGet('/admin/employees.php');
  const s = data.stats;
  const onLeaveIds = new Set(data.on_leave_ids.map(String));

  document.getElementById('pageBody').innerHTML = `
    <div class="grid grid-4" style="margin-bottom:18px;">
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-people"></i></div><div><b>${s.total_employees}</b><span>Total Members</span></div></div>
      <div class="card stat-card"><div class="ic green"><i class="bi bi-person-check"></i></div><div><b>${s.active_employees || 0}</b><span>Active</span></div></div>
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-person-plus"></i></div><div><b>${s.new_this_month || 0}</b><span>New This Month</span></div></div>
      <div class="card stat-card"><div class="ic orange"><i class="bi bi-airplane"></i></div><div><b>${s.on_leave_today || 0}</b><span>On Leave Today</span></div></div>
    </div>

    ${data.pending_leave.length ? `
    <div class="panel" style="margin-bottom:18px;">
      <div class="panel-head"><h3><i class="bi bi-calendar-check"></i> Pending Leave Requests</h3></div>
      <div class="notif-row-list">${data.pending_leave.map(l => `
        <div class="notif-item" style="cursor:default;">
          <i class="bi bi-calendar-event"></i>
          <span class="notif-item-body"><b>${escapeHtml(l.full_name)}</b><span>${l.leave_type.replace(/_/g, '/')} · ${escapeHtml(l.start_date)} to ${escapeHtml(l.end_date)}${l.reason ? ' · ' + escapeHtml(l.reason) : ''}</span></span>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-light btn-sm" title="Approve" onclick="decideLeave(${l.id}, 'approved')"><i class="bi bi-check2"></i></button>
            <button class="btn btn-light btn-sm" title="Reject" onclick="decideLeave(${l.id}, 'rejected')"><i class="bi bi-x"></i></button>
          </div>
        </div>`).join('')}</div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head"><h3><i class="bi bi-people"></i> All Company Members</h3></div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Position</th><th>Department</th><th>Phone</th><th>Hire Date</th><th>Employment</th><th>Status</th><th>On Leave</th><th></th></tr></thead>
          <tbody>${data.employees.length ? data.employees.map(e => `
            <tr>
              <td class="row-name"><b>${escapeHtml(e.full_name)}</b><span>${escapeHtml(e.email || '—')}</span></td>
              <td class="small">${escapeHtml(roleLabel(e.role))}</td>
              <td class="small">${escapeHtml(e.position_title || '—')}</td>
              <td class="small">${escapeHtml(e.department_label || '—')}</td>
              <td class="small">${escapeHtml(e.phone || '—')}</td>
              <td class="small" style="white-space:nowrap;">${escapeHtml(empDateLabel(e.hire_date))}</td>
              <td>${employmentBadge(e.employment_status)}</td>
              <td>${statusBadge(e.status)}</td>
              <td>${onLeaveIds.has(String(e.id)) ? '<span class="badge badge-warn">On Leave</span>' : '<span class="small">—</span>'}</td>
              <td class="actions-cell"><button class="btn btn-light btn-sm" onclick="openEmployeeDetail(${e.id})"><i class="bi bi-eye"></i> View</button></td>
            </tr>`).join('') : '<tr><td colspan="10" class="empty-state">No members yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function employmentBadge(st) {
  return st === 'terminated'
    ? '<span class="badge badge-off">Terminated</span>'
    : '<span class="badge badge-ok">Active</span>';
}

async function decideLeave(leaveId, decision) {
  const note = decision === 'rejected' ? (prompt('Reason (optional):') || '') : '';
  const { data } = await apiPost('/admin/employees.php', { action: 'decide_leave', leave_id: leaveId, decision, note });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadEmployees();
}

function empDateLabel(d) {
  return d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
function empInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}
function empLeaveType(t) {
  const label = String(t || '').replace(/_/g, '/');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function empDays(start, end) {
  const d = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return d > 0 ? d + (d === 1 ? ' day' : ' days') : '';
}

function leaveHistoryHtml(leaves) {
  if (!leaves.length) return `<div class="emp-empty"><i class="bi bi-calendar2-check"></i>No leave history.</div>`;
  return `<div class="emp-leave-list">${leaves.map(l => `
    <div class="emp-leave">
      <span class="emp-leave-ic"><i class="bi bi-calendar-event"></i></span>
      <div class="emp-leave-body">
        <b>${escapeHtml(empLeaveType(l.leave_type))}</b>
        <span>${escapeHtml(empDateLabel(l.start_date))} to ${escapeHtml(empDateLabel(l.end_date))}${empDays(l.start_date, l.end_date) ? ' · ' + empDays(l.start_date, l.end_date) : ''}${l.reason ? ' · ' + escapeHtml(l.reason) : ''}</span>
      </div>
      ${statusBadge(l.status)}
    </div>`).join('')}</div>`;
}

async function openEmployeeDetail(id) {
  const { data } = await apiGet('/admin/employees.php?employee=' + id);
  if (!data.employee) { showFlash('Employee not found.', 'error'); return; }
  const e = data.employee;
  const p = data.performance;

  const contact = [e.position_title || e.department_label, e.email, e.phone].filter(Boolean).map(escapeHtml).join(' · ');

  const detailsSection = `
    <div class="emp-sum">
      <div><span>Role</span><b>${escapeHtml(roleLabel(e.role))}</b></div>
      <div><span>Department</span><b>${escapeHtml(e.department_label || '—')}</b></div>
      <div><span>Joined</span><b>${escapeHtml(empDateLabel(e.created_at))}</b></div>
    </div>`;

  // Only Super Admin / Generic Admin can edit employment records, and never the Super Admin's own record.
  // The Operations Manager sees hire date and status as read-only.
  const canEditEmployment = e.role !== 'super_admin' && isFullAdmin(CURRENT_USER);
  const employmentSection = canEditEmployment ? `
    <form id="employmentForm" class="emp-form">
      <div class="emp-form-grid">
        <div class="form-group"><label>Hire Date</label><input type="date" name="hire_date" value="${escapeHtml(e.hire_date || '')}"></div>
        <div class="form-group"><label>Employment Status</label>
          <select name="employment_status">
            <option value="active" ${e.employment_status !== 'terminated' ? 'selected' : ''}>Active</option>
            <option value="terminated" ${e.employment_status === 'terminated' ? 'selected' : ''}>Terminated (Fired)</option>
          </select>
        </div>
        <button class="btn btn-primary emp-save"><i class="bi bi-check2"></i> Save Employment Record</button>
      </div>
    </form>` : `
    <div class="emp-sum">
      <div><span>Hire date</span><b>${escapeHtml(empDateLabel(e.hire_date))}</b></div>
      <div><span>Employment status</span><b>${e.employment_status === 'terminated' ? 'Terminated' : 'Active'}</b></div>
    </div>`;

  const performanceSection = p ? `
    <section class="emp-sec">
      <h4><i class="bi bi-list-check"></i> Task Summary</h4>
      <div class="emp-sum">
        <div><span>Assigned</span><b>${Number(p.total_assigned) || 0}</b></div>
        <div><span>Completed</span><b>${Number(p.completed) || 0}</b></div>
        <div><span>Active</span><b>${Number(p.active) || 0}</b></div>
        <div><span>Declined</span><b>${Number(p.declined) || 0}</b></div>
      </div>
    </section>` : '';

  document.getElementById('employeeDetailBody').innerHTML = `
    <div class="emp-head">
      <div class="emp-avatar">${escapeHtml(empInitials(e.full_name))}</div>
      <div class="emp-head-text">
        <h3>${escapeHtml(e.full_name)}</h3>
        <p>${contact}</p>
        <div class="emp-badges">${statusBadge(e.status)}${employmentBadge(e.employment_status)}${data.on_leave_today ? '<span class="badge badge-warn">Currently on leave</span>' : ''}</div>
      </div>
    </div>

    <section class="emp-sec">
      <h4><i class="bi bi-person-vcard"></i> Details</h4>
      ${detailsSection}
    </section>

    <section class="emp-sec">
      <h4><i class="bi bi-briefcase"></i> Employment Record</h4>
      ${employmentSection}
    </section>

    ${performanceSection}

    <section class="emp-sec">
      <h4><i class="bi bi-calendar-event"></i> Leave History</h4>
      ${leaveHistoryHtml(data.leave_history)}
    </section>
  `;

  if (canEditEmployment) {
    document.getElementById('employmentForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = new FormData(ev.target);
      form.append('action', 'update_employment');
      form.append('employee_id', e.id);
      const { data } = await apiPost('/admin/employees.php', form);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) { openEmployeeDetail(e.id); loadEmployees(); }
    });
  }

  openModal('employeeDetailModal');
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Employees', crumb: 'Admin / Employees', activeKey: 'employees', allowedRoles: ['admin'] });
  if (!user) return;
  // Super Admin, Generic Administrator and Operations Manager only (the API enforces the same rule).
  if (!(isFullAdmin(user) || user.job_role_key === 'general_manager')) {
    redirectWithNotice(pageUrl('/admin/profile.html'), 'You do not have permission to access that page.', 'error');
    return;
  }
  await loadEmployees();
})();
