(function () {
  // Customer accounts have been removed (system restructuring spec) — this
  // portal is Staff/Admin only now. An old ?as=customer link (or none at
  // all) falls back to Staff rather than a tab that no longer exists.
  const params = new URLSearchParams(window.location.search);
  let tab = params.get('as') || 'staff';
  if (!['staff', 'admin'].includes(tab)) tab = 'staff';

  function renderTabs() {
    document.getElementById('authTabs').innerHTML = `
      <a href="?as=staff" class="${tab === 'staff' ? 'active' : ''}"><i class="bi bi-briefcase"></i> Staff</a>
      <a href="?as=admin" class="${tab === 'admin' ? 'active' : ''}"><i class="bi bi-shield-lock"></i> Admin</a>`;
    document.getElementById('loginBtnLabel').textContent = 'Login as ' + tab.charAt(0).toUpperCase() + tab.slice(1);

    let foot = '';
    if (tab === 'staff') {
      foot = `<i class="bi bi-lock"></i> Forgot your password? Please contact your administrator to reset it.`;
    } else if (tab === 'admin') {
      foot = `<a href="${pageUrl('/auth/admin-reset-password.html')}">Forgot password?</a>`;
    }
    document.getElementById('authFoot').innerHTML = foot;
  }

  async function init() {
    await loadSession();
    if (CURRENT_USER) {
      const home = CURRENT_USER.role === 'staff' ? '/staff/dashboard.html' : '/admin/dashboard.html';
      window.location.href = pageUrl(home);
      return;
    }
    renderTabs();
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('expected_role', tab);
    const { data } = await apiPost('/auth/login.php', form);
    if (data.success) {
      window.location.href = pageUrl(data.redirect);
    } else {
      showFlash(data.message || 'Login failed.', 'error');
    }
  });

  init();
})();
