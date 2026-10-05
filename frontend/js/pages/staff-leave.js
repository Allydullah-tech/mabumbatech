async function loadMyLeave() {
  const { data } = await apiGet('/staff/leave.php');
  document.getElementById('leaveTableBody').innerHTML = data.leaves.length ? data.leaves.map(l => `
    <tr>
      <td>${l.leave_type.replace(/_/g, '/')}</td>
      <td class="small">${escapeHtml(l.start_date)} → ${escapeHtml(l.end_date)}</td>
      <td class="small">${escapeHtml(l.reason || '—')}</td>
      <td>${statusBadge(l.status)}</td>
      <td class="small">${timeAgo(l.created_at)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="empty-state"><i class="bi bi-inbox"></i>No leave requests yet.</td></tr>';
}

(async function () {
  const user = await initDashLayout({ pageTitle: 'My Leave', crumb: 'Staff / Leave', activeKey: 'leave', allowedRoles: ['staff'] });
  if (!user) return;
  await loadMyLeave();

  document.getElementById('newLeaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'request_leave');
    const { data } = await apiPost('/staff/leave.php', form);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) { closeModal('newLeaveModal'); e.target.reset(); loadMyLeave(); }
  });
})();
