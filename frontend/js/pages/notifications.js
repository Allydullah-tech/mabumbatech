function notifLinkToPage(link) {
  if (!link) return '#';
  return APP_ROOT + link.replace('/backend/', '/frontend/html/').replace(/\.php(\?|$)/, '.html$1');
}

async function loadAllNotifications() {
  const { data } = await apiGet('/notifications.php?limit=50');
  const notifications = data.notifications || [];

  const rows = notifications.length
    ? notifications.map(n => `
      <a href="${notifLinkToPage(n.link)}" class="notif-row ${n.is_read == 0 ? 'unread' : ''}" onclick="markOneNotificationRead(${n.id})">
        <i class="bi ${notificationIcon(n.type)}"></i>
        <div class="notif-row-body">
          <b>${escapeHtml(n.title)}</b>
          <span>${escapeHtml(n.message || '')}</span>
        </div>
        <span class="notif-time">${timeAgo(n.created_at)}</span>
      </a>`).join('')
    : `<div class="empty-state" style="padding:40px 10px;"><i class="bi bi-bell-slash"></i>No notifications yet. We'll let you know as soon as something needs your attention.</div>`;

  document.getElementById('pageBody').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3><i class="bi bi-bell"></i> Notifications ${data.unread_count > 0 ? `<span class="badge badge-warn">${data.unread_count} unread</span>` : ''}</h3>
        ${data.unread_count > 0 ? `<button class="btn btn-light btn-sm" id="markAllReadPageBtn"><i class="bi bi-check2-all"></i> Mark all read</button>` : ''}
      </div>
      <div class="notif-row-list">${rows}</div>
    </div>`;

  const markAllBtn = document.getElementById('markAllReadPageBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await apiPost('/notifications.php', { action: 'mark_all' });
      loadAllNotifications();
    });
  }
}

/** Fire-and-forget — the link navigation proceeds immediately either way. */
function markOneNotificationRead(id) {
  apiPost('/notifications.php', { action: 'mark_one', id });
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'Notifications', crumb: 'Notifications', activeKey: 'notifications', allowedRoles: ['admin', 'staff', 'customer'] });
  if (!user) return;
  await loadAllNotifications();
})();
