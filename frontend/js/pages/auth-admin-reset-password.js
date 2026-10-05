(async function () {
  await loadSession();

  const token = new URLSearchParams(window.location.search).get('token');
  const requestForm = document.getElementById('requestForm');
  const resetForm = document.getElementById('resetForm');

  if (token) {
    requestForm.style.display = 'none';
    resetForm.style.display = 'block';
  }

  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const submitBtn = requestForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const { data } = await apiPost('/auth/admin-forgot-password.php', { action: 'request_reset', email });
    showFlash(data.message || 'If that email belongs to an administrator account, a reset link has been sent.', 'success');
    requestForm.reset();
    submitBtn.disabled = false;
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    form.append('action', 'reset_password');
    form.append('token', token || '');

    const { data } = await apiPost('/auth/admin-forgot-password.php', form);
    if (data.success) {
      showFlash(data.message, 'success');
      setTimeout(() => { window.location.href = pageUrl('/auth/login.html?as=admin'); }, 1200);
    } else {
      showFlash(data.message || 'Reset failed.', 'error');
    }
  });
})();
