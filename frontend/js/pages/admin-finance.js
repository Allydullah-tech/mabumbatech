const REPORT_RANGES = [
  { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' }, { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' }, { key: 'this_year', label: 'This Year' },
];

let currentRange = 'this_month';
let currentTab = 'transactions';
let FIN_DATA = null;

function fmt(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function loadFinance() {
  const { data } = await apiGet('/admin/finance.php?range=' + currentRange);
  FIN_DATA = data;
  renderFinancePage();
}

function renderFinancePage() {
  const d = FIN_DATA;
  const rangeTabsHtml = REPORT_RANGES.map(r => `<a href="#" data-range="${r.key}" class="${currentRange === r.key ? 'active' : ''}">${r.label}</a>`).join('');

  document.getElementById('pageBody').innerHTML = `
    <div class="grid grid-4" style="margin-bottom:14px;">
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-bank"></i></div><div><b>${fmt(d.total_income_all_time)}</b><span>Total Company Income (All-Time)</span></div></div>
      <div class="card stat-card"><div class="ic green"><i class="bi bi-check2-circle"></i></div><div><b>${fmt(d.income_from_completed_requests)}</b><span>Income From Service Requests</span></div></div>
      <div class="card stat-card"><div class="ic orange"><i class="bi bi-graph-down"></i></div><div><b>${fmt(d.total_expenses_all_time)}</b><span>Total Expenses (All-Time)</span></div></div>
      <div class="card stat-card"><div class="ic ${(d.net_profit_all_time ?? (d.total_income_all_time - d.total_expenses_all_time)) >= 0 ? 'blue' : 'red'}"><i class="bi bi-piggy-bank"></i></div><div><b>${fmt(d.net_profit_all_time ?? (d.total_income_all_time - d.total_expenses_all_time))}</b><span>Net Profit (All-Time) · after cost of goods sold</span></div></div>
    </div>

    <div class="tabs-row">${rangeTabsHtml}</div>
    <div class="grid grid-4" style="margin-bottom:18px;">
      <div class="card stat-card"><div class="ic green"><i class="bi bi-graph-up"></i></div><div><b>${fmt(d.summary.revenue)}</b><span>Revenue (${escapeHtml(d.range.label)})</span></div></div>
      <div class="card stat-card"><div class="ic orange"><i class="bi bi-graph-down"></i></div><div><b>${fmt(d.summary.expenses)}</b><span>Expenses (${escapeHtml(d.range.label)})${Number(d.summary.damage_loss) > 0 ? ' · incl. ' + fmt(d.summary.damage_loss) + ' damaged-stock loss' : ''}</span></div></div>
      <div class="card stat-card"><div class="ic ${d.summary.net_profit >= 0 ? 'blue' : 'red'}"><i class="bi bi-piggy-bank"></i></div><div><b>${fmt(d.summary.net_profit)}</b><span>Net Profit (${escapeHtml(d.range.label)})</span></div></div>
      <div class="card stat-card"><div class="ic red"><i class="bi bi-exclamation-circle"></i></div><div><b>${fmt(d.outstanding)}</b><span>Outstanding Balance</span></div></div>
    </div>

    <div class="panel" style="margin-bottom:18px;">
      <div class="panel-head"><h3><i class="bi bi-bar-chart-line"></i> Income — Last 6 Months</h3></div>
      <div class="panel-body" id="incomeTrendBody"></div>
    </div>

    ${d.overdue_invoices.length ? `
    <div class="panel" style="margin-bottom:18px;">
      <div class="panel-head"><h3><i class="bi bi-alarm"></i> Overdue Invoices</h3></div>
      <div class="notif-row-list">${d.overdue_invoices.map(i => `
        <div class="notif-item" style="cursor:default;"><i class="bi bi-exclamation-triangle"></i>
          <span class="notif-item-body"><b>${escapeHtml(i.invoice_code)}</b><span>Due ${escapeHtml(i.due_date)} · Balance ${fmt(i.amount - i.amount_paid)}</span></span>
        </div>`).join('')}</div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head">
        <h3><i class="bi bi-cash-coin"></i> Finance</h3>
        ${d.can_finance ? `
          <div style="display:flex;gap:6px;">
            <button class="btn btn-light btn-sm" onclick="openTxnModal('record_income')"><i class="bi bi-plus-circle"></i> Income</button>
            <button class="btn btn-light btn-sm" onclick="openTxnModal('record_expense')"><i class="bi bi-dash-circle"></i> Expense</button>
            <button class="btn btn-primary btn-sm" onclick="openInvoiceModal()"><i class="bi bi-receipt"></i> New Invoice</button>
          </div>` : ''}
      </div>
      <div class="tabs-row">
        <a href="#" data-tab="completed" class="${currentTab === 'completed' ? 'active' : ''}">Completed Requests</a>
        <a href="#" data-tab="transactions" class="${currentTab === 'transactions' ? 'active' : ''}">Transactions</a>
        <a href="#" data-tab="sales" class="${currentTab === 'sales' ? 'active' : ''}">Sales</a>
        <a href="#" data-tab="invoices" class="${currentTab === 'invoices' ? 'active' : ''}">Invoices</a>
        <a href="#" data-tab="payroll" class="${currentTab === 'payroll' ? 'active' : ''}">Payroll</a>
        <a href="#" data-tab="debts" class="${currentTab === 'debts' ? 'active' : ''}">Customer Debts</a>
      </div>
      <div id="financeTabBody"></div>
    </div>`;

  document.querySelectorAll('#pageBody .tabs-row a[data-range]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault(); currentRange = a.dataset.range; loadFinance();
  }));
  document.querySelectorAll('#pageBody .tabs-row a[data-tab]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault(); currentTab = a.dataset.tab; renderFinancePage();
  }));

  renderIncomeTrend();
  renderFinanceTabBody();
  fillDropdowns();
}

/** Simple month-over-month income bar chart — same visual pattern as the Admin Dashboard's demand trend. */
function renderIncomeTrend() {
  const el = document.getElementById('incomeTrendBody');
  if (!el) return;
  const trend = FIN_DATA.income_trend || [];
  const maxTrend = Math.max(1, ...trend.map(t => Number(t.total)));
  el.innerHTML = trend.length
    ? `<div style="display:flex;align-items:flex-end;gap:10px;height:140px;padding-top:10px;">
        ${trend.map(t => {
          const val = Number(t.total);
          const h = Math.max(4, Math.round((val / maxTrend) * 110));
          const [y, m] = t.ym.split('-');
          const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <span class="small" style="font-weight:700;">${fmt(val)}</span>
            <div style="width:100%;max-width:36px;height:${h}px;background:linear-gradient(180deg,var(--ok),#0f7a52);border-radius:6px 6px 0 0;"></div>
            <span class="small">${label}</span>
          </div>`;
        }).join('')}
      </div>`
    : `<p class="empty-state small"><i class="bi bi-graph-up"></i>Not enough data yet.</p>`;
}

function renderFinanceTabBody() {
  const d = FIN_DATA;
  const body = document.getElementById('financeTabBody');

  if (currentTab === 'completed') {
    const rows = d.completed_requests || [];
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Tracking Code</th><th>Service</th><th>Customer</th><th>Completed</th><th>Invoiced</th><th>Amount Earned</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `
        <tr>
          <td><b>${escapeHtml(r.tracking_code)}</b><div class="small">${escapeHtml(r.subject)}</div></td>
          <td><i class="bi ${escapeHtml(r.icon)}"></i> ${escapeHtml(r.service_name)}</td>
          <td>${escapeHtml(r.customer_name || '—')}</td>
          <td class="small">${escapeHtml(r.completed_at || r.created_at || '—')}</td>
          <td>${fmt(r.amount_invoiced)}</td>
          <td><b class="${Number(r.amount_earned) > 0 ? '' : 'small'}" style="${Number(r.amount_earned) > 0 ? 'color:var(--ok);' : ''}">${fmt(r.amount_earned)}</b></td>
          <td class="actions-cell">${d.can_finance ? `<button class="btn btn-light btn-sm" onclick="openTxnModal('record_income', ${r.id}, '${escapeHtml(r.tracking_code)}')"><i class="bi bi-plus-circle"></i> Record Income</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty-state"><i class="bi bi-check2-circle"></i>No completed requests yet.</td></tr>'}</tbody>
    </table></div>
    <p class="small" style="margin-top:10px;"><i class="bi bi-info-circle"></i> "Amount Earned" is the total recorded as income against that request in the ledger — record a payment or an invoice payment to update it.</p>`;
  }

  if (currentTab === 'transactions') {
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Related</th><th>Description</th></tr></thead>
      <tbody>${d.transactions.length ? d.transactions.map(t => `
        <tr>
          <td class="small">${escapeHtml(t.transaction_date)}</td>
          <td>${t.type === 'income' ? '<span class="badge badge-ok">Income</span>' : '<span class="badge badge-off">Expense</span>'}</td>
          <td class="small">${escapeHtml(t.category.replace(/_/g, ' '))}</td>
          <td><b>${fmt(t.amount)}</b></td>
          <td class="small">${escapeHtml(t.customer_name || '—')}</td>
          <td class="small">${escapeHtml(t.description || '—')}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty-state">No transactions in this range.</td></tr>'}</tbody>
    </table></div>`;
  }

  if (currentTab === 'sales') {
    const s = d.sales_summary;
    const rows = d.recent_sales || [];
    body.innerHTML = `
      <div class="grid grid-3" style="margin:14px 0;">
        <div class="card stat-card"><div class="ic green"><i class="bi bi-cash-stack"></i></div><div><b>${fmt(s.revenue)}</b><span>Sales Revenue (${escapeHtml(d.range.label)})</span></div></div>
        <div class="card stat-card"><div class="ic orange"><i class="bi bi-box-seam"></i></div><div><b>${fmt(s.cost)}</b><span>Cost of Goods Sold</span></div></div>
        <div class="card stat-card"><div class="ic ${s.profit >= 0 ? 'blue' : 'red'}"><i class="bi bi-graph-up"></i></div><div><b>${fmt(s.profit)}</b><span>Gross Profit From Sales</span></div></div>
      </div>
      <p class="small">Figures come straight from the Sales feature (Record Sale) — revenue is already included in the totals above, this just breaks out cost and profit per sale.</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Sale</th><th>Product</th><th>Qty</th><th>Amount</th><th>Cost</th><th>Profit</th><th>Sold By</th><th>Date</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td><b>${escapeHtml(r.sale_code)}</b></td>
            <td>${escapeHtml(r.product_name)} — ${escapeHtml(r.type_name)}</td>
            <td>${r.quantity}</td>
            <td>${fmt(r.total_amount)}</td>
            <td>${fmt(r.total_cost)}</td>
            <td>${fmt(r.profit)}</td>
            <td class="small">${escapeHtml(r.sold_by_name || '—')}</td>
            <td class="small">${escapeHtml(r.created_at)}</td>
          </tr>`).join('') : '<tr><td colspan="8" class="empty-state"><i class="bi bi-cart"></i>No sales recorded yet.</td></tr>'}</tbody>
      </table></div>`;
  }

  if (currentTab === 'invoices') {
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due</th><th></th></tr></thead>
      <tbody>${d.invoices.length ? d.invoices.map(i => `
        <tr>
          <td><b>${escapeHtml(i.invoice_code)}</b><div class="small">${escapeHtml(i.title)}</div></td>
          <td>${escapeHtml(i.customer_name)}</td>
          <td>${fmt(i.amount)}</td>
          <td>${fmt(i.amount_paid)}</td>
          <td>${statusBadge(i.status)}</td>
          <td class="small">${escapeHtml(i.due_date || '—')}</td>
          <td class="actions-cell">${d.can_finance && i.status !== 'paid' && i.status !== 'cancelled' ? `<button class="btn btn-light btn-sm" onclick="openPaymentModal(${i.id}, '${escapeHtml(i.invoice_code)}', ${i.amount - i.amount_paid})"><i class="bi bi-cash"></i> Pay</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty-state">No invoices yet.</td></tr>'}</tbody>
    </table></div>`;
  }

  if (currentTab === 'payroll') {
    body.innerHTML = `
      ${d.can_payroll ? `<div style="margin:12px 0;"><button class="btn btn-light btn-sm" onclick="openModal('payrollModal')"><i class="bi bi-plus-circle"></i> Add Payroll Record</button></div>` : ''}
      <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Employee</th><th>Period</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead>
      <tbody>${d.payroll.length ? d.payroll.map(p => `
        <tr>
          <td>${escapeHtml(p.full_name)}</td>
          <td class="small">${new Date(p.period_month).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</td>
          <td>${fmt(p.gross_amount)}</td>
          <td>${fmt(p.deductions)}</td>
          <td><b>${fmt(p.net_amount)}</b></td>
          <td>${statusBadge(p.status)}</td>
          <td class="actions-cell">${d.can_payroll && p.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="payPayroll(${p.id})"><i class="bi bi-check2"></i> Mark Paid</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty-state">No payroll records yet.</td></tr>'}</tbody>
    </table></div>`;
  }

  if (currentTab === 'debts') {
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Customer</th><th>Outstanding Balance</th></tr></thead>
      <tbody>${d.customer_debts.length ? d.customer_debts.map(c => `
        <tr><td>${escapeHtml(c.full_name)}</td><td><b>${fmt(c.balance)}</b></td></tr>`).join('') : '<tr><td colspan="2" class="empty-state">No outstanding customer balances.</td></tr>'}</tbody>
    </table></div>`;
  }
}

function fillDropdowns() {
  const d = FIN_DATA;
  const fill = (id, items, valueKey, labelKey, placeholder) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + items.map(i => `<option value="${i[valueKey]}">${escapeHtml(i[labelKey])}</option>`).join('');
  };
  fill('txnCustomerSelect', d.customers, 'id', 'full_name', '—');
  fill('invoiceCustomerSelect', d.customers, 'id', 'full_name', 'Select…');
  fill('payrollUserSelect', d.payable_staff, 'id', 'full_name', 'Select…');
}

function openTxnModal(action, requestId, trackingCode) {
  document.getElementById('txnAction').value = action;
  document.getElementById('txnModalTitle').innerHTML = action === 'record_income'
    ? '<i class="bi bi-plus-circle"></i> Record Income' : '<i class="bi bi-dash-circle"></i> Record Expense';

  const reqField = document.getElementById('txnRequestId');
  const reqLabel = document.getElementById('txnRequestLabel');
  const catField = document.querySelector('#txnForm [name="category"]');
  if (requestId) {
    reqField.value = requestId;
    reqLabel.style.display = 'block';
    reqLabel.innerHTML = `<i class="bi bi-link-45deg"></i> Linked to request <b>${escapeHtml(trackingCode || '')}</b>`;
    if (catField && !catField.value) catField.value = 'project_payment';
  } else {
    reqField.value = '';
    reqLabel.style.display = 'none';
    reqLabel.innerHTML = '';
  }
  openModal('incomeExpenseModal');
}

function openInvoiceModal() { openModal('invoiceModal'); }

function openPaymentModal(invoiceId, code, balance) {
  document.getElementById('paymentInvoiceId').value = invoiceId;
  document.getElementById('paymentInvoiceLabel').textContent = `${code} — balance due: ${fmt(balance)}`;
  document.querySelector('#paymentForm [name="amount"]').value = balance;
  openModal('paymentModal');
}

async function payPayroll(id) {
  if (!confirm('Mark this payroll record paid? This records the expense in the ledger.')) return;
  const { data } = await apiPost('/admin/finance.php', { action: 'pay_payroll', payroll_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) loadFinance();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Finance', crumb: 'Admin / Finance / Overview', activeKey: 'finance', allowedRoles: ['admin'], anyPermission: ['finance.view','payroll.view'] });
  if (!user) return;
  await loadFinance();

  document.getElementById('txnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const { data } = await apiPost('/admin/finance.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      closeModal('incomeExpenseModal'); e.target.reset();
      document.getElementById('txnRequestLabel').style.display = 'none';
      loadFinance();
    }
  });

  document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'create_invoice');
    const { data } = await apiPost('/admin/finance.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('invoiceModal'); e.target.reset(); loadFinance(); }
  });

  document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'record_payment');
    const { data } = await apiPost('/admin/finance.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('paymentModal'); e.target.reset(); loadFinance(); }
  });

  document.getElementById('payrollForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'create_payroll');
    const { data } = await apiPost('/admin/finance.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('payrollModal'); e.target.reset(); loadFinance(); }
  });
})();
