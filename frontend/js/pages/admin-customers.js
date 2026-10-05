let ALL_CUSTOMERS = [];

function renderCustomersTable(list) {
  document.getElementById('customerCount').textContent = list.length;
  const body = document.getElementById('customersTableBody');

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="bi bi-person-x"></i>No matching customer accounts.</td></tr>`;
    return;
  }

  body.innerHTML = list.map(c => `
    <tr>
      <td class="row-name">
        <div class="avatar-sm" style="background:var(--ok);">${escapeHtml((c.full_name || '?').charAt(0).toUpperCase())}</div>
        <div><b>${escapeHtml(c.full_name)}</b><span>${escapeHtml(c.username)}</span></div>
      </td>
      <td>${escapeHtml(c.email)}<br><span class="small">${escapeHtml(c.phone || '—')}</span></td>
      <td><span class="tag-pill">${c.request_count} requests</span></td>
      <td>${statusBadge(c.status)}</td>
      <td class="small">${new Date(c.created_at.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td class="actions-cell"><button class="btn btn-light btn-sm" onclick="toggleCustomerStatus(${c.id})"><i class="bi bi-power"></i></button></td>
    </tr>`).join('');
}

function applyCustomerSearch() {
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  if (!q) { renderCustomersTable(ALL_CUSTOMERS); return; }
  const filtered = ALL_CUSTOMERS.filter(c =>
    (c.full_name || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q) ||
    (c.phone || '').toLowerCase().includes(q) ||
    (c.username || '').toLowerCase().includes(q)
  );
  renderCustomersTable(filtered);
}

async function loadCustomers() {
  const { data } = await apiGet('/admin/customers.php');
  ALL_CUSTOMERS = data.customers;
  applyCustomerSearch();
}

async function toggleCustomerStatus(id) {
  if (!confirm('Change status for this customer?')) return;
  const { data } = await apiPost('/admin/customers.php', { action: 'toggle_status', customer_id: id });
  showFlash(data.message, data.success ? 'success' : 'error');
  loadCustomers();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Customer Accounts', crumb: 'Admin / People / Customers', activeKey: 'customers', allowedRoles: ['admin'], anyPermission: ['customers.manage'] });
  if (!user) return;
  await loadCustomers();
  document.getElementById('searchInput').addEventListener('input', applyCustomerSearch);
})();
