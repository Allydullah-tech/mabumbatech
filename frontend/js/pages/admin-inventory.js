let INV_DATA = null;
let CAN_MANAGE_INV = false;
let currentInvTab = 'products';
let purchaseLineCount = 0;
let invSearchQuery = '';
let invCategoryFilter = '';

function fmt(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function loadInventory() {
  const { data } = await apiGet('/admin/inventory.php');
  INV_DATA = data;
  CAN_MANAGE_INV = !!data.can_manage;
  renderInventoryPage();
}

function invSearchPlaceholder() {
  const map = {
    products: 'Search products or categories…',
    purchases: 'Search purchase code, supplier or staff…',
    movements: 'Search type, movement or notes…',
    damaged: 'Search damaged product or notes…',
    suppliers: 'Search supplier, contact, phone or email…',
    categories: 'Search categories…',
  };
  return map[currentInvTab] || 'Search…';
}

function renderInventoryPage() {
  const d = INV_DATA;
  const s = d.stats;

  document.getElementById('pageBody').innerHTML = `
    <div class="grid" style="margin-bottom:6px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));">
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-box-seam"></i></div><div><b>${s.total_products}</b><span>Products</span></div></div>
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-stack"></i></div><div><b>${s.total_stock}</b><span>Total Stock</span></div></div>
      <div class="card stat-card"><div class="ic green"><i class="bi bi-cash-stack"></i></div><div><b>${fmt(s.stock_value)}</b><span>Stock Value</span></div></div>
      <div class="card stat-card"><div class="ic ${s.out_of_stock_count > 0 ? 'red' : 'orange'}"><i class="bi bi-exclamation-triangle"></i></div><div><b>${s.low_stock_count}</b><span>Low Stock (${s.out_of_stock_count} out)</span></div></div>
      <div class="card stat-card" style="cursor:pointer;" onclick="currentInvTab='damaged';invSearchQuery='';renderInventoryPage();" title="View damaged products"><div class="ic red"><i class="bi bi-heartbreak"></i></div><div><b>${s.damaged_units}</b><span>Damaged Products · loss ${fmt(s.damage_loss)}</span></div></div>
    </div>
    <p class="small" style="margin:0 0 16px;">Stock Value is the total buying cost (cost price × quantity) of everything currently in stock. Low Stock counts variants at or below their reorder level. Damaged products are removed from stock and their cost is counted as a loss (an expense) in Finance and Reports.</p>

    ${d.low_stock.length ? `
    <div class="panel" style="margin-bottom:18px;">
      <div class="panel-head"><h3><i class="bi bi-alarm"></i> Low Stock Alerts</h3></div>
      <div class="notif-row-list">${d.low_stock.map(t => `
        <div class="notif-item" style="cursor:default;"><i class="bi bi-exclamation-triangle"></i>
          <span class="notif-item-body"><b>${escapeHtml(t.product_name)} — ${escapeHtml(t.name)}</b><span>Stock: ${t.quantity} (min: ${t.minimum_stock_level})</span></span>
        </div>`).join('')}</div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head">
        <h3><i class="bi bi-box-seam"></i> Inventory</h3>
        ${CAN_MANAGE_INV ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-light btn-sm" onclick="downloadInventoryTemplate()" title="Download the Excel/CSV template for recording purchases"><i class="bi bi-download"></i> Template</button>
          <button class="btn btn-light btn-sm" onclick="openImportModal()"><i class="bi bi-file-earmark-excel"></i> Import Excel</button>
          <button class="btn btn-light btn-sm" onclick="openModal('supplierModal')"><i class="bi bi-truck"></i> Supplier</button>
          <button class="btn btn-light btn-sm" onclick="openProductModal()"><i class="bi bi-plus-circle"></i> Product</button>
          <button class="btn btn-primary btn-sm" onclick="openPurchaseModal()"><i class="bi bi-cart-plus"></i> Record Purchase</button>
        </div>` : ''}
      </div>
      <div class="tabs-row">
        <a href="#" data-tab="products" class="${currentInvTab === 'products' ? 'active' : ''}">Products</a>
        <a href="#" data-tab="purchases" class="${currentInvTab === 'purchases' ? 'active' : ''}">Purchases</a>
        <a href="#" data-tab="movements" class="${currentInvTab === 'movements' ? 'active' : ''}">Stock Movements</a>
        <a href="#" data-tab="damaged" class="${currentInvTab === 'damaged' ? 'active' : ''}">Damaged</a>
        <a href="#" data-tab="suppliers" class="${currentInvTab === 'suppliers' ? 'active' : ''}">Suppliers</a>
        <a href="#" data-tab="categories" class="${currentInvTab === 'categories' ? 'active' : ''}">Categories</a>
      </div>
      <div class="panel-body" style="padding-top:14px;">
        <div class="filter-bar" style="margin-bottom:10px;">
          <div class="search-box" style="flex:1;min-width:220px;">
            <i class="bi bi-search"></i>
            <input type="text" id="invSearchInput" placeholder="${invSearchPlaceholder()}" value="${escapeHtml(invSearchQuery)}">
          </div>
          ${currentInvTab === 'products' ? `
          <select id="invCategoryFilter">
            <option value="">All Categories</option>
            ${d.categories.map(c => `<option value="${c.id}" ${String(invCategoryFilter) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>` : ''}
          <span class="small" id="invResultCount" style="white-space:nowrap;"></span>
        </div>
      </div>
      <div id="invTabBody"></div>
    </div>`;

  document.querySelectorAll('#pageBody .tabs-row a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    currentInvTab = a.dataset.tab;
    invSearchQuery = '';
    invCategoryFilter = '';
    renderInventoryPage();
  }));

  document.getElementById('invSearchInput').addEventListener('input', (e) => {
    invSearchQuery = e.target.value;
    renderInvTabBody();
  });
  const catFilterEl = document.getElementById('invCategoryFilter');
  if (catFilterEl) {
    catFilterEl.addEventListener('change', (e) => {
      invCategoryFilter = e.target.value;
      renderInvTabBody();
    });
  }

  renderInvTabBody();
  fillInvDropdowns();
}

/** Case-insensitive "does any of these fields contain the query" check. */
function invMatches(query, fields) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => String(f || '').toLowerCase().includes(q));
}

function renderInvTabBody() {
  const d = INV_DATA;
  const body = document.getElementById('invTabBody');
  const countEl = document.getElementById('invResultCount');
  const hasFilter = !!invSearchQuery.trim() || (currentInvTab === 'products' && !!invCategoryFilter);

  if (currentInvTab === 'products') {
    const rows = d.products.filter(p =>
      (!invCategoryFilter || String(p.category_id) === String(invCategoryFilter)) &&
      invMatches(invSearchQuery, [p.name, p.category_name]));
    if (countEl) countEl.textContent = `${rows.length} of ${d.products.length} product${d.products.length === 1 ? '' : 's'}`;
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Product</th><th>Category</th><th>Types</th><th>Total Qty</th><th>Stock Value</th><th>Actions</th></tr></thead>
      <tbody>${rows.length ? rows.map(p => `
        <tr>
          <td><b>${escapeHtml(p.name)}</b></td>
          <td class="small">${escapeHtml(p.category_name || '—')}</td>
          <td>${p.type_count}</td>
          <td>${p.total_quantity}${p.low_stock_types > 0 ? ' <span class="badge badge-warn">low</span>' : ''}</td>
          <td>${fmt(p.stock_value)}</td>
          <td class="actions-cell"><button class="btn btn-light btn-sm" onclick="openProductDetail(${p.id})" title="View"><i class="bi bi-eye"></i></button>${CAN_MANAGE_INV ? ` <button class="btn btn-light btn-sm" onclick="openProductModal(${p.id})" title="Edit"><i class="bi bi-pencil-square"></i></button> <button class="btn btn-light btn-sm" onclick="deleteProduct(${p.id})" title="Delete" style="color:var(--danger);"><i class="bi bi-trash"></i></button>` : ''}</td>
        </tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-box-seam"></i>${d.products.length ? 'No products match your search.' : 'No products yet.'}</td></tr>`}</tbody>
    </table></div>`;
  }

  if (currentInvTab === 'purchases') {
    const rows = d.recent_purchases.filter(p => invMatches(invSearchQuery, [p.purchase_code, p.supplier_name, p.recorded_by_name]));
    if (countEl) countEl.textContent = `${rows.length} of ${d.recent_purchases.length} purchase${d.recent_purchases.length === 1 ? '' : 's'}`;
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Purchase</th><th>Supplier</th><th>Date</th><th>Amount</th><th>Recorded By</th></tr></thead>
      <tbody>${rows.length ? rows.map(p => `
        <tr><td><b>${escapeHtml(p.purchase_code)}</b></td><td>${escapeHtml(p.supplier_name || '—')}</td><td class="small">${escapeHtml(p.purchase_date)}</td><td>${fmt(p.total_amount)}</td><td class="small">${escapeHtml(p.recorded_by_name || '—')}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-state"><i class="bi bi-cart"></i>${d.recent_purchases.length ? 'No purchases match your search.' : 'No purchases yet.'}</td></tr>`}</tbody>
    </table></div>`;
  }

  if (currentInvTab === 'movements') {
    const rows = d.recent_movements.filter(m => invMatches(invSearchQuery, [m.type_name, m.movement_type, m.notes, m.recorded_by_name]));
    if (countEl) countEl.textContent = `${rows.length} of ${d.recent_movements.length} movement${d.recent_movements.length === 1 ? '' : 's'}`;
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Type</th><th>Movement</th><th>Qty</th><th>Notes</th><th>By</th></tr></thead>
      <tbody>${rows.length ? rows.map(m => `
        <tr><td class="small">${timeAgo(m.created_at)}</td><td>${escapeHtml(m.type_name)}</td>
          <td>${movementBadge(m.movement_type)}</td><td>${m.quantity}</td>
          <td class="small">${escapeHtml(m.notes || '—')}</td><td class="small">${escapeHtml(m.recorded_by_name || '—')}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-arrow-left-right"></i>${d.recent_movements.length ? 'No movements match your search.' : 'No stock movements yet.'}</td></tr>`}</tbody>
    </table></div>`;
  }

  if (currentInvTab === 'damaged') {
    const rows = (d.damages || []).filter(m => invMatches(invSearchQuery, [m.product_name, m.type_name, m.notes, m.recorded_by_name]));
    if (countEl) countEl.textContent = `${rows.length} of ${(d.damages || []).length} record${(d.damages || []).length === 1 ? '' : 's'}`;
    body.innerHTML = `${CAN_MANAGE_INV ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:0 18px 12px;">
      <span class="small">Every damaged item is removed from stock, counted as a loss, and kept here with its remark.</span>
      <button class="btn btn-primary btn-sm" onclick="openDamageModal()"><i class="bi bi-exclamation-triangle"></i> Record Damage</button>
    </div>` : ''}<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Product</th><th>Qty Damaged</th><th>Loss</th><th>Remark</th><th>By</th></tr></thead>
      <tbody>${rows.length ? rows.map(m => `
        <tr><td class="small">${timeAgo(m.created_at)}</td><td><b>${escapeHtml(m.product_name)}</b> — ${escapeHtml(m.type_name)}</td>
          <td>${m.quantity}</td><td style="color:var(--danger);font-weight:700;">${fmt(m.loss)}</td>
          <td class="small">${escapeHtml(m.notes || '—')}</td><td class="small">${escapeHtml(m.recorded_by_name || '—')}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-state"><i class="bi bi-emoji-smile"></i>${(d.damages || []).length ? 'No records match your search.' : 'No damaged products recorded.'}</td></tr>`}</tbody>
    </table></div>`;
  }

  if (currentInvTab === 'suppliers') {
    const rows = d.suppliers.filter(s => invMatches(invSearchQuery, [s.name, s.contact_person, s.phone, s.email]));
    if (countEl) countEl.textContent = `${rows.length} of ${d.suppliers.length} supplier${d.suppliers.length === 1 ? '' : 's'}`;
    body.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
      <tbody>${rows.length ? rows.map(s => `
        <tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.contact_person || '—')}</td><td class="small">${escapeHtml(s.phone || '—')}</td><td class="small">${escapeHtml(s.email || '—')}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-state"><i class="bi bi-truck"></i>${d.suppliers.length ? 'No suppliers match your search.' : 'No suppliers yet.'}</td></tr>`}</tbody>
    </table></div>`;
  }

  if (currentInvTab === 'categories') {
    const rows = d.categories.filter(c => invMatches(invSearchQuery, [c.name]));
    if (countEl) countEl.textContent = `${rows.length} of ${d.categories.length} categor${d.categories.length === 1 ? 'y' : 'ies'}`;
    body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:0 18px 12px;">
      <span class="small">Save the categories you sell. They appear automatically when you add a product, import purchases, or store stock.</span>
      ${CAN_MANAGE_INV ? `<button class="btn btn-primary btn-sm" onclick="openCategoryModal()"><i class="bi bi-plus-circle"></i> Add Category</button>` : ''}
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Category</th><th>Products</th>${CAN_MANAGE_INV ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.length ? rows.map(c => `<tr><td><b>${escapeHtml(c.name)}</b></td><td>${c.product_count ?? 0}</td>${CAN_MANAGE_INV ? `<td class="actions-cell">
          <button class="btn btn-light btn-sm" onclick="openCategoryModal(${c.id})" title="Rename"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-light btn-sm" onclick="deleteCategory(${c.id})" title="Delete"><i class="bi bi-trash"></i></button>
        </td>` : ''}</tr>`).join('') : `<tr><td colspan="${CAN_MANAGE_INV ? 3 : 2}" class="empty-state"><i class="bi bi-tags"></i>${d.categories.length ? 'No categories match your search.' : (CAN_MANAGE_INV ? 'No categories yet — click “Add Category” to save your first one.' : 'No categories yet.')}</td></tr>`}</tbody>
    </table></div>`;
  }

  if (countEl && !hasFilter) countEl.textContent = '';
}

function movementBadge(type) {
  const map = { purchase: 'badge-ok', sale: 'badge-info', damage: 'badge-off', adjustment_in: 'badge-ok', adjustment_out: 'badge-off' };
  return `<span class="badge ${map[type] || 'badge-info'}">${type.replace(/_/g, ' ')}</span>`;
}

function fillInvDropdowns() {
  const d = INV_DATA;
  const fill = (id, items, valueKey, labelKey, placeholder) => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + items.map(i => `<option value="${i[valueKey]}">${escapeHtml(i[labelKey])}</option>`).join('');
    if (current && items.some(i => String(i[valueKey]) === String(current))) el.value = current;
  };
  fill('productCategorySelect', d.categories, 'id', 'name', d.categories.length ? '— choose —' : '— add a category first —');
  fill('purchaseSupplierSelect', d.suppliers, 'id', 'name', '—');

  if (document.getElementById('damageList')) dpickSetItems(d.all_types.filter(t => Number(t.quantity) > 0));
}

function goToCategories() {
  currentInvTab = 'categories'; invSearchQuery = ''; invCategoryFilter = '';
  renderInventoryPage();
}

function openProductModal(productId) {
  if (!INV_DATA.categories.length) {
    showFlash('Add at least one category first — then you can create products.', 'error');
    goToCategories();
    return;
  }
  const form = document.getElementById('productForm');
  form.reset();
  const p = productId ? (INV_DATA.products || []).find(x => Number(x.id) === Number(productId)) : null;
  document.getElementById('productEditId').value = p ? p.id : '';
  document.getElementById('productModalTitle').textContent = p ? 'Edit Product' : 'New Product';
  document.getElementById('productSubmitLabel').textContent = p ? 'Save Changes' : 'Create Product';
  if (p) {
    form.elements['name'].value = p.name || '';
    form.elements['category_id'].value = p.category_id || '';
    form.elements['description'].value = p.description || '';
  }
  // Opened from the product window too, so make sure it sits on top.
  document.getElementById('productModal').style.zIndex = '1000';
  openModal('productModal');
}

function openCategoryModal(id) {
  const cat = id ? INV_DATA.categories.find(c => Number(c.id) === Number(id)) : null;
  document.getElementById('categoryId').value = cat ? cat.id : '';
  document.getElementById('categoryName').value = cat ? cat.name : '';
  document.getElementById('categoryModalTitle').innerHTML = cat ? '<i class="bi bi-pencil"></i> Rename Category' : '<i class="bi bi-tag"></i> New Category';
  openModal('categoryModal');
  setTimeout(() => document.getElementById('categoryName').focus(), 50);
}

async function deleteCategory(id) {
  const cat = INV_DATA.categories.find(c => Number(c.id) === Number(id));
  if (!cat) return;
  if (!confirm('Delete the category "' + cat.name + '"?')) return;
  const { data } = await apiPost('/admin/inventory.php', { action: 'delete_category', category_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) loadInventory();
}

function openDamageModal(typeId) {
  document.getElementById('damageForm').reset();
  fillInvDropdowns();
  dpickReset();
  if (typeId) dpickSelect(typeId);
  updateDamageLoss();
  openModal('damageModal');
  if (!typeId) setTimeout(() => document.getElementById('damageSearch').focus(), 50);
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
  const cost = it ? Number(it.buying_price || 0) : 0;
  const max = it ? Number(it.quantity || 0) : 0;
  if (max) qtyEl.max = max; else qtyEl.removeAttribute('max');
  document.getElementById('damageLoss').value = fmt((Number(qtyEl.value) || 0) * cost);
}

/** Builds and downloads the purchase template (opens in Excel; upload it back with Import Excel). */
function downloadInventoryTemplate() {
  const cat = (INV_DATA && INV_DATA.categories[0] && INV_DATA.categories[0].name) || 'Laptops';
  const rows = [
    ['Category', 'Description', 'Quantity', 'Amount'],
    [cat, 'EXAMPLE - HP ProBook 450 G8, 8GB RAM, 256GB SSD (replace or delete this row)', 5, 850000],
  ];
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inventory-purchase-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function deleteProduct(productId) {
  const p = (INV_DATA && INV_DATA.products || []).find(x => Number(x.id) === Number(productId));
  const name = p ? p.name : 'this product';
  if (!confirm('Delete "' + name + '"?\n\nIts types and stock will be removed from the list. If it already has sales or stock history it is archived (hidden) so old receipts and reports stay correct.')) return;
  const { data } = await apiPost('/admin/inventory.php', { action: 'delete_product', product_id: productId });
  showFlash(data.message || (data.success ? 'Product deleted.' : 'Could not delete this product.'), data.success ? 'success' : 'error');
  if (data.success) { closeModal('productDetailModal'); await loadInventory(); }
}

async function openProductDetail(productId) {
  const { data } = await apiGet('/admin/inventory.php?product=' + productId);
  if (!data.product) { showFlash('Product not found.', 'error'); return; }
  CAN_MANAGE_INV = !!data.can_manage;
  const p = data.product;

  document.getElementById('productDetailBody').innerHTML = `
    <h3><i class="bi bi-box-seam"></i> ${escapeHtml(p.name)}</h3>
    <p class="small">${escapeHtml(p.category_name || 'Uncategorized')}</p>
    ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
    ${CAN_MANAGE_INV ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;"><button class="btn btn-light btn-sm" onclick="openTypeModal(${p.id})"><i class="bi bi-plus-circle"></i> Add Type</button><button class="btn btn-light btn-sm" onclick="openProductModal(${p.id})"><i class="bi bi-pencil-square"></i> Edit Product</button><button class="btn btn-light btn-sm" onclick="deleteProduct(${p.id})" style="color:var(--danger);"><i class="bi bi-trash"></i> Delete Product</button></div>` : ''}
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Type</th><th>Unit</th><th>Qty</th><th>Buy</th><th>Sell</th><th>Min Sell</th><th>Min Stock</th>${CAN_MANAGE_INV ? '<th></th>' : ''}</tr></thead>
      <tbody>${data.types.length ? data.types.map(t => `
        <tr>
          <td><b>${escapeHtml(t.name)}</b></td>
          <td class="small">${escapeHtml(t.unit)}</td>
          <td>${t.quantity <= t.minimum_stock_level ? `<span class="badge badge-warn">${t.quantity}</span>` : t.quantity}</td>
          <td>${fmt(t.buying_price)}</td>
          <td>${fmt(t.selling_price)}</td>
          <td>${t.minimum_selling_price ? fmt(t.minimum_selling_price) : '<span class="small">cost</span>'}</td>
          <td class="small">${t.minimum_stock_level}</td>
          ${CAN_MANAGE_INV ? `<td class="actions-cell">
            <button class="btn btn-light btn-sm" onclick="openStockAction(${t.id}, 'adjust_stock', 'in')" title="Stock in"><i class="bi bi-plus"></i></button>
            <button class="btn btn-light btn-sm" onclick="openStockAction(${t.id}, 'adjust_stock', 'out')" title="Stock out"><i class="bi bi-dash"></i></button>
            <button class="btn btn-light btn-sm" onclick="openStockAction(${t.id}, 'record_damage', 'out')" title="Record damage (counted as a loss)"><i class="bi bi-exclamation-triangle"></i></button>
          </td>` : ''}
        </tr>`).join('') : `<tr><td colspan="${CAN_MANAGE_INV ? 8 : 7}" class="empty-state">No types yet.</td></tr>`}</tbody>
    </table></div>`;

  openModal('productDetailModal');
}

function openTypeModal(productId) {
  document.getElementById('typeProductId').value = productId;
  // Opened from inside the product-detail window, so force it on top of that
  // window (it used to appear behind it).
  document.getElementById('typeModal').style.zIndex = '1000';
  openModal('typeModal');
}

function openStockAction(typeId, action, direction) {
  document.getElementById('stockActionType').value = action;
  document.getElementById('stockActionTypeId').value = typeId;
  document.getElementById('stockActionDirection').value = direction;
  document.getElementById('stockActionTitle').innerHTML = action === 'record_damage'
    ? '<i class="bi bi-exclamation-triangle"></i> Record Damage'
    : (direction === 'in' ? '<i class="bi bi-plus-circle"></i> Stock In (Adjustment)' : '<i class="bi bi-dash-circle"></i> Stock Out (Adjustment)');
  const isDamage = action === 'record_damage';
  document.getElementById('stockActionNotesLabel').textContent = isDamage ? 'Remark (required — what happened?)' : 'Notes';
  const notesEl = document.getElementById('stockActionNotes');
  notesEl.required = isDamage; notesEl.minLength = isDamage ? 3 : 0;
  notesEl.placeholder = isDamage ? 'e.g. Screen cracked during delivery' : '';
  openModal('stockActionModal');
}

function openPurchaseModal() {
  document.getElementById('purchaseLines').innerHTML = '';
  purchaseLineCount = 0;
  addPurchaseLine();
  openModal('purchaseModal');
}

function addPurchaseLine() {
  const idx = purchaseLineCount++;
  const typeOptions = INV_DATA.all_types.map(t => `<option value="${t.id}" data-cost="${t.buying_price}">${escapeHtml(t.product_name)} — ${escapeHtml(t.name)}</option>`).join('');
  const row = document.createElement('div');
  row.className = 'form-row';
  row.style.marginBottom = '6px';
  row.innerHTML = `
    <div class="form-group" style="flex:2;"><select class="pline-type">${typeOptions}</select></div>
    <div class="form-group"><input type="number" class="pline-qty" placeholder="Qty" min="1" value="1"></div>
    <div class="form-group"><input type="number" step="0.01" class="pline-cost" placeholder="Unit Cost"></div>`;
  document.getElementById('purchaseLines').appendChild(row);
  const sel = row.querySelector('.pline-type');
  const costInput = row.querySelector('.pline-cost');
  costInput.value = sel.selectedOptions[0]?.dataset.cost || '';
  sel.addEventListener('change', () => { costInput.value = sel.selectedOptions[0]?.dataset.cost || ''; });
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Inventory', crumb: 'Admin / Inventory / Overview', activeKey: 'inventory', allowedRoles: ['admin'], anyPermission: ['inventory.view','inventory.manage'] });
  if (!user) return;
  await loadInventory();

  let importRows = [];

  window.openImportModal = function () {
    document.getElementById('importFileInput').value = '';
    document.getElementById('importUploadStep').style.display = 'block';
    document.getElementById('importPreviewStep').style.display = 'none';
    const names = INV_DATA.categories.map(c => c.name);
    document.getElementById('importCategoryHint').innerHTML = names.length
      ? 'Your saved categories: <b>' + names.map(escapeHtml).join(', ') + '</b>. Use these names in the Category column.'
      : '<span style="color:var(--danger);">You have no saved categories yet — add them in the Categories tab first.</span>';
    openModal('importModal');
  };

  window.cancelImportPreview = function () {
    importRows = [];
    document.getElementById('importUploadStep').style.display = 'block';
    document.getElementById('importPreviewStep').style.display = 'none';
  };

  function renderImportPreview() {
    const categories = INV_DATA.categories.map(c => c.name);
    const body = document.getElementById('importPreviewBody');
    body.innerHTML = importRows.map((r, i) => `
      <tr style="${r.error ? 'background:var(--blue-50);' : ''}">
        <td>
          <select data-i="${i}" class="imp-category">
            <option value="">— choose —</option>
            ${categories.map(c => `<option value="${escapeHtml(c)}" ${r.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </td>
        <td class="small">${escapeHtml(r.description) || '<span class="badge badge-off">missing</span>'}</td>
        <td>${r.quantity}</td>
        <td>${fmt(r.amount)}</td>
        <td><input type="number" step="0.01" min="0.01" class="imp-selling" data-i="${i}" value="${r.selling_price ?? ''}" style="width:100px;"></td>
        <td><input type="number" min="0" class="imp-reorder" data-i="${i}" value="${r.reorder_level}" style="width:80px;"></td>
      </tr>
      ${r.error ? `<tr style="background:var(--blue-50);"><td colspan="6" class="small" style="color:var(--danger);padding-top:0;"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(r.error)}</td></tr>` : ''}
    `).join('');

    body.querySelectorAll('.imp-category').forEach(el => el.addEventListener('change', (e) => {
      importRows[e.target.dataset.i].category = e.target.value;
    }));
    body.querySelectorAll('.imp-selling').forEach(el => el.addEventListener('input', (e) => {
      importRows[e.target.dataset.i].selling_price = e.target.value;
    }));
    body.querySelectorAll('.imp-reorder').forEach(el => el.addEventListener('input', (e) => {
      importRows[e.target.dataset.i].reorder_level = e.target.value;
    }));

    document.getElementById('importPreviewSummary').textContent =
      `${importRows.length} row(s) found. Fix any highlighted rows and set a selling price for each before saving.`;
    document.getElementById('importUploadStep').style.display = 'none';
    document.getElementById('importPreviewStep').style.display = 'block';
  }

  document.getElementById('importPreviewBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('importFileInput');
    if (!fileInput.files.length) { showFlash('Please choose a file first.', 'error'); return; }
    const form = new FormData();
    form.append('action', 'import_preview');
    form.append('excel_file', fileInput.files[0]);
    const { data } = await apiPost('/admin/inventory.php', form);
    if (!data.success) { showFlash(data.message || 'Could not read that file.', 'error'); return; }
    if (!data.rows.length) { showFlash('No data rows found in that file.', 'error'); return; }
    importRows = data.rows;
    renderImportPreview();
  });

  document.getElementById('importConfirmBtn').addEventListener('click', async () => {
    for (const r of importRows) {
      if (!r.category || !r.description || !r.quantity || !r.selling_price || Number(r.selling_price) <= 0) {
        showFlash('Every row needs a category, description, quantity, and a selling price greater than zero.', 'error');
        return;
      }
    }
    const { data } = await apiPost('/admin/inventory.php', { action: 'import_confirm', rows: JSON.stringify(importRows) });
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('importModal'); importRows = []; loadInventory(); }
  });

  document.getElementById('supplierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const person = (e.target.contact_person.value || '').trim();
    if (person && !/[A-Za-z\u00C0-\u024F]/.test(person)) {
      showFlash('Contact Person should be a name (e.g. Amina Juma). Put the phone number in the Phone field.', 'error');
      return;
    }
    const form = new FormData(e.target); form.append('action', 'create_supplier');
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('supplierModal'); e.target.reset(); loadInventory(); }
  });

  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', form.get('category_id') ? 'update_category' : 'create_category');
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('categoryModal'); e.target.reset(); loadInventory(); }
  });

  dpickWire();
  document.getElementById('damageQty').addEventListener('input', updateDamageLoss);
  document.getElementById('damageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    if (!form.get('product_type_id')) { showFlash('Please choose the damaged product.', 'error'); return; }
    if (String(form.get('notes') || '').trim().length < 3) { showFlash('Please add a remark explaining what happened.', 'error'); return; }
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('damageModal'); e.target.reset(); await loadInventory(); }
  });

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const editing = !!form.get('product_id');
    form.append('action', editing ? 'update_product' : 'create_product');
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      closeModal('productModal'); e.target.reset();
      await loadInventory();
      if (editing && document.getElementById('productDetailModal').classList.contains('show')) openProductDetail(Number(form.get('product_id')));
    }
  });

  document.getElementById('typeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target); form.append('action', 'create_product_type');
    const productId = form.get('product_id');
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('typeModal'); e.target.reset(); await loadInventory(); openProductDetail(productId); }
  });

  document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = Array.from(document.querySelectorAll('#purchaseLines .form-row')).map(row => ({
      product_type_id: row.querySelector('.pline-type').value,
      quantity: row.querySelector('.pline-qty').value,
      unit_cost: row.querySelector('.pline-cost').value,
    })).filter(i => i.product_type_id && i.quantity > 0);

    const form = new FormData(e.target);
    form.append('action', 'record_purchase');
    form.append('items', JSON.stringify(items));
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('purchaseModal'); e.target.reset(); loadInventory(); }
  });

  document.getElementById('stockActionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const { data } = await apiPost('/admin/inventory.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      closeModal('stockActionModal'); e.target.reset();
      const typeId = form.get('product_type_id');
      await loadInventory();
      const row = INV_DATA.all_types.find(t => String(t.id) === String(typeId));
      if (row) {
        const prod = INV_DATA.products.find(p => p.name === row.product_name);
        if (prod) openProductDetail(prod.id);
      }
    }
  });
})();
