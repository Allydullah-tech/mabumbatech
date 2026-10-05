function acqStatusFilterFromQuery() {
  return new URLSearchParams(window.location.search).get('status') || 'all';
}
function acqViewFromQuery() {
  const v = new URLSearchParams(window.location.search).get('view');
  return v ? parseInt(v, 10) : 0;
}

let CAN_REVIEW_ACQUISITION = false;
let ACQ_DETAIL = null;   // the request currently open in the detail modal (used by the sale form)
function acqMoney(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const ACQ_PAY_LABELS = { cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank Transfer', card: 'Card', credit: 'Credit' };
let CURRENT_REQUEST_TYPE = 'service';

/**
 * The Operations Manager only assigns product requests, so his "Product Requests" page is a plain
 * list — no tabs, stat cards or customer search — laid out like the Service Requests page.
 */
function isProductDesk() {
  // The dedicated Product Requests page (Super Admin / General Admin) always runs in desk mode.
  if (window.PRODUCT_REQUESTS_PAGE) return true;
  return !!CURRENT_USER && CURRENT_USER.job_role_key === 'general_manager' && !isFullAdmin(CURRENT_USER);
}

/** File name of the page showing the product desk, so its status tabs link back to the right one. */
function productDeskPage() {
  return window.PRODUCT_REQUESTS_PAGE ? 'product-requests.html' : 'marketing-acquisition.html';
}

let DESK_REQUESTS = [];

async function renderProductDesk() {
  const statusFilter = acqStatusFilterFromQuery();
  const { data } = await apiGet('/admin/marketing-acquisition.php?type=product&status=' + encodeURIComponent(statusFilter));
  if (!data.requests) return;
  DESK_REQUESTS = data.requests;
  CAN_REVIEW_ACQUISITION = !!data.can_review;

  // Hide everything the Customer Acquisition page normally shows above/around the list.
  ['acqTabs', 'tab-sources', 'acqIntro', 'acqListPanel'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const searchPanel = document.getElementById('customerSearchInput')?.closest('.panel');
  if (searchPanel) searchPanel.style.display = 'none';

  // Full admins can also cancel a request, so they get a Cancelled tab too.
  const tabs = window.PRODUCT_REQUESTS_PAGE ? ['all', 'pending', 'in_progress', 'completed', 'cancelled'] : ['all', 'pending', 'in_progress', 'completed'];
  const tabsHtml = tabs.map(t => {
    const label = t === 'all' ? 'All' : t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<a href="${productDeskPage()}?status=${t}" class="${statusFilter === t ? 'active' : ''}">${label}</a>`;
  }).join('');

  const desk = document.getElementById('deskBody');
  desk.style.display = '';
  desk.innerHTML = `
    <div class="tabs-row">${tabsHtml}</div>
    <div class="panel">
      <div class="panel-head">
        <h3><i class="bi bi-inboxes"></i> Requests (<span id="deskCount">${DESK_REQUESTS.length}</span>)</h3>
        <div class="filter-bar" style="margin-bottom:0;">
          <div class="search-box"><i class="bi bi-search"></i><input type="text" id="deskSearch" placeholder="Search code, client or product…"></div>
          <input type="date" id="deskFrom" title="From date">
          <input type="date" id="deskTo" title="To date">
        </div>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Code</th><th>Product</th><th>Client</th><th>Status</th><th>Received</th><th></th></tr></thead>
          <tbody id="deskTableBody"></tbody>
        </table>
      </div>
    </div>`;

  drawProductDesk();
  ['deskSearch', 'deskFrom', 'deskTo'].forEach(id => {
    document.getElementById(id).addEventListener(id === 'deskSearch' ? 'input' : 'change', drawProductDesk);
  });
}

function drawProductDesk() {
  const q = (document.getElementById('deskSearch').value || '').trim().toLowerCase();
  const from = document.getElementById('deskFrom').value;
  const to = document.getElementById('deskTo').value;
  const rows = DESK_REQUESTS.filter(r => {
    if (q && !`${r.tracking_code} ${r.guest_name} ${acqTypeLabel(r)}`.toLowerCase().includes(q)) return false;
    const created = (r.created_at || '').slice(0, 10);
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });
  document.getElementById('deskCount').textContent = rows.length;
  document.getElementById('deskTableBody').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${escapeHtml(r.tracking_code)}</td>
        <td><i class="bi bi-box-seam"></i> ${escapeHtml(acqTypeLabel(r))}</td>
        <td>${escapeHtml(r.guest_name)}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="small">${timeAgo(r.created_at)}</td>
        <td><button class="btn btn-light btn-sm" onclick="openAcquisitionDetail(${r.id})"><i class="bi bi-eye"></i> View</button></td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i>No requests match your filters.</td></tr>';
}

/** Redraws whichever list this user sees (the Operations Manager's desk or the normal page). */
function refreshAcquisitionList() {
  return isProductDesk() ? renderProductDesk() : renderAcquisitionList();
}

function acqTypeLabel(r) {
  if (r.request_type === 'product') return r.product_type_name || r.product_name || 'Product';
  return r.service_name || 'Service';
}

async function renderAcquisitionList() {
  const statusFilter = acqStatusFilterFromQuery();
  const { data } = await apiGet('/admin/marketing-acquisition.php?status=' + encodeURIComponent(statusFilter));
  if (!data.requests) return;

  CAN_REVIEW_ACQUISITION = !!data.can_review;
  document.getElementById('newRequestBtn').style.display = data.can_create ? '' : 'none';
  // People who only handle forwarded requests (e.g. the Sales Officer) don't search for or register customers.
  const searchPanel = document.getElementById('customerSearchInput')?.closest('.panel');
  if (searchPanel) searchPanel.style.display = data.can_create ? '' : 'none';

  document.getElementById('statTotal').textContent = data.stats.total || 0;
  document.getElementById('statPendingReview').textContent = data.stats.pending_review || 0;
  document.getElementById('statConverted').textContent = data.stats.converted || 0;

  const svcSelect = document.getElementById('serviceSelect');
  if (svcSelect && !svcSelect.dataset.filled) {
    svcSelect.insertAdjacentHTML('beforeend', data.services.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join(''));
    svcSelect.dataset.filled = '1';
  }
  const prodSelect = document.getElementById('productSelect');
  if (prodSelect && !prodSelect.dataset.filled) {
    prodSelect.insertAdjacentHTML('beforeend', data.products.map(p => `<option value="${p.id}">${escapeHtml(p.category_name)} — ${escapeHtml(p.name)}</option>`).join(''));
    prodSelect.dataset.filled = '1';
  }

  const tabs = ['all', 'pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
  document.getElementById('statusTabs').innerHTML = tabs.map(t => {
    const label = t === 'all' ? 'All' : t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<a href="marketing-acquisition.html?status=${t}" class="${statusFilter === t ? 'active' : ''}">${label}</a>`;
  }).join('');

  document.getElementById('acquisitionTableBody').innerHTML = data.requests.length ? data.requests.map(r => `
    <tr>
      <td><b>${escapeHtml(r.tracking_code)}</b></td>
      <td class="row-name"><b>${escapeHtml(r.guest_name)}</b><span>${escapeHtml(r.guest_phone || r.guest_email || '—')}</span></td>
      <td class="small">${r.request_type === 'product' ? 'Product' : 'Service'}</td>
      <td>${escapeHtml(acqTypeLabel(r))}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.acquisition_status ? statusBadge(r.acquisition_status) : '—'}</td>
      <td class="small">${timeAgo(r.created_at)}</td>
      <td class="actions-cell"><button class="btn btn-light btn-sm" onclick="openAcquisitionDetail(${r.id})"><i class="bi bi-eye"></i> View</button></td>
    </tr>`).join('') : '<tr><td colspan="8" class="empty-state"><i class="bi bi-inbox"></i>No customer-acquisition requests yet.</td></tr>';
}

/** Plain-language task state of one forwarded person on a product request. */
function acqAssigneeState(taskStatus) {
  return ({ new: 'Waiting to respond', accepted: 'Responded', in_progress: 'Responded', completed: 'Deal complete' })[taskStatus] || taskStatus.replace(/_/g, ' ');
}

/** Three-step progress shown on PRODUCT requests: Pending -> In progress -> Completed. */
function productProgressHtml(status) {
  if (status === 'cancelled') {
    return '<div class="alert alert-err" style="margin:8px 0 12px;"><i class="bi bi-x-circle"></i> This request was cancelled.</div>';
  }
  const order = ['pending', 'in_progress', 'completed'];
  const at = Math.max(0, order.indexOf(status));
  const steps = [
    ['bi-hourglass-split', 'Pending', 'No response yet'],
    ['bi-arrow-repeat', 'In progress', 'Received and responded to'],
    ['bi-check2-circle', 'Completed', 'Deal done — sale made'],
  ];
  return `
    <div style="display:flex;gap:8px;margin:8px 0 14px;">${steps.map(([icon, label, hint], i) => {
      const done = i < at, current = i === at;
      const bg = current ? 'var(--blue-600)' : done ? 'var(--ok-100)' : 'var(--blue-50)';
      const fg = current ? '#fff' : done ? '#16663a' : 'var(--ink-soft)';
      return `<div style="flex:1;min-width:0;border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px 8px;text-align:center;background:${bg};color:${fg};">
        <i class="bi ${done ? 'bi-check-lg' : icon}" style="font-size:1.1rem;"></i>
        <div style="font-weight:700;font-size:.8rem;margin-top:2px;">${label}</div>
        <div style="font-size:.68rem;opacity:.85;">${hint}</div>
      </div>`;
    }).join('')}</div>`;
}

async function openAcquisitionDetail(id) {
  const { data } = await apiGet('/admin/marketing-acquisition.php?view=' + id);
  if (!data.request) { showFlash('Request not found.', 'error'); return; }
  CAN_REVIEW_ACQUISITION = !!data.can_review;
  ACQ_DETAIL = data;
  const r = data.request;
  const isProduct = r.request_type === 'product';

  const historyHtml = data.history.length ? data.history.map(h => `
    <div class="notif-item" style="cursor:default;">
      <i class="bi bi-clock-history"></i>
      <span class="notif-item-body">
        <b>${h.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</b>
        <span>${escapeHtml(h.note || '')}</span>
        <span>${escapeHtml(h.user_name || 'System')} · ${timeAgo(h.created_at)}</span>
      </span>
    </div>`).join('') : '<div class="empty-state">No history yet.</div>';

  const staffOptionsHtml = data.staff_options.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)}${s.role_label ? ' — ' + escapeHtml(s.role_label) : ''}</option>`).join('');

  const assignments = data.assignments || [];
  const assignmentsHtml = assignments.length ? assignments.map(a => `
    <div class="notif-item" style="cursor:default;">
      <i class="bi bi-person-check"></i>
      <span class="notif-item-body" style="flex:1;">
        <b>${escapeHtml(a.full_name)}</b>
        <span>${isProduct ? acqAssigneeState(a.task_status) : a.task_status.replace(/_/g, ' ')} · forwarded ${timeAgo(a.created_at)}</span>
      </span>
      ${isProduct && r.status !== 'pending' ? '' : `<button class="btn btn-light btn-sm" onclick="unforwardAcquisitionRequest(${r.id}, ${a.staff_id})" title="Remove — forwarded by mistake or to the wrong person"><i class="bi bi-x-lg"></i></button>`}
    </div>`).join('') : '';

  const attachments = data.attachments || [];
  const attachmentsHtml = attachments.length ? attachments.map(a => `
    <div class="notif-item" style="cursor:default;">
      <i class="bi bi-paperclip"></i>
      <span class="notif-item-body" style="flex:1;">
        <b>${escapeHtml(a.original_name)}</b>
        <span>${escapeHtml(a.full_name || 'Marketing Officer')} · ${timeAgo(a.created_at)}</span>
      </span>
      <a class="btn btn-light btn-sm" href="${APP_ROOT}/backend/includes/download.php?id=${a.id}"><i class="bi bi-download"></i></a>
    </div>`).join('') : '';

  document.getElementById('requestDetailBody').innerHTML = `
    <h3><i class="bi bi-person-vcard"></i> ${escapeHtml(r.guest_name)}</h3>
    <p class="small">${escapeHtml(r.guest_phone || '')} ${r.guest_email ? '· ' + escapeHtml(r.guest_email) : ''} ${r.guest_location ? '· ' + escapeHtml(r.guest_location) : ''}</p>
    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;">
      ${statusBadge(r.status)} ${r.acquisition_status ? statusBadge(r.acquisition_status) : ''}
      <span class="tag-pill">${r.request_type === 'product' ? 'Product' : 'Service'}: ${escapeHtml(acqTypeLabel(r))}</span>
    </div>
    ${isProduct ? productProgressHtml(r.status) : ''}
    ${isProduct && data.can_progress && r.status === 'pending' ? `
      <div class="alert alert-info" style="margin:0 0 12px;"><i class="bi bi-info-circle"></i> This customer is waiting for a response. Press the button once you have received the request and responded to the customer.</div>
      <button class="btn btn-primary btn-block" style="margin-bottom:12px;" onclick="respondToProductRequest(${r.id})"><i class="bi bi-reply"></i> Received &amp; Responded</button>` : ''}
    ${isProduct && data.can_progress && r.status === 'in_progress' ? `
      <div class="alert alert-info" style="margin:0 0 12px;"><i class="bi bi-info-circle"></i> When the customer buys, press the button and enter the sale (product, quantity, price, payment). Stock is reduced and the income and profit are recorded automatically, and the Accountant is notified.</div>
      <button class="btn btn-primary btn-block" style="margin-bottom:12px;" onclick="openDealSale(${r.id}, 'complete')"><i class="bi bi-check2-circle"></i> Deal Done — Sale Made</button>` : ''}
    ${isProduct && r.status === 'completed' && (data.sale || []).length ? acqSaleSummaryHtml(data.sale) : ''}
    ${isProduct && r.status === 'completed' && !(data.sale || []).length ? (data.can_progress ? `
      <div class="alert alert-err" style="margin:0 0 12px;"><i class="bi bi-exclamation-triangle"></i> This deal was marked complete before sales were linked to product requests, so <b>no sale is recorded</b>: stock, income and profit are missing. Record the sale now.</div>
      <button class="btn btn-primary btn-block" style="margin-bottom:12px;" onclick="openDealSale(${r.id}, 'record_sale')"><i class="bi bi-cash-coin"></i> Record the Sale Now</button>` : `
      <div class="alert alert-err" style="margin:0 0 12px;"><i class="bi bi-exclamation-triangle"></i> No sale is recorded for this completed deal yet. The person it was forwarded to (or an admin) can record it.</div>`) : ''}
    <p class="small"><b>Tracking Code:</b> ${escapeHtml(r.tracking_code)}</p>
    ${r.quantity ? `<p class="small"><b>Quantity:</b> ${escapeHtml(String(r.quantity))}</p>` : ''}
    ${r.budget ? `<p class="small"><b>Budget:</b> ${escapeHtml(r.budget)}</p>` : ''}
    ${r.deadline ? `<p class="small"><b>Preferred Date:</b> ${escapeHtml(r.deadline)}</p>` : ''}
    <p class="small"><b>Requirements:</b> ${escapeHtml(r.message)}</p>
    ${r.additional_notes ? `<p class="small"><b>Additional Notes:</b> ${escapeHtml(r.additional_notes)}</p>` : ''}
    <p class="small"><b>Registered by:</b> ${escapeHtml(r.created_by_name || '—')} (Marketing Officer, on behalf of the customer)</p>

    ${attachmentsHtml ? `<h4 style="margin:14px 0 6px;">Attachments</h4><div class="notif-row-list" style="margin-bottom:10px;">${attachmentsHtml}</div>` : ''}

    ${(CAN_REVIEW_ACQUISITION || data.can_forward) ? `
    <div class="divider"></div>
    ${assignmentsHtml ? `<h4 style="margin:14px 0 6px;">Currently Forwarded To</h4><div class="notif-row-list" style="margin-bottom:10px;">${assignmentsHtml}</div>` : ''}
    ${(!data.can_forward || (isProduct && r.status === 'completed')) ? '' : `
    <div class="form-row" style="margin-bottom:${isProduct ? '4' : '10'}px;">
      <div class="form-group">
        <label>${isProduct ? 'Forward To' : 'Forward To Staff'}</label>
        <select id="forwardStaffSelect"><option value="">${isProduct ? 'Select who will deal with it…' : 'Select staff…'}</option>${staffOptionsHtml}</select>
      </div>
      <div class="form-group" style="align-self:flex-end;">
        <button class="btn btn-light btn-block" onclick="forwardAcquisitionRequest(${r.id})"><i class="bi bi-send"></i> Forward</button>
      </div>
    </div>
    ${isProduct ? '<p class="small" style="margin:0 0 10px;">Product requests go to the Super Admin, a General Admin or a Sales Officer.</p>' : ''}`}
    ${!data.can_forward && isProduct && r.status !== 'completed' && r.status !== 'cancelled' ? '<p class="small" style="margin:0 0 10px;"><i class="bi bi-info-circle"></i> Product requests are assigned by the Operations Manager.</p>' : ''}
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      ${CAN_REVIEW_ACQUISITION && r.acquisition_status === 'pending_review' ? `<button class="btn btn-light btn-sm" onclick="markAcquisitionReviewed(${r.id})"><i class="bi bi-check2"></i> Mark Reviewed</button>` : ''}
      ${CAN_REVIEW_ACQUISITION && r.status !== 'cancelled' ? `<button class="btn btn-light btn-sm" onclick="cancelAcquisitionRequest(${r.id})"><i class="bi bi-x-circle"></i> Cancel Request</button>` : ''}
    </div>` : ''}

    <h4 style="margin:14px 0 6px;">History</h4>
    <div class="notif-row-list" style="max-height:200px;overflow-y:auto;margin-bottom:10px;">${historyHtml}</div>
    <form id="addAcqNoteForm">
      <div class="form-group"><label>Add Note</label><textarea name="note" rows="2" placeholder="Add a note to this request's history…" required></textarea></div>
      <button class="btn btn-light btn-block"><i class="bi bi-plus-circle"></i> Add Note</button>
    </form>
  `;

  document.getElementById('addAcqNoteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'add_note');
    form.append('request_id', r.id);
    const { data } = await apiPost('/admin/marketing-acquisition.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) openAcquisitionDetail(r.id);
  });

  openModal('requestDetailModal');
}

async function markAcquisitionReviewed(id) {
  const { data } = await apiPost('/admin/marketing-acquisition.php', { action: 'mark_reviewed', request_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) openAcquisitionDetail(id);
}

async function respondToProductRequest(id) {
  const { data } = await apiPost('/admin/marketing-acquisition.php', { action: 'respond', request_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) { openAcquisitionDetail(id); refreshAcquisitionList(); }
}

/** The sale a completed product request ended in: receipt, product, amount, payment, profit. */
function acqSaleSummaryHtml(sales) {
  const total = sales.reduce((t, x) => t + Number(x.total_amount), 0);
  const profit = sales.reduce((t, x) => t + Number(x.profit), 0);
  const first = sales[0];
  const pay = ACQ_PAY_LABELS[first.payment_method] || first.payment_method || '—';
  const channel = first.payment_channel ? ' · ' + escapeHtml(first.payment_channel) : '';
  const showProfit = typeof hasPerm === 'function' ? (hasPerm('inventory.sell') || hasPerm('inventory.manage') || hasPerm('finance.view')) : true;
  return `
    <div class="alert alert-ok" style="margin:0 0 12px;">
      <div><i class="bi bi-receipt"></i> <b>Sale ${escapeHtml(first.receipt_code)}</b> · ${escapeHtml(String(first.created_at).slice(0, 16))} · by ${escapeHtml(first.sold_by_name || '—')}</div>
      ${sales.map(x => `<div class="small">${escapeHtml(x.product_name)} — ${escapeHtml(x.type_name)} × ${x.quantity} @ ${acqMoney(x.unit_price)} = <b>${acqMoney(x.total_amount)}</b></div>`).join('')}
      <div class="small">Paid by <b>${escapeHtml(pay)}</b>${channel}${first.debt_code ? ` · credit — paid ${acqMoney(first.debt_paid)} of ${acqMoney(first.debt_total)} (${escapeHtml(first.debt_code)})` : ''}</div>
      <div class="small">Total <b>${acqMoney(total)}</b>${showProfit ? ' · Profit <b>' + acqMoney(profit) + '</b>' : ''} · counted in Sales, Stock, Finance and the Accountant.</div>
    </div>`;
}

/* ------------------------------------------------------------------ sale form */

let DEAL_SALE = { id: 0, action: 'complete' };

function dealSaleProduct() {
  const id = Number(document.getElementById('dealProduct').value);
  return ((ACQ_DETAIL && ACQ_DETAIL.sale_products) || []).find(p => Number(p.id) === id) || null;
}

function dealSaleRefresh() {
  const p = dealSaleProduct();
  const hint = document.getElementById('dealProductHint');
  const price = document.getElementById('dealPrice');
  const qty = Number(document.getElementById('dealQty').value) || 0;
  if (p) {
    const min = Number(p.minimum_selling_price) > 0 ? ` · minimum price ${acqMoney(p.minimum_selling_price)}` : '';
    hint.textContent = `In stock: ${p.quantity} ${p.unit} · standard price ${acqMoney(p.selling_price)}${min}`;
    price.placeholder = acqMoney(p.selling_price);
  } else {
    hint.textContent = '';
    price.placeholder = '';
  }
  const unit = price.value !== '' ? Number(price.value) : (p ? Number(p.selling_price) : 0);
  document.getElementById('dealTotal').textContent = acqMoney(unit * qty);

  const method = document.getElementById('dealMethod').value;
  document.getElementById('dealChannelBox').style.display = (method === 'mobile_money' || method === 'bank_transfer') ? '' : 'none';
  document.getElementById('dealCreditBox').style.display = method === 'credit' ? '' : 'none';
  dealFillChannels('dealChannel', method);
  const dm = document.getElementById('dealDepositMethod').value;
  document.getElementById('dealDepositChannelBox').style.display = (dm === 'mobile_money' || dm === 'bank_transfer') ? '' : 'none';
  dealFillChannels('dealDepositChannel', dm);
}

function dealFillChannels(selectId, method) {
  const sel = document.getElementById(selectId);
  const opts = (ACQ_DETAIL && ACQ_DETAIL.payment_options) || { mobile_money_providers: [], banks: [] };
  const list = method === 'mobile_money' ? opts.mobile_money_providers : method === 'bank_transfer' ? opts.banks : [];
  const key = method + '|' + list.length;
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  sel.innerHTML = `<option value="">Select…</option>` + list.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
}

function openDealSale(id, action) {
  const data = ACQ_DETAIL;
  if (!data || !data.request || Number(data.request.id) !== Number(id)) return;
  const r = data.request;
  DEAL_SALE = { id: Number(id), action };
  const prods = data.sale_products || [];
  if (!prods.length) { showFlash('No product is in stock to sell. Add stock in Inventory first.', 'error'); return; }

  document.getElementById('dealSaleTitle').textContent = action === 'record_sale' ? 'Record the Sale' : 'Deal Done — Record the Sale';
  document.getElementById('dealSaleIntro').innerHTML = `Customer <b>${escapeHtml(r.guest_name)}</b> · request ${escapeHtml(r.tracking_code)}. This creates the real sale: stock goes down and the income and profit are recorded.`;
  document.getElementById('dealProduct').innerHTML = `<option value="">Select the product sold…</option>` + prods.map(p =>
    `<option value="${p.id}">${escapeHtml(p.product_name)} — ${escapeHtml(p.name)} (${p.quantity} ${escapeHtml(p.unit)} in stock)</option>`).join('');
  if (r.product_type_id && prods.some(p => Number(p.id) === Number(r.product_type_id))) document.getElementById('dealProduct').value = r.product_type_id;
  document.getElementById('dealQty').value = r.quantity || 1;
  document.getElementById('dealPrice').value = '';
  document.getElementById('dealMethod').value = 'cash';
  document.getElementById('dealNote').value = '';
  document.getElementById('dealCustName').value = r.guest_name || '';
  document.getElementById('dealCustPhone').value = r.guest_phone || '';
  document.getElementById('dealCustAddress').value = r.guest_location || '';
  document.getElementById('dealDue').value = '';
  document.getElementById('dealDeposit').value = '';
  document.getElementById('dealDepositMethod').value = 'cash';
  document.getElementById('dealNoteBox').style.display = action === 'record_sale' ? 'none' : '';
  document.getElementById('dealSubmit').innerHTML = action === 'record_sale'
    ? '<i class="bi bi-cash-coin"></i> Record Sale' : '<i class="bi bi-check2-circle"></i> Complete Deal &amp; Record Sale';
  dealSaleRefresh();
  openModal('dealSaleModal');
}

async function submitDealSale(e) {
  e.preventDefault();
  const btn = document.getElementById('dealSubmit');
  const method = document.getElementById('dealMethod').value;
  const body = {
    action: DEAL_SALE.action, request_id: DEAL_SALE.id,
    product_type_id: document.getElementById('dealProduct').value,
    quantity: document.getElementById('dealQty').value,
    unit_price: document.getElementById('dealPrice').value,
    payment_method: method,
    payment_channel: document.getElementById('dealChannel').value,
    note: document.getElementById('dealNote').value.trim(),
  };
  if (method === 'credit') {
    Object.assign(body, {
      customer_name: document.getElementById('dealCustName').value, customer_phone: document.getElementById('dealCustPhone').value,
      customer_address: document.getElementById('dealCustAddress').value, due_date: document.getElementById('dealDue').value,
      deposit_amount: document.getElementById('dealDeposit').value, deposit_method: document.getElementById('dealDepositMethod').value,
      deposit_channel: document.getElementById('dealDepositChannel').value,
    });
  }
  btn.disabled = true;
  const { data } = await apiPost('/admin/marketing-acquisition.php', body);
  btn.disabled = false;
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) {
    closeModal('dealSaleModal');
    openAcquisitionDetail(DEAL_SALE.id);
    refreshAcquisitionList();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('dealSaleForm');
  if (!form) return;
  form.addEventListener('submit', submitDealSale);
  ['dealProduct', 'dealQty', 'dealPrice', 'dealMethod', 'dealDepositMethod'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', dealSaleRefresh);
    el.addEventListener('change', dealSaleRefresh);
  });
});

async function forwardAcquisitionRequest(id) {
  const staffId = document.getElementById('forwardStaffSelect').value;
  if (!staffId) { showFlash('Choose a staff member first.', 'error'); return; }
  const { data } = await apiPost('/admin/marketing-acquisition.php', { action: 'forward', request_id: id, staff_id: staffId });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) { openAcquisitionDetail(id); refreshAcquisitionList(); }
}

async function unforwardAcquisitionRequest(id, staffId) {
  if (!confirm('Remove this staff member from the request? They will no longer see it in their tasks.')) return;
  const { data } = await apiPost('/admin/marketing-acquisition.php', { action: 'unforward', request_id: id, staff_id: staffId });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) { openAcquisitionDetail(id); refreshAcquisitionList(); }
}

async function cancelAcquisitionRequest(id) {
  const reason = prompt('Reason for cancelling (optional):') || '';
  if (!confirm('Cancel this customer-acquisition request?')) return;
  const { data } = await apiPost('/admin/marketing-acquisition.php', { action: 'cancel', request_id: id, reason });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) { closeModal('requestDetailModal'); refreshAcquisitionList(); }
}

function renderCustomerResults(items, caption, emptyText) {
  const results = document.getElementById('customerSearchResults');
  const kindLabel = (c) => c.kind === 'account' ? 'Registered Customer'
    : c.kind === 'lead' ? 'Lead · ' + leadSourceLabel(c.source)
    : 'Previous Guest Request';
  const icon = (c) => c.kind === 'account' ? 'bi-person-check' : c.kind === 'lead' ? 'bi-megaphone' : 'bi-person';
  results.innerHTML = (caption ? `<div class="small" style="font-weight:700;margin:2px 0 4px;">${caption}</div>` : '') + (items.length ? items.map(c => `
    <div class="notif-item" style="cursor:pointer;" onclick='prefillCustomer(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
      <i class="bi ${icon(c)}"></i>
      <span class="notif-item-body">
        <b>${escapeHtml(c.full_name || 'Unnamed')}</b>
        <span>${escapeHtml(c.phone || '')} ${c.email ? '· ' + escapeHtml(c.email) : ''} · ${escapeHtml(kindLabel(c))}${c.created_at ? ' · ' + timeAgo(c.created_at) : ''}</span>
      </span>
    </div>`).join('') : `<div class="empty-state">${emptyText}</div>`);
}

async function loadRecentCustomers() {
  const { data } = await apiGet('/admin/marketing-acquisition.php?recent_customers=1');
  const items = data.results || [];
  renderCustomerResults(items, items.length ? 'Recent customers — tap one to start a request, or search above' : '', 'No customers yet — a new customer can be registered with “New Customer Request”.');
}

function setupCustomerSearch() {
  const input = document.getElementById('customerSearchInput');
  let timer = null;
  loadRecentCustomers();
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { loadRecentCustomers(); return; }
    timer = setTimeout(async () => {
      const { data } = await apiGet('/admin/marketing-acquisition.php?search_customers=' + encodeURIComponent(q));
      renderCustomerResults(data.results || [], '', 'No matches found — this looks like a new customer.');
    }, 300);
  });
}

function prefillCustomer(c) {
  openModal('newRequestModal');
  const form = document.getElementById('newRequestForm');
  form.full_name.value = c.full_name || '';
  form.phone.value = c.phone || '';
  form.email.value = c.email || '';
  // A lead already knows where the customer came from — carry that over.
  if (c.kind === 'lead' && form.source) {
    form.source.value = c.source || '';
    form.source.dispatchEvent(new Event('change'));
    if (c.source_detail && form.source_detail) form.source_detail.value = c.source_detail;
  }
  showFlash('Customer details filled in — complete the rest of the request below.', 'info');
}

function setupRequestTypeTabs() {
  const tabs = document.querySelectorAll('#requestTypeTabs a');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      CURRENT_REQUEST_TYPE = tab.dataset.type;
      document.getElementById('serviceFieldGroup').style.display = CURRENT_REQUEST_TYPE === 'service' ? '' : 'none';
      document.getElementById('productFieldGroup').style.display = CURRENT_REQUEST_TYPE === 'product' ? '' : 'none';
    });
  });
}

(async function () {
  await loadSession();
  const desk = isProductDesk();
  const user = await initDashLayout({
    pageTitle: desk ? 'Product Requests' : 'Customer Acquisition',
    crumb: desk ? 'Admin / Sales & Marketing / Product Requests' : 'Admin / Marketing / Customer Acquisition',
    activeKey: window.PRODUCT_REQUESTS_PAGE ? 'product-requests' : 'marketing-acquisition', allowedRoles: ['admin'],
    anyPermission: ['marketing.view', 'marketing.manage', 'marketing.acquisition.manage'],
    fullAdminOnly: !!window.PRODUCT_REQUESTS_PAGE,
  });
  if (!user) return;

  setupRequestTypeTabs();
  if (desk) {
    // No customer search and no By Source tab for the Operations Manager.
    await renderProductDesk();
  } else {
    setupCustomerSearch();
    await renderAcquisitionList();
    if (window.initLeadsUI) await initLeadsUI();
  }

  const viewId = acqViewFromQuery();
  if (viewId) openAcquisitionDetail(viewId);

  // The dedicated Product Requests page has no "new request" form (requests are registered in Customer Acquisition).
  const newRequestForm = document.getElementById('newRequestForm');
  if (newRequestForm) newRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'create');
    form.append('request_type', CURRENT_REQUEST_TYPE);
    const { data } = await apiPost('/admin/marketing-acquisition.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('newRequestModal'); e.target.reset(); refreshAcquisitionList(); }
  });
})();
