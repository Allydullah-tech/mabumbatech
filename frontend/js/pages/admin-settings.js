(async function () {
  const user = await initDashLayout({ pageTitle: 'Mail Settings', crumb: 'Admin / System / Mail Settings', activeKey: 'settings', allowedRoles: ['admin'], anyPermission: ['settings.manage'] });
  if (!user) return;

  document.getElementById('testEmailInput').value = user.email;

  const { data } = await apiGet('/admin/settings.php');
  const s = data.settings;
  const form = document.getElementById('mailForm');
  form.mail_method.value = s.mail_method || 'php_mail';
  form.mail_from_email.value = s.mail_from_email || '';
  form.mail_from_name.value = s.mail_from_name || '';
  form.smtp_host.value = s.smtp_host || '';
  form.smtp_port.value = s.smtp_port || '587';
  form.smtp_username.value = s.smtp_username || '';
  form.smtp_secure.value = s.smtp_secure || 'tls';

  const smtpFields = document.getElementById('smtpFields');
  function toggleSmtp() { smtpFields.style.display = form.mail_method.value === 'smtp' ? 'block' : 'none'; }
  form.mail_method.addEventListener('change', toggleSmtp);
  toggleSmtp();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    fd.append('action', 'save_mail');
    const { data } = await apiPost('/admin/settings.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
  });

  document.getElementById('testForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('action', 'send_test');
    const { data } = await apiPost('/admin/settings.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
  });
})();
