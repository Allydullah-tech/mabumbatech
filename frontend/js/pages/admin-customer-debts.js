/**
 * Customer Debts — everything customers owe from credit sales.
 *  - Top: totals (still owed, paid back, overdue, customers owing).
 *  - List: customer, what they owe, what they paid, what is left, due date, status.
 *  - View: full customer details, the items bought, a payment form, and the
 *    payment history (date, amount, balance after, method, who recorded it).
 * Every payment recorded here is posted to Finance as income (by the server).
 */
let dbtQuery = '';
let dbtStatus = 'open';     // open | unpaid | partial | overdue | paid | all
let dbtTimer = null;
let dbtOptions = { mobile_money_providers: [], banks: [] };
let dbtCanRecord = false;
let dbtOpenId = null;

const DBT_METHODS = { cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank', card: 'Card' };
const DBT_STATUS = { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Fully paid' };

function dbtMoney(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dbtDate(d) {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function dbtMethod(m, channel) {
  const label = DBT_METHODS[m] || m || '—';
  return channel ? `${label} · ${channel}` : label;
}
function dbtBadge(d) {
  const overdue = Number(d.is_overdue) === 1;
  return `<span class="debt-badge ${d.status}">${DBT_STATUS[d.status] || d.status}</span>${overdue ? '<span class="debt-badge overdue">Overdue</span>' : ''}`;
}
function dbtPct(d) {
  const t = Number(d.total_amount) || 0;
  return t > 0 ? Math.min(100, Math.round((Number(d.amount_paid) / t) * 100)) : 0;
}

/* ------------------------------------------------------------------ page */

function renderDebtsShell() {
  document.getElementById('pageBody').innerHTML = `
    <div class="rs-head">
      <div>
        <h2>Customer Debts</h2>
        <p>Customers who took goods on credit — what they owe, what they have paid, and what is left.</p>
      </div>
      <div class="rs-head-actions"><a class="btn btn-light btn-sm" href="record-sale.html"><i class="bi bi-cart-check"></i> Record Sale</a></div>
    </div>

    <div class="rs-kpis" id="dbtKpis"></div>

    <div class="panel">
      <div class="panel-head" style="flex-wrap:wrap;gap:10px;">
        <h3><i class="bi bi-journal-text"></i> Debts</h3>
        <div class="debt-toolbar" style="flex:1 1 380px;justify-content:flex-end;">
          <div class="search-box"><i class="bi bi-search"></i><input type="text" id="dbtSearch" placeholder="Search customer, phone or receipt…" autocomplete="off" value="${escapeHtml(dbtQuery)}"></div>
          <select id="dbtFilter">
            ${[['open', 'Still owing'], ['unpaid', 'Unpaid'], ['partial', 'Partly paid'], ['overdue', 'Overdue'], ['paid', 'Fully paid'], ['all', 'All debts']]
              .map(o => `<option value="${o[0]}" ${o[0] === dbtStatus ? 'selected' : ''}>${o[1]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap" id="dbtTable"><div class="empty-state small">Loading…</div></div>
    </div>`;

  document.getElementById('dbtSearch').addEventListener('input', (e) => {
    clearTimeout(dbtTimer);
    dbtTimer = setTimeout(() => { dbtQuery = e.target.value.trim(); loadDebts(); }, 250);
  });
  document.getElementById('dbtFilter').addEventListener('change', (e) => { dbtStatus = e.target.value; loadDebts(); });
  document.getElementById('dbtTable').addEventListener('click', (e) => {
    const b = e.target.closest('[data-debt]');
    if (b) openDebt(Number(b.dataset.debt));
  });
}

async function loadDebts() {
  const url = '/admin/customer-debts.php?status=' + encodeURIComponent(dbtStatus) + (dbtQuery ? '&q=' + encodeURIComponent(dbtQuery) : '');
  const { data } = await apiGet(url);
  if (!data.stats) { document.getElementById('dbtTable').innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i>Could not load customer debts.</div>'; return; }
  dbtOptions = data.options || dbtOptions;
  dbtCanRecord = !!data.can_record;
  const s = data.stats;

  document.getElementById('dbtKpis').innerHTML = `
    <div class="card stat-card"><div class="ic orange"><i class="bi bi-hourglass-split"></i></div><div><b>${dbtMoney(s.total_balance)}</b><span>Still owed to us</span><small>${s.open_count} open debt${Number(s.open_count) === 1 ? '' : 's'}</small></div></div>
    <div class="card stat-card"><div class="ic green"><i class="bi bi-cash-coin"></i></div><div><b>${dbtMoney(s.total_paid)}</b><span>Paid back so far</span><small>of ${dbtMoney(s.total_credit)} given on credit</small></div></div>
    <div class="card stat-card"><div class="ic red"><i class="bi bi-exclamation-octagon"></i></div><div><b>${dbtMoney(s.overdue_amount)}</b><span>Overdue</span><small>${s.overdue_count} debt${Number(s.overdue_count) === 1 ? '' : 's'} past the pay-by date</small></div></div>
    <div class="card stat-card"><div class="ic blue"><i class="bi bi-people"></i></div><div><b>${s.customers_owing}</b><span>Customers owing</span></div></div>`;

  const rows = data.debts || [];
  document.getElementById('dbtTable').innerHTML = `<table class="tbl">
    <thead><tr><th>Customer</th><th>Sale</th><th>Amount owed</th><th>Amount paid</th><th>Balance</th><th>Pay-by date</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.length ? rows.map(d => `
      <tr>
        <td class="debt-who"><b>${escapeHtml(d.customer_name)}</b><span><i class="bi bi-telephone"></i> ${escapeHtml(d.customer_phone)}</span></td>
        <td class="small"><b>${escapeHtml(d.receipt_code)}</b><div>${escapeHtml(dbtDate(d.created_at))}</div></td>
        <td class="debt-amt">${dbtMoney(d.total_amount)}</td>
        <td class="debt-amt paid">${dbtMoney(d.amount_paid)}<div class="mini-bar"><i style="width:${dbtPct(d)}%"></i></div></td>
        <td class="debt-amt ${Number(d.balance) > 0 ? 'owe' : ''}">${dbtMoney(d.balance)}</td>
        <td class="small">${escapeHtml(dbtDate(d.due_date))}</td>
        <td>${dbtBadge(d)}</td>
        <td class="actions-cell"><button type="button" class="btn btn-light btn-sm" data-debt="${d.id}"><i class="bi bi-eye"></i> View</button></td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty-state"><i class="bi bi-journal-check"></i>${dbtQuery || dbtStatus !== 'open' ? 'No debts match your search.' : 'No customer owes anything right now.'}</td></tr>`}</tbody>
  </table>`;
}

/* ---------------------------------------------------------------- detail */

function ensureDebtModal() {
  if (document.getElementById('debtModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bg" id="debtModal">
      <div class="modal-box">
        <span class="modal-close" onclick="closeModal('debtModal')"><i class="bi bi-x-lg"></i></span>
        <div id="debtModalBody"></div>
      </div>
    </div>`);
}

function debtProviderSelect(method, selected) {
  if (method !== 'mobile_money' && method !== 'bank_transfer') return '';
  const list = method === 'mobile_money' ? dbtOptions.mobile_money_providers : dbtOptions.banks;
  const label = method === 'mobile_money' ? 'Mobile Money provider' : 'Bank';
  return `<div class="form-group full"><label>${label} *</label>
    <select name="payment_channel" required><option value="">Select ${method === 'mobile_money' ? 'provider' : 'bank'}…</option>
    ${list.map(n => `<option value="${escapeHtml(n)}" ${n === selected ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></div>`;
}

async function openDebt(id) {
  ensureDebtModal();
  dbtOpenId = id;
  const { data } = await apiGet('/admin/customer-debts.php?debt=' + id);
  if (!data.debt) { showFlash('Debt not found.', 'error'); return; }
  dbtOptions = data.options || dbtOptions;
  const d = data.debt;
  const balance = Math.max(0, Number(d.total_amount) - Number(d.amount_paid));
  const pct = dbtPct(d);
  const today = new Date().toISOString().slice(0, 10);

  const itemsHtml = data.items.length ? `<div class="debt-table-wrap"><table class="debt-table">
      <thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead>
      <tbody>${data.items.map(i => `<tr><td><b>${escapeHtml(i.product_name)}</b> — ${escapeHtml(i.type_name)}</td><td class="r">${i.quantity} ${escapeHtml(i.unit || '')}</td><td class="r">${dbtMoney(i.unit_price)}</td><td class="r">${dbtMoney(i.total_amount)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="debt-empty">No items found for this sale.</div>';

  const historyHtml = data.payments.length ? `<div class="debt-table-wrap"><table class="debt-table">
      <thead><tr><th>Date</th><th class="r">Amount paid</th><th class="r">Balance after</th><th>Method</th><th>Recorded by</th></tr></thead>
      <tbody>${data.payments.map(p => `<tr>
        <td>${escapeHtml(dbtDate(p.paid_date))}${p.note ? `<small>${escapeHtml(p.note)}</small>` : ''}</td>
        <td class="r"><b style="color:var(--ok);">${dbtMoney(p.amount)}</b></td>
        <td class="r"><b style="${Number(p.balance_after) > 0 ? 'color:var(--danger);' : 'color:var(--ok);'}">${dbtMoney(p.balance_after)}</b></td>
        <td>${escapeHtml(dbtMethod(p.payment_method, p.payment_channel))}${p.reference ? `<small>Ref: ${escapeHtml(p.reference)}</small>` : ''}</td>
        <td>${escapeHtml(p.recorded_by_name || '—')}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="debt-empty"><i class="bi bi-cash-coin"></i>No payments yet.</div>';

  const payForm = balance <= 0
    ? `<div class="debt-paid-note"><i class="bi bi-check-circle-fill"></i> This debt is fully paid.</div>`
    : (data.can_record ? `
      <form id="debtPayForm" class="debt-form">
        <div class="debt-form-grid">
          <div class="form-group"><label>Amount paid *</label><input type="number" name="amount" min="0.01" max="${balance}" step="0.01" placeholder="0.00" required>
            <a href="#" class="fill-link" id="debtPayFull">Pay the full balance (${dbtMoney(balance)})</a></div>
          <div class="form-group"><label>Payment date *</label><input type="date" name="paid_date" value="${today}" max="${today}" required></div>
          <div class="form-group"><label>Paid by *</label>
            <select name="payment_method" id="debtPayMethod">${Object.entries(DBT_METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="form-group"><label>Reference <span class="small">(optional)</span></label><input type="text" name="reference" maxlength="80" placeholder="Transaction no."></div>
          <div id="debtPayChannel" style="display:contents;"></div>
          <div class="form-group full"><label>Note <span class="small">(optional)</span></label><input type="text" name="note" maxlength="255" placeholder="e.g. second instalment"></div>
        </div>
        <button class="btn btn-primary btn-block"><i class="bi bi-check2-circle"></i> Record Payment</button>
      </form>` : '<div class="debt-empty">You can view this debt but not record payments.</div>');

  document.getElementById('debtModalBody').innerHTML = `
    <div class="debt-head">
      <h3>${escapeHtml(d.customer_name)}</h3>
      <p><i class="bi bi-telephone"></i> ${escapeHtml(d.customer_phone)}${d.customer_address ? ' · ' + escapeHtml(d.customer_address) : ''}</p>
      <div class="codes"><span>${escapeHtml(d.debt_code)}</span><span>Sale ${escapeHtml(d.receipt_code)}</span>${dbtBadge(d).replace(/class="debt-badge/g, 'style="margin:0" class="debt-badge')}</div>
    </div>

    <section class="debt-sec">
      <h4><i class="bi bi-wallet2"></i> Debt Summary</h4>
      <div class="debt-sum">
        <div><span>Amount owed</span><b>${dbtMoney(d.total_amount)}</b></div>
        <div class="ok"><span>Amount paid</span><b>${dbtMoney(d.amount_paid)}</b></div>
        <div class="${balance > 0 ? 'owe' : 'ok'}"><span>Remaining balance</span><b>${dbtMoney(balance)}</b></div>
      </div>
      <div class="debt-progress"><div class="bar"><i style="width:${pct}%"></i></div><small>${pct}% paid</small></div>
    </section>

    <section class="debt-sec">
      <h4><i class="bi bi-person-vcard"></i> Customer &amp; Sale</h4>
      <div class="debt-info">
        <div><span>Customer</span><b>${escapeHtml(d.customer_name)}</b></div>
        <div><span>Phone</span><b>${escapeHtml(d.customer_phone)}</b></div>
        <div><span>Address</span><b>${escapeHtml(d.customer_address || '—')}</b></div>
        <div><span>Pay-by date</span><b>${escapeHtml(dbtDate(d.due_date))}${Number(d.is_overdue) === 1 ? ' <span class="debt-badge overdue">Overdue</span>' : ''}</b></div>
        <div><span>Sale date</span><b>${escapeHtml(dbtDate(d.sale_date || d.created_at))}</b></div>
        <div><span>Sold by</span><b>${escapeHtml(d.created_by_name || '—')}</b></div>
        ${d.notes ? `<div style="grid-column:1/-1;"><span>Notes</span><b>${escapeHtml(d.notes)}</b></div>` : ''}
      </div>
      <div style="margin-top:14px;">${itemsHtml}</div>
    </section>

    <section class="debt-sec">
      <h4><i class="bi bi-clock-history"></i> Payment History</h4>
      ${historyHtml}
    </section>

    <section class="debt-sec" style="padding-bottom:6px;">
      <h4><i class="bi bi-plus-circle"></i> Record a Payment</h4>
      ${payForm}
    </section>
    <div class="debt-foot"><button type="button" class="btn btn-light" onclick="closeModal('debtModal')">Close</button></div>`;

  const form = document.getElementById('debtPayForm');
  if (form) {
    const channelBox = document.getElementById('debtPayChannel');
    const drawChannel = () => { channelBox.innerHTML = debtProviderSelect(form.payment_method.value, ''); };
    form.payment_method.addEventListener('change', drawChannel);
    document.getElementById('debtPayFull').addEventListener('click', (e) => { e.preventDefault(); form.amount.value = balance.toFixed(2); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const amount = Number(fd.get('amount'));
      if (!(amount > 0)) { showFlash('Enter the amount the customer is paying.', 'error'); return; }
      if (amount > balance + 0.004) { showFlash(`That is more than the customer owes (${dbtMoney(balance)}).`, 'error'); return; }
      fd.append('action', 'record_payment');
      fd.append('debt_id', id);
      const btn = form.querySelector('button.btn-primary');
      btn.disabled = true;
      const { data: res } = await apiPost('/admin/customer-debts.php', fd);
      btn.disabled = false;
      showFlash(res.message || 'Done.', res.success ? 'success' : 'error');
      if (!res.success) return;
      await openDebt(id);
      loadDebts();
    });
  }
  openModal('debtModal');
}

(async function () {
  const user = await initDashLayout({
    pageTitle: 'Customer Debts', crumb: 'Admin / Operations / Customer Debts', activeKey: 'customer-debts', allowedRoles: ['admin'],
    anyPermission: ['inventory.sell', 'inventory.manage', 'sales_overview.view', 'finance.view', 'finance.manage'],
  });
  if (!user) return;
  renderDebtsShell();
  await loadDebts();
})();
