function budgetStatusBadge(status, transfer) {
  const map = {
    pending:  ['badge-warn', 'bi-hourglass-split', 'Pending'],
    approved: ['badge-ok',   'bi-check-circle-fill', 'Approved'],
    rejected: ['badge-off',  'bi-x-circle-fill', 'Rejected'],
  };
  let [cls, icon, label] = map[status] || ['badge-info', 'bi-dot', status];
  if (status === 'approved' && transfer === 'awaiting') { cls = 'badge-info'; icon = 'bi-send'; label = 'Approved · Awaiting transfer'; }
  if (status === 'approved' && transfer === 'transferred') { cls = 'badge-ok'; icon = 'bi-bank'; label = 'Money transferred'; }
  return `<span class="badge ${cls}" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;"><i class="bi ${icon}"></i>${escapeHtml(label)}</span>`;
}

const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const refCode = (id) => 'BR-' + String(id).padStart(4, '0');
function niceDate(dt) {
  if (!dt) return '—';
  const d = new Date(String(dt).replace(' ', 'T'));
  if (isNaN(d)) return escapeHtml(dt);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + `<div class="small">${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>`;
}

let HISTORY_FILTER = 'all';
let MY_REQUESTS = [];

function renderBudgetHistory() {
  const box = document.getElementById('budgetHistory');
  if (!box) return;
  const all = MY_REQUESTS;
  const sum = (st) => all.filter(r => st === 'all' || r.status === st).reduce((t, r) => t + Number(r.amount || 0), 0);
  const cnt = (st) => all.filter(r => st === 'all' || r.status === st).length;
  const rows = all.filter(r => HISTORY_FILTER === 'all' || r.status === HISTORY_FILTER);

  const stat = (icon, tone, label, count, amount) => `
    <div class="card stat-card"><div class="ic ${tone}"><i class="bi ${icon}"></i></div>
      <div><b>${count}</b><span>${label}</span><span style="display:block;font-weight:600;color:var(--ink);">${tzs(amount)}</span></div></div>`;

  const chip = (key, label) => `<a href="#" data-f="${key}" class="${HISTORY_FILTER === key ? 'active' : ''}">${label} (${cnt(key)})</a>`;

  box.innerHTML = `
    <div class="panel-head">
      <h3><i class="bi bi-clock-history"></i> Request History</h3>
      <span class="small">${all.length} request${all.length === 1 ? '' : 's'} submitted</span>
    </div>
    <div class="grid" style="padding:14px 14px 4px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));">
      ${stat('bi-cash-stack', 'blue', 'Total requested', cnt('all'), sum('all'))}
      ${stat('bi-hourglass-split', 'orange', 'Pending', cnt('pending'), sum('pending'))}
      ${stat('bi-check-circle', 'green', 'Approved', cnt('approved'), sum('approved'))}
      ${stat('bi-x-circle', 'red', 'Rejected', cnt('rejected'), sum('rejected'))}
    </div>
    <div class="tabs-row" id="budgetHistoryTabs" style="margin:6px 14px 12px;">${chip('all', 'All')}${chip('pending', 'Pending')}${chip('approved', 'Approved')}${chip('rejected', 'Rejected')}</div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Ref</th><th>Purpose</th><th style="text-align:right;">Amount</th><th>Status</th><th>Submitted</th><th>Decision</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td><code style="font-size:.74rem;font-weight:700;color:var(--blue-700);">${refCode(r.id)}</code></td>
            <td style="min-width:200px;"><b>${escapeHtml(r.purpose)}</b>${r.details ? `<div class="small">${escapeHtml(r.details)}</div>` : ''}</td>
            <td style="text-align:right;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums;">${tzs(r.amount)}</td>
            <td>${budgetStatusBadge(r.status, r.transfer_status)}</td>
            <td class="small" style="white-space:nowrap;">${niceDate(r.created_at)}</td>
            <td class="small" style="min-width:150px;">${r.status === 'pending'
              ? '<span style="color:var(--ink-soft);">Awaiting review</span>'
              : `${r.status === 'approved' ? (r.transfer_status === 'transferred'
                    ? `<div style="color:#16663a;font-weight:700;"><i class="bi bi-bank"></i> Transferred ${niceDate(r.transferred_at)}${r.transfer_reference ? ' · ' + escapeHtml(r.transfer_reference) : ''}</div>`
                    : '<div style="color:var(--blue-700);font-weight:700;"><i class="bi bi-send"></i> Sent to Accountant for transfer</div>') : ''}
                ${r.decided_by_name ? '<b>' + escapeHtml(r.decided_by_name) + '</b>' : ''}${r.decided_at ? `<div>${niceDate(r.decided_at)}</div>` : ''}${r.decision_note ? `<div style="margin-top:3px;font-style:italic;">“${escapeHtml(r.decision_note)}”</div>` : ''}`}</td>
          </tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i>${all.length ? 'No ' + HISTORY_FILTER + ' requests.' : 'You have not submitted any budget requests yet.'}</td></tr>`}</tbody>
      </table>
    </div>`;

  box.querySelectorAll('#budgetHistoryTabs a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault(); HISTORY_FILTER = a.dataset.f; renderBudgetHistory();
  }));
}

async function loadLegal() {
  const { data } = await apiGet('/admin/legal.php');
  const requestFormSection = data.can_request_budget ? `
    <div class="panel" style="margin-bottom:18px;">
      <div class="panel-head"><h3><i class="bi bi-cash-stack"></i> Request a Budget</h3></div>
      <form id="budgetRequestForm" class="form" style="padding:14px;">
        <div class="form-group"><label>Purpose</label><input type="text" name="purpose" required placeholder="e.g. Client travel to Dodoma"></div>
        <div class="form-group"><label>Amount (TZS)</label><input type="number" name="amount" min="1" step="1" required></div>
        <div class="form-group"><label>Details (optional)</label><textarea name="details" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary"><i class="bi bi-send"></i> Submit Request</button>
      </form>
    </div>
    <div class="panel" id="budgetHistory" style="margin-bottom:18px;"></div>` : '';

  const decideSection = data.can_decide_budget ? `
    <div class="panel" style="margin-bottom:18px;">
      <div class="panel-head"><h3><i class="bi bi-wallet2"></i> Budget Requests to Review</h3></div>
      ${data.pending_budget_requests.length ? `
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>From</th><th>Dept.</th><th>Purpose</th><th style="text-align:right;">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${data.pending_budget_requests.map(r => `
          <tr>
            <td>${escapeHtml(r.requested_by_name)}</td>
            <td>${escapeHtml(r.department)}</td>
            <td>${escapeHtml(r.purpose)}${r.details ? `<div class="small">${escapeHtml(r.details)}</div>` : ''}</td>
            <td style="text-align:right;white-space:nowrap;font-weight:700;">${tzs(r.amount)}</td>
            <td>${budgetStatusBadge(r.status, r.transfer_status)}</td>
            <td>${r.status === 'pending' ? `
              <button class="btn btn-light btn-sm" onclick="decideBudget(${r.id}, 'approved')" title="Approve"><i class="bi bi-check2"></i></button>
              <button class="btn btn-light btn-sm" onclick="decideBudget(${r.id}, 'rejected')" title="Reject"><i class="bi bi-x"></i></button>` : '-'}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><i class="bi bi-inbox"></i>Nothing pending.</div>`}
    </div>` : '';

  document.getElementById('pageBody').innerHTML = requestFormSection + decideSection ||
    `<div class="empty-state"><i class="bi bi-inbox"></i>Nothing to show here yet.</div>`;

  MY_REQUESTS = data.my_budget_requests || [];
  renderBudgetHistory();

  const rf = document.getElementById('budgetRequestForm');
  if (rf) rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'request_budget');
    const { data } = await apiPost('/admin/legal.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) loadLegal();
  });
}

async function decideBudget(id, decision) {
  const note = decision === 'rejected' ? (prompt('Optional note for the requester:') || '') : '';
  const { data } = await apiPost('/admin/legal.php', { action: 'decide_budget', request_id: id, decision, note });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) loadLegal();
}

(async function () {
  const user = await initDashLayout({
    pageTitle: 'Legal & Budget Requests', crumb: 'Admin / Legal', activeKey: 'legal',
    allowedRoles: ['admin'],
    anyPermission: ['legal.view', 'legal.manage', 'budget_requests.create', 'budget_requests.manage'],
  });
  if (!user) return;
  await loadLegal();
})();
