(async function () {
  await initPublicLayout('team');
  const { data } = await apiGet('/public/team.php');
  const container = document.getElementById('teamContainer');

  if (!data.team.length) {
    container.className = '';
    container.innerHTML = `<div class="empty-state"><i class="bi bi-people"></i><p>Team profiles will appear here soon.</p></div>`;
    return;
  }

  const ROLE_FALLBACK = {
    super_admin: 'Chief Executive Officer',
    admin: 'Administrator',
    staff: 'Team Member'
  };

  function teamAvatar(m) {
    const initial = escapeHtml((m.full_name || '?').charAt(0).toUpperCase());
    if (m.avatar) {
      return `<img src="${APP_ROOT}/backend/uploads/avatars/${encodeURIComponent(m.avatar)}" alt="${escapeHtml(m.full_name)}">`;
    }
    return `<span>${initial}</span>`;
  }

  function teamRole(m) {
    return escapeHtml(m.position_title || m.department_label || ROLE_FALLBACK[m.role] || 'Team Member');
  }

  container.className = 'team-grid';
  container.innerHTML = data.team.map(m => `
    <div class="team-card">
      <div class="team-avatar">${teamAvatar(m)}</div>
      <h3 class="team-name">${escapeHtml(m.full_name)}</h3>
      <div class="team-role">${teamRole(m)}</div>
      <div class="team-contacts">
        <a href="mailto:${escapeHtml(m.email)}"><i class="bi bi-envelope"></i> ${escapeHtml(m.email)}</a>
        ${m.phone ? `<a href="tel:${escapeHtml(m.phone)}"><i class="bi bi-telephone"></i> ${escapeHtml(m.phone)}</a>` : ''}
      </div>
      ${m.public_bio ? `<p class="team-note">${escapeHtml(m.public_bio)}</p>` : ''}
    </div>`).join('');
})();
