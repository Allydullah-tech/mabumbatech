function statusFilterFromQuery() {
  return new URLSearchParams(window.location.search).get('status') || 'all';
}
function leadViewFromQuery() {
  const v = new URLSearchParams(window.location.search).get('lead');
  return v ? parseInt(v, 10) : 0;
}

let CAN_MANAGE_SALES = false;

async function renderPipeline() {
  const statusFilter = statusFilterFromQuery();
  const { data } = await apiGet('/admin/sales.php?status=' + encodeURIComponent(statusFilter));
  CAN_MANAGE_SALES = !!data.can_manage;

  document.getElementById('statNew').textContent = data.stats.new_count || 0;
  document.getElementById('statQuotation').textContent = data.stats.quotation_count || 0;
  document.getElementById('statNegotiation').textContent = data.stats.negotiation_count || 0;
  document.getElementById('statWon').textContent = data.stats.won_this_month || 0;

  document.getElementById('addLeadBtn')?.style && (document.getElementById('addLeadBtn').style.display = CAN_MANAGE_SALES ? '' : 'none');

  const fu = document.getElementById('followUpPanel');
  if (data.follow_ups_due && data.follow_ups_due.length) {
    fu.style.display = '';
    document.getElementById('followUpBody').innerHTML = data.follow_ups_due.map(f => `
      <a href="sales.html?lead=${f.lead_id}" class="notif-item">
        <i class="bi bi-alarm-fill"></i>
        <span class="notif-item-body"><b>${escapeHtml(f.full_name)}</b><span>Follow-up was due ${timeAgo(f.follow_up_at)}</span></span>
      </a>`).join('');
  } else {
    fu.style.display = 'none';
  }

  const svcSelect = document.getElementById('addLeadService');
  if (svcSelect && !svcSelect.dataset.filled) {
    svcSelect.insertAdjacentHTML('beforeend', data.services.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join(''));
    svcSelect.dataset.filled = '1';
  }
  const assignSelect = document.getElementById('addLeadAssignee');
  if (assignSelect && !assignSelect.dataset.filled) {
    assignSelect.insertAdjacentHTML('beforeend', data.sales_users.map(u => `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join(''));
    assignSelect.dataset.filled = '1';
  }

  const tabs = ['all', 'new', 'contacted', 'qualified', 'quotation', 'negotiation', 'won', 'lost'];
  const tabsHtml = tabs.map(t => {
    const label = t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1);
    return `<a href="sales.html?status=${t}" class="${statusFilter === t ? 'active' : ''}">${label}</a>`;
  }).join('');

  document.getElementById('pipelineBody').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3><i class="bi bi-graph-up-arrow"></i> Leads Pipeline (<span>${data.leads.length}</span>)</h3></div>
      <div class="tabs-row">${tabsHtml}</div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Lead</th><th>Company</th><th>Source</th><th>Requested Service</th><th>Assigned To</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${data.leads.length ? data.leads.map(l => `
              <tr>
                <td class="row-name"><b>${escapeHtml(l.full_name)}</b><span>${escapeHtml(l.email || l.phone || '—')}</span></td>
                <td>${escapeHtml(l.company_name || '—')}</td>
                <td class="small">${escapeHtml(leadSourceLabel(l.source))}</td>
                <td>${escapeHtml(l.service_name || '—')}</td>
                <td>${escapeHtml(l.assigned_name || 'Unassigned')}</td>
                <td>${statusBadge(l.status)}</td>
                <td class="small">${timeAgo(l.created_at)}</td>
                <td class="actions-cell"><button class="btn btn-light btn-sm" onclick="location.href='sales.html?lead=${l.id}'"><i class="bi bi-eye"></i> View</button></td>
              </tr>`).join('') : '<tr><td colspan="8" class="empty-state"><i class="bi bi-inbox"></i>No leads at this stage.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function openLeadDetail(id) {
  const { data } = await apiGet('/admin/sales.php?view=' + id);
  if (!data.lead) { showFlash('Lead not found.', 'error'); return; }
  CAN_MANAGE_SALES = !!data.can_manage;
  const l = data.lead;

  const statusOptions = ['new', 'contacted', 'qualified', 'quotation', 'negotiation', 'lost']
    .map(s => `<option value="${s}" ${l.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('');

  const activitiesHtml = data.activities.length ? data.activities.map(a => `
    <div class="notif-item" style="cursor:default;">
      <i class="bi ${a.activity_type === 'status_change' ? 'bi-arrow-repeat' : 'bi-chat-left-text'}"></i>
      <span class="notif-item-body">
        <b>${a.activity_type === 'status_change' ? `Status: ${escapeHtml(a.old_status)} → ${escapeHtml(a.new_status)}` : escapeHtml(a.description || a.activity_type)}</b>
        <span>${escapeHtml(a.user_name || 'System')} · ${timeAgo(a.created_at)}</span>
      </span>
    </div>`).join('') : '<div class="empty-state">No activity yet.</div>';

  const quotesHtml = data.quotations.length ? data.quotations.map(q => `
    <div class="notif-item" style="cursor:default;">
      <i class="bi bi-file-earmark-text"></i>
      <span class="notif-item-body">
        <b>${escapeHtml(q.quote_code)} — ${escapeHtml(q.title)}</b>
        <span>Amount: ${escapeHtml(String(q.amount))} · ${statusBadge(q.status)}</span>
      </span>
      ${CAN_MANAGE_SALES && q.status === 'sent' ? `
        <div style="display:flex;gap:4px;">
          <button class="btn btn-light btn-sm" onclick="updateQuotationStatus(${l.id}, ${q.id}, 'accepted')"><i class="bi bi-check2"></i></button>
          <button class="btn btn-light btn-sm" onclick="updateQuotationStatus(${l.id}, ${q.id}, 'rejected')"><i class="bi bi-x"></i></button>
        </div>` : ''}
    </div>`).join('') : '<div class="empty-state">No quotations yet.</div>';

  document.getElementById('leadDetailBody').innerHTML = `
    <h3><i class="bi bi-person-vcard"></i> ${escapeHtml(l.full_name)}</h3>
    <p class="small">${escapeHtml(l.company_name || '')} ${l.email ? '· ' + escapeHtml(l.email) : ''} ${l.phone ? '· ' + escapeHtml(l.phone) : ''}</p>
    <p class="small">Source: ${escapeHtml(leadSourceLabel(l.source))}${l.source_detail ? ' (' + escapeHtml(l.source_detail) + ')' : ''}</p>
    <div style="margin-bottom:14px;">${statusBadge(l.status)}</div>

    ${CAN_MANAGE_SALES ? `
    <div class="form-row" style="margin-bottom:14px;">
      <div class="form-group">
        <label>Status</label>
        <select id="leadStatusSelect">${statusOptions}</select>
      </div>
      <div class="form-group" style="align-self:flex-end;">
        <button class="btn btn-light btn-block" onclick="changeLeadStatus(${l.id})"><i class="bi bi-arrow-repeat"></i> Update Status</button>
      </div>
    </div>
    ${l.status !== 'won' && l.status !== 'lost' ? `<button class="btn btn-primary btn-block" style="margin-bottom:14px;" onclick="openConvertForm(${l.id}, ${l.requested_service_id || 0})"><i class="bi bi-trophy"></i> Convert to Project (Won)</button>` : ''}
    <div id="convertFormBox"></div>
    ` : ''}

    <h4 style="margin:14px 0 6px;">Quotations</h4>
    <div class="notif-row-list" style="max-height:160px;overflow-y:auto;margin-bottom:10px;">${quotesHtml}</div>
    ${CAN_MANAGE_SALES ? `
    <form id="addQuoteForm" style="margin-bottom:18px;">
      <div class="form-row">
        <div class="form-group"><label>Quote Title</label><input type="text" name="title" required></div>
        <div class="form-group"><label>Amount</label><input type="number" step="0.01" name="amount" required></div>
      </div>
      <button class="btn btn-light btn-block"><i class="bi bi-plus-circle"></i> Add Quotation</button>
    </form>` : ''}

    <h4 style="margin:14px 0 6px;">Activity</h4>
    <div class="notif-row-list" style="max-height:200px;overflow-y:auto;margin-bottom:10px;">${activitiesHtml}</div>
    ${CAN_MANAGE_SALES ? `
    <form id="addActivityForm">
      <div class="form-group"><label>Add Note / Follow-up</label><textarea name="description" rows="2" placeholder="What happened, or what's next…"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Type</label>
          <select name="activity_type"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="follow_up">Follow-up</option></select>
        </div>
        <div class="form-group"><label>Follow-up At (optional)</label><input type="datetime-local" name="follow_up_at"></div>
      </div>
      <button class="btn btn-light btn-block"><i class="bi bi-plus-circle"></i> Log</button>
    </form>` : ''}
  `;

  if (CAN_MANAGE_SALES) {
    document.getElementById('addQuoteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      form.append('action', 'create_quotation');
      form.append('lead_id', l.id);
      const { data } = await apiPost('/admin/sales.php', form);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) openLeadDetail(l.id);
    });
    document.getElementById('addActivityForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      form.append('action', 'add_activity');
      form.append('lead_id', l.id);
      const { data } = await apiPost('/admin/sales.php', form);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) openLeadDetail(l.id);
    });
  }

  openModal('leadDetailModal');
}

async function changeLeadStatus(leadId) {
  const status = document.getElementById('leadStatusSelect').value;
  let lostReason = null;
  if (status === 'lost') lostReason = prompt('Reason lost (optional):') || '';
  const { data } = await apiPost('/admin/sales.php', { action: 'change_status', lead_id: leadId, status, lost_reason: lostReason });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) openLeadDetail(leadId);
}

async function updateQuotationStatus(leadId, quotationId, status) {
  const { data } = await apiPost('/admin/sales.php', { action: 'update_quotation_status', lead_id: leadId, quotation_id: quotationId, status });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) openLeadDetail(leadId);
}

function openConvertForm(leadId, serviceId) {
  document.getElementById('convertFormBox').innerHTML = `
    <form id="convertForm" style="margin-bottom:14px;border:1px solid var(--line);border-radius:10px;padding:12px;">
      <div class="form-group"><label>Project Subject</label><input type="text" name="subject" required></div>
      <div class="form-group"><label>Project Brief</label><textarea name="message" rows="2" required></textarea></div>
      <input type="hidden" name="service_id" value="${serviceId || ''}">
      <button class="btn btn-primary btn-block"><i class="bi bi-check2-circle"></i> Confirm — Create Project</button>
    </form>`;
  document.getElementById('convertForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('This marks the lead Won and creates a real project. Continue?')) return;
    const form = new FormData(e.target);
    form.append('action', 'convert_won');
    form.append('lead_id', leadId);
    const { data } = await apiPost('/admin/sales.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('leadDetailModal'); renderPipeline(); }
  });
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Sales & Leads', crumb: 'Admin / Sales / Pipeline', activeKey: 'sales', allowedRoles: ['admin'], anyPermission: ['sales.view','sales.manage'] });
  if (!user) return;

  await renderPipeline();

  const leadId = leadViewFromQuery();
  if (leadId) openLeadDetail(leadId);

  document.getElementById('addLeadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'create_lead');
    const { data } = await apiPost('/admin/sales.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('addLeadModal'); e.target.reset(); renderPipeline(); }
  });
})();
