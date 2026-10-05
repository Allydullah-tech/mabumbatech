(async function () {
  await loadSession();
  if (!CURRENT_USER) { window.location.href = pageUrl('/auth/login.html'); return; }
  if (CURRENT_USER.role !== 'staff' || CURRENT_USER.must_reset != 1) {
    const home = CURRENT_USER.role === 'staff' ? '/staff/dashboard.html' : (CURRENT_USER.role === 'customer' ? '/customer/dashboard.html' : '/admin/dashboard.html');
    window.location.href = pageUrl(home);
    return;
  }

  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const { data } = await apiPost('/auth/logout.php', {});
    window.location.href = pageUrl('/auth/login.html');
  });

  document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const { data } = await apiPost('/auth/force-reset.php', form);
    if (data.success) {
      showFlash('Password updated successfully. Welcome back!', 'success');
      setTimeout(() => { window.location.href = pageUrl(data.redirect); }, 800);
    } else {
      showFlash(data.message || 'Reset failed.', 'error');
    }
  });
})();
