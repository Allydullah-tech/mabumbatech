(async function () {
  const user = await initDashLayout({ pageTitle: 'Dashboard', crumb: 'Admin / Overview', activeKey: 'dashboard', allowedRoles: ['admin'] });
  if (!user) return;

  const { data } = await apiGet('/admin/dashboard.php');
  const s = data.stats;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // Customer Accounts, Urgent Requests and Unread Contact Messages cards are not shown to
  // the Super Admin, Generic Admin, Manager, Accountant, Lawyer, Sales Officer or Marketing Officer dashboards.
  const jobKey = user.job_role_key || '';
  const hideExtraCards = isFullAdmin(user) || ['general_manager', 'accountant', 'lawyer', 'sales_officer', 'marketing_officer'].includes(jobKey);
  if (hideExtraCards) {
    ['cardCustomers', 'cardUrgent', 'cardMessages'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });

    // Re-flow the 5 remaining cards (Pending, Active, Completed, Staff, Administrators)
    // into ONE evenly spaced row instead of leaving gaps in two half-empty rows.
    const rowOne = document.getElementById('statPending')?.closest('.grid');
    const rowTwo = document.getElementById('statStaff')?.closest('.grid');
    if (rowOne && rowTwo && rowOne !== rowTwo) {
      Array.from(rowTwo.children).forEach(card => rowOne.appendChild(card));
      rowTwo.remove();
    }
    if (rowOne) { rowOne.classList.remove('grid-4'); rowOne.classList.add('grid-5'); }
  }
  // Read-only Financial Overview (with period filter): Super Admin, Generic Admin, Manager, Accountant.
  if (isFullAdmin(user) || ['general_manager', 'accountant'].includes(jobKey)) {
    initFinanceOverview();
  }

  setText('statStaff', s.staff);
  setText('statCustomers', s.customers);
  setText('statNewCustomers', s.new_customers_week > 0 ? `+${s.new_customers_week} this week` : '');
  setText('statPending', s.pending);
  setText('statMessages', s.unread_messages);
  setText('statAdmins', s.admins);
  setText('statInProgress', s.in_progress);
  setText('statCompleted', s.completed);
  setText('statUrgent', s.urgent);

  // Recent Requests: service AND product requests, shown the same way. A service request opens in
  // Service Requests; a product request (Customer Acquisition) opens in Product Requests (full admins)
  // or Customer Acquisition (other roles that have access to it).
  const canOpenProduct = isFullAdmin(user) || ['marketing.view', 'marketing.manage', 'marketing.acquisition.manage'].some(k => hasPerm(k));
  const productPage = isFullAdmin(user) ? 'product-requests.html' : 'marketing-acquisition.html';
  const requestLink = (r) => (r.request_type === 'product'
    ? (canOpenProduct ? `${productPage}?view=${r.id}` : '')
    : `requests.html?view=${r.id}`);

  const body = document.getElementById('recentRequestsBody');
  if (!data.recent_requests.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="bi bi-inbox"></i>No requests yet.</td></tr>`;
  } else {
    body.innerHTML = data.recent_requests.map(r => {
      const isProduct = r.request_type === 'product';
      const name = isProduct ? (r.product_type_name || r.product_name || 'Product') : (r.service_name || 'Service');
      const href = requestLink(r);
      const code = escapeHtml(r.tracking_code);
      return `
      <tr>
        <td>${href ? `<a href="${href}">${code}</a>` : code}</td>
        <td><i class="bi ${escapeHtml(r.icon || (isProduct ? 'bi-box-seam' : 'bi-gear'))}"></i> ${escapeHtml(name)}<br><span class="small">${isProduct ? 'Product Request' : 'Service Request'}</span></td>
        <td>${escapeHtml(r.guest_name || '—')}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="small">${timeAgo(r.created_at)}</td>
      </tr>`;
    }).join('');
  }

  const catBody = document.getElementById('categoryLoadBody');
  const maxCat = Math.max(1, ...data.category_load.map(c => c.total));
  catBody.innerHTML = data.category_load.length
    ? data.category_load.map(c => {
      const pct = Math.round((c.total / maxCat) * 100);
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px;">
          <span>${escapeHtml(c.name)}</span><b>${c.total}</b>
        </div>
        <div style="background:var(--blue-50);border-radius:20px;height:7px;overflow:hidden;">
          <div style="background:var(--blue-600);height:100%;width:${pct}%;"></div>
        </div>
      </div>`;
    }).join('')
    : `<p class="empty-state small"><i class="bi bi-bar-chart"></i>No requests yet.</p>`;

  // Service demand trend — simple month-over-month bar chart, no charting library needed.
  const trendBody = document.getElementById('demandTrendBody');
  const trend = data.demand_trend || [];
  const maxTrend = Math.max(1, ...trend.map(t => t.c));
  trendBody.innerHTML = trend.length
    ? `<div style="display:flex;align-items:flex-end;gap:10px;height:140px;padding-top:10px;">
        ${trend.map(t => {
          const h = Math.max(4, Math.round((t.c / maxTrend) * 110));
          const [y, m] = t.ym.split('-');
          const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <span class="small" style="font-weight:700;">${t.c}</span>
            <div style="width:100%;max-width:36px;height:${h}px;background:linear-gradient(180deg,var(--blue-500),var(--blue-600));border-radius:6px 6px 0 0;"></div>
            <span class="small">${label}</span>
          </div>`;
        }).join('')}
      </div>`
    : `<p class="empty-state small"><i class="bi bi-graph-up"></i>Not enough data yet.</p>`;

  // Staff Activity is only meaningful (and only sent by the backend) for full
  // admins — Super Admin/CEO or Generic Admin. Scoped job-role admins
  // (Secretary, Sales Officer, Accountant, ...) don't get this panel.
  const staffActivityPanel = document.getElementById('staffActivityPanel');
  if (isFullAdmin(user)) {
    const staffActivityBody = document.getElementById('staffActivityBody');
    const activity = data.staff_activity || [];
    staffActivityBody.innerHTML = activity.length
      ? activity.map(a => `
        <div class="notif-row" style="cursor:default;">
          <i class="bi bi-person-check"></i>
          <div class="notif-row-body">
            <b>${escapeHtml(a.full_name)}</b>
            <span>${escapeHtml(a.action)}${a.details ? ' — ' + escapeHtml(a.details) : ''}</span>
          </div>
          <span class="notif-time">${timeAgo(a.created_at)}</span>
        </div>`).join('')
      : `<div class="empty-state" style="padding:20px 10px;"><i class="bi bi-activity"></i>No recent activity.</div>`;
  } else if (staffActivityPanel) {
    staffActivityPanel.remove();
  }

  const messagesBody = document.getElementById('recentMessagesBody');
  const messages = data.recent_thread_messages || [];
  messagesBody.innerHTML = messages.length
    ? messages.map(m => `
      <a href="${m.request_type === 'product' ? (canOpenProduct ? productPage + '?view=' + m.request_id : '#') : 'requests.html?view=' + m.request_id}" class="notif-row">
        <i class="bi bi-chat-dots-fill"></i>
        <div class="notif-row-body">
          <b>${escapeHtml(m.full_name || (m.sender_role === 'customer' ? 'Customer' : 'Team'))} on "${escapeHtml(m.subject)}"</b>
          <span>${escapeHtml((m.message || '').slice(0, 90))}</span>
        </div>
        <span class="notif-time">${timeAgo(m.created_at)}</span>
      </a>`).join('')
    : `<div class="empty-state" style="padding:20px 10px;"><i class="bi bi-chat-dots"></i>No conversations yet.</div>`;

  const notifBody = document.getElementById('recentNotificationsBody');
  const notes = data.recent_notifications || [];
  notifBody.innerHTML = notes.length
    ? notes.map(n => `
      <div class="notif-row ${n.is_read == 0 ? 'unread' : ''}" style="cursor:default;">
        <i class="bi ${notificationIcon(n.type)}"></i>
        <div class="notif-row-body">
          <b>${escapeHtml(n.title)}</b>
          <span>${escapeHtml((n.message || '').slice(0, 90))}</span>
        </div>
        <span class="notif-time">${timeAgo(n.created_at)}</span>
      </div>`).join('')
    : `<div class="empty-state" style="padding:20px 10px;"><i class="bi bi-bell-slash"></i>No notifications yet.</div>`;
})();


/* ------------------------------------------------------------------
 * Financial Overview (view only; Super Admin, Generic Admin, Manager, Accountant) — income, expenses, profit, loans
 * with a time filter. Data comes from /admin/manager-finance.php.
 * ------------------------------------------------------------------ */
function initFinanceOverview() {
  const panel = document.getElementById('financePanel');
  if (!panel) return;
  panel.style.display = '';

  const filter = document.getElementById('foFilter');
  const customBox = document.getElementById('foCustom');
  const fromEl = document.getElementById('foFrom');
  const toEl = document.getElementById('foTo');
  const body = document.getElementById('foBody');
  const rangeLabel = document.getElementById('foRangeLabel');
  let period = 'this_month';
  let seq = 0;

  const money = n => 'TZS ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const compact = n => {
    const v = Math.abs(Number(n || 0));
    if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return Math.round(v / 1e3) + 'K';
    return String(Math.round(v));
  };

  function render(d) {
    const income = Number(d.income), expenses = Number(d.expenses), profit = Number(d.profit);
    const top = Math.max(income, expenses, 1);
    const L = d.loans || {};
    const positive = profit >= 0;
    const margin = d.margin_pct === null || d.margin_pct === undefined ? '' :
      `<span class="fo-pill ${positive ? 'up' : 'down'}"><i class="bi ${positive ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}"></i> ${d.margin_pct}% margin</span>`;

    const trend = d.trend || [];
    const trendMax = Math.max(1, ...trend.map(t => Math.max(t.income, t.expenses)));
    const trendHtml = trend.map(t => `
      <div class="fo-month" title="${escapeHtml(t.label)} — Income ${money(t.income)} · Expenses ${money(t.expenses)}">
        <div class="fo-bars">
          <i class="inc" style="height:${Math.max(t.income > 0 ? 4 : 0, Math.round(t.income / trendMax * 100))}%"></i>
          <i class="exp" style="height:${Math.max(t.expenses > 0 ? 4 : 0, Math.round(t.expenses / trendMax * 100))}%"></i>
        </div>
        <span>${escapeHtml(t.label)}</span>
      </div>`).join('');

    body.innerHTML = `
      <div class="fo-grid">
        <div class="fo-hero ${positive ? 'is-up' : 'is-down'}">
          <span class="fo-eyebrow"><i class="bi bi-graph-up-arrow"></i> Net profit</span>
          <div class="fo-hero-num">${money(profit)}</div>
          ${margin}
          <div class="fo-split">
            <div class="fo-line">
              <div class="fo-line-top"><span><i class="dot inc"></i> Income</span><b>${money(income)}</b></div>
              <div class="fo-track"><div class="fo-fill inc" style="width:${Math.round(income / top * 100)}%"></div></div>
            </div>
            <div class="fo-line">
              <div class="fo-line-top"><span><i class="dot exp"></i> Expenses</span><b>${money(expenses)}</b></div>
              <div class="fo-track"><div class="fo-fill exp" style="width:${Math.round(expenses / top * 100)}%"></div></div>
            </div>
          </div>
        </div>

        <div class="fo-loans">
          <span class="fo-eyebrow"><i class="bi bi-bank"></i> Loans</span>
          <div class="fo-loan-num">${money(L.outstanding)}</div>
          <span class="fo-muted">still to repay${L.active_count ? ` · ${L.active_count} active loan${L.active_count > 1 ? 's' : ''}` : ''}</span>
          <div class="fo-track tall"><div class="fo-fill loan" style="width:${L.progress_pct || 0}%"></div></div>
          <div class="fo-loan-meta"><span>${L.progress_pct || 0}% repaid</span><span>${money(L.total_repaid)} of ${money(L.total_repayable)}</span></div>
          <div class="fo-mini">
            <div><b>${money(L.received_in_period)}</b><span>Received in period</span></div>
            <div><b>${money(L.repaid_in_period)}</b><span>Repaid in period</span></div>
          </div>
        </div>

        <div class="fo-trend">
          <div class="fo-trend-head"><span class="fo-eyebrow"><i class="bi bi-bar-chart-line"></i> Last 6 months</span>
            <span class="fo-legend"><i class="dot inc"></i> Income <i class="dot exp"></i> Expenses</span></div>
          <div class="fo-months">${trendHtml}</div>
          <span class="fo-muted fo-scale">Tallest bar = ${compact(trendMax)} TZS</span>
        </div>
      </div>`;
  }

  async function load() {
    const my = ++seq;
    let qs = 'period=' + encodeURIComponent(period);
    if (period === 'custom') qs += '&from=' + encodeURIComponent(fromEl.value) + '&to=' + encodeURIComponent(toEl.value);
    body.classList.add('is-loading');
    try {
      const { ok, data } = await apiGet('/admin/manager-finance.php?' + qs);
      if (my !== seq) return;                       // a newer filter click already took over
      if (!ok || data.income === undefined) throw new Error(data.message || 'failed');
      rangeLabel.textContent = (data.range && data.range.label) || '';
      render(data);
    } catch (e) {
      if (my !== seq) return;
      body.innerHTML = `<div class="fo-loading">Could not load the financial overview. Please refresh.</div>`;
    } finally {
      if (my === seq) body.classList.remove('is-loading');
    }
  }

  filter.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-p]');
    if (!btn) return;
    period = btn.dataset.p;
    filter.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    customBox.style.display = period === 'custom' ? 'flex' : 'none';
    if (period === 'custom') {
      const today = new Date().toISOString().slice(0, 10);
      if (!toEl.value) toEl.value = today;
      if (!fromEl.value) fromEl.value = today.slice(0, 8) + '01';
      return;                                       // wait for Apply
    }
    load();
  });
  document.getElementById('foApply').addEventListener('click', load);

  load();
}
