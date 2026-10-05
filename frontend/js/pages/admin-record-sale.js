/**
 * Record Sale — one sale can hold several products.
 *  - Left: pick products (a few are always shown; type to search for others).
 *  - Right: the current sale. Each line shows the MINIMUM price allowed for
 *    that product; the price can be edited but never below that minimum
 *    (the server enforces the same rule).
 */
let saleSearchTimer = null;
let saleCart = [];          // lines of the sale being built
let saleProducts = {};      // id -> product from the latest picker results

// Records panel (sales / damaged items) with its time filter.
let recPeriod = 'today';    // today | yesterday | week | month | last_month | year | all | custom
let recFrom = '';
let recTo = '';
let recTab = 'sales';       // sales | damages
let recData = null;         // latest response from the server
let damageProducts = {};    // id -> in-stock product (for the Record Damage form)
let payOptions = { mobile_money_providers: ['M-Pesa', 'Airtel Money', 'HaloPesa', 'Mixx by Yas'], banks: ['CRDB Bank', 'NMB Bank', 'Other Bank'] };  // replaced by the server's lists
let payMethod = 'cash';     // method chosen for the sale being built
const PAY_TILES = [
  ['cash', 'Cash', 'bi-cash-coin'], ['mobile_money', 'Mobile Money', 'bi-phone'], ['bank_transfer', 'Bank', 'bi-bank'],
  ['card', 'Card', 'bi-credit-card'], ['credit', 'Credit', 'bi-journal-text'],
];
const REC_PERIODS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'],
  ['last_month', 'Last month'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom dates…'],
];

function fmtMoney(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ------------------------------------------------------------------ page */

function renderSalePage(data) {
  if (data.options) payOptions = data.options;
  document.getElementById('pageBody').innerHTML = `
    <div class="rs-head">
      <div>
        <h2>Record Sale</h2>
        <p>Pick the products, choose how the customer pays — or sell on credit — and print the receipt.</p>
      </div>
      <div class="rs-head-actions">
        <a class="btn btn-light btn-sm" href="customer-debts.html"><i class="bi bi-journal-text"></i> Customer Debts</a>
        <button type="button" class="btn btn-light btn-sm" id="openDamageBtn"><i class="bi bi-exclamation-triangle"></i> Record Damaged Item</button>
      </div>
    </div>

    <div class="rs-kpis">
      <div class="card stat-card"><div class="ic green"><i class="bi bi-cash-stack"></i></div><div><b id="statTodaySales">0.00</b><span>Today's Sales</span></div></div>
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-graph-up"></i></div><div><b id="statTodayProfit">0.00</b><span>Today's Profit</span></div></div>
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-receipt"></i></div><div><b id="statTodayCount">0</b><span>Sales Today</span></div></div>
      <a class="card stat-card is-link" href="customer-debts.html" title="Open Customer Debts"><div class="ic orange"><i class="bi bi-journal-text"></i></div><div><b id="statDebts">0.00</b><span>Owed by customers</span><small id="statDebtsCount"></small></div></a>
    </div>

    <div class="sale-layout">
      <div class="panel">
        <div class="panel-head"><h3><i class="bi bi-box-seam"></i> Products</h3></div>
        <div class="panel-body">
          <div class="search-box" style="min-width:0;">
            <i class="bi bi-search"></i>
            <input type="text" id="saleSearchInput" placeholder="Search a product to add it to the sale…" autocomplete="off">
          </div>
          <p class="small" id="saleListHint" style="margin:10px 0 8px;">Showing products in stock — type above to find any other product.</p>
          <div id="saleProductList" class="sale-product-list"><div class="empty-state small">Loading…</div></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3><i class="bi bi-cart-check"></i> Current Sale</h3><span class="panel-count" id="cartCount"></span></div>
        <div class="panel-body">
          <div id="receiptBox"></div>
          <div id="cartBody"></div>
          <div id="cartFooter"></div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:18px;">
      <div class="panel-head">
        <h3><i class="bi bi-clock-history"></i> Records</h3>
        <button type="button" class="btn btn-primary btn-sm js-open-damage"><i class="bi bi-exclamation-triangle"></i> Record Damage</button>
      </div>
      <div class="panel-body" style="padding-bottom:0;">
        <div class="filter-bar" style="margin-bottom:10px;">
          <label class="small" for="recPeriod" style="font-weight:700;">Time</label>
          <select id="recPeriod">${REC_PERIODS.map(p => `<option value="${p[0]}" ${p[0] === recPeriod ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>
          <span id="recCustom" style="display:${recPeriod === 'custom' ? 'inline-flex' : 'none'};gap:8px;align-items:center;">
            <input type="date" id="recFrom" value="${escapeHtml(recFrom)}"> <span class="small">to</span> <input type="date" id="recTo" value="${escapeHtml(recTo)}">
          </span>
          <span class="small" id="recRangeLabel"></span>
        </div>
        <div class="grid grid-4" id="recSummary" style="margin-bottom:12px;"></div>
        <div class="tabs-row">
          <a href="#" data-rec-tab="sales" class="${recTab === 'sales' ? 'active' : ''}">Sales</a>
          <a href="#" data-rec-tab="damages" class="${recTab === 'damages' ? 'active' : ''}">Damaged Items</a>
        </div>
      </div>
      <div class="table-wrap" id="recTable"></div>
    </div>`;

  updateSaleSummary(data);
  wireSalePage();
  renderCart();
  loadProducts('');
}

function updateSaleSummary(data) {
  recData = data;

  // Today's three cards (always today, whatever the filter below says).
  const s = data.stats;
  document.getElementById('statTodaySales').textContent = fmtMoney(s.today_sales);
  document.getElementById('statTodayProfit').textContent = fmtMoney(s.today_profit);
  document.getElementById('statTodayCount').textContent = s.today_count;
  document.getElementById('statDebts').textContent = fmtMoney(s.debts_balance);
  document.getElementById('statDebtsCount').textContent = Number(s.debts_open) ? `${s.debts_open} open debt${Number(s.debts_open) === 1 ? '' : 's'}` : 'No open debts';

  renderRecords();
}

/** Draws the summary strip and the Sales / Damaged Items table for the chosen period. */
function renderRecords() {
  const data = recData;
  if (!data) return;
  const sum = data.summary || {};

  const label = document.getElementById('recRangeLabel');
  if (label) label.textContent = data.range ? `Showing: ${data.range.label}` : '';

  document.getElementById('recSummary').innerHTML = `
    <div class="card stat-card"><div class="ic green"><i class="bi bi-cash-stack"></i></div><div><b>${fmtMoney(sum.sales_total)}</b><span>Sales · ${sum.receipts || 0} receipt${Number(sum.receipts) === 1 ? '' : 's'}${Number(sum.credit_sales) > 0 ? ' · ' + fmtMoney(sum.credit_sales) + ' on credit' : ''}</span></div></div>
    <div class="card stat-card"><div class="ic blue"><i class="bi bi-graph-up"></i></div><div><b>${fmtMoney(sum.profit)}</b><span>Profit</span></div></div>
    <div class="card stat-card"><div class="ic blue"><i class="bi bi-box-seam"></i></div><div><b>${sum.units || 0}</b><span>Units sold</span></div></div>
    <div class="card stat-card" style="cursor:pointer;" data-rec-tab="damages" title="View damaged items"><div class="ic red"><i class="bi bi-heartbreak"></i></div><div><b>${fmtMoney(sum.damage_loss)}</b><span>Damage loss · ${sum.damage_units || 0} unit${Number(sum.damage_units) === 1 ? '' : 's'}</span></div></div>`;

  document.querySelectorAll('[data-rec-tab]').forEach(a => {
    if (a.tagName === 'A') a.classList.toggle('active', a.dataset.recTab === recTab);
  });

  const box = document.getElementById('recTable');
  if (recTab === 'damages') {
    const rows = data.damages || [];
    box.innerHTML = `<table class="tbl">
      <thead><tr><th>Date</th><th>Product</th><th>Qty Damaged</th><th>Loss</th><th>Remark</th><th>By</th></tr></thead>
      <tbody>${rows.length ? rows.map(m => `
        <tr>
          <td class="small">${escapeHtml(String(m.created_at).slice(0, 16))}</td>
          <td><b>${escapeHtml(m.product_name)}</b> — ${escapeHtml(m.type_name)}</td>
          <td>${m.quantity} ${escapeHtml(m.unit || '')}</td>
          <td style="color:var(--danger);font-weight:700;">${fmtMoney(m.loss)}</td>
          <td class="small">${escapeHtml(m.notes || '—')}</td>
          <td class="small">${escapeHtml(m.recorded_by_name || '—')}</td>
        </tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-emoji-smile"></i>No damaged items in this period.</td></tr>`}</tbody>
    </table>
    <p class="small" style="margin:10px 16px;">Each damaged item is removed from stock and its buying cost is counted as a loss (an expense) in Finance and Reports.</p>`;
    return;
  }

  // Group the line rows into receipts (one sale = one row here).
  const groups = [];
  const byReceipt = {};
  (data.sales || []).forEach(line => {
    const key = line.receipt;
    if (!byReceipt[key]) { byReceipt[key] = { receipt: key, lines: [], amount: 0, profit: 0, sold_by: line.sold_by_name, at: line.created_at, request_code: line.request_code, request_customer: line.request_customer, payment_method: line.payment_method, payment_channel: line.payment_channel, debt: line.debt_id ? { debt_code: line.debt_code, customer_name: line.customer_name, customer_phone: line.customer_phone, total: Number(line.debt_total), paid: Number(line.debt_paid), due_date: line.debt_due } : null }; groups.push(byReceipt[key]); }
    const g = byReceipt[key];
    g.lines.push(line);
    g.amount += Number(line.total_amount);
    g.profit += Number(line.profit);
  });

  receiptGroups = {};
  groups.forEach(g => {
    receiptGroups[g.receipt] = {
      receipt_code: g.receipt, at: g.at, served_by: g.sold_by, payment_method: g.payment_method, payment_channel: g.payment_channel, total_amount: g.amount,
      credit: g.debt ? { debt_code: g.debt.debt_code, customer_name: g.debt.customer_name, customer_phone: g.debt.customer_phone, paid: g.debt.paid, balance: Math.max(0, g.debt.total - g.debt.paid), due_date: g.debt.due_date } : null,
      items: g.lines.map(l => ({ product_name: l.product_name, type_name: l.type_name, unit: l.unit, quantity: l.quantity, unit_price: l.unit_price, total_amount: l.total_amount })),
    };
  });

  box.innerHTML = `<table class="tbl">
    <thead><tr><th>Sale</th><th>Products</th><th>Amount</th><th>Payment</th><th>Profit</th><th>Sold By</th><th>When</th><th></th></tr></thead>
    <tbody id="recentSalesBody">${groups.length ? groups.map(g => `
      <tr>
        <td><b>${escapeHtml(g.receipt)}</b>${g.request_code ? `<div class="small"><span class="tag-pill" title="Sold through a customer product request"><i class="bi bi-person-lines-fill"></i> Request ${escapeHtml(g.request_code)}${g.request_customer ? ' · ' + escapeHtml(g.request_customer) : ''}</span></div>` : ''}</td>
        <td>${g.lines.map(l => `<div>${escapeHtml(l.product_name)} — ${escapeHtml(l.type_name)} <span class="small">× ${l.quantity} @ ${fmtMoney(l.unit_price)}</span></div>`).join('')}</td>
        <td>${fmtMoney(g.amount)}</td>
        <td>${paymentCell(g)}</td>
        <td>${fmtMoney(g.profit)}</td>
        <td class="small">${escapeHtml(g.sold_by || '—')}</td>
        <td class="small">${escapeHtml(String(g.at).slice(0, 16))}<div>${timeAgo(g.at)}</div></td>
        <td><button type="button" class="btn btn-light btn-sm js-open-receipt" data-receipt="${escapeHtml(g.receipt)}"><i class="bi bi-receipt"></i> Receipt</button></td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty-state"><i class="bi bi-cart"></i>No sales in this period.</td></tr>`}</tbody>
  </table>${data.sales_truncated ? '<p class="small" style="margin:10px 16px;">Showing the latest 1,000 sale lines — narrow the time range to see older ones. The totals above cover the whole period.</p>' : ''}`;
}

/** "Mobile Money · M-Pesa", "Bank · CRDB Bank", or a Credit tag with the customer and what is still owed. */
function paymentCell(g) {
  const label = PAY_LABELS[g.payment_method] || (g.payment_method ? g.payment_method : '—');
  if (g.payment_method === 'credit' && g.debt) {
    const bal = Math.max(0, g.debt.total - g.debt.paid);
    return `<span class="pay-tag"><i class="bi bi-journal-text"></i> Credit</span><div class="small">${escapeHtml(g.debt.customer_name)}</div>
      <span class="credit-flag ${bal <= 0 ? 'paid' : ''}">${bal <= 0 ? 'Fully paid' : 'Owes ' + fmtMoney(bal)}</span>`;
  }
  return `<span class="pay-tag">${escapeHtml(label)}</span>${g.payment_channel ? `<div class="small">${escapeHtml(g.payment_channel)}</div>` : ''}`;
}

/** Reloads the records for the selected time period. */
async function loadRecords() {
  let url = '/admin/inventory-sales.php?period=' + encodeURIComponent(recPeriod);
  if (recPeriod === 'custom') {
    if (!recFrom && !recTo) return;           // wait until a date is picked
    url += '&from=' + encodeURIComponent(recFrom) + '&to=' + encodeURIComponent(recTo);
  }
  const { data } = await apiGet(url);
  updateSaleSummary(data);
}

/* ---------------------------------------------------------------- damage */

async function openDamageModal() {
  const { data } = await apiGet('/admin/inventory-sales.php?damage_products=1');
  const list = data.products || [];
  damageProducts = {};
  list.forEach(p => { damageProducts[p.id] = p; });
  document.getElementById('damageForm').reset();
  dpickSetItems(list);
  dpickReset();
  updateDamageLoss();
  openModal('damageModal');
  setTimeout(() => document.getElementById('damageSearch').focus(), 50);
}

/* ---------------- Damage product picker: category chips + search + grouped list ---------------- */
let DPICK = { items: [], cat: 'all', q: '' };
const dpickCat = (i) => i.category_name || 'Uncategorised';

function dpickSetItems(items) {
  DPICK.items = items || [];
  if (DPICK.cat !== 'all' && !DPICK.items.some(i => dpickCat(i) === DPICK.cat)) DPICK.cat = 'all';
  dpickRender();
}
function dpickItem() {
  const el = document.getElementById('damageTypeSelect');
  return el ? (DPICK.items.find(i => String(i.id) === String(el.value)) || null) : null;
}
function dpickReset() {
  DPICK.cat = 'all'; DPICK.q = '';
  const s = document.getElementById('damageSearch'); if (s) s.value = '';
  document.getElementById('damageTypeSelect').value = '';
  dpickRender();
}
function dpickSelect(id) {
  const it = DPICK.items.find(i => String(i.id) === String(id));
  document.getElementById('damageTypeSelect').value = it ? String(it.id) : '';
  dpickRender();
  updateDamageLoss();
}
function dpickShown() {
  const words = DPICK.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const bySearch = DPICK.items.filter(i => words.every(w => (i.product_name + ' ' + i.name + ' ' + dpickCat(i)).toLowerCase().includes(w)));
  return { bySearch, shown: bySearch.filter(i => DPICK.cat === 'all' || dpickCat(i) === DPICK.cat) };
}
function dpickRender() {
  const catsEl = document.getElementById('damageCats'), listEl = document.getElementById('damageList'), chosenEl = document.getElementById('damageChosen');
  if (!catsEl || !listEl) return;
  const { bySearch, shown } = dpickShown();
  const cats = [...new Set(DPICK.items.map(dpickCat))].sort((a, b) => a.localeCompare(b));
  catsEl.innerHTML = [['all', 'All', bySearch.length]].concat(cats.map(c => [c, c, bySearch.filter(i => dpickCat(i) === c).length]))
    .map(([key, label, n]) => `<button type="button" class="dpick-chip ${DPICK.cat === key ? 'active' : ''}" data-cat="${escapeHtml(key)}">${escapeHtml(label)} <span>${n}</span></button>`).join('');

  const selId = (document.getElementById('damageTypeSelect') || {}).value;
  if (!DPICK.items.length) {
    listEl.innerHTML = '<div class="dpick-empty"><i class="bi bi-box-seam"></i><br>No products in stock.</div>';
  } else if (!shown.length) {
    listEl.innerHTML = '<div class="dpick-empty"><i class="bi bi-search"></i><br>No product matches your search.</div>';
  } else {
    let html = '', last = null;
    shown.slice().sort((a, b) => dpickCat(a).localeCompare(dpickCat(b)) || (a.product_name + a.name).localeCompare(b.product_name + b.name)).forEach(i => {
      if (DPICK.cat === 'all' && dpickCat(i) !== last) { last = dpickCat(i); html += `<div class="dpick-group">${escapeHtml(last)}</div>`; }
      html += `<button type="button" class="dpick-item ${String(i.id) === String(selId) ? 'sel' : ''}" data-id="${i.id}">
        <span class="dpick-name"><b>${escapeHtml(i.product_name)}</b> <em>${escapeHtml(i.name)}</em></span>
        <span class="dpick-qty">${i.quantity} ${escapeHtml(i.unit || '')} in stock</span><i class="bi bi-check-circle-fill"></i></button>`;
    });
    listEl.innerHTML = html;
  }
  const it = dpickItem();
  if (chosenEl) chosenEl.innerHTML = it
    ? `<i class="bi bi-check-circle-fill" style="color:var(--blue-700);"></i> Selected: <b>${escapeHtml(it.product_name)}</b> — ${escapeHtml(it.name)} <span class="small">(${escapeHtml(dpickCat(it))} · ${it.quantity} in stock)</span>`
    : (DPICK.items.length ? `<span class="small">${shown.length} of ${DPICK.items.length} product${DPICK.items.length === 1 ? '' : 's'} shown — tap one to select it.</span>` : '');
}
function dpickWire() {
  document.getElementById('damageSearch').addEventListener('input', (e) => { DPICK.q = e.target.value; dpickRender(); });
  document.getElementById('damageSearch').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();                                   // Enter picks the first match instead of submitting the form
    const first = dpickShown().shown[0];
    if (first) { dpickSelect(first.id); document.getElementById('damageQty').focus(); }
  });
  document.getElementById('damageCats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (b) { DPICK.cat = b.dataset.cat; dpickRender(); }
  });
  document.getElementById('damageList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (b) dpickSelect(b.dataset.id);
  });
}

function updateDamageLoss() {
  const it = dpickItem();
  const qtyEl = document.getElementById('damageQty');
  const out = document.getElementById('damageLoss');
  if (it) qtyEl.max = it.quantity; else qtyEl.removeAttribute('max');
  if (it && it.buying_price !== null && it.buying_price !== undefined) out.value = fmtMoney((Number(qtyEl.value) || 0) * Number(it.buying_price));
  else out.value = it ? 'Calculated automatically' : '0.00';
}

async function submitDamage(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const typeId = form.get('product_type_id');
  const qty = parseInt(form.get('quantity'), 10);
  if (!typeId) { showFlash('Please choose the damaged product.', 'error'); return; }
  if (!(qty >= 1)) { showFlash('Enter how many units are damaged.', 'error'); return; }
  if (String(form.get('notes') || '').trim().length < 3) { showFlash('Please add a remark explaining what happened.', 'error'); return; }

  const btn = e.target.querySelector('button.btn-primary');
  btn.disabled = true;
  const { data } = await apiPost('/admin/inventory-sales.php', form);
  btn.disabled = false;
  showFlash(data.message, data.success ? 'success' : 'error');
  if (!data.success) return;

  closeModal('damageModal');
  // Keep the sale being built honest: that product has fewer units in stock now.
  saleCart.forEach(l => {
    if (String(l.id) === String(typeId)) { l.stock = Math.max(0, l.stock - qty); if (l.qty > l.stock) l.qty = l.stock; }
  });
  saleCart = saleCart.filter(l => l.stock > 0);
  renderCart();
  recTab = 'damages';
  await loadRecords();
  loadProductsKeepQuery();
}

/* -------------------------------------------------------------- products */

async function loadProducts(q) {
  const { data } = await apiGet('/admin/inventory-sales.php?q=' + encodeURIComponent(q));
  const results = data.results || [];
  results.forEach(p => { saleProducts[p.id] = p; });

  document.getElementById('saleListHint').textContent = q
    ? `${results.length} result${results.length === 1 ? '' : 's'} for “${q}”`
    : 'Showing products in stock — type above to find any other product.';

  document.getElementById('saleProductList').innerHTML = results.length ? results.map(p => {
    const out = Number(p.quantity) <= 0;
    const inCart = saleCart.find(l => Number(l.id) === Number(p.id));
    return `
      <div class="sale-product ${out ? 'is-out' : ''}" data-id="${p.id}">
        <div class="sale-product-main">
          <b>${escapeHtml(p.product_name)} — ${escapeHtml(p.name)}</b>
          <span class="rs-meta">
            <span class="small">${escapeHtml(p.category_name || '')}</span>
            <span class="stock-pill ${out ? 'out' : Number(p.quantity) <= 5 ? 'low' : ''}">${out ? 'Out of stock' : p.quantity + ' in stock'}</span>
          </span>
          <span class="rs-meta"><span class="price-chip">${fmtMoney(p.selling_price)} / ${escapeHtml(p.unit)}</span><span class="price-min">Min. ${fmtMoney(p.min_price)}</span></span>
        </div>
        <button type="button" class="btn ${inCart ? 'btn-light' : 'btn-primary'} btn-sm js-add" ${out ? 'disabled' : ''}>
          <i class="bi ${inCart ? 'bi-plus' : 'bi-cart-plus'}"></i> ${inCart ? 'Add more' : 'Add'}
        </button>
      </div>`;
  }).join('') : `<div class="empty-state small"><i class="bi bi-search"></i>${q ? 'No matching products.' : 'No products in stock yet.'}</div>`;
}

/* ------------------------------------------------------------------ cart */

function addToCart(productId) {
  const p = saleProducts[productId];
  if (!p) return;
  const stock = Number(p.quantity);
  const existing = saleCart.find(l => Number(l.id) === Number(p.id));
  if (existing) {
    if (existing.qty < existing.stock) existing.qty += 1;
    else showFlash(`Only ${existing.stock} of ${existing.label} in stock.`, 'error');
  } else {
    saleCart.push({
      id: Number(p.id), label: `${p.product_name} — ${p.name}`, unit: p.unit, stock,
      std: Number(p.selling_price), min: Number(p.min_price), minSet: !!p.min_is_set,
      price: Number(p.selling_price), qty: 1,
    });
  }
  renderCart();
  loadProductsKeepQuery();
}

function loadProductsKeepQuery() {
  const input = document.getElementById('saleSearchInput');
  loadProducts(input ? input.value.trim() : '');
}

function lineIssue(l) {
  if (!Number.isInteger(l.qty) || l.qty < 1) return 'Quantity must be at least 1.';
  if (l.qty > l.stock) return `Only ${l.stock} in stock.`;
  if (!(l.price > 0)) return 'Enter a price.';
  if (l.price + 0.0001 < l.min) return `Below the minimum of ${fmtMoney(l.min)}.`;
  return '';
}

function renderCart() {
  const body = document.getElementById('cartBody');
  if (!saleCart.length) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-cart"></i>No products added yet.<br><span class="small">Pick products on the left — you can add as many as the customer is buying.</span></div>`;
    updateCartTotals();
    return;
  }

  body.innerHTML = `<div class="table-wrap"><table class="tbl sale-cart">
    <thead><tr><th>Product</th><th>Min. allowed</th><th>Selling price</th><th>Qty</th><th>Total</th><th></th></tr></thead>
    <tbody>${saleCart.map((l, i) => `
      <tr data-i="${i}">
        <td><b>${escapeHtml(l.label)}</b><div class="small">${l.stock} ${escapeHtml(l.unit)} in stock</div></td>
        <td><b>${fmtMoney(l.min)}</b><div class="small">${l.minSet ? 'set for this product' : 'cost price'}</div></td>
        <td>
          <input type="number" class="cart-price" step="0.01" min="${l.min}" value="${l.price}" style="width:120px;">
          <div class="small cart-reset" style="${l.price === l.std ? 'display:none;' : ''}"><a href="#" class="js-reset-price">Use standard ${fmtMoney(l.std)}</a></div>
        </td>
        <td><input type="number" class="cart-qty" min="1" max="${l.stock}" step="1" value="${l.qty}" style="width:74px;"></td>
        <td><b class="cart-line-total">${fmtMoney(l.price * l.qty)}</b><div class="small cart-issue" style="color:var(--danger);"></div></td>
        <td><button type="button" class="btn btn-light btn-sm js-remove" title="Remove"><i class="bi bi-x-lg"></i></button></td>
      </tr>`).join('')}</tbody>
  </table></div>`;
  updateCartTotals();
}

function updateCartTotals() {
  let total = 0, units = 0, anyIssue = false;
  const rows = document.querySelectorAll('#cartBody tr[data-i]');
  saleCart.forEach((l, i) => {
    const issue = lineIssue(l);
    if (issue) anyIssue = true;
    total += l.price * l.qty;
    units += l.qty;
    const row = rows[i];
    if (row) {
      row.querySelector('.cart-line-total').textContent = fmtMoney(l.price * l.qty);
      row.querySelector('.cart-issue').textContent = issue;
      row.querySelector('.cart-price').style.borderColor = issue && issue.startsWith('Below') ? 'var(--danger)' : '';
      row.querySelector('.cart-reset').style.display = l.price === l.std ? 'none' : '';
    }
  });

  document.getElementById('cartCount').textContent = saleCart.length ? `${saleCart.length} product${saleCart.length === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'}` : '';

  const footer = document.getElementById('cartFooter');
  if (!saleCart.length) { footer.innerHTML = ''; return; }
  if (!document.getElementById('saleNotes')) {
    footer.innerHTML = `
      <div class="pay-box">
        <div class="pay-title">How is the customer paying?</div>
        <div class="pay-methods" id="payMethods">${PAY_TILES.map(t => `<button type="button" class="pay-tile ${t[0] === 'credit' ? 'credit' : ''} ${payMethod === t[0] ? 'active' : ''}" data-method="${t[0]}"><i class="bi ${t[2]}"></i>${t[1]}</button>`).join('')}</div>
        <div class="pay-extra" id="payExtra"></div>
        <div class="credit-box" id="creditBox" style="display:none;">
          <h4><i class="bi bi-journal-text"></i> Credit sale — customer details</h4>
          <div class="credit-grid">
            <div class="form-group"><label>Customer name *</label><input type="text" id="crName" maxlength="120" placeholder="Full name"></div>
            <div class="form-group"><label>Phone number *</label><input type="text" id="crPhone" maxlength="40" placeholder="e.g. 0712 345 678"></div>
            <div class="form-group full"><label>Address / location <span class="small">(optional)</span></label><input type="text" id="crAddress" maxlength="200" placeholder="e.g. Mbeya, Mwanjelwa"></div>
            <div class="form-group"><label>Pay-by date <span class="small">(optional)</span></label><input type="date" id="crDue"></div>
            <div class="form-group"><label>Paid now <span class="small">(optional)</span></label><input type="number" id="crDeposit" min="0" step="0.01" placeholder="0.00"></div>
            <div class="form-group full" id="crDepositHow" style="display:none;"><label>Deposit paid by</label>
              <select id="crDepositMethod"><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Bank</option><option value="card">Card</option></select>
              <div id="crDepositChannelBox" style="margin-top:8px;"></div></div>
          </div>
        </div>
      </div>
      <div class="form-group" style="margin-top:14px;"><label>Notes (optional)</label><input type="text" id="saleNotes" placeholder="e.g. walk-in customer"></div>
      <div class="sale-summary" id="saleSummary"></div>
      <button type="button" class="btn btn-primary btn-block" id="completeSaleBtn"><i class="bi bi-check2-circle"></i> Complete Sale</button>
      <button type="button" class="btn btn-light btn-block" id="clearSaleBtn" style="margin-top:8px;"><i class="bi bi-trash"></i> Clear</button>`;
    document.getElementById('completeSaleBtn').addEventListener('click', completeSale);
    document.getElementById('clearSaleBtn').addEventListener('click', () => { saleCart = []; renderCart(); loadProductsKeepQuery(); });
    document.getElementById('payMethods').addEventListener('click', (e) => {
      const t = e.target.closest('[data-method]'); if (!t) return;
      payMethod = t.dataset.method;
      document.querySelectorAll('#payMethods .pay-tile').forEach(x => x.classList.toggle('active', x.dataset.method === payMethod));
      renderPayExtra();
      updateCartTotals();
    });
    document.getElementById('crDeposit').addEventListener('input', () => { renderDepositHow(); updateCartTotals(); });
    document.getElementById('crDepositMethod').addEventListener('change', renderDepositHow);
    renderPayExtra();
  }

  const deposit = payMethod === 'credit' ? Math.max(0, Number((document.getElementById('crDeposit') || {}).value) || 0) : 0;
  const summary = document.getElementById('saleSummary');
  if (summary) {
    summary.innerHTML = payMethod === 'credit'
      ? `<div class="row"><span>Sale total</span><b>${fmtMoney(total)}</b></div>
         <div class="row"><span>Paid now</span><b>${fmtMoney(Math.min(deposit, total))}</b></div>
         <div class="row grand owe"><span>Customer will owe</span><b>${fmtMoney(Math.max(0, total - deposit))}</b></div>`
      : `<div class="row grand"><span>Sale total</span><b id="saleGrandTotal">${fmtMoney(total)}</b></div>`;
  }
  const btn = document.getElementById('completeSaleBtn');
  btn.innerHTML = payMethod === 'credit' ? '<i class="bi bi-journal-check"></i> Complete Credit Sale' : '<i class="bi bi-check2-circle"></i> Complete Sale';
  btn.disabled = anyIssue;
  btn.title = anyIssue ? 'Fix the highlighted lines first' : '';
}

/** Provider dropdown under the method tiles: Mobile Money -> M-Pesa…, Bank -> CRDB, NMB… */
function providerSelect(id, method) {
  const list = method === 'mobile_money' ? payOptions.mobile_money_providers : payOptions.banks;
  const label = method === 'mobile_money' ? 'Mobile Money provider' : 'Bank';
  return `<div class="form-group" style="margin-bottom:0;"><label>${label} *</label>
    <select id="${id}"><option value="">Select ${method === 'mobile_money' ? 'provider' : 'bank'}…</option>${list.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}</select></div>`;
}
function renderPayExtra() {
  const box = document.getElementById('payExtra');
  if (!box) return;
  box.innerHTML = (payMethod === 'mobile_money' || payMethod === 'bank_transfer') ? providerSelect('payChannel', payMethod) : '';
  const credit = document.getElementById('creditBox');
  if (credit) credit.style.display = payMethod === 'credit' ? '' : 'none';
  renderDepositHow();
}
function renderDepositHow() {
  const how = document.getElementById('crDepositHow');
  if (!how) return;
  const has = payMethod === 'credit' && (Number(document.getElementById('crDeposit').value) || 0) > 0;
  how.style.display = has ? '' : 'none';
  const m = document.getElementById('crDepositMethod').value;
  const box = document.getElementById('crDepositChannelBox');
  const keep = (document.getElementById('crDepositChannel') || {}).value || '';
  box.innerHTML = has && (m === 'mobile_money' || m === 'bank_transfer') ? providerSelect('crDepositChannel', m) : '';
  if (keep && document.getElementById('crDepositChannel')) document.getElementById('crDepositChannel').value = keep;
}

async function completeSale() {
  if (!saleCart.length) return;
  if (saleCart.some(l => lineIssue(l))) { showFlash('Fix the highlighted lines before completing the sale.', 'error'); return; }

  const total = saleCart.reduce((a, l) => a + l.price * l.qty, 0);
  const payload = {
    action: 'record_sale',
    items: JSON.stringify(saleCart.map(l => ({ product_type_id: l.id, quantity: l.qty, unit_price: l.price }))),
    notes: (document.getElementById('saleNotes') || {}).value || '',
    payment_method: payMethod,
  };

  if (payMethod === 'mobile_money' || payMethod === 'bank_transfer') {
    const ch = (document.getElementById('payChannel') || {}).value || '';
    if (!ch) { showFlash(payMethod === 'mobile_money' ? 'Choose the Mobile Money provider.' : 'Choose the bank.', 'error'); return; }
    payload.payment_channel = ch;
  }

  if (payMethod === 'credit') {
    const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
    if (!v('crName')) { showFlash("Enter the customer's name.", 'error'); return; }
    if (v('crPhone').length < 6) { showFlash("Enter the customer's phone number.", 'error'); return; }
    const deposit = Number(v('crDeposit')) || 0;
    if (deposit < 0) { showFlash('The amount paid now cannot be negative.', 'error'); return; }
    if (deposit >= total) { showFlash('The customer is paying everything now — choose a normal payment method instead of Credit.', 'error'); return; }
    if (v('crDue') && v('crDue') < new Date().toISOString().slice(0, 10)) { showFlash('The pay-by date cannot be in the past.', 'error'); return; }
    Object.assign(payload, { customer_name: v('crName'), customer_phone: v('crPhone'), customer_address: v('crAddress'), due_date: v('crDue'), deposit_amount: deposit || '' });
    if (deposit > 0) {
      const dm = v('crDepositMethod');
      payload.deposit_method = dm;
      if (dm === 'mobile_money' || dm === 'bank_transfer') {
        const dc = v('crDepositChannel');
        if (!dc) { showFlash(dm === 'mobile_money' ? 'Choose the Mobile Money provider for the deposit.' : 'Choose the bank for the deposit.', 'error'); return; }
        payload.deposit_channel = dc;
      }
    }
  }

  const btn = document.getElementById('completeSaleBtn');
  btn.disabled = true;
  const { data } = await apiPost('/admin/inventory-sales.php', payload);

  if (!data.success) {
    showFlash(data.message || 'Could not record that sale.', 'error');
    btn.disabled = false;
    return;
  }

  const isCredit = data.receipt.payment_method === 'credit';
  showFlash(isCredit
    ? `Credit sale ${data.receipt.receipt_code} recorded — ${data.receipt.credit.customer_name} owes ${fmtMoney(data.receipt.credit.balance)}.`
    : `Sale ${data.receipt.receipt_code} recorded — ${fmtMoney(data.receipt.total_amount)}.`, 'success');
  const receipt = Object.assign({}, data.receipt, { date: new Date(), served_by: saleUser ? saleUser.full_name : '' });
  showReceipt(receipt);
  openReceipt(receipt);
  saleCart = [];
  payMethod = 'cash';
  renderCart();
  await loadRecords();
  loadProductsKeepQuery();
}

/* --------------------------------------------------------------- receipt */

let lastReceipt = null;
let saleUser = null;
let receiptGroups = {};   // receipt code -> receipt (for re-printing from Recent Sales)
const PAY_LABELS = { cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank', card: 'Card', credit: 'Credit' };

const RECEIPT_CSS = `
  .rcpt{font-family:'Courier New',Courier,monospace;background:#fff;width:320px;max-width:100%;margin:0 auto;padding:26px 22px 22px;color:#1a2233;font-size:12.5px;line-height:1.5;border-radius:10px;}
  .rcpt-logo{display:block;margin:0 auto 6px;height:64px;max-width:100%;object-fit:contain;}
  .rcpt-name{text-align:center;font-weight:bold;font-size:15px;letter-spacing:.06em;margin:2px 0 0;}
  .rcpt-tag{text-align:center;color:#0b56b8;font-weight:bold;letter-spacing:.09em;font-size:12px;margin:4px 0 8px;}
  .rcpt-addr{text-align:center;font-size:11px;color:#333;margin:0;}
  .rcpt hr{border:0;border-top:1px dashed #8fa0bd;margin:12px 0;}
  .rcpt-row{display:flex;justify-content:space-between;gap:10px;}
  .rcpt-row span:first-child{color:#444;}
  .rcpt-item b{display:block;margin-top:4px;}
  .rcpt-total{font-weight:bold;font-size:13.5px;border-top:1px solid #1a2233;padding-top:8px;margin-top:6px;}
  .rcpt-foot{text-align:center;font-size:11px;color:#333;margin:0;}
`;

function receiptDateTime(r) {
  const pad = (n) => String(n).padStart(2, '0');
  let d = r.date instanceof Date ? r.date : null;
  if (!d && r.at) d = new Date(String(r.at).replace(' ', 'T'));
  if (!d || isNaN(d)) d = new Date();
  return { date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** The receipt itself — logo, company details, numbered items ("3 pcs x TZS 200 … TZS 600"), total, payment, PAID. */
function receiptCard(r) {
  const logo = `${window.location.origin}${APP_ROOT}/frontend/img/logo.png`;
  const dt = receiptDateTime(r);
  const money = (n) => 'TZS ' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const pay = PAY_LABELS[r.payment_method] ? PAY_LABELS[r.payment_method] + (r.payment_channel ? ' — ' + r.payment_channel : '') : '';
  const cr = r.payment_method === 'credit' && r.credit ? r.credit : null;
  return `<div class="rcpt">
    <img class="rcpt-logo" src="${logo}" alt="MABUMBA TECH">
    <div class="rcpt-name">MABUMBA TECH</div>
    <div class="rcpt-tag">Technology. Innovation. Solution.</div>
    <p class="rcpt-addr">Mbeya, Tanzania</p>
    <p class="rcpt-addr">+255 620 839 640 / +255 760 620 418</p>
    <hr>
    <div class="rcpt-row"><span>Receipt No.</span><span>${escapeHtml(r.receipt_code)}</span></div>
    <div class="rcpt-row"><span>Date</span><span>${dt.date}</span></div>
    <div class="rcpt-row"><span>Time</span><span>${dt.time}</span></div>
    <div class="rcpt-row"><span>Served by</span><span>${escapeHtml(r.served_by || '—')}</span></div>
    <hr>
    ${r.items.map((i, n) => `<div class="rcpt-item"><b>${n + 1}. ${escapeHtml(i.product_name)} — ${escapeHtml(i.type_name)}</b>
      <div class="rcpt-row"><span>${i.quantity} ${escapeHtml(i.unit || 'pcs')} x ${money(i.unit_price)}</span><span>${money(i.total_amount)}</span></div></div>`).join('')}
    <div class="rcpt-row rcpt-total"><span>TOTAL</span><span>${money(r.total_amount)}</span></div>
    ${pay ? `<div class="rcpt-row" style="margin-top:8px;"><span>Payment</span><span>${escapeHtml(pay)}</span></div>` : ''}
    ${cr ? `<div class="rcpt-row"><span>Customer</span><span>${escapeHtml(cr.customer_name)}</span></div>
    <div class="rcpt-row"><span>Paid</span><span>${money(cr.paid)}</span></div>
    <div class="rcpt-row rcpt-total"><span>BALANCE DUE</span><span>${money(cr.balance)}</span></div>
    ${cr.due_date ? `<div class="rcpt-row"><span>Pay by</span><span>${escapeHtml(cr.due_date)}</span></div>` : ''}
    <div class="rcpt-row"><span>Status</span><span>${Number(cr.balance) <= 0 ? 'PAID' : 'ON CREDIT'}</span></div>`
    : `<div class="rcpt-row"><span>Status</span><span>PAID</span></div>`}
    <hr>
    <p class="rcpt-foot">Thank you for choosing MABUMBATECH!</p>
    <p class="rcpt-foot">No Returns or Exchanges Without the Original Receipt.</p>
  </div>`;
}

function openReceipt(r) {
  lastReceipt = r;
  document.getElementById('receiptModalBody').innerHTML = receiptCard(r);
  openModal('receiptModal');
}

function showReceipt(r) {
  document.getElementById('receiptBox').innerHTML = `
    <div class="alert alert-ok" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
        <span><b><i class="bi bi-check-circle"></i> ${r.payment_method === 'credit' ? 'Credit sale' : 'Sale'} ${escapeHtml(r.receipt_code)} recorded</b> — ${r.items.length} product${r.items.length === 1 ? '' : 's'}, total <b>${fmtMoney(r.total_amount)}</b>${r.credit ? `, balance due <b>${fmtMoney(r.credit.balance)}</b>` : ''}</span>
        <span style="display:flex;gap:6px;">
          <button type="button" class="btn btn-light btn-sm" id="viewReceiptBtn"><i class="bi bi-receipt"></i> View receipt</button>
          <button type="button" class="btn btn-light btn-sm" id="closeReceiptBtn"><i class="bi bi-x-lg"></i></button>
        </span>
      </div>
    </div>`;
  document.getElementById('viewReceiptBtn').addEventListener('click', () => openReceipt(r));
  document.getElementById('closeReceiptBtn').addEventListener('click', () => { document.getElementById('receiptBox').innerHTML = ''; });
}

function printReceipt() {
  const r = lastReceipt;
  if (!r) return;
  const w = window.open('', '_blank', 'width=420,height=680');
  if (!w) { showFlash('Allow pop-ups to print the receipt.', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${escapeHtml(r.receipt_code)}</title>
    <style>@page{margin:6mm}body{margin:0;background:#fff}${RECEIPT_CSS}.rcpt{width:auto;max-width:300px;padding:6px}</style></head>
    <body>${receiptCard(r)}
    <script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script></body></html>`);
  w.document.close();
}

/* --------------------------------------------------------------- wiring */

function wireSalePage() {
  if (!document.getElementById('receiptModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-bg" id="receiptModal">
        <div class="modal-box" style="max-width:400px;background:#eef2f8;">
          <span class="modal-close" onclick="closeModal('receiptModal')"><i class="bi bi-x-lg"></i></span>
          <style>${RECEIPT_CSS}</style>
          <div id="receiptModalBody" style="margin-top:14px;"></div>
          <button type="button" class="btn btn-primary btn-block" id="receiptPrintBtn" style="margin-top:12px;"><i class="bi bi-printer"></i> Print receipt</button>
        </div>
      </div>`);
    document.getElementById('receiptPrintBtn').addEventListener('click', printReceipt);
  }
  document.getElementById('recTable').addEventListener('click', (e) => {
    const btn = e.target.closest('.js-open-receipt');
    if (btn && receiptGroups[btn.dataset.receipt]) openReceipt(receiptGroups[btn.dataset.receipt]);
  });

  // Time filter + Sales / Damaged Items tabs.
  const periodSel = document.getElementById('recPeriod');
  const customBox = document.getElementById('recCustom');
  periodSel.addEventListener('change', () => {
    recPeriod = periodSel.value;
    customBox.style.display = recPeriod === 'custom' ? 'inline-flex' : 'none';
    if (recPeriod === 'custom' && !recFrom && !recTo) {
      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      recFrom = recTo = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      document.getElementById('recFrom').value = recFrom;
      document.getElementById('recTo').value = recTo;
    }
    loadRecords();
  });
  ['recFrom', 'recTo'].forEach(id => document.getElementById(id).addEventListener('change', (e) => {
    if (id === 'recFrom') recFrom = e.target.value; else recTo = e.target.value;
    loadRecords();
  }));
  document.getElementById('pageBody').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-rec-tab]');
    if (tab) { e.preventDefault(); recTab = tab.dataset.recTab; renderRecords(); return; }
    if (e.target.closest('#openDamageBtn') || e.target.closest('.js-open-damage')) openDamageModal();
  });

  // Record Damage form (stock goes down, buying cost is posted as a loss).
  if (!document.getElementById('damageModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-bg" id="damageModal">
        <div class="modal-box" style="max-width:520px;">
          <span class="modal-close" onclick="closeModal('damageModal')"><i class="bi bi-x-lg"></i></span>
          <h3><i class="bi bi-exclamation-triangle"></i> Record Damaged Item</h3>
          <form id="damageForm">
            <input type="hidden" name="action" value="record_damage">
            <div class="form-group"><label>Product</label>
              <input type="hidden" name="product_type_id" id="damageTypeSelect" value="">
              <div class="dpick">
                <div class="dpick-search"><i class="bi bi-search"></i><input type="search" id="damageSearch" placeholder="Search product, type or category…" autocomplete="off"></div>
                <div class="dpick-cats" id="damageCats"></div>
                <div class="dpick-list" id="damageList"></div>
              </div>
              <div class="dpick-chosen" id="damageChosen"></div></div>
            <div class="form-row">
              <div class="form-group"><label>Quantity Damaged</label><input type="number" name="quantity" id="damageQty" min="1" step="1" value="1" required></div>
              <div class="form-group"><label>Loss (cost price)</label><input type="text" id="damageLoss" value="0.00" readonly></div>
            </div>
            <div class="form-group"><label>Remark <span class="small">(required — what happened?)</span></label><textarea name="notes" rows="3" placeholder="e.g. Screen cracked during delivery / water damage in storage" required minlength="3"></textarea></div>
            <p class="small" style="margin:-4px 0 10px;">The damaged quantity is removed from stock and what it cost to buy is counted automatically as a loss.</p>
            <button class="btn btn-primary btn-block"><i class="bi bi-check2"></i> Record Damage</button>
          </form>
        </div>
      </div>`);
    dpickWire();
    document.getElementById('damageQty').addEventListener('input', updateDamageLoss);
    document.getElementById('damageForm').addEventListener('submit', submitDamage);
  }

  const input = document.getElementById('saleSearchInput');
  input.addEventListener('input', () => {
    clearTimeout(saleSearchTimer);
    saleSearchTimer = setTimeout(() => loadProducts(input.value.trim()), 220);
  });

  document.getElementById('saleProductList').addEventListener('click', (e) => {
    const btn = e.target.closest('.js-add');
    if (btn) { addToCart(Number(btn.closest('.sale-product').dataset.id)); return; }
    const card = e.target.closest('.sale-product');
    if (card && !card.classList.contains('is-out') && !e.target.closest('button')) addToCart(Number(card.dataset.id));
  });

  const cart = document.getElementById('cartBody');
  cart.addEventListener('input', (e) => {
    const row = e.target.closest('tr[data-i]');
    if (!row) return;
    const line = saleCart[Number(row.dataset.i)];
    if (!line) return;
    if (e.target.classList.contains('cart-price')) line.price = e.target.value === '' ? 0 : Number(e.target.value);
    if (e.target.classList.contains('cart-qty')) line.qty = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
    updateCartTotals();
  });
  cart.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-i]');
    if (!row) return;
    const idx = Number(row.dataset.i);
    if (e.target.closest('.js-remove')) { saleCart.splice(idx, 1); renderCart(); loadProductsKeepQuery(); }
    if (e.target.closest('.js-reset-price')) {
      e.preventDefault();
      saleCart[idx].price = saleCart[idx].std;
      row.querySelector('.cart-price').value = saleCart[idx].std;
      updateCartTotals();
    }
  });
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Record Sale', crumb: 'Admin / Operations / Record Sale', activeKey: 'record-sale', allowedRoles: ['admin'], anyPermission: ['inventory.sell', 'inventory.manage'] });
  if (!user) return;
  saleUser = user;
  const { data } = await apiGet('/admin/inventory-sales.php');
  renderSalePage(data);
})();
