function statusFilterFromQuery() {
  return new URLSearchParams(window.location.search).get('status') || 'all';
}
function viewIdFromQuery() {
  const v = new URLSearchParams(window.location.search).get('view');
  return v ? parseInt(v, 10) : 0;
}


/* ------------------------------------------------------------------
 * Lawyer (view-only) layout — "Company Projects" list + details pop-up.
 * Same data as the normal list, shown with filter chips, search, a
 * progress bar and resource counts. Nothing here can change a project.
 * ------------------------------------------------------------------ */
let PROJECTS = [];
let PROJECT_FILTER = 'all';
let PROJECT_QUERY = '';

const PROJECT_FILTERS = [
  ['all', 'All', () => true],
  ['pending', 'Pending', p => p.status === 'pending'],
  ['active', 'In progress', p => ['assigned', 'in_progress', 'review'].includes(p.status)],
  ['done', 'Completed', p => ['completed', 'delivered'].includes(p.status)],
  ['cancelled', 'Cancelled', p => p.status === 'cancelled'],
];

// Lets old links such as requests.html?status=in_progress still land on the right chip.
function projectFilterForStatus(status) {
  if (status === 'pending') return 'pending';
  if (['assigned', 'in_progress', 'review'].includes(status)) return 'active';
  if (['completed', 'delivered'].includes(status)) return 'done';
  if (status === 'cancelled') return 'cancelled';
  return 'all';
}

function fileSizeLabel(b) {
  b = Number(b || 0);
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}
function shortDate(dt) {
  if (!dt) return '—';
  const d = new Date(String(dt).replace(' ', 'T'));
  return isNaN(d) ? escapeHtml(dt) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Builds the Company Projects panel once, then redraws only the chips + table as the filters change. */
function renderProjectsPanel(requests) {
  PROJECTS = requests || [];
  document.getElementById('pageBody').innerHTML = `
    <div class="panel lp-panel" id="projectsPanel">
      <div class="panel-head">
        <div>
          <h3><i class="bi bi-briefcase"></i> Company Projects</h3>
          <div class="small" style="margin-top:2px;">Open a project to read its details, open links and download files — then write your notes in the Lawyer Desk.</div>
        </div>
        <div class="search-box"><i class="bi bi-search"></i><input type="text" id="projSearch" placeholder="Search code, project or client…" value="${escapeHtml(PROJECT_QUERY)}"></div>
      </div>
      <div class="lp-toolbar"><div class="tabs-row" id="projChips"></div></div>
      <div id="projTable"></div>
    </div>`;
  document.getElementById('projSearch').addEventListener('input', (e) => { PROJECT_QUERY = e.target.value; drawProjects(); });
  drawProjects();
}

function drawProjects() {
  const q = PROJECT_QUERY.trim().toLowerCase();
  const chipCount = (fn) => PROJECTS.filter(fn).length;
  document.getElementById('projChips').innerHTML = PROJECT_FILTERS.map(([key, label, fn]) =>
    `<a href="#" data-f="${key}" class="${PROJECT_FILTER === key ? 'active' : ''}">${label} (${chipCount(fn)})</a>`).join('');
  document.querySelectorAll('#projChips a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault(); PROJECT_FILTER = a.dataset.f; drawProjects();
  }));

  const filterFn = (PROJECT_FILTERS.find(f => f[0] === PROJECT_FILTER) || PROJECT_FILTERS[0])[2];
  const rows = PROJECTS.filter(filterFn).filter(p =>
    !q || `${p.tracking_code} ${p.subject} ${p.guest_name || ''} ${p.service_name || ''}`.toLowerCase().includes(q));

  const box = document.getElementById('projTable');
  if (!rows.length) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-inbox"></i>${PROJECTS.length ? 'No projects match your search or filter.' : 'No projects yet.'}</div>`;
    return;
  }
  box.innerHTML = `
    <div class="table-wrap"><table class="tbl lp-table">
      <thead><tr><th>Code</th><th>Project</th><th>Service</th><th>Status</th><th>Budget</th><th>Progress</th><th>Resources</th><th></th></tr></thead>
      <tbody>${rows.map(p => {
        const pct = Math.max(0, Math.min(100, parseInt(p.progress, 10) || 0));
        const links = parseInt(p.link_count, 10) || 0, files = parseInt(p.file_count, 10) || 0;
        return `
        <tr class="lp-row" onclick="viewProject(${p.id})">
          <td><span class="lp-code">${escapeHtml(p.tracking_code)}</span></td>
          <td class="lp-project"><div class="lp-title">${escapeHtml(p.subject)}</div><div class="lp-sub">${p.guest_name ? '<i class="bi bi-person"></i> ' + escapeHtml(p.guest_name) + ' · ' : ''}${shortDate(p.created_at)}</div></td>
          <td><span class="lp-service"><i class="bi ${escapeHtml(p.icon || 'bi-grid')}"></i> ${escapeHtml(p.service_name || '—')}</span></td>
          <td>${statusBadge(p.status)}</td>
          <td class="lp-budget">${p.budget ? escapeHtml(p.budget) : '<span class="lp-none">—</span>'}</td>
          <td class="lp-progress"><div class="lp-bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></td>
          <td><div class="lp-res">
            <span class="lp-chip ${links ? '' : 'is-empty'}" title="${links} link${links === 1 ? '' : 's'}"><i class="bi bi-link-45deg"></i>${links}</span>
            <span class="lp-chip ${files ? '' : 'is-empty'}" title="${files} file${files === 1 ? '' : 's'}"><i class="bi bi-paperclip"></i>${files}</span>
          </div></td>
          <td onclick="event.stopPropagation()"><button class="btn btn-light btn-sm" onclick="viewProject(${p.id})"><i class="bi bi-eye"></i> View</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

/** Opens the details pop-up. `preloaded` is the already-fetched ?view= response, when we have one. */
async function viewProject(id, preloaded) {
  openModal('projectViewModal');
  const body = document.getElementById('projectViewBody');
  body.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>Loading…</div>';
  let data = preloaded;
  if (!data) ({ data } = await apiGet('/admin/requests.php?view=' + id));
  if (!data || !data.request) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i>${escapeHtml((data && data.message) || 'Could not load this project.')}</div>`;
    return;
  }
  const r = data.request;
  const pct = Math.max(0, Math.min(100, parseInt(r.progress, 10) || 0));
  const types = data.link_types || {};
  const links = data.links || [];
  const files = data.attachments || [];
  const field = (label, value) => `<div class="lp-field"><span>${label}</span><b>${value}</b></div>`;

  const linksHtml = links.length ? links.map(l => {
    const meta = types[l.link_type] || { label: 'Project Link', icon: 'bi-link-45deg', cta: 'Open Link' };
    return `
      <div class="lp-res-item">
        <div class="lp-res-ic"><i class="bi ${escapeHtml(meta.icon)}"></i></div>
        <div class="lp-res-main"><b>${escapeHtml(l.title)}</b><span>${escapeHtml(meta.label)}${l.added_by_name ? ' · added by ' + escapeHtml(l.added_by_name) : ''}${l.description ? ' · ' + escapeHtml(l.description) : ''}</span></div>
        <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-light btn-sm"><i class="bi bi-box-arrow-up-right"></i> ${escapeHtml(meta.cta)}</a>
      </div>`;
  }).join('') : '<div class="lp-res-empty"><i class="bi bi-link-45deg"></i> No links added yet.</div>';

  const filesHtml = files.length ? files.map(f => `
      <div class="lp-res-item">
        <div class="lp-res-ic file"><i class="bi bi-file-earmark-text"></i></div>
        <div class="lp-res-main"><b>${escapeHtml(f.original_name)}</b><span>${fileSizeLabel(f.file_size)} · uploaded by ${escapeHtml(f.full_name || 'Guest')} · ${shortDate(f.created_at)}</span></div>
        <a href="${APP_ROOT}/backend/includes/download.php?id=${f.id}" class="btn btn-light btn-sm"><i class="bi bi-download"></i> Download</a>
      </div>`).join('') : '<div class="lp-res-empty"><i class="bi bi-paperclip"></i> No files attached yet.</div>';

  const thread = data.thread || [];
  const threadHtml = thread.length ? thread.map(m => `
      <div class="lp-msg"><b>${escapeHtml(m.full_name || m.sender_role)}</b><span>${escapeHtml(m.is_deleted ? 'This message was deleted.' : m.message)}</span></div>`).join('')
    : '<div class="lp-res-empty"><i class="bi bi-chat"></i> No messages yet.</div>';

  body.innerHTML = `
    <div class="lp-modal-head">
      <div class="lp-modal-ic"><i class="bi bi-briefcase"></i></div>
      <div style="min-width:0;flex:1;">
        <h3>${escapeHtml(r.subject)}</h3>
        <div class="small">${escapeHtml(r.tracking_code)}${r.service_name ? ' · ' + escapeHtml(r.service_name) : ''}</div>
      </div>
      ${statusBadge(r.status)}
    </div>

    <div class="lp-fields">
      ${field('Client', escapeHtml(r.guest_name || '—'))}
      ${field('Budget', r.budget ? escapeHtml(r.budget) : '—')}
      ${field('Received', shortDate(r.created_at))}
      ${field('Deadline', r.deadline ? shortDate(r.deadline) : '—')}
    </div>

    <div class="lp-prog"><div class="lp-prog-top"><span>Project progress</span><b>${pct}%</b></div><div class="lp-bar big"><span style="width:${pct}%"></span></div></div>

    ${r.message ? `<div class="lp-section"><h4><i class="bi bi-card-text"></i> Project description</h4><p class="lp-desc">${escapeHtml(r.message)}</p></div>` : ''}

    <div class="lp-section"><h4><i class="bi bi-link-45deg"></i> Project links <em>${links.length}</em></h4>${linksHtml}</div>
    <div class="lp-section"><h4><i class="bi bi-paperclip"></i> Attached files <em>${files.length}</em></h4>${filesHtml}</div>
    <div class="lp-section"><h4><i class="bi bi-chat-dots"></i> Conversation <em>${thread.length}</em></h4><div class="lp-thread">${threadHtml}</div></div>

    <div class="lp-modal-foot">
      <span class="small"><i class="bi bi-eye"></i> View-only — record your findings in the Lawyer Desk.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="${pageUrl('/admin/legal-desk.html')}?tab=notes" class="btn btn-primary btn-sm"><i class="bi bi-journal-plus"></i> Write a legal note</a>
        <a href="${pageUrl('/admin/legal-desk.html')}?tab=cases" class="btn btn-light btn-sm"><i class="bi bi-flag"></i> Report an issue</a>
      </div>
    </div>`;
}

async function renderRequestsList() {
  const statusFilter = statusFilterFromQuery();
  const tabs = ['all', 'pending', 'assigned', 'in_progress', 'review', 'completed', 'delivered', 'cancelled'];
  const tabsHtml = tabs.map(t => {
    const label = t === 'all' ? 'All' : t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<a href="requests.html?status=${t}" class="${statusFilter === t ? 'active' : ''}">${label}</a>`;
  }).join('');

  let { data } = await apiGet('/admin/requests.php?status=' + encodeURIComponent(statusFilter));

  // View-only accounts (the Lawyer) get the Company Projects layout: every project,
  // filtered with chips on the page itself, details in a pop-up.
  if (data.read_only) {
    if (statusFilter !== 'all') {
      PROJECT_FILTER = projectFilterForStatus(statusFilter);
      ({ data } = await apiGet('/admin/requests.php?status=all'));
    }
    renderProjectsPanel(data.requests);
    return;
  }
  window.__allRequestsForFilter = data.requests;

  document.getElementById('pageBody').innerHTML = `
    <div class="tabs-row">${tabsHtml}</div>
    <div class="panel">
      <div class="panel-head">
        <h3><i class="bi bi-inboxes"></i> Requests (<span id="reqFilterCount">${data.requests.length}</span>)</h3>
        <div class="filter-bar" style="margin-bottom:0;">
          <div class="search-box"><i class="bi bi-search"></i><input type="text" id="reqSearchInput" placeholder="Search code, client or service…"></div>
          <input type="date" id="reqFromDate" title="From date">
          <input type="date" id="reqToDate" title="To date">
        </div>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Code</th><th>Service</th><th>Client</th><th>Status</th><th>Received</th><th></th></tr></thead>
          <tbody id="reqTableBody"></tbody>
        </table>
      </div>
    </div>`;

  renderRequestRows(data.requests);
  document.getElementById('reqSearchInput').addEventListener('input', applyRequestFilters);
  document.getElementById('reqFromDate').addEventListener('change', applyRequestFilters);
  document.getElementById('reqToDate').addEventListener('change', applyRequestFilters);
}

function renderRequestRows(list) {
  document.getElementById('reqFilterCount').textContent = list.length;
  document.getElementById('reqTableBody').innerHTML = list.length
    ? list.map(r => `
      <tr>
        <td>${escapeHtml(r.tracking_code)}</td>
        <td><i class="bi ${escapeHtml(r.icon)}"></i> ${escapeHtml(r.service_name)}</td>
        <td>${escapeHtml(r.guest_name)}</td>
        <td>${statusBadge(r.status)} ${r.unread_messages > 0 ? `<span class="badge badge-warn">${r.unread_messages} new</span>` : ''}</td>
        <td class="small">${timeAgo(r.created_at)}</td>
        <td><a href="requests.html?view=${r.id}" class="btn btn-light btn-sm"><i class="bi bi-eye"></i> View</a></td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i>No requests match your filters.</td></tr>`;
}

function applyRequestFilters() {
  const q = (document.getElementById('reqSearchInput').value || '').trim().toLowerCase();
  const from = document.getElementById('reqFromDate').value;
  const to = document.getElementById('reqToDate').value;
  const all = window.__allRequestsForFilter || [];

  const filtered = all.filter(r => {
    if (q) {
      const hay = `${r.tracking_code} ${r.guest_name} ${r.service_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const created = r.created_at.slice(0, 10);
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });
  renderRequestRows(filtered);
}

async function renderRequestDetail(viewId) {
  const { data } = await apiGet('/admin/requests.php?view=' + viewId);

  // Show the REAL server error directly on the page instead of crashing with a
  // cryptic console message — this makes the actual cause visible without needing DevTools.
  if (!data || !data.request) {
    document.getElementById('pageBody').innerHTML = `
      <a href="requests.html" class="small"><i class="bi bi-arrow-left"></i> Back to all requests</a>
      <div class="alert alert-err" style="margin-top:12px;">
        <i class="bi bi-exclamation-triangle"></i>
        Could not load this request. Server said: <b>${escapeHtml((data && data.message) || 'Unknown error (no response body).')}</b>
      </div>`;
    return;
  }

  // View-only accounts (the Lawyer) see the Company Projects list with this project open in a pop-up.
  if (data.read_only) {
    await renderRequestsList();
    await viewProject(viewId, data);
    return;
  }

  const r = data.request;
  // Everyone else here is a manager/admin, so the management controls below are always available.
  // (The server enforces permissions too.)
  const readOnly = false;
  // A product request (from the Marketing Officer) has only three steps and is handled by a
  // Super Admin, a General Admin or a Sales Officer — no delivery progress bar or other statuses.
  const isProduct = r.request_type === 'product';
  // A product deal is completed from Marketing & Customer Acquisition ("Deal Done — Sale Made"), because completing it records a real sale.
  const statusChoices = isProduct ? (r.status === 'completed' ? ['pending', 'in_progress', 'completed'] : ['pending', 'in_progress']) : ['pending', 'assigned', 'in_progress', 'review', 'completed', 'delivered', 'cancelled'];

  const assignmentsHtml = data.assignments.length
    ? data.assignments.map(a => `<span class="tag-pill" style="margin:2px 4px 2px 0;"><i class="bi bi-person"></i> ${escapeHtml(a.full_name)} — ${statusBadge(a.task_status)}</span>`).join('')
    : `<p class="small">Not yet assigned to any staff.</p>`;

  let assignFormHtml = '';
  if (!data.assignments.length) {
    if (r.is_broadcast == 1) {
      assignFormHtml = `
        <form id="assignForm">
          <p class="small">This is an <b>Other Digital Services</b> request — it will be sent to <b>all active staff</b>, and the first available staff member can pick it up.</p>
          <button class="btn btn-primary btn-block"><i class="bi bi-broadcast"></i> Broadcast to All Staff</button>
        </form><div class="divider"></div>`;
    } else {
      const specialistOptions = data.staff_options.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)} (${escapeHtml(s.username)})</option>`).join('');
      const adminOptionsHtml = data.admin_options.map(a => `<option value="${a.id}">${escapeHtml(a.full_name)} — ${escapeHtml(a.role_label)}</option>`).join('');
      const hasAnyOption = data.staff_options.length || data.admin_options.length;
      assignFormHtml = `
        <form id="assignForm">
          <div class="form-group">
            <label>Assign To</label>
            <select name="staff_id" required>
              <option value="">Select…</option>
              ${data.staff_options.length ? `<optgroup label="${r.category_key ? 'Specialists — ' + escapeHtml(categoryLabel(r.category_key)) : 'Staff'}">${specialistOptions}</optgroup>` : ''}
              ${data.admin_options.length ? `<optgroup label="${isProduct ? 'Who will deal with it' : 'Administrators'}">${adminOptionsHtml}</optgroup>` : ''}
            </select>
          </div>
          <p class="small">${isProduct ? 'A product request is assigned to the Super Admin, a General Admin or a Sales Officer.' : 'Choose a specialist for hands-on delivery work, or an administrator if this needs managerial/administrative handling instead.'}</p>
          ${!hasAnyOption ? `<p class="small" style="color:var(--danger);">No active staff found in this category yet. Add one from the Staff Accounts page.</p>` : ''}
          <button class="btn btn-primary btn-block" ${!hasAnyOption ? 'disabled' : ''}><i class="bi bi-person-check"></i> Assign</button>
        </form><div class="divider"></div>`;
    }
  }

  document.getElementById('pageBody').innerHTML = `
    <a href="requests.html" class="small"><i class="bi bi-arrow-left"></i> Back to all requests</a>
    <div class="grid grid-2" style="align-items:start;margin-top:12px;">
      <div class="panel">
        <div class="panel-head">
          <h3><i class="bi ${escapeHtml(r.icon)}"></i> ${escapeHtml(r.subject)}</h3>
          ${statusBadge(r.status)}
        </div>
        <div class="panel-body">
          <p class="small"><b>Tracking Code:</b> ${escapeHtml(r.tracking_code)}</p>
          <p class="small"><b>${isProduct ? 'Type' : 'Service'}:</b> ${isProduct ? 'Product request' : escapeHtml(r.service_name)} ${r.is_broadcast == 1 ? '<span class="badge badge-info">Broadcast to all staff</span>' : ''}</p>
          <p class="small"><b>Client:</b> ${escapeHtml(r.guest_name)} — ${escapeHtml(r.guest_email)} ${r.guest_phone ? '/ ' + escapeHtml(r.guest_phone) : ''}</p>
          ${r.budget ? `<p class="small"><b>Budget:</b> ${escapeHtml(r.budget)}</p>` : ''}
          ${r.deadline ? `<p class="small"><b>Deadline:</b> ${new Date(r.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>` : ''}
          ${isProduct ? '' : renderProgressBar(r.progress)}
          <div class="divider"></div>
          <p>${escapeHtml(r.message).replace(/\n/g, '<br>')}</p>
          <div class="divider"></div>
          <h4><i class="bi bi-people"></i> Assigned To</h4>
          ${assignmentsHtml}
        </div>
      </div>

      ${readOnly ? `
      <div class="panel">
        <div class="panel-head"><h3><i class="bi bi-journal-bookmark"></i> Legal Review</h3></div>
        <div class="panel-body">
          <p class="small" style="margin-top:0;">You have <b>view-only</b> access here. Open the project links and download the attached files below, then record your findings in the Lawyer Desk.</p>
          <a href="${pageUrl('/admin/legal-desk.html')}?tab=notes" class="btn btn-primary btn-block" style="margin-bottom:8px;"><i class="bi bi-journal-plus"></i> Write a legal note</a>
          <a href="${pageUrl('/admin/legal-desk.html')}?tab=cases" class="btn btn-light btn-block"><i class="bi bi-flag"></i> Report an issue or case</a>
        </div>
      </div>` : `
      <div class="panel">
        <div class="panel-head"><h3><i class="bi bi-gear"></i> Manage Request</h3></div>
        <div class="panel-body">
          ${assignFormHtml}
          <form id="statusForm">
            <div class="form-group">
              <label>Update Status</label>
              <select name="status" id="statusSelect">
                ${statusChoices.map(st => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${st.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Admin Note (shown to customer, optional)</label><textarea name="admin_note">${escapeHtml(r.admin_note || '')}</textarea></div>
            <button class="btn btn-light btn-block"><i class="bi bi-check2"></i> Update Status</button>
          </form>
          ${isProduct ? '' : `<div class="divider"></div>
          <form id="progressForm">
            <div class="form-group">
              <label>Progress (%)</label>
              <input type="range" name="progress" min="0" max="100" step="5" value="${parseInt(r.progress, 10) || 0}"
                oninput="this.nextElementSibling.textContent = this.value + '%'">
              <span class="small">${parseInt(r.progress, 10) || 0}%</span>
            </div>
            <div class="form-group"><label>Internal Notes (staff/admin only)</label><textarea name="internal_notes" rows="2">${escapeHtml(r.internal_notes || '')}</textarea></div>
            <button class="btn btn-light btn-block"><i class="bi bi-save"></i> Save Progress</button>
          </form>`}
        </div>
      </div>`}
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><h3><i class="bi bi-link-45deg"></i> Project Links</h3></div>
      <div class="panel-body">${renderLinksHtml(data.links, data.link_types, !readOnly)}</div>
    </div>
    <div id="threadContainer"></div>`;

  if (!readOnly) {
    const assignForm = document.getElementById('assignForm');
    if (assignForm) {
      assignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        fd.append('action', 'assign');
        fd.append('request_id', viewId);
        const { data } = await apiPost('/admin/requests.php', fd);
        showFlash(data.message, data.success ? 'success' : 'error');
        if (data.success) renderRequestDetail(viewId);
      });
    }

    document.getElementById('statusForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      fd.append('action', 'update_status');
      fd.append('request_id', viewId);
      const { data } = await apiPost('/admin/requests.php', fd);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) renderRequestDetail(viewId);
    });

    document.getElementById('progressForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      fd.append('action', 'update_progress');
      fd.append('request_id', viewId);
      const { data } = await apiPost('/admin/requests.php', fd);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) renderRequestDetail(viewId);
    });

    wireProjectPanels({ apiPath: '/admin/requests.php', requestId: viewId, onChange: () => renderRequestDetail(viewId) });
  }

  renderRequestThread(document.getElementById('threadContainer'), {
    attachments: data.attachments,
    thread: data.thread,
    viewerId: readOnly ? 0 : data.viewer_id,
    viewerRole: readOnly ? 'viewer' : CURRENT_USER.role,
    canReply: !readOnly,
    apiPath: '/admin/requests.php',
    requestId: viewId,
    onChange: () => renderRequestDetail(viewId),
  });
}

function categoryLabel(key) {
  const map = {
    web_dev: 'Web Development', app_dev: 'App Development', software_hardware: 'Software & Hardware Solutions',
    it_consultancy: 'IT Consultancy', ai_ml: 'AI/ML Projects', multimedia: 'Multimedia/Animation Projects',
    graphics: 'Graphics Designing', other_services: 'All Other Digital Services',
  };
  return map[key] || key;
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Service Requests', crumb: 'Admin / Operations / Requests', activeKey: 'requests', allowedRoles: ['admin'], anyPermission: ['projects.view','projects.manage'] });
  if (!user) return;

  const viewId = viewIdFromQuery();
  if (viewId) {
    await renderRequestDetail(viewId);
  } else {
    await renderRequestsList();
  }
})();
