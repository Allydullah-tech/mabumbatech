function tabFromQuery() {
  return new URLSearchParams(window.location.search).get('tab') || 'all';
}

async function loadTasks() {
  const tab = tabFromQuery();
  const tabs = ['all', 'new', 'accepted', 'completed', 'declined'];
  const tabsHtml = tabs.map(t => {
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    return `<a href="?tab=${t}" class="${tab === t ? 'active' : ''}">${label}</a>`;
  }).join('');

  const { data } = await apiGet('/staff/tasks.php?tab=' + encodeURIComponent(tab));
  const tasks = data.tasks || [];

  const cards = tasks.length
    ? tasks.map(t => `
      <div class="task-card">
        <div class="top-row">
          <div>
            <h4><i class="bi ${escapeHtml(t.icon)}"></i> ${escapeHtml(t.subject)} ${t.is_broadcast == 1 ? '<span class="badge badge-info">Open Request</span>' : ''} ${t.priority === 'urgent' ? '<span class="badge badge-off" style="background:var(--danger);color:#fff;">Urgent</span>' : ''} ${t.unread_messages > 0 ? `<span class="badge badge-warn">${t.unread_messages} new message${t.unread_messages > 1 ? 's' : ''}</span>` : ''}</h4>
            <span class="meta">${escapeHtml(t.tracking_code)} · ${escapeHtml(t.service_name)} · ${escapeHtml(t.guest_name)} · ${timeAgo(t.created_at)}${t.deadline ? ' · Due ' + new Date(t.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
          </div>
          ${statusBadge(t.task_status)}
        </div>
        ${renderProgressBar(t.progress)}
        <p>${escapeHtml(t.message)}</p>
        ${t.remark ? `<p class="small"><b>Your remark:</b> ${escapeHtml(t.remark)}</p>` : ''}
        <div class="task-actions">
          <a href="task-view.html?id=${t.request_id}" class="btn btn-light btn-sm"><i class="bi bi-chat-dots"></i> View &amp; Discuss</a>
          ${t.task_status === 'new' ? `
            <button class="btn btn-primary btn-sm" onclick="acceptTask(${t.id})"><i class="bi bi-check2"></i> Accept Task</button>
            <button class="btn btn-light btn-sm" onclick="declineTask(${t.id})"><i class="bi bi-x"></i> Decline</button>` : ''}
          ${['accepted', 'in_progress'].includes(t.task_status) ? `<button class="btn btn-primary btn-sm" onclick="openCompleteModal(${t.id})"><i class="bi bi-check2-circle"></i> Mark Completed</button>` : ''}
        </div>
      </div>`).join('')
    : `<div class="panel"><div class="empty-state"><i class="bi bi-inbox"></i>No tasks in this view.</div></div>`;

  document.getElementById('pageBody').innerHTML = `<div class="tabs-row">${tabsHtml}</div>${cards}`;
}

async function acceptTask(id) {
  const { data } = await apiPost('/staff/tasks.php', { action: 'accept', assignment_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadTasks();
}
async function declineTask(id) {
  const { data } = await apiPost('/staff/tasks.php', { action: 'decline', assignment_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadTasks();
}
function openCompleteModal(id) {
  document.getElementById('completeAssignmentId').value = id;
  openModal('completeTaskModal');
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'My Tasks', crumb: 'Staff / My Tasks', activeKey: 'tasks', allowedRoles: ['staff'] });
  if (!user) return;
  await loadTasks();

  document.getElementById('completeTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('completeAssignmentId').value;
    const remark = e.target.remark.value;
    const { data } = await apiPost('/staff/tasks.php', { action: 'complete', assignment_id: id, remark });
    showFlash(data.message, data.success ? 'success' : 'error');
    closeModal('completeTaskModal');
    loadTasks();
  });
})();
