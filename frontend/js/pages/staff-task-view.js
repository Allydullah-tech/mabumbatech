function requestIdFromQuery() {
  const v = new URLSearchParams(window.location.search).get('id');
  return v ? parseInt(v, 10) : 0;
}

async function loadTaskDetail(requestId) {
  const { data } = await apiGet('/staff/task-view.php?id=' + requestId);
  const r = data.request;
  const a = data.assignment;

  if (!r || !a) {
    document.getElementById('taskDetail').innerHTML = `
      <div class="panel"><div class="empty-state" style="padding:40px 20px;">
        <i class="bi bi-exclamation-triangle"></i>
        <p>${escapeHtml(data.message || "That task isn't in your list — it may have been reassigned or removed.")}</p>
        <a href="tasks.html" class="btn btn-primary btn-sm" style="margin-top:10px;"><i class="bi bi-arrow-left"></i> Back to My Tasks</a>
      </div></div>`;
    return;
  }

  document.getElementById('taskDetail').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3><i class="bi ${escapeHtml(r.icon)}"></i> ${escapeHtml(r.subject)} ${r.priority === 'urgent' ? '<span class="badge badge-off" style="background:var(--danger);color:#fff;">Urgent</span>' : ''}</h3>
        <div style="display:flex;gap:6px;">${statusBadge(a.task_status)}${statusBadge(r.status)}</div>
      </div>
      <div class="panel-body">
        <p class="small"><b>Tracking Code:</b> ${escapeHtml(r.tracking_code)}</p>
        <p class="small"><b>Service:</b> ${escapeHtml(r.service_name)}</p>
        <p class="small"><b>Client:</b> ${escapeHtml(r.guest_name)} — ${escapeHtml(r.guest_email)}</p>
        ${r.budget ? `<p class="small"><b>Budget:</b> ${escapeHtml(r.budget)}</p>` : ''}
        ${r.deadline ? `<p class="small"><b>Deadline:</b> ${new Date(r.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>` : ''}
        <div class="divider"></div>
        <p>${escapeHtml(r.message).replace(/\n/g, '<br>')}</p>
        <div class="task-actions" style="margin-top:12px;">
          ${a.task_status === 'new' ? `
            <button class="btn btn-primary btn-sm" onclick="acceptThisTask()"><i class="bi bi-check2"></i> Accept Task</button>
            <button class="btn btn-light btn-sm" onclick="declineThisTask()"><i class="bi bi-x"></i> Decline</button>` : ''}
          ${['accepted', 'in_progress'].includes(a.task_status) ? `
            <button class="btn btn-light btn-sm" onclick="sendForReview()"><i class="bi bi-eye"></i> Send for Review</button>
            <button class="btn btn-primary btn-sm" onclick="openModal('completeTaskModal')"><i class="bi bi-check2-circle"></i> Mark Completed</button>` : ''}
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><h3><i class="bi bi-bar-chart-steps"></i> Progress</h3></div>
      <div class="panel-body">
        ${renderProgressBar(r.progress)}
        <form id="progressForm" class="stacked-form">
          <div class="form-group">
            <label>Update Progress (%)</label>
            <input type="range" name="progress" min="0" max="100" step="5" value="${parseInt(r.progress, 10) || 0}"
              oninput="this.nextElementSibling.textContent = this.value + '%'">
            <span class="small">${parseInt(r.progress, 10) || 0}%</span>
          </div>
          <div class="form-group"><label>Internal Notes (staff/admin only, not visible to customer)</label><textarea name="internal_notes" rows="2">${escapeHtml(r.internal_notes || '')}</textarea></div>
          <button class="btn btn-light btn-sm"><i class="bi bi-save"></i> Save Progress</button>
        </form>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><h3><i class="bi bi-journal-text"></i> Work Remark</h3></div>
      <div class="panel-body">
        <p class="small">A short note on progress or blockers — visible to admins, not shown to the customer.</p>
        <form id="remarkForm" class="stacked-form">
          <textarea name="remark" rows="2" maxlength="400" placeholder="e.g. Waiting on client to confirm design colors...">${escapeHtml(a.remark || '')}</textarea>
          <button class="btn btn-light btn-sm" style="margin-top:8px;"><i class="bi bi-save"></i> Save Remark</button>
        </form>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><h3><i class="bi bi-link-45deg"></i> Project Links</h3></div>
      <div class="panel-body">${renderLinksHtml(data.links, data.link_types, true)}</div>
    </div>`;

  renderRequestThread(document.getElementById('threadContainer'), {
    attachments: data.attachments,
    thread: data.thread,
    viewerId: data.viewer_id,
    viewerRole: CURRENT_USER.role,
    canReply: true,
    apiPath: '/staff/task-view.php',
    requestId: requestId,
    onChange: () => loadTaskDetail(requestId),
  });

  wireProjectPanels({ apiPath: '/staff/task-view.php', requestId, onChange: () => loadTaskDetail(requestId) });

  document.getElementById('progressForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { data } = await apiPost('/staff/task-view.php', {
      action: 'update_progress', request_id: requestId,
      progress: fd.get('progress'), internal_notes: fd.get('internal_notes'),
    });
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) loadTaskDetail(requestId);
  });

  document.getElementById('remarkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const remark = e.target.remark.value;
    const { data } = await apiPost('/staff/task-view.php', { action: 'update_remark', request_id: requestId, remark });
    showFlash(data.message, data.success ? 'success' : 'error');
  });
}

async function sendForReview() {
  const requestId = requestIdFromQuery();
  const { data } = await apiPost('/staff/task-view.php', { action: 'send_for_review', request_id: requestId });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadTaskDetail(requestId);
}

async function acceptThisTask() {
  const requestId = requestIdFromQuery();
  const { data } = await apiPost('/staff/task-view.php', { action: 'accept', request_id: requestId });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadTaskDetail(requestId);
}
async function declineThisTask() {
  const requestId = requestIdFromQuery();
  const { data } = await apiPost('/staff/task-view.php', { action: 'decline', request_id: requestId });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadTaskDetail(requestId);
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Task Details', crumb: 'Staff / My Tasks / Details', activeKey: 'tasks', allowedRoles: ['staff'] });
  if (!user) return;

  const requestId = requestIdFromQuery();
  if (!requestId) { window.location.href = 'tasks.html'; return; }
  await loadTaskDetail(requestId);

  document.getElementById('completeTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const remark = e.target.remark.value;
    const { data } = await apiPost('/staff/task-view.php', { action: 'complete', request_id: requestId, remark });
    showFlash(data.message, data.success ? 'success' : 'error');
    closeModal('completeTaskModal');
    loadTaskDetail(requestId);
  });
})();
