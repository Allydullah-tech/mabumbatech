const REPORT_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
];

let currentRange = { preset: 'this_month', from: '', to: '' };

function reportQueryString() {
  const p = new URLSearchParams({ range: currentRange.preset });
  if (currentRange.preset === 'custom') {
    if (currentRange.from) p.set('from', currentRange.from);
    if (currentRange.to) p.set('to', currentRange.to);
  }
  return p.toString();
}

function renderRangeTabs() {
  document.getElementById('rangeTabs').innerHTML = REPORT_RANGES.map(r =>
    `<a href="#" data-range="${r.key}" class="${currentRange.preset === r.key ? 'active' : ''}">${r.label}</a>`
  ).join('');
  document.querySelectorAll('#rangeTabs a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const key = a.dataset.range;
      document.getElementById('customRangeRow').style.display = key === 'custom' ? 'flex' : 'none';
      if (key !== 'custom') {
        currentRange = { preset: key, from: '', to: '' };
        renderRangeTabs();
        loadReport();
      } else {
        currentRange.preset = 'custom';
        renderRangeTabs();
      }
    });
  });
}

function updateExportLinks() {
  const qs = reportQueryString();
  document.getElementById('exportPdf').href = APP_ROOT + '/backend/api/admin/reports.php?' + qs + '&export=pdf';
  document.getElementById('exportXlsx').href = APP_ROOT + '/backend/api/admin/reports.php?' + qs + '&export=xlsx';
  document.getElementById('exportCsv').href = APP_ROOT + '/backend/api/admin/reports.php?' + qs + '&export=csv';
}

async function loadReport() {
  updateExportLinks();
  const { data } = await apiGet('/admin/reports.php?' + reportQueryString());

  if (!data || !data.report) {
    document.querySelector('.dash-content').insertAdjacentHTML('beforeend', `
      <div class="alert alert-err">
        <i class="bi bi-exclamation-triangle"></i>
        Could not load report data. Server said: <b>${escapeHtml((data && data.message) || 'Unknown error (no response body).')}</b>
      </div>`);
    return;
  }

  const r = data.report;
  renderReportExtras(data);
  document.getElementById('rangeLabel').innerHTML = `<i class="bi bi-calendar-range"></i> Showing: <b>${escapeHtml(data.range.label)}</b>`;

  const s = r.summary;
  document.getElementById('summaryCards').innerHTML = `
    <div class="card stat-card"><div class="ic blue"><i class="bi bi-inboxes"></i></div><div><b>${s.total_requests}</b><span>Total Requests</span></div></div>
    <div class="card stat-card"><div class="ic green"><i class="bi bi-person-plus"></i></div><div><b>${s.new_customers}</b><span>New Customers</span></div></div>
    <div class="card stat-card"><div class="ic orange"><i class="bi bi-arrow-repeat"></i></div><div><b>${s.active_projects}</b><span>Active Projects</span></div></div>
    <div class="card stat-card"><div class="ic green"><i class="bi bi-check2-circle"></i></div><div><b>${s.completed_projects}</b><span>Completed Projects</span></div></div>`;

  const statuses = r.requests_by_status || [];
  const totalStatus = statuses.reduce((sum, x) => sum + Number(x.c || 0), 0) || 1;
  document.getElementById('statusBody').innerHTML = statuses.length
    ? statuses.map(x => {
      const pct = Math.round((Number(x.c) / totalStatus) * 100);
      const label = x.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px;"><span>${label}</span><b>${x.c} (${pct}%)</b></div>
        <div style="background:var(--blue-50);border-radius:20px;height:7px;overflow:hidden;"><div style="background:var(--blue-600);height:100%;width:${pct}%;"></div></div>
      </div>`;
    }).join('')
    : `<p class="empty-state small"><i class="bi bi-pie-chart"></i>No requests in this range.</p>`;

  document.getElementById('serviceBody').innerHTML = (r.requests_by_service || []).length
    ? r.requests_by_service.map(x => `<tr><td>${escapeHtml(x.name)}</td><td>${x.c}</td></tr>`).join('')
    : `<tr><td colspan="2" class="empty-state">No data for this range.</td></tr>`;

  const trend = r.request_trend || [];
  const maxTrend = Math.max(1, ...trend.map(t => Number(t.c)));
  document.getElementById('trendBody').innerHTML = trend.length
    ? `<div style="display:flex;align-items:flex-end;gap:6px;height:140px;overflow-x:auto;padding-top:10px;">
        ${trend.map(t => {
          const h = Math.max(4, Math.round((t.c / maxTrend) * 110));
          return `<div style="flex:0 0 auto;width:26px;display:flex;flex-direction:column;align-items:center;gap:4px;" title="${t.d}: ${t.c}">
            <span class="small" style="font-weight:700;">${t.c}</span>
            <div style="width:100%;height:${h}px;background:linear-gradient(180deg,var(--blue-500),var(--blue-600));border-radius:4px 4px 0 0;"></div>
            <span class="small" style="font-size:.62rem;white-space:nowrap;">${new Date(t.d).getDate()}/${new Date(t.d).getMonth() + 1}</span>
          </div>`;
        }).join('')}
      </div>`
    : `<p class="empty-state small"><i class="bi bi-graph-up"></i>No requests in this range.</p>`;

  document.getElementById('staffPerfBody').innerHTML = (r.staff_performance || []).length
    ? r.staff_performance.map(x => `
      <tr>
        <td>${escapeHtml(x.full_name)}</td>
        <td>${escapeHtml(x.position_title || '')}</td>
        <td>${x.completed_in_range}</td>
        <td>${x.active_now}</td>
        <td>${x.total_assigned_all_time}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state"><i class="bi bi-person-x"></i>No staff data.</td></tr>`;

  document.getElementById('customerActivityBody').innerHTML = (r.customer_activity || []).length
    ? r.customer_activity.map(x => `<tr><td>${escapeHtml(x.full_name)}</td><td>${escapeHtml(x.email)}</td><td>${x.requests_in_range}</td></tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">No customer activity in this range.</td></tr>`;

  const comm = r.communication_activity || [];
  const totalComm = comm.reduce((sum, x) => sum + Number(x.c || 0), 0) || 1;
  document.getElementById('commActivityBody').innerHTML = comm.length
    ? comm.map(x => {
      const pct = Math.round((Number(x.c) / totalComm) * 100);
      const label = x.sender_role.charAt(0).toUpperCase() + x.sender_role.slice(1);
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px;"><span>${label} Messages</span><b>${x.c}</b></div>
        <div style="background:var(--blue-50);border-radius:20px;height:7px;overflow:hidden;"><div style="background:var(--blue-600);height:100%;width:${pct}%;"></div></div>
      </div>`;
    }).join('')
    : `<p class="empty-state small"><i class="bi bi-chat-dots"></i>No messages in this range.</p>`;
}

function rpMoney(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function rpTable(headers, rows, emptyText) {
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty-state">${emptyText}</td></tr>`}</tbody></table></div>`;
}

/** Financial, product-sales and customer-source sections + the report header. */
function renderReportExtras(data) {
  document.getElementById('reportMeta').innerHTML = `
    <span><i class="bi bi-calendar-range"></i> Period: <b>${escapeHtml(data.range.label)}</b></span>
    <span><i class="bi bi-clock"></i> Generated: ${escapeHtml(data.meta.generated_at)}</span>
    <span><i class="bi bi-person"></i> By: ${escapeHtml(data.meta.generated_by)}</span>
    <span><i class="bi bi-cash"></i> Amounts in ${escapeHtml(data.meta.currency)}</span>`;

  let n = 1;
  const f = data.financial;
  const finEl = document.getElementById('financialSection');
  if (f) {
    const s = f.summary, sl = f.sales;
    finEl.innerHTML = `
      <div class="report-section">
        <h3>${n++}. Financial Summary</h3>
        <div class="grid grid-4" style="margin-bottom:14px;">
          <div class="card stat-card"><div class="ic green"><i class="bi bi-graph-up"></i></div><div><b>${rpMoney(s.revenue)}</b><span>Revenue</span></div></div>
          <div class="card stat-card"><div class="ic orange"><i class="bi bi-graph-down"></i></div><div><b>${rpMoney(s.expenses)}</b><span>Expenses</span></div></div>
          <div class="card stat-card"><div class="ic red"><i class="bi bi-heartbreak"></i></div><div><b>${rpMoney(s.damage_loss)}</b><span>Damaged Stock Loss</span></div></div>
          <div class="card stat-card"><div class="ic ${s.net_profit >= 0 ? 'blue' : 'red'}"><i class="bi bi-piggy-bank"></i></div><div><b>${rpMoney(s.net_profit)}</b><span>Net Profit</span></div></div>
        </div>
        <p class="small" style="margin:0 0 12px;">Damaged stock is counted as a loss (expense) at its buying price, so it is already inside Expenses and Net Profit.</p>
        <div class="grid grid-2" style="align-items:start;">
          <div class="panel"><div class="panel-head"><h3>Income by Category</h3></div>${rpTable(['Category', 'Amount'], f.income_by_category.map(x => `<tr><td>${escapeHtml(x.category)}</td><td>${rpMoney(x.total)}</td></tr>`), 'No income in this period.')}</div>
          <div class="panel"><div class="panel-head"><h3>Expenses by Category</h3></div>${rpTable(['Category', 'Amount'], f.expenses_by_category.map(x => `<tr><td>${escapeHtml(x.category)}</td><td>${rpMoney(x.total)}</td></tr>`), 'No expenses in this period.')}</div>
        </div>
      </div>
      <div class="report-section">
        <h3>${n++}. Product Sales &amp; Stock</h3>
        <div class="grid grid-4" style="margin-bottom:14px;">
          <div class="card stat-card"><div class="ic blue"><i class="bi bi-receipt"></i></div><div><b>${sl.count}</b><span>Sales (${sl.units} units)</span></div></div>
          <div class="card stat-card"><div class="ic green"><i class="bi bi-cash-stack"></i></div><div><b>${rpMoney(sl.revenue)}</b><span>Sales Revenue</span></div></div>
          <div class="card stat-card"><div class="ic blue"><i class="bi bi-graph-up-arrow"></i></div><div><b>${rpMoney(sl.profit)}</b><span>Gross Profit</span></div></div>
          <div class="card stat-card"><div class="ic red"><i class="bi bi-exclamation-triangle"></i></div><div><b>${f.damaged_units}</b><span>Damaged Units</span></div></div>
        </div>
        <div class="panel">${rpTable(['Top Selling Products', 'Units', 'Revenue', 'Profit'], f.top_products.map(x => `<tr><td>${escapeHtml(x.product_name)} — ${escapeHtml(x.type_name)}</td><td>${x.units}</td><td>${rpMoney(x.revenue)}</td><td>${rpMoney(x.profit)}</td></tr>`), 'No products sold in this period.')}</div>
        <p class="small" style="margin:8px 0 0;">Stock on hand now: <b>${f.stock_on_hand.units}</b> units worth <b>${rpMoney(f.stock_on_hand.value)}</b> at selling price.</p>
      </div>`;
  } else {
    finEl.innerHTML = '';
  }

  const m = data.marketing;
  const mkEl = document.getElementById('marketingSection');
  if (m) {
    const maxLeads = Math.max(1, ...m.sources.map(x => x.total));
    mkEl.innerHTML = `
      <div class="report-section">
        <h3>${n++}. Customer Acquisition</h3>
        <div class="grid grid-3" style="margin-bottom:14px;">
          <div class="card stat-card"><div class="ic blue"><i class="bi bi-people"></i></div><div><b>${m.summary.total_customers}</b><span>Customers</span></div></div>
          <div class="card stat-card"><div class="ic blue"><i class="bi bi-award"></i></div><div><b style="font-size:.9rem;">${escapeHtml(m.summary.top_source || '—')}</b><span>Top Source</span></div></div>
        </div>
        <div class="panel" style="margin-bottom:14px;">${rpTable(['Source', 'Customers'], m.sources.map(x => `
          <tr><td><b>${escapeHtml(x.label)}</b><div class="source-bar"><div style="width:${Math.round(x.total * 100 / maxLeads)}%"></div></div></td>
          <td>${x.total}</td></tr>`), 'No customers recorded in this period.')}</div>
      </div>`;
  } else {
    mkEl.innerHTML = '';
  }
  document.getElementById('opsHeading').textContent = `${n}. Operations`;
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Reports', crumb: 'Admin / System / Reports', activeKey: 'reports', allowedRoles: ['admin'], anyPermission: ['reports.financial','reports.operational'] });
  if (!user) return;

  renderRangeTabs();
  await loadReport();

  document.getElementById('applyCustomRange').addEventListener('click', () => {
    currentRange.from = document.getElementById('customFrom').value;
    currentRange.to = document.getElementById('customTo').value;
    if (!currentRange.from || !currentRange.to) {
      showFlash('Please choose both a from and to date.', 'error');
      return;
    }
    loadReport();
  });
})();
