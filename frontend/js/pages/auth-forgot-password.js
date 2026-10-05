let FORGOT_IDENTITY = '';

(async function () {
  await loadSession();
})();

document.getElementById('identityForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const identity = e.target.identity.value.trim();
  const { data } = await apiPost('/auth/forgot-password.php', { action: 'get_question', identity });

  if (data.success) {
    FORGOT_IDENTITY = identity;
    document.getElementById('questionText').textContent = data.question;
    document.getElementById('identityForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'block';
  } else {
    showFlash(data.message || 'Could not find that account.', 'error');
  }
});

document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  form.append('action', 'verify_and_reset');
  form.append('identity', FORGOT_IDENTITY);

  const { data } = await apiPost('/auth/forgot-password.php', form);
  if (data.success) {
    showFlash(data.message, 'success');
    setTimeout(() => { window.location.href = pageUrl('/auth/login.html?as=customer'); }, 1200);
  } else {
    showFlash(data.message || 'Reset failed.', 'error');
  }
});
