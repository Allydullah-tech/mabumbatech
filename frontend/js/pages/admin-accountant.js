/* Accountant Desk — income, company budgets, salaries (kept separate), expenses, company loans, bank accounts */
let ACC = null;
let accTab = new URLSearchParams(location.search).get('tab') || 'income';
if (accTab === 'transfers') accTab = 'budgets';   // old links
let accMonth = null;
let memberFilter = 'all';
let memberSearch = '';

const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const methodLabel = { cash: 'Cash', bank_transfer: 'Bank transfer', mobile_money: 'Mobile money', card: 'Card', other: 'Other' };

function niceDate(dt) {
  if (!dt) return '—';
  const d = new Date(String(dt).replace(' ', 'T'));
  if (isNaN(d)) return escapeHtml(dt);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function monthLabel(ym) {
  const d = new Date(ym + '-01T00:00:00');
  return isNaN(d) ? ym : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
const currentYm = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const brCode = (id) => 'BR-' + String(id).padStart(4, '0');

function copyText(text) {
  const done = () => showFlash('Copied: ' + text, 'success');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
}

function bankHtml(b) {
  if (!b.account_number) return '<span class="acc-missing"><i class="bi bi-exclamation-triangle"></i> No bank account yet</span>';
  return `<div class="acc-bank"><b>${escapeHtml(b.bank_name)}</b><br>${escapeHtml(b.account_name)}<br>
    <code>${escapeHtml(b.account_number)}</code><button class="copy" type="button" title="Copy account number" onclick="copyText('${escapeHtml(b.account_number)}')"><i class="bi bi-clipboard"></i></button></div>`;
}

async function loadAcc() {
  const { data } = await apiGet('/admin/accountant.php' + (accMonth ? '?month=' + encodeURIComponent(accMonth) : ''));
  ACC = data;
  accMonth = data.salary.month;
  renderAcc();
}

function renderAcc() {
  const d = ACC, o = d.overview, p = d.position;
  const negative = p.net < 0;
  const salaryOwed = o.overdue_amount + o.current_unpaid_amount;

  const alerts = [];
  if (o.overdue_months > 0) {
    const names = d.months.filter(m => m.overdue).map(m => `<a onclick="openSalaryMonth('${m.month}')">${escapeHtml(m.label)}</a> (${m.unpaid} unpaid)`).join(', ');
    alerts.push(`<div class="acc-alert red"><i class="bi bi-exclamation-octagon-fill"></i><div><b>Salaries not paid:</b> ${names}. Total still owed for past months: <b>${tzs(o.overdue_amount)}</b>. Workers must be paid.</div></div>`);
  }
  if (o.loans_overdue > 0) {
    alerts.push(`<div class="acc-alert orange"><i class="bi bi-calendar-x"></i><div><b>${o.loans_overdue} loan${o.loans_overdue === 1 ? ' is' : 's are'} past the final repayment date.</b> <a onclick="switchAccTab('loans')">Open Loans</a> to record repayments.</div></div>`);
  }
  if (negative) {
    alerts.push(`<div class="acc-alert red"><i class="bi bi-graph-down-arrow"></i><div><b>The company is at a loss of ${tzs(Math.abs(p.net))}.</b> Expenses are higher than income.</div></div>`);
  }

  const card = (icon, tone, value, label, sub, tab) => `
    <div class="card stat-card" ${tab ? `style="cursor:pointer;" onclick="switchAccTab('${tab}')"` : ''}>
      <div class="ic ${tone}"><i class="bi ${icon}"></i></div>
      <div><b class="${tone === 'red' && value.includes('-') ? '' : ''}">${value}</b><span>${label}</span>${sub ? `<span class="acc-sub">${sub}</span>` : ''}</div>
    </div>`;

  const tabs = [
    ['income', 'Income to Record', o.income_waiting_count],
    ['budgets', 'Company Budgets', o.transfers_count],
    ['salaries', 'Salaries', o.overdue_months + (o.current_unpaid > 0 ? 1 : 0)],
    ['expenses', 'Expenses', 0],
    ['incomelog', 'Income', 0],
    ['transactions', 'All Transactions', 0],
    ['loans', 'Loans', o.loans_overdue],
    ['banks', 'Bank Accounts', o.missing_bank],
  ].map(([k, label, n]) => `<a href="#" data-tab="${k}" class="${accTab === k ? 'active' : ''}">${label}${n > 0 ? ` <span class="badge badge-${k === 'banks' ? 'info' : 'warn'}" style="margin-left:4px;">${n}</span>` : ''}</a>`).join('');

  const incomeOther = p.income - p.sales_revenue;
  document.getElementById('pageBody').innerHTML = `
    ${alerts.join('')}
    <div class="grid grid-4" style="margin-bottom:16px;">
      ${card(negative ? 'bi-graph-down-arrow' : 'bi-piggy-bank', negative ? 'red' : 'green', (negative ? '− ' : '') + tzs(Math.abs(p.net)), negative ? 'Company Loss' : 'Company Profit', `Other income ${tzs(incomeOther)} + sales profit ${tzs(p.sales_profit)} − expenses ${tzs(p.expenses)}`)}
      ${card('bi-safe', p.available_funds < 0 ? 'red' : 'blue', (p.available_funds < 0 ? '− ' : '') + tzs(Math.abs(p.available_funds)), 'Available Funds', 'Profit + loans received − loan principal repaid')}
      ${card('bi-cart-check', 'blue', tzs(p.sales_revenue), 'Sales Revenue', `Profit from sales (Sales Officer): ${tzs(p.sales_profit)}`)}
      ${card('bi-bank2', p.loans_outstanding > 0 ? 'orange' : 'green', tzs(p.loans_outstanding), 'Loans Outstanding', o.loans_active ? `${o.loans_active} active loan${o.loans_active === 1 ? '' : 's'}${o.loans_overdue ? ' · ' + o.loans_overdue + ' overdue' : ''}` : 'No active loans', 'loans')}
    </div>
    <div class="grid grid-3" style="margin-bottom:16px;">
      ${card('bi-cash-coin', 'blue', tzs(o.income_waiting_amount), 'Income Waiting to Record', `${o.income_waiting_count} finished project${o.income_waiting_count === 1 ? '' : 's'}`, 'income')}
      ${card('bi-briefcase', 'orange', tzs(o.transfers_amount), 'Company Budgets to Pay', `${o.transfers_count} approved budget${o.transfers_count === 1 ? '' : 's'}${o.budgets_pending_count ? ' · ' + o.budgets_pending_count + ' awaiting approval' : ''}`, 'budgets')}
      ${card('bi-wallet2', salaryOwed > 0 ? 'red' : 'green', tzs(salaryOwed), 'Salaries Unpaid', o.overdue_months ? `${o.overdue_months} past month${o.overdue_months === 1 ? '' : 's'} overdue` : (o.current_unpaid ? `${o.current_unpaid} waiting this month` : 'All paid up'), 'salaries')}
    </div>
    <div class="panel">
      <div class="panel-head"><h3><i class="bi bi-calculator"></i> Accountant Desk</h3></div>
      <div class="tabs-row" id="accTabs">${tabs}</div>
      <div id="accBody"></div>
    </div>`;

  document.querySelectorAll('#accTabs a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); switchAccTab(a.dataset.tab); }));
  renderAccTab();
}

function switchAccTab(tab) {
  accTab = tab;
  document.querySelectorAll('#accTabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  renderAccTab();
}
function renderAccTab() {
  const body = document.getElementById('accBody');
  if (!body) return;
  ({ income: renderIncomeTab, budgets: renderBudgetsTab, salaries: renderSalariesTab, expenses: renderExpensesTab, incomelog: renderIncomeLogTab, transactions: renderTransactionsTab, loans: renderLoansTab, banks: renderBanksTab }[accTab] || renderIncomeTab)(body);
}

/* ============================ 1) INCOME ============================ */
function renderIncomeTab(body) {
  const w = ACC.income.waiting, rec = ACC.income.recorded, canF = ACC.can_finance;
  body.innerHTML = `
    <p class="small" style="padding:0 18px 10px;">When a project is finished, it appears here with the budget that was set for it. Click <b>Record as Income</b> to add that money to company income. Product sales from <i>Record Sale</i> are added to income automatically, so they do not appear here.</p>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Project</th><th>Customer</th><th>Finished</th><th>Budget set</th><th style="text-align:right;">To record</th><th></th></tr></thead>
      <tbody>${w.length ? w.map(r => `<tr>
        <td style="min-width:200px;"><b>${escapeHtml(r.subject)}</b><div class="small">${escapeHtml(r.tracking_code)} · ${escapeHtml(r.service_name || '')}</div></td>
        <td>${escapeHtml(r.customer_name || '—')}</td>
        <td class="small" style="white-space:nowrap;">${niceDate(r.completed_at)}</td>
        <td class="small">${r.budget ? escapeHtml(r.budget) : '<span class="acc-missing">No budget set</span>'}</td>
        <td class="acc-num">${r.to_record > 0 ? tzs(r.to_record) : '<span class="small">enter amount</span>'}</td>
        <td>${canF ? `<button class="btn btn-primary btn-sm" onclick="openIncomeModal(${r.id})"><i class="bi bi-plus-circle"></i> Record as Income</button>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-check2-circle"></i>Nothing waiting — every finished project has been recorded.</td></tr>`}</tbody>
    </table></div>
    ${rec.length ? `<h4 style="margin:18px 18px 8px;font-size:.9rem;">Recently recorded</h4>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Project</th><th>Customer</th><th>Recorded</th><th style="text-align:right;">Income</th></tr></thead>
      <tbody>${rec.map(r => `<tr>
        <td><b>${escapeHtml(r.subject)}</b><div class="small">${escapeHtml(r.tracking_code)}</div></td>
        <td>${escapeHtml(r.customer_name || '—')}</td>
        <td class="small">${r.via_invoice ? 'Collected through invoices' : niceDate(r.recorded_on)}</td>
        <td class="acc-num">${tzs(r.collected)}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}`;
}

function openIncomeModal(id) {
  const r = ACC.income.waiting.find(x => Number(x.id) === Number(id));
  if (!r) return;
  document.getElementById('incomeRequestId').value = r.id;
  document.getElementById('incomeInfo').innerHTML = `<b>${escapeHtml(r.subject)}</b><br>${escapeHtml(r.tracking_code)} · ${escapeHtml(r.customer_name || 'Customer')}<br>Budget set: <b>${r.budget ? escapeHtml(r.budget) : 'not set'}</b>`;
  const amt = document.getElementById('incomeAmount');
  amt.value = r.to_record > 0 ? r.to_record : '';
  amt.max = r.to_record > 0 ? r.to_record : '';
  document.getElementById('incomeHint').textContent = r.to_record > 0
    ? (r.collected > 0 ? `Already collected through invoices: ${tzs(r.collected)}. Only the remaining budget can be recorded.` : 'The full project budget is filled in. You can lower it if the customer paid less.')
    : 'No amount could be read from the budget, so please type the amount received.';
  openModal('incomeModal');
}

/* ============================ 2) COMPANY BUDGETS ============================ */
/* Operational money requested by employees / departments (emergency, marketing, special expenses…).
   Completely separate from salaries — but both reduce company funds. */
let budgetFilter = 'all';
let budgetSearch = '';
const budgetStateInfo = {
  pending:  ['badge-warn', 'bi-hourglass-split', 'Awaiting approval'],
  awaiting: ['badge-info', 'bi-send', 'Approved — to pay'],
  partial:  ['badge-warn', 'bi-pie-chart', 'Partly paid'],
  paid:     ['badge-ok', 'bi-check-circle-fill', 'Paid'],
  rejected: ['badge-off', 'bi-x-circle-fill', 'Rejected'],
};
const budgetBadge = (st) => { const i = budgetStateInfo[st] || budgetStateInfo.pending; return `<span class="badge ${i[0]}"><i class="bi ${i[1]}"></i> ${i[2]}</span>`; };

function renderBudgetsTab(body) {
  const B = ACC.budgets, canF = ACC.can_finance, t = B.totals;
  const all = B.requests;
  const count = (st) => all.filter(r => r.pay_state === st).length;
  const q = budgetSearch.trim().toLowerCase();
  const rows = all.filter(r =>
    (budgetFilter === 'all' || r.pay_state === budgetFilter || (budgetFilter === 'topay' && (r.pay_state === 'awaiting' || r.pay_state === 'partial'))) &&
    (!q || [r.code, r.requester_name, r.purpose, r.details, r.type_label].join(' ').toLowerCase().includes(q)));
  const chip = (k, label, n) => `<a href="#" data-f="${k}" class="${budgetFilter === k ? 'active' : ''}">${label} (${n})</a>`;

  body.innerHTML = `
    <p class="small" style="padding:0 18px 10px;">Company budgets are funds requested by employees or departments — emergencies, marketing and promotions, special company expenses and other approved needs. Each payment you record is an expense that reduces company funds. <b>Salaries are handled separately</b> in the Salaries tab.</p>
    ${B.migrated ? '' : `<div class="acc-alert orange" style="margin:0 14px 12px;"><i class="bi bi-database-exclamation"></i><div>Run <b>migration_037_budgets_loans.sql</b> to track part-payments and payment records. Until then a budget can only be paid in full.</div></div>`}
    <div class="acc-pos-grid">
      <div class="acc-box"><small>Requested (all)</small><b>${tzs(t.requested)}</b><span class="acc-sub">${all.length} request${all.length === 1 ? '' : 's'}</span></div>
      <div class="acc-box"><small>Approved</small><b>${tzs(t.approved)}</b><span class="acc-sub">${count('awaiting') + count('partial') + count('paid')} budget${count('awaiting') + count('partial') + count('paid') === 1 ? '' : 's'}</span></div>
      <div class="acc-box"><small>Paid out</small><b class="acc-pos">${tzs(t.paid)}</b></div>
      <div class="acc-box ${t.remaining > 0 ? 'loss' : ''}"><small>Still to pay</small><b class="${t.remaining > 0 ? 'acc-neg' : ''}">${tzs(t.remaining)}</b></div>
    </div>
    <div class="tabs-row" id="budgetFilters" style="margin:0 14px 10px;">${chip('all', 'All', all.length)}${chip('topay', 'To pay', count('awaiting') + count('partial'))}${chip('pending', 'Awaiting approval', count('pending'))}${chip('paid', 'Paid', count('paid'))}${chip('rejected', 'Rejected', count('rejected'))}</div>
    <div class="acc-toolbar"><input type="search" id="budgetSearch" class="grow" placeholder="Search reference, requester, purpose or type…" value="${escapeHtml(budgetSearch)}"></div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Ref</th><th>Requested by</th><th>Purpose</th><th style="text-align:right;">Requested</th><th style="text-align:right;">Approved</th><th style="min-width:130px;">Paid</th><th style="text-align:right;">Remaining</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => {
        const pct = r.approved_amount > 0 ? Math.min(100, Math.round(r.paid_total / r.approved_amount * 100)) : 0;
        return `<tr>
        <td><code style="font-size:.74rem;font-weight:700;color:var(--blue-700);">${escapeHtml(r.code)}</code><div class="small">${niceDate(r.created_at)}</div></td>
        <td><b>${escapeHtml(r.requester_name)}</b><div class="small">${escapeHtml(r.type_label)}</div></td>
        <td style="min-width:170px;">${escapeHtml(r.purpose)}${r.details ? `<div class="small">${escapeHtml(r.details)}</div>` : ''}</td>
        <td class="acc-num">${tzs(r.requested_amount)}</td>
        <td class="acc-num">${r.approved_amount !== null ? tzs(r.approved_amount) : '<span class="small">—</span>'}</td>
        <td>${r.approved_amount !== null ? `<b>${tzs(r.paid_total)}</b><div class="acc-progress"><i style="width:${pct}%"></i></div><div class="small">${pct}%</div>` : '<span class="small">—</span>'}</td>
        <td class="acc-num ${r.remaining > 0 ? 'acc-neg' : ''}">${r.approved_amount !== null ? tzs(r.remaining) : '—'}</td>
        <td>${budgetBadge(r.pay_state)}</td>
        <td style="white-space:nowrap;"><button class="btn btn-light btn-sm" onclick="openBudgetView(${r.id})" title="Details & payment records"><i class="bi bi-eye"></i></button>${canF && (r.pay_state === 'awaiting' || r.pay_state === 'partial') ? ` <button class="btn btn-primary btn-sm" onclick="openPayBudgetModal(${r.id})"><i class="bi bi-send-check"></i> Pay</button>` : ''}</td>
      </tr>`; }).join('') : `<tr><td colspan="9" class="empty-state"><i class="bi bi-briefcase"></i>${all.length ? 'No budgets match your filters.' : 'No budget requests yet.'}</td></tr>`}</tbody>
    </table></div>`;

  body.querySelectorAll('#budgetFilters a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); budgetFilter = a.dataset.f; renderBudgetsTab(body); }));
  const si = document.getElementById('budgetSearch');
  si.addEventListener('input', () => { budgetSearch = si.value; const pos = si.selectionStart; renderBudgetsTab(body); const n = document.getElementById('budgetSearch'); n.focus(); n.setSelectionRange(pos, pos); });
}

function openPayBudgetModal(id) {
  const r = ACC.budgets.requests.find(x => Number(x.id) === Number(id));
  if (!r) return;
  document.getElementById('transferForm').reset();
  document.getElementById('transferBudgetId').value = r.id;
  document.getElementById('transferInfo').innerHTML = `<b>${escapeHtml(r.code)} — ${escapeHtml(r.purpose)}</b><br>Requested: <b>${tzs(r.requested_amount)}</b> · Approved: <b>${tzs(r.approved_amount)}</b><br>Already paid: <b>${tzs(r.paid_total)}</b> · Still to pay: <b>${tzs(r.remaining)}</b><br>Send to: ${r.account_number
    ? `<b>${escapeHtml(r.requester_name)}</b> — ${escapeHtml(r.bank_name)}, ${escapeHtml(r.account_name)}, <b>${escapeHtml(r.account_number)}</b>`
    : `<b>${escapeHtml(r.requester_name)}</b> <span class="acc-missing">(no bank account saved)</span>`}`;
  const amt = document.getElementById('transferAmount');
  amt.value = r.remaining; amt.max = r.remaining;
  amt.readOnly = !ACC.budgets.migrated;                  // without migration 037 a budget can only be paid in full
  updateBudgetPayHint();
  openModal('transferModal');
}
function updateBudgetPayHint() {
  const id = document.getElementById('transferBudgetId').value;
  const r = ACC.budgets.requests.find(x => Number(x.id) === Number(id));
  const box = document.getElementById('transferHint');
  if (!r || !box) return;
  const amt = Number(document.getElementById('transferAmount').value) || 0;
  const after = ACC.position.net - amt;
  box.innerHTML = amt > 0
    ? `Balance of this budget after payment: <b>${tzs(Math.max(r.remaining - amt, 0))}</b>. Company profit after payment: <b class="${after < 0 ? 'acc-neg' : ''}">${after < 0 ? '− ' : ''}${tzs(Math.abs(after))}</b>.`
    : '';
}

function openBudgetView(id) {
  const r = ACC.budgets.requests.find(x => Number(x.id) === Number(id));
  if (!r) return;
  const pays = r.payments || [];
  document.getElementById('budgetViewBody').innerHTML = `
    <div class="acc-modal-info"><b>${escapeHtml(r.code)} — ${escapeHtml(r.purpose)}</b>
      <div class="small">${escapeHtml(r.type_label)} · requested by <b>${escapeHtml(r.requester_name)}</b> on ${niceDate(r.created_at)}</div>
      ${r.details ? `<div style="margin-top:6px;">${escapeHtml(r.details)}</div>` : ''}
      ${r.decided_by_name ? `<div class="small" style="margin-top:6px;">${r.status === 'rejected' ? 'Rejected' : 'Approved'} by ${escapeHtml(r.decided_by_name)} on ${niceDate(r.decided_at)}${r.decision_note ? ` — “${escapeHtml(r.decision_note)}”` : ''}</div>` : ''}
    </div>
    <div class="acc-pos-grid" style="padding:10px 0;">
      <div class="acc-box"><small>Requested</small><b>${tzs(r.requested_amount)}</b></div>
      <div class="acc-box"><small>Approved</small><b>${r.approved_amount !== null ? tzs(r.approved_amount) : '—'}</b></div>
      <div class="acc-box"><small>Paid</small><b class="acc-pos">${tzs(r.paid_total)}</b></div>
      <div class="acc-box"><small>Remaining</small><b>${r.approved_amount !== null ? tzs(r.remaining) : '—'}</b></div>
    </div>
    <h4 style="margin:6px 0 8px;font-size:.88rem;">Payment records</h4>
    ${pays.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th style="text-align:right;">Amount</th><th>Method</th><th>Reference</th><th>Note</th><th>Paid by</th></tr></thead><tbody>${pays.map(p => `<tr>
      <td class="small" style="white-space:nowrap;">${niceDate(p.paid_at)}</td><td class="acc-num">${tzs(p.amount)}</td>
      <td class="small">${escapeHtml(methodLabel[p.payment_method] || p.payment_method)}</td><td class="small">${p.reference ? escapeHtml(p.reference) : '—'}</td>
      <td class="small">${p.note ? escapeHtml(p.note) : '—'}</td><td class="small">${p.paid_by_name ? escapeHtml(p.paid_by_name) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : (r.status === 'approved' && r.transfer_status === 'transferred'
        ? `<p class="small">Paid in full on ${niceDate(r.transferred_at)}${r.transfer_reference ? ' · ref ' + escapeHtml(r.transfer_reference) : ''}.</p>`
        : '<p class="small">No payments recorded yet.</p>')}`;
  openModal('budgetViewModal');
}

/* ============================ 3) SALARIES ============================ */
function openSalaryMonth(ym) { accTab = 'salaries'; accMonth = ym; loadAcc(); }

function renderSalariesTab(body) {
  const s = ACC.salary, canP = ACC.can_payroll, net = ACC.position.net;
  const after = net - s.due;
  const isCurrent = s.month === currentYm();
  const strip = ACC.months;

  const stripHtml = strip.length ? `<div class="acc-months">${strip.map(m => `
    <button type="button" class="acc-month ${m.state} ${m.month === s.month ? 'active' : ''}" onclick="openSalaryMonth('${m.month}')">
      <b>${escapeHtml(m.label)}</b>
      <span>${m.state === 'paid' ? '✔ All paid' : (m.overdue ? (m.state === 'unpaid' ? '✖ NOT PAID' : '● PARTLY PAID') : (m.state === 'unpaid' ? 'Waiting' : 'Partly paid'))}</span>
      ${m.unpaid ? `<span style="font-weight:600;color:var(--ink-soft);">${m.unpaid} unpaid</span>` : ''}
    </button>`).join('')}</div>` : '';

  const status = (r) => ({
    paid: `<span class="badge badge-ok"><i class="bi bi-check-circle-fill"></i> Paid</span><div class="small">${niceDate(r.paid_at)}${r.payment_reference ? ' · ' + escapeHtml(r.payment_reference) : ''}</div>`,
    unpaid: isCurrent ? '<span class="badge badge-warn">Waiting</span>' : '<span class="badge badge-off"><i class="bi bi-x-circle-fill"></i> NOT PAID</span>',
    no_salary: '<span class="small">No salary set</span>',
    not_started: '<span class="small">Not started yet</span>',
  }[r.status]);

  body.innerHTML = `
    <div class="acc-toolbar">
      <button class="btn btn-light btn-sm" onclick="openSalaryMonth('${shiftMonth(s.month, -1)}')" title="Previous month"><i class="bi bi-chevron-left"></i></button>
      <input type="month" id="salaryMonthInput" value="${s.month}" max="${currentYm()}">
      <button class="btn btn-light btn-sm" ${isCurrent ? 'disabled' : ''} onclick="openSalaryMonth('${shiftMonth(s.month, 1)}')" title="Next month"><i class="bi bi-chevron-right"></i></button>
      <b style="margin-left:6px;">${monthLabel(s.month)}</b>
      <span class="grow"></span>
      ${canP && s.due_count ? `<button class="btn btn-primary btn-sm" onclick="payAllSalaries()"><i class="bi bi-wallet2"></i> Pay All Unpaid (${s.due_count})</button>` : ''}
    </div>
    <p class="small" style="padding:0 18px 8px;">Salaries are tracked here on their own — separate from <a href="#" onclick="event.preventDefault();switchAccTab('budgets')">Company Budgets</a>. Both reduce company funds.</p>
    ${stripHtml}
    <div class="acc-pos-grid">
      <div class="acc-box"><small>Company profit available</small><b class="${net < 0 ? 'acc-neg' : 'acc-pos'}">${net < 0 ? '− ' : ''}${tzs(Math.abs(net))}</b></div>
      <div class="acc-box"><small>Salaries still to pay</small><b>${tzs(s.due)}</b><span class="acc-sub">${s.due_count} ${s.due_count === 1 ? 'person' : 'people'} · already paid ${tzs(s.paid)}</span></div>
      <div class="acc-box ${s.due > 0 && after < 0 ? 'loss' : ''}"><small>${s.due === 0 ? 'Result' : (after < 0 ? 'Loss after paying' : 'Profit after paying')}</small>
        <b class="${s.due > 0 && after < 0 ? 'acc-neg' : 'acc-pos'}">${s.due === 0 ? 'All paid ✔' : (after < 0 ? '− ' : '') + tzs(Math.abs(after))}</b></div>
    </div>
    ${s.due > 0 && after < 0 ? `<div class="acc-alert red" style="margin:0 14px 12px;"><i class="bi bi-exclamation-triangle-fill"></i><div><b>Profit is not enough for these salaries.</b> Paying them will put the company at a loss of <b>${tzs(Math.abs(after))}</b>. Workers must still be paid, so the payment is allowed and the loss will be shown.</div></div>` : ''}
    ${s.due > 0 && !isCurrent ? `<div class="acc-alert red" style="margin:0 14px 12px;"><i class="bi bi-exclamation-octagon-fill"></i><div><b>${monthLabel(s.month)} salaries were not paid</b> for ${s.due_count} ${s.due_count === 1 ? 'person' : 'people'} (${tzs(s.due)}).</div></div>` : ''}
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Member</th><th>Bank account</th><th style="text-align:right;">Salary</th><th>Status</th><th></th></tr></thead>
      <tbody>${s.rows.length ? s.rows.map(r => `<tr>
        <td><b>${escapeHtml(r.full_name)}</b><div class="small">${escapeHtml(r.position_label)}</div></td>
        <td>${bankHtml(r)}</td>
        <td class="acc-num">${r.amount > 0 ? tzs(r.amount) : '—'}</td>
        <td>${status(r)}</td>
        <td>${r.status === 'unpaid' && canP ? `<button class="btn btn-primary btn-sm" onclick="openPayModal(${r.user_id})"><i class="bi bi-wallet2"></i> Pay</button>`
            : (r.status === 'no_salary' ? `<button class="btn btn-light btn-sm" onclick="editBank(${r.user_id})">Set salary</button>` : '')}</td>
      </tr>`).join('') : `<tr><td colspan="5" class="empty-state"><i class="bi bi-people"></i>No company members found.</td></tr>`}</tbody>
    </table></div>`;

  const inp = document.getElementById('salaryMonthInput');
  if (inp) inp.addEventListener('change', () => { if (inp.value) openSalaryMonth(inp.value); });
}

function openPayModal(userId) {
  const s = ACC.salary;
  const r = s.rows.find(x => Number(x.user_id) === Number(userId));
  if (!r) return;
  document.getElementById('payUserId').value = r.user_id;
  document.getElementById('payMonth').value = s.month;
  document.getElementById('payInfo').innerHTML = `<b>${escapeHtml(r.full_name)}</b> — ${monthLabel(s.month)} salary<br>Amount: <b>${tzs(r.amount)}</b><br>Pay to: ${r.account_number
    ? `${escapeHtml(r.bank_name)}, ${escapeHtml(r.account_name)}, <b>${escapeHtml(r.account_number)}</b>`
    : '<span class="acc-missing">no bank account saved — add one in the Bank Accounts tab</span>'}`;
  const after = ACC.position.net - r.amount;
  document.getElementById('payLossWarn').innerHTML = after < 0
    ? `<div class="acc-alert red"><i class="bi bi-exclamation-triangle-fill"></i><div>Profit is not enough. After this payment the company will be at a <b>loss of ${tzs(Math.abs(after))}</b>. The salary must still be paid.</div></div>`
    : `<p class="small" style="margin:-4px 0 10px;">Profit after this payment: <b>${tzs(after)}</b></p>`;
  document.getElementById('payForm').reset();
  document.getElementById('payUserId').value = r.user_id;
  document.getElementById('payMonth').value = s.month;
  openModal('payModal');
}

async function payAllSalaries() {
  const s = ACC.salary, after = ACC.position.net - s.due;
  const msg = `Pay all ${s.due_count} unpaid salaries for ${monthLabel(s.month)} (${tzs(s.due)})?`
    + (after < 0 ? `\n\nProfit is not enough — the company will be at a LOSS of ${tzs(Math.abs(after))}. Workers must still be paid.` : `\n\nProfit after paying: ${tzs(after)}.`);
  if (!confirm(msg)) return;
  const { data } = await apiPost('/admin/accountant.php', { action: 'pay_all_salaries', month: s.month, payment_method: 'bank_transfer' });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) loadAcc();
}


/* ============================ 4) EXPENSES & STATEMENT ============================ */
let LEDGER = null;
let ledgerMonth = currentYm();
let ledgerType = 'expense';   // expense | income | all
let ledgerCat = '';
let ledgerSearch = '';

const catIcon = (key, type) => {
  const list = (LEDGER && LEDGER.categories && LEDGER.categories[type === 'income' ? 'income' : 'expense']) || [];
  const c = list.find(x => x[0] === key);
  return c ? c[2] : (key === 'salary' ? 'bi-wallet2' : key === 'budget_request' ? 'bi-send' : key === 'inventory_damage' ? 'bi-exclamation-triangle' : key === 'product_sale' ? 'bi-cart-check' : key === 'project_income' || key === 'project_payment' ? 'bi-briefcase' : 'bi-tag');
};

// Expenses, Income and All Transactions are three separate tabs sharing one ledger view.
function renderExpensesTab(body) { return openLedgerTab(body, 'expense'); }
function renderIncomeLogTab(body) { return openLedgerTab(body, 'income'); }
function renderTransactionsTab(body) { return openLedgerTab(body, 'all'); }

async function openLedgerTab(body, type) {
  if (ledgerType !== type) { ledgerType = type; ledgerCat = ''; ledgerSearch = ''; }
  body.innerHTML = '<p class="small" style="padding:0 18px 14px;">Loading…</p>';
  const { data } = await apiGet('/admin/accountant.php?view=ledger&month=' + encodeURIComponent(ledgerMonth));
  LEDGER = data;
  drawExpensesTab(body);
}

function drawExpensesTab(body) {
  const L = LEDGER, t = L.totals, canF = L.can_finance;
  const top = L.by_category.slice(0, 6), max = top.length ? top[0].total : 1;
  const isCurrent = ledgerMonth === currentYm();

  body.innerHTML = `
    <div class="acc-toolbar">
      <button class="btn btn-light btn-sm" onclick="setLedgerMonth('${shiftMonth(ledgerMonth, -1)}')" title="Previous month"><i class="bi bi-chevron-left"></i></button>
      <input type="month" id="ledgerMonthInput" value="${ledgerMonth}" max="${currentYm()}">
      <button class="btn btn-light btn-sm" ${isCurrent ? 'disabled' : ''} onclick="setLedgerMonth('${shiftMonth(ledgerMonth, 1)}')" title="Next month"><i class="bi bi-chevron-right"></i></button>
      <b style="margin-left:6px;">${monthLabel(ledgerMonth)}</b>
      <span class="grow"></span>
      <button class="btn btn-light btn-sm" onclick="exportLedgerCsv()"><i class="bi bi-download"></i> Export CSV</button>
      ${canF && ledgerType !== 'expense' ? `<button class="btn ${ledgerType === 'income' ? 'btn-primary' : 'btn-light'} btn-sm" onclick="openEntryModal('income')"><i class="bi bi-plus-circle"></i> Other Income</button>` : ''}
      ${canF && ledgerType !== 'income' ? `<button class="btn btn-primary btn-sm" onclick="openEntryModal('expense')"><i class="bi bi-dash-circle"></i> Record Expense</button>` : ''}
    </div>

    <div class="acc-pos-grid">
      <div class="acc-box"><small>Expenses — ${monthLabel(ledgerMonth)}</small><b>${tzs(t.expense)}</b></div>
      <div class="acc-box"><small>Income — ${monthLabel(ledgerMonth)}</small><b class="acc-pos">${tzs(t.income)}</b></div>
      <div class="acc-box ${t.net < 0 ? 'loss' : ''}"><small>${t.net < 0 ? 'Loss this month' : 'Profit this month'}</small><b class="${t.net < 0 ? 'acc-neg' : 'acc-pos'}">${t.net < 0 ? '− ' : ''}${tzs(Math.abs(t.net))}</b></div>
    </div>

    ${Number(t.sales_revenue) > 0 ? `<p class="small" style="margin:-4px 18px 12px;">Product sales brought in <b>${tzs(t.sales_revenue)}</b>; only the profit the Sales Officer recorded on them (<b>${tzs(t.sales_profit)}</b>) counts toward profit — the cost of the goods (${tzs(t.cost_of_goods)}) is deducted.</p>` : ''}
    ${top.length && ledgerType === 'expense' ? `<h4 style="margin:4px 18px 8px;font-size:.88rem;">Where the money went</h4>
    <div class="acc-cats">${top.map(c => `<div class="acc-cat"><span><i class="bi ${catIcon(c.category, 'expense')}"></i> ${escapeHtml(c.label)}</span><span class="bar"><i style="width:${Math.max(3, Math.round(c.total / max * 100))}%"></i></span><b>${tzs(c.total)}</b></div>`).join('')}</div>` : ''}

    <div class="acc-toolbar">
      <select id="ledgerCat"><option value="">All categories</option>${(() => { const tr = L.rows.filter(r => ledgerType === 'all' || r.type === ledgerType); return [...new Set(tr.map(r => r.category))].map(k => `<option value="${escapeHtml(k)}" ${ledgerCat === k ? 'selected' : ''}>${escapeHtml((tr.find(r => r.category === k) || {}).category_label || k)}</option>`).join(''); })()}</select>
      <input type="search" id="ledgerSearch" class="grow" placeholder="Search paid to, description, reference or voucher…" value="${escapeHtml(ledgerSearch)}">
    </div>
    <div id="ledgerTable"></div>`;

  document.getElementById('ledgerMonthInput').addEventListener('change', (e) => { if (e.target.value) setLedgerMonth(e.target.value); });
  document.getElementById('ledgerCat').addEventListener('change', (e) => { ledgerCat = e.target.value; renderLedgerRows(); });
  document.getElementById('ledgerSearch').addEventListener('input', (e) => { ledgerSearch = e.target.value; renderLedgerRows(); });
  renderLedgerRows();
}

function ledgerFiltered() {
  const q = ledgerSearch.trim().toLowerCase();
  return LEDGER.rows.filter(r =>
    (ledgerType === 'all' || r.type === ledgerType) &&
    (!ledgerCat || r.category === ledgerCat) &&
    (!q || [r.voucher, r.payee, r.description, r.reference, r.category_label].join(' ').toLowerCase().includes(q)));
}

function renderLedgerRows() {
  const rows = ledgerFiltered();
  const sum = rows.reduce((t, r) => t + (r.type === 'income' ? Number(r.amount) : -Number(r.amount)), 0);
  const expTotal = rows.filter(r => r.type === 'expense').reduce((t, r) => t + Number(r.amount), 0);
  const incTotal = rows.filter(r => r.type === 'income').reduce((t, r) => t + Number(r.amount), 0);
  document.getElementById('ledgerTable').innerHTML = `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Voucher</th><th>Date</th><th>Category</th><th>${ledgerType === 'income' ? 'Received from' : (ledgerType === 'all' ? 'Paid to / Received from' : 'Paid to')}</th><th>Description</th><th>Method</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr>
      <td><span class="acc-voucher">${escapeHtml(r.voucher)}</span><div class="small">${r.recorded_by_name ? escapeHtml(r.recorded_by_name) : 'System'}</div></td>
      <td class="small" style="white-space:nowrap;">${niceDate(r.transaction_date)}</td>
      <td><span class="acc-catbadge ${r.type === 'income' ? 'inc' : (r.auto ? 'auto' : '')}"><i class="bi ${catIcon(r.category, r.type)}"></i>${escapeHtml(r.category_label)}</span>${r.auto ? '<div class="small">auto-recorded</div>' : ''}</td>
      <td>${r.payee ? `<b>${escapeHtml(r.payee)}</b>` : '<span class="small">—</span>'}</td>
      <td style="min-width:180px;">${escapeHtml(r.description || '')}${r.tracking_code ? `<div class="small">${escapeHtml(r.tracking_code)}</div>` : ''}</td>
      <td class="small">${escapeHtml(methodLabel[r.payment_method] || r.payment_method)}</td>
      <td class="small">${r.reference ? escapeHtml(r.reference) : '—'}</td>
      <td class="acc-num ${r.type === 'income' ? 'acc-pos' : ''}">${r.type === 'income' ? '+' : '−'} ${tzs(r.amount)}</td>
    </tr>`).join('') + `<tr class="acc-foot"><td colspan="7" style="text-align:right;">${ledgerType === 'all' ? 'Net (income − expenses)' : (ledgerType === 'income' ? 'Total income' : 'Total expenses')} · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}</td>
      <td class="acc-num ${ledgerType === 'all' && sum < 0 ? 'acc-neg' : ''}">${ledgerType === 'income' ? tzs(incTotal) : ledgerType === 'expense' ? tzs(expTotal) : (sum < 0 ? '− ' : '') + tzs(Math.abs(sum))}</td></tr>`
      : `<tr><td colspan="8" class="empty-state"><i class="bi bi-receipt"></i>${LEDGER.rows.length ? 'No entries match your filters.' : 'Nothing recorded for ' + monthLabel(ledgerMonth) + ' yet.'}</td></tr>`}</tbody>
  </table></div>`;
}

function setLedgerMonth(ym) { ledgerMonth = ym; ledgerCat = ''; renderExpensesTab(document.getElementById('accBody')); }

function openEntryModal(type) {
  const isExp = type === 'expense';
  document.getElementById('entryForm').reset();
  document.getElementById('entryAction').value = isExp ? 'record_expense' : 'record_other_income';
  document.getElementById('entryTitle').innerHTML = isExp ? '<i class="bi bi-receipt"></i> Record Expense' : '<i class="bi bi-plus-circle"></i> Record Other Income';
  document.getElementById('entrySubmit').innerHTML = '<i class="bi bi-check2"></i> ' + (isExp ? 'Record Expense' : 'Record Income');
  document.getElementById('entryPayeeLabel').textContent = isExp ? 'Paid to' : 'Received from';
  document.getElementById('entryPayee').placeholder = isExp ? 'e.g. TANESCO, Landlord, Shop name' : 'e.g. Bank, donor, supplier';
  document.getElementById('entryDesc').placeholder = isExp ? 'e.g. September office rent' : 'e.g. Interest for September';
  document.getElementById('entryMethod').value = isExp ? 'cash' : 'bank_transfer';

  const groups = {};
  (LEDGER.categories[isExp ? 'expense' : 'income']).forEach(c => { (groups[c[3]] = groups[c[3]] || []).push(c); });
  document.getElementById('entryCategory').innerHTML = '<option value="">— choose category —</option>' +
    Object.keys(groups).map(g => `<optgroup label="${escapeHtml(g)}">${groups[g].map(c => `<option value="${c[0]}">${escapeHtml(c[1])}</option>`).join('')}</optgroup>`).join('');

  const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dateEl = document.getElementById('entryDate'); dateEl.value = today; dateEl.max = today;
  updateEntryImpact();
  openModal('entryModal');
}

function updateEntryImpact() {
  const isExp = document.getElementById('entryAction').value === 'record_expense';
  const amt = Number(document.getElementById('entryAmount').value) || 0;
  const box = document.getElementById('entryImpact');
  const net = (LEDGER && LEDGER.position ? LEDGER.position.net : 0) + (isExp ? -amt : amt);
  if (!amt) { box.innerHTML = ''; return; }
  box.innerHTML = isExp && net < 0
    ? `<div class="acc-alert red"><i class="bi bi-exclamation-triangle-fill"></i><div>After this expense the company will be at a <b>loss of ${tzs(Math.abs(net))}</b>.</div></div>`
    : `<p class="small" style="margin:-2px 0 10px;">Company profit after this ${isExp ? 'expense' : 'income'}: <b>${tzs(net)}</b></p>`;
}

function exportLedgerCsv() {
  const rows = ledgerFiltered();
  const cols = ['Voucher', 'Date', 'Type', 'Category', 'Paid to / Received from', 'Description', 'Method', 'Reference', 'Amount (TZS)', 'Recorded by'];
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = [cols.map(q).join(',')].concat(rows.map(r => [r.voucher, r.transaction_date, r.type, r.category_label, r.payee, r.description, methodLabel[r.payment_method] || r.payment_method, r.reference, (r.type === 'income' ? '' : '-') + Number(r.amount).toFixed(2), r.recorded_by_name || 'System'].map(q).join(','))).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'mabumba-' + (ledgerType === 'all' ? 'transactions' : ledgerType === 'income' ? 'income' : 'expenses') + '-' + ledgerMonth + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ============================ 6) COMPANY LOANS ============================ */
/* A loan is money owed, not income: only the interest part of a repayment is an expense.
   The records below keep every loan, repayment, balance and the repayment history by period. */
let LOANS = null;
let loanPeriod = 'all';
let loanFrom = '';
let loanTo = '';
let loanFocus = null;       // loan id whose repayments are shown in the history (null = all loans)
const LOAN_PERIODS = [['all', 'All time'], ['this_month', 'This month'], ['last_month', 'Last month'], ['last_3_months', 'Last 3 months'], ['this_year', 'This year'], ['custom', 'Custom dates…']];
const loanStateInfo = {
  active:  ['badge-info', 'bi-hourglass-split', 'Active'],
  overdue: ['badge-off', 'bi-exclamation-circle-fill', 'Overdue'],
  paid:    ['badge-ok', 'bi-check-circle-fill', 'Fully repaid'],
};
const loanBadge = (st) => { const i = loanStateInfo[st] || loanStateInfo.active; return `<span class="badge ${i[0]}"><i class="bi ${i[1]}"></i> ${i[2]}</span>`; };

async function renderLoansTab(body) {
  body.innerHTML = '<p class="small" style="padding:0 18px 14px;">Loading…</p>';
  let url = '/admin/accountant.php?view=loans&period=' + encodeURIComponent(loanPeriod);
  if (loanPeriod === 'custom') {
    if (!loanFrom && !loanTo) { const t = new Date(); loanFrom = loanTo = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
    url += '&from=' + encodeURIComponent(loanFrom) + '&to=' + encodeURIComponent(loanTo);
  }
  const { data } = await apiGet(url);
  LOANS = data;
  drawLoansTab(body);
}

function drawLoansTab(body) {
  const L = LOANS, canF = ACC.can_finance, pos = L.position || {}, sm = L.summary || {};
  if (!L.migrated) {
    body.innerHTML = `<div class="acc-alert orange" style="margin:0 14px 12px;"><i class="bi bi-database-exclamation"></i><div>Company Loans needs one database update. Run <b>migration_037_budgets_loans.sql</b> once in phpMyAdmin, then reload this page.</div></div>`;
    return;
  }
  const focus = loanFocus ? L.loans.find(l => Number(l.id) === Number(loanFocus)) : null;
  const history = L.repayments.filter(r => !focus || Number(r.loan_id) === Number(focus.id));
  const histTotal = history.reduce((t, r) => t + Number(r.amount), 0);

  body.innerHTML = `
    <p class="small" style="padding:0 18px 10px;">Record loans the company receives from banks or lenders and every repayment. A loan is <b>not income</b> — it is money owed. It adds to available funds when received, and the <b>interest</b> part of each repayment is recorded as an expense (loan interest) that reduces profit.</p>
    <div class="acc-toolbar">
      <label class="small" for="loanPeriod" style="font-weight:700;">Period</label>
      <select id="loanPeriod">${LOAN_PERIODS.map(p => `<option value="${p[0]}" ${p[0] === loanPeriod ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>
      <span id="loanCustom" style="display:${loanPeriod === 'custom' ? 'inline-flex' : 'none'};gap:8px;align-items:center;">
        <input type="date" id="loanFrom" value="${escapeHtml(loanFrom)}"> <span class="small">to</span> <input type="date" id="loanTo" value="${escapeHtml(loanTo)}">
      </span>
      <span class="small">Showing: <b>${escapeHtml(L.range.label)}</b></span>
      <span class="grow"></span>
      ${canF ? `<button class="btn btn-primary btn-sm" onclick="openLoanModal()"><i class="bi bi-plus-circle"></i> Record Loan</button>` : ''}
    </div>
    <div class="acc-pos-grid">
      <div class="acc-box ${pos.outstanding > 0 ? 'loss' : ''}"><small>Outstanding balance</small><b class="${pos.outstanding > 0 ? 'acc-neg' : ''}">${tzs(pos.outstanding)}</b><span class="acc-sub">all loans, to date</span></div>
      <div class="acc-box"><small>Loans received (all-time)</small><b>${tzs(pos.received)}</b><span class="acc-sub">repaid so far ${tzs(pos.repaid)}</span></div>
      <div class="acc-box"><small>Received — ${escapeHtml(L.range.label)}</small><b>${tzs(sm.received_in_period)}</b><span class="acc-sub">${sm.loans_in_period} loan${sm.loans_in_period === 1 ? '' : 's'}</span></div>
      <div class="acc-box"><small>Repaid — ${escapeHtml(L.range.label)}</small><b class="acc-pos">${tzs(sm.repaid_in_period)}</b><span class="acc-sub">of which interest ${tzs(sm.interest_in_period)}</span></div>
    </div>

    <h4 style="margin:6px 18px 8px;font-size:.9rem;">Loans</h4>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Loan</th><th>Received</th><th style="text-align:right;">Loan amount</th><th style="text-align:right;">To repay</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th><th style="min-width:130px;">Progress</th><th>Final date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${L.loans.length ? L.loans.map(l => `<tr class="${focus && Number(focus.id) === Number(l.id) ? 'acc-row-focus' : ''}">
        <td style="min-width:190px;"><code style="font-size:.74rem;font-weight:700;color:var(--blue-700);">${escapeHtml(l.code)}</code> <b>${escapeHtml(l.provider)}</b>
          <div class="small">${escapeHtml(l.purpose || '')}</div>${l.notes ? `<div class="small" style="font-style:italic;">${escapeHtml(l.notes)}</div>` : ''}</td>
        <td class="small" style="white-space:nowrap;">${niceDate(l.date_received)}</td>
        <td class="acc-num">${tzs(l.principal)}</td>
        <td class="acc-num">${tzs(l.total_repayable)}${Number(l.total_repayable) > Number(l.principal) ? `<div class="small" style="font-weight:400;">interest ${tzs(l.total_repayable - l.principal)}</div>` : ''}</td>
        <td class="acc-num acc-pos">${tzs(l.paid_total)}</td>
        <td class="acc-num ${l.balance > 0 ? 'acc-neg' : ''}">${tzs(l.balance)}</td>
        <td><div class="acc-progress"><i style="width:${l.progress}%"></i></div><div class="small">${l.progress}% repaid${l.installment_amount ? ' · instalment ' + tzs(l.installment_amount) : ''}</div></td>
        <td class="small" style="white-space:nowrap;">${l.due_date ? niceDate(l.due_date) : '—'}</td>
        <td>${loanBadge(l.state)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-light btn-sm" onclick="focusLoan(${l.id})" title="Show this loan's repayments"><i class="bi bi-clock-history"></i></button>
          ${canF && l.state !== 'paid' ? ` <button class="btn btn-primary btn-sm" onclick="openRepayModal(${l.id})"><i class="bi bi-cash-stack"></i> Repay</button>` : ''}
          ${canF && Number(l.payment_count) === 0 ? ` <button class="btn btn-light btn-sm" style="color:var(--danger);" onclick="deleteLoan(${l.id})" title="Delete (no repayments yet)"><i class="bi bi-trash"></i></button>` : ''}
        </td>
      </tr>`).join('') : `<tr><td colspan="10" class="empty-state"><i class="bi bi-bank2"></i>No loans recorded yet.</td></tr>`}</tbody>
    </table></div>

    <h4 style="margin:18px 18px 8px;font-size:.9rem;">Repayment history — ${escapeHtml(L.range.label)}${focus ? ` · ${escapeHtml(focus.code)} <a href="#" onclick="event.preventDefault();focusLoan(null)" class="small">(show all loans ✕)</a>` : ''}</h4>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Loan</th><th style="text-align:right;">Repayment</th><th style="text-align:right;">Principal</th><th style="text-align:right;">Interest</th><th>Method</th><th>Reference</th><th>Notes</th><th>Recorded by</th></tr></thead>
      <tbody>${history.length ? history.map(r => `<tr>
        <td class="small" style="white-space:nowrap;">${niceDate(r.paid_date)}</td>
        <td><b>${escapeHtml(r.loan_code)}</b><div class="small">${escapeHtml(r.provider)}</div></td>
        <td class="acc-num">${tzs(r.amount)}</td><td class="acc-num">${tzs(r.principal_part)}</td><td class="acc-num">${Number(r.interest_part) > 0 ? tzs(r.interest_part) : '—'}</td>
        <td class="small">${escapeHtml(methodLabel[r.payment_method] || r.payment_method)}</td><td class="small">${r.reference ? escapeHtml(r.reference) : '—'}</td>
        <td class="small">${r.notes ? escapeHtml(r.notes) : '—'}</td><td class="small">${r.recorded_by_name ? escapeHtml(r.recorded_by_name) : '—'}</td>
      </tr>`).join('') + `<tr class="acc-foot"><td colspan="2" style="text-align:right;">Total repaid in this view</td><td class="acc-num">${tzs(histTotal)}</td><td colspan="6"></td></tr>`
        : `<tr><td colspan="9" class="empty-state"><i class="bi bi-receipt"></i>No repayments in this period.</td></tr>`}</tbody>
    </table></div>`;

  const sel = document.getElementById('loanPeriod');
  sel.addEventListener('change', () => { loanPeriod = sel.value; renderLoansTab(body); });
  ['loanFrom', 'loanTo'].forEach(id => document.getElementById(id).addEventListener('change', (e) => {
    if (id === 'loanFrom') loanFrom = e.target.value; else loanTo = e.target.value;
    renderLoansTab(body);
  }));
}

function focusLoan(id) { loanFocus = id; drawLoansTab(document.getElementById('accBody')); }

function openLoanModal() {
  document.getElementById('loanForm').reset();
  const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dt = document.getElementById('loanDateReceived'); dt.value = today; dt.max = today;
  openModal('loanModal');
}

function openRepayModal(id) {
  const l = LOANS.loans.find(x => Number(x.id) === Number(id));
  if (!l) return;
  document.getElementById('repayForm').reset();
  document.getElementById('repayLoanId').value = l.id;
  document.getElementById('repayInfo').innerHTML = `<b>${escapeHtml(l.code)} — ${escapeHtml(l.provider)}</b><br>To repay: <b>${tzs(l.total_repayable)}</b> · Paid: <b>${tzs(l.paid_total)}</b> · Balance: <b>${tzs(l.balance)}</b>${l.installment_amount ? `<br>Planned instalment: <b>${tzs(l.installment_amount)}</b>` : ''}`;
  const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dt = document.getElementById('repayDate'); dt.value = today; dt.max = today; dt.min = String(l.date_received).slice(0, 10);
  const amt = document.getElementById('repayAmount');
  amt.max = l.balance; amt.value = l.installment_amount ? Math.min(Number(l.installment_amount), l.balance) : l.balance;
  updateRepayHint();
  openModal('repayModal');
}
function updateRepayHint() {
  const l = LOANS && LOANS.loans.find(x => Number(x.id) === Number(document.getElementById('repayLoanId').value));
  const box = document.getElementById('repayHint');
  if (!l || !box) return;
  const amt = Number(document.getElementById('repayAmount').value) || 0;
  if (amt <= 0) { box.textContent = ''; return; }
  const interestRatio = Number(l.total_repayable) > 0 ? (Number(l.total_repayable) - Number(l.principal)) / Number(l.total_repayable) : 0;
  const final = amt >= l.balance - 0.005;
  const principalPart = final ? Number(l.principal) - Number(l.principal_paid) : amt * (1 - interestRatio);
  const interest = Math.max(amt - principalPart, 0);
  box.innerHTML = `Balance after this repayment: <b>${tzs(Math.max(l.balance - amt, 0))}</b>.${interest > 0.5 ? ` Interest part <b>${tzs(interest)}</b> will be recorded as an expense.` : ''}`;
}

async function deleteLoan(id) {
  if (!confirm('Delete this loan? Only loans with no repayments can be deleted.')) return;
  const { data } = await apiPost('/admin/accountant.php', { action: 'loan_delete', loan_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) loadAcc();
}

/* ============================ 5) BANK ACCOUNTS ============================ */
function renderBanksTab(body) {
  const all = ACC.members, canEdit = ACC.can_finance || ACC.can_payroll;
  const missingBank = all.filter(m => !m.account_number).length;
  const noSalary = all.filter(m => !(Number(m.monthly_salary) > 0)).length;
  const q = memberSearch.trim().toLowerCase();
  const rows = all.filter(m =>
    (memberFilter === 'all' || (memberFilter === 'missing' && !m.account_number) || (memberFilter === 'nosalary' && !(Number(m.monthly_salary) > 0))) &&
    (!q || (m.full_name + ' ' + m.position_label + ' ' + (m.bank_name || '') + ' ' + (m.account_number || '')).toLowerCase().includes(q)));
  const chip = (k, label, n) => `<a href="#" data-f="${k}" class="${memberFilter === k ? 'active' : ''}">${label} (${n})</a>`;

  body.innerHTML = `
    <p class="small" style="padding:0 18px 10px;">Save every company member's bank account here. The details are used when you pay salaries and when you transfer approved budget money.</p>
    <div class="tabs-row" id="bankFilters" style="margin:0 14px 10px;">${chip('all', 'Everyone', all.length)}${chip('missing', 'No bank account', missingBank)}${chip('nosalary', 'No salary set', noSalary)}</div>
    <div class="acc-toolbar"><input type="search" id="memberSearch" class="grow" placeholder="Search name, position, bank or account…" value="${escapeHtml(memberSearch)}"></div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Member</th><th>Bank name</th><th>Account name</th><th>Account number</th><th style="text-align:right;">Monthly salary</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(m => `<tr>
        <td><b>${escapeHtml(m.full_name)}</b><div class="small">${escapeHtml(m.position_label)}${m.phone ? ' · ' + escapeHtml(m.phone) : ''}</div></td>
        <td>${m.bank_name ? escapeHtml(m.bank_name) : '<span class="acc-missing">Not saved</span>'}</td>
        <td>${m.account_name ? escapeHtml(m.account_name) : '—'}</td>
        <td>${m.account_number ? `<code>${escapeHtml(m.account_number)}</code>` : '—'}</td>
        <td class="acc-num">${Number(m.monthly_salary) > 0 ? tzs(m.monthly_salary) : '<span class="small">not set</span>'}</td>
        <td>${canEdit ? `<button class="btn btn-light btn-sm" onclick="editBank(${m.id})"><i class="bi bi-pencil"></i> ${m.account_number ? 'Edit' : 'Add'}</button>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-people"></i>No members match.</td></tr>`}</tbody>
    </table></div>`;

  body.querySelectorAll('#bankFilters a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); memberFilter = a.dataset.f; renderBanksTab(body); }));
  const s = document.getElementById('memberSearch');
  s.addEventListener('input', () => { memberSearch = s.value; const pos = s.selectionStart; renderBanksTab(body); const n = document.getElementById('memberSearch'); n.focus(); n.setSelectionRange(pos, pos); });
}

function editBank(userId) {
  const m = ACC.members.find(x => Number(x.id) === Number(userId));
  if (!m) return;
  document.getElementById('bankUserId').value = m.id;
  document.getElementById('bankModalTitle').innerHTML = `<i class="bi bi-bank"></i> ${escapeHtml(m.full_name)}`;
  document.getElementById('bankName').value = m.bank_name || '';
  document.getElementById('bankAccName').value = m.account_name || (m.account_number ? '' : m.full_name);
  document.getElementById('bankAccNo').value = m.account_number || '';
  document.getElementById('bankSalary').value = Number(m.monthly_salary) > 0 ? m.monthly_salary : '';
  document.getElementById('bankStart').value = m.salary_start ? String(m.salary_start).slice(0, 7) : currentYm();
  openModal('bankModal');
}

/* ============================ boot + forms ============================ */
(async function () {
  const user = await initDashLayout({ pageTitle: 'Accountant Desk', crumb: 'Admin / Finance / Accountant Desk', activeKey: 'accountant', allowedRoles: ['admin'], anyPermission: ['finance.view', 'payroll.view', 'finance.manage', 'payroll.manage'] });
  if (!user) return;
  await loadAcc();

  const submit = (formId, modalId) => document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data } = await apiPost('/admin/accountant.php', new FormData(e.target));
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal(modalId); loadAcc(); }
  });
  submit('incomeForm', 'incomeModal');
  submit('transferForm', 'transferModal');
  submit('payForm', 'payModal');
  submit('bankForm', 'bankModal');
  submit('loanForm', 'loanModal');
  submit('repayForm', 'repayModal');
  document.getElementById('transferAmount').addEventListener('input', updateBudgetPayHint);
  document.getElementById('repayAmount').addEventListener('input', updateRepayHint);

  document.getElementById('entryAmount').addEventListener('input', updateEntryImpact);
  document.getElementById('entryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.category.value) { showFlash('Please choose a category.', 'error'); return; }
    if (f.payee.value.trim().length < 2) { showFlash('Please enter who the money was ' + (f.action.value === 'record_expense' ? 'paid to' : 'received from') + '.', 'error'); return; }
    const btn = document.getElementById('entrySubmit'); btn.disabled = true;
    const { data } = await apiPost('/admin/accountant.php', new FormData(f));
    btn.disabled = false;
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('entryModal'); await loadAcc(); }
  });
})();
