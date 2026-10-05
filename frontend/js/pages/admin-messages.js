/* Contact Messages — inbox with a time-filtered history.
 * Passing a customer on to the manager is done in person, so nothing here
 * creates leads or sales. */
let ALL_MESSAGES = [];

let msgPeriod = 'all';
let msgFrom = '';
let msgTo = '';
let msgStatus = 'all';
const MSG_PERIODS = [['all', 'All time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year'], ['custom', 'Custom dates…']];
const MSG_STATUSES = [['all', 'All messages'], ['new', 'New (unread)'], ['read', 'Read']];

function niceDateTime(dt) {
  if (!dt) return '';
  const d = new Date(String(dt).replace(' ', 'T'));
  if (isNaN(d)) return escapeHtml(dt);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderSummary(s) {
  const card = (icon, tone, value, label) => `<div class="card stat-card"><div class="ic ${tone}"><i class="bi ${icon}"></i></div><div><b>${value}</b><span>${label}</span></div></div>`;
  document.getElementById('msgSummary').innerHTML =
    card('bi-envelope', 'blue', s.total, 'Messages') +
    card('bi-envelope-exclamation', 'orange', s.unread, 'New (unread)') +
    card('bi-envelope-open', 'green', s.read_count, 'Read');
}

function renderMessages(list) {
  document.getElementById('msgCount').textContent = list.length;
  const body = document.getElementById('messagesBody');

  if (!list.length) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-envelope-open"></i>No messages match your filters.</div>`;
    return;
  }

  body.innerHTML = list.map(m => `
    <div class="task-card">
      <div class="top-row">
        <div>
          <h4>${escapeHtml(m.subject || 'No subject')} ${m.is_read == 0 ? '<span class="badge badge-warn">New</span>' : ''}</h4>
          <span class="meta">${escapeHtml(m.name)} · ${escapeHtml(m.email)} ${m.phone ? '· ' + escapeHtml(m.phone) : ''} · ${niceDateTime(m.created_at)} (${timeAgo(m.created_at)})</span>
        </div>
        <div style="display:flex;gap:6px;">
          ${m.is_read == 0 ? `<button class="btn btn-light btn-sm" onclick="markMsgRead(${m.id})"><i class="bi bi-check2"></i> Mark Read</button>` : ''}
        </div>
      </div>
      <p>${escapeHtml(m.message).replace(/\n/g, '<br>')}</p>
    </div>`).join('');
}

function applyMessageSearch() {
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  if (!q) { renderMessages(ALL_MESSAGES); return; }
  const filtered = ALL_MESSAGES.filter(m =>
    (m.name || '').toLowerCase().includes(q) ||
    (m.email || '').toLowerCase().includes(q) ||
    (m.subject || '').toLowerCase().includes(q) ||
    (m.message || '').toLowerCase().includes(q)
  );
  renderMessages(filtered);
}

async function loadMessages() {
  const qs = new URLSearchParams({ period: msgPeriod, status: msgStatus });
  if (msgPeriod === 'custom') { qs.set('from', msgFrom); qs.set('to', msgTo); }
  const { data } = await apiGet('/admin/messages.php?' + qs.toString());
  ALL_MESSAGES = data.messages || [];
  renderSummary(data.summary || { total: 0, unread: 0, read_count: 0 });
  document.getElementById('msgRangeLabel').textContent = data.range ? data.range.label + (data.limit_reached ? ' · showing the latest 500' : '') : '';
  applyMessageSearch();
}

async function markMsgRead(id) {
  await apiPost('/admin/messages.php', { action: 'mark_read', msg_id: id });
  loadMessages();
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Contact Messages', crumb: 'Admin / Operations / Messages', activeKey: 'messages', allowedRoles: ['admin'], anyPermission: ['messages.manage'] });
  if (!user) return;

  const per = document.getElementById('msgPeriod'), st = document.getElementById('msgStatus');
  per.innerHTML = MSG_PERIODS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('');
  st.innerHTML = MSG_STATUSES.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('');
  per.value = msgPeriod; st.value = msgStatus;

  per.addEventListener('change', () => {
    msgPeriod = per.value;
    document.getElementById('msgCustom').style.display = msgPeriod === 'custom' ? 'inline-flex' : 'none';
    if (msgPeriod !== 'custom' || msgFrom || msgTo) loadMessages();
  });
  const onDate = () => { msgFrom = document.getElementById('msgFrom').value; msgTo = document.getElementById('msgTo').value; if (msgFrom || msgTo) loadMessages(); };
  document.getElementById('msgFrom').addEventListener('change', onDate);
  document.getElementById('msgTo').addEventListener('change', onDate);
  st.addEventListener('change', () => { msgStatus = st.value; loadMessages(); });
  document.getElementById('searchInput').addEventListener('input', applyMessageSearch);

  await loadMessages();
})();
