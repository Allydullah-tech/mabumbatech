const CATEGORY_LABELS = {
  web_dev: 'Web Development', app_dev: 'App Development', software_hardware: 'Software & Hardware Solutions',
  it_consultancy: 'IT Consultancy', ai_ml: 'AI/ML Projects', multimedia: 'Multimedia/Animation Projects',
  graphics: 'Graphics Designing', other_services: 'All Other Digital Services',
};

(async function () {
  const user = await initDashLayout({ pageTitle: 'Dashboard', crumb: 'Staff / Overview', activeKey: 'dashboard', allowedRoles: ['staff'] });
  if (!user) return;

  document.getElementById('welcomeCard').innerHTML = `
    <div class="avatar-sm" style="width:48px;height:48px;font-size:1.1rem;background:rgba(255,255,255,.18);">${escapeHtml((user.full_name || '?').charAt(0).toUpperCase())}</div>
    <div>
      <h3 style="color:#fff;margin-bottom:2px;">Welcome, ${escapeHtml(user.full_name)}</h3>
      <p style="color:#dbeaff;margin:0;"><i class="bi ${CATEGORY_ICONS[user.staff_category] || 'bi-gear'}"></i> ${escapeHtml(user.position_title || CATEGORY_LABELS[user.staff_category] || '')} · ${escapeHtml(CATEGORY_LABELS[user.staff_category] || '')} Department</p>
    </div>`;

  const { data } = await apiGet('/staff/dashboard.php');
  const s = data.stats || {};
  document.getElementById('statNew').textContent = s.new_c || 0;
  document.getElementById('statActive').textContent = s.active_c || 0;
  document.getElementById('statDone').textContent = s.done_c || 0;
  document.getElementById('statTotal').textContent = s.total_c || 0;

  const body = document.getElementById('recentTasksBody');
  if (!data.recent_tasks.length) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-inbox"></i>No tasks assigned yet. New work from the admin team will appear here.</div>`;
  } else {
    body.innerHTML = data.recent_tasks.map(t => `
      <div class="task-card">
        <div class="top-row">
          <div>
            <h4><i class="bi ${escapeHtml(t.icon)}"></i> ${escapeHtml(t.subject)}</h4>
            <span class="meta">${escapeHtml(t.tracking_code)} · ${escapeHtml(t.service_name)} · ${timeAgo(t.created_at)}</span>
          </div>
          ${statusBadge(t.task_status)}
        </div>
        <p>${escapeHtml(t.message.length > 130 ? t.message.slice(0, 130) + '…' : t.message)}</p>
      </div>`).join('');
  }

  const urgentBody = document.getElementById('urgentTasksBody');
  const urgent = data.urgent_tasks || [];
  urgentBody.innerHTML = urgent.length
    ? urgent.map(t => `
      <a href="task-view.html?id=${t.request_id}" class="notif-row">
        <i class="bi ${t.priority === 'urgent' ? 'bi-exclamation-triangle-fill' : 'bi-alarm-fill'}" style="color:var(--danger);"></i>
        <div class="notif-row-body">
          <b>${escapeHtml(t.subject)} ${t.priority === 'urgent' ? '<span class="badge badge-off" style="background:var(--danger);color:#fff;">Urgent</span>' : ''}</b>
          <span>${escapeHtml(t.tracking_code)} · ${escapeHtml(t.service_name)}${t.deadline ? ' · Due ' + new Date(t.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</span>
        </div>
      </a>`).join('')
    : `<p class="empty-state small"><i class="bi bi-check2-circle"></i>Nothing urgent right now — nice work staying on top of things.</p>`;

  const completedBody = document.getElementById('recentlyCompletedBody');
  const completed = data.recently_completed || [];
  completedBody.innerHTML = completed.length
    ? completed.map(t => `
      <a href="task-view.html?id=${t.request_id}" class="notif-row">
        <i class="bi bi-check-circle-fill" style="color:var(--ok);"></i>
        <div class="notif-row-body">
          <b>${escapeHtml(t.subject)}</b>
          <span>${escapeHtml(t.tracking_code)} · ${escapeHtml(t.service_name)}</span>
        </div>
        <span class="notif-time">${timeAgo(t.responded_at)}</span>
      </a>`).join('')
    : `<p class="empty-state small"><i class="bi bi-hourglass"></i>No completed work yet.</p>`;
})();
