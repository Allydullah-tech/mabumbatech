/* Sales & Stock Overview — read-only view for the Operations Manager. */
let soPeriod = 'month';
let soFrom = '';
let soTo = '';
let STOCK_LIST = [];
const SO_PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom dates…']];

const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const num = (n) => Number(n || 0).toLocaleString('en-US');
const shortMoney = (n) => {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(Math.round(n));
};
function whenText(dt) {
  const d = new Date(String(dt).replace(' ', 'T'));
  if (isNaN(d)) return escapeHtml(dt || '');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
const card = (icon, tone, value, label, sub) => `<div class="card stat-card"><div class="ic ${tone}"><i class="bi ${icon}"></i></div><div><b>${value}</b><span>${label}</span>${sub ? `<span style="display:block;margin-top:2px;">${sub}</span>` : ''}</div></div>`;

function renderStock(s) {
  document.getElementById('stockCards').innerHTML =
    card('bi-tags', 'blue', num(s.total_products), 'Total Products', num(s.total_variants) + ' types / variants') +
    card('bi-stack', 'blue', num(s.total_stock), 'Total Stock', 'units on the shelves') +
    card('bi-cash-stack', 'green', tzs(s.stock_value), 'Total Stock Value', 'at buying price · selling value ' + tzs(s.retail_value)) +
    card('bi-exclamation-triangle', (Number(s.out_of_stock_count) > 0 ? 'red' : 'orange'), num(s.low_stock_count), 'Low Stock', num(s.out_of_stock_count) + ' sold out');
}

function renderSales(d) {
  const s = d.summary;
  document.getElementById('soRangeLabel').textContent = d.range.label;
  document.getElementById('salesCards').innerHTML =
    card('bi-cash-coin', 'green', tzs(s.sales_total), 'Sales', num(s.receipts) + ' sale' + (Number(s.receipts) === 1 ? '' : 's') + ' · ' + num(s.units) + ' units') +
    card('bi-graph-up', 'blue', tzs(s.profit), 'Profit', s.margin + '% margin') +
    card('bi-receipt', 'blue', tzs(s.avg_sale), 'Average Sale', 'per receipt') +
    card('bi-heartbreak', Number(s.damage_loss) > 0 ? 'red' : 'orange', tzs(s.damage_loss), 'Lost to Damage', num(s.damage_units) + ' damaged unit' + (Number(s.damage_units) === 1 ? '' : 's'));

  // trend bars
  const t = d.trend || [];
  const max = Math.max(1, ...t.map(x => x.sales));
  const gran = d.range.granularity;
  document.getElementById('trendNote').textContent = gran === 'hour' ? 'by hour' : gran === 'day' ? 'by day' : 'by month';
  const every = t.length > 24 ? Math.ceil(t.length / 12) : 1;
  document.getElementById('trendChart').innerHTML = t.length && t.some(x => x.sales > 0)
    ? t.map((x, i) => `<div class="so-bar ${x.sales > 0 ? '' : 'zero'}" title="${escapeHtml(x.label)} — ${tzs(x.sales)} (profit ${tzs(x.profit)})">
        <i style="height:${Math.max(2, Math.round(x.sales / max * 120))}px"></i><span>${i % every === 0 ? escapeHtml(x.label) : '&nbsp;'}</span></div>`).join('')
    : '<div class="empty-state" style="width:100%;"><i class="bi bi-bar-chart"></i>No sales in this period.</div>';

  // top products
  const tp = d.top_products || [];
  document.getElementById('topProducts').innerHTML = tp.length ? tp.map((p, i) => `
    <div class="so-rank"><span class="n">${i + 1}</span>
      <div class="t"><b>${escapeHtml(p.product_name)}</b><small>${escapeHtml(p.type_name)} · ${num(p.units)} sold</small></div>
      <div class="v">${tzs(p.revenue)}<small style="display:block;color:var(--ok);font-weight:700;">+${shortMoney(p.profit)}</small></div></div>`).join('')
    : '<div class="empty-state"><i class="bi bi-trophy"></i>Nothing sold in this period.</div>';

  // sellers
  const sl = d.sellers || [];
  document.getElementById('sellers').innerHTML = sl.length ? sl.map((p, i) => `
    <div class="so-rank"><span class="n">${i + 1}</span>
      <div class="t"><b>${escapeHtml(p.seller)}</b><small>${num(p.receipts)} sale${Number(p.receipts) === 1 ? '' : 's'}</small></div>
      <div class="v">${tzs(p.revenue)}</div></div>`).join('')
    : '<div class="empty-state"><i class="bi bi-person"></i>No sales in this period.</div>';

  // recent receipts
  const rc = d.recent_sales || [];
  document.getElementById('recentNote').textContent = rc.length >= 40 ? 'latest 40' : '';
  document.getElementById('recentBody').innerHTML = rc.length ? rc.map(r => `
    <tr>
      <td><b>${escapeHtml(r.receipt)}</b></td>
      <td class="small" style="white-space:nowrap;">${whenText(r.created_at)}</td>
      <td class="so-items">${escapeHtml(r.items || '')}</td>
      <td style="text-align:right;font-weight:700;">${tzs(r.total)}</td>
      <td style="text-align:right;color:var(--ok);font-weight:700;">${tzs(r.profit)}</td>
      <td class="small">${escapeHtml(r.sold_by_name || '—')}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state"><i class="bi bi-receipt"></i>No sales in this period.</td></tr>';
}

function renderLow(list) {
  document.getElementById('lowStock').innerHTML = list.length ? list.map(p => `
    <div class="so-rank">
      <div class="t"><b>${escapeHtml(p.product_name)}</b><small>${escapeHtml(p.name)}</small></div>
      <div class="v">${num(p.quantity)} <small style="color:var(--ink-soft);font-weight:600;">/ min ${num(p.minimum_stock_level)}</small></div></div>`).join('')
    : '<div class="empty-state"><i class="bi bi-check-circle"></i>All products are well stocked.</div>';
}

function renderStockList() {
  const q = (document.getElementById('stockSearch').value || '').trim().toLowerCase();
  const rows = STOCK_LIST.filter(r => !q || [r.product_name, r.type_name, r.category_name].join(' ').toLowerCase().includes(q));
  document.getElementById('stockBody').innerHTML = rows.length ? rows.map(r => {
    const qty = Number(r.quantity), min = Number(r.minimum_stock_level);
    const st = qty === 0 ? ['out', 'Sold out'] : (qty <= min ? ['low', 'Low'] : ['ok', 'In stock']);
    return `<tr>
      <td><b>${escapeHtml(r.product_name)}</b><div class="small">${escapeHtml(r.type_name)}</div></td>
      <td class="small">${escapeHtml(r.category_name || '—')}</td>
      <td style="text-align:right;font-weight:700;">${num(qty)} <span class="small">${escapeHtml(r.unit || '')}</span></td>
      <td style="text-align:right;">${tzs(r.stock_value)}</td>
      <td style="text-align:right;">${tzs(r.selling_price)}</td>
      <td><span class="so-pill ${st[0]}">${st[1]}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-state"><i class="bi bi-box"></i>No products match.</td></tr>';
}

async function loadOverview() {
  const qs = new URLSearchParams({ period: soPeriod });
  if (soPeriod === 'custom') { qs.set('from', soFrom); qs.set('to', soTo); }
  const { data } = await apiGet('/admin/sales-overview.php?' + qs.toString());
  if (!data || !data.stock) return;
  STOCK_LIST = data.stock_list || [];
  renderStock(data.stock);
  renderSales(data);
  renderLow(data.low_stock || []);
  renderStockList();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Sales & Stock Overview', crumb: 'Admin / Operations / Sales & Stock', activeKey: 'sales-overview', allowedRoles: ['admin'] });
  if (!user) return;

  const per = document.getElementById('soPeriod');
  per.innerHTML = SO_PERIODS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('');
  per.value = soPeriod;
  per.addEventListener('change', () => {
    soPeriod = per.value;
    document.getElementById('soCustom').style.display = soPeriod === 'custom' ? 'inline-flex' : 'none';
    if (soPeriod !== 'custom' || soFrom || soTo) loadOverview();
  });
  const onDate = () => { soFrom = document.getElementById('soFrom').value; soTo = document.getElementById('soTo').value; if (soFrom || soTo) loadOverview(); };
  document.getElementById('soFrom').addEventListener('change', onDate);
  document.getElementById('soTo').addEventListener('change', onDate);
  document.getElementById('stockSearch').addEventListener('input', renderStockList);

  await loadOverview();
})();
