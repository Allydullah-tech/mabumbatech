(async function () {
  const user = await initDashLayout({ pageTitle: 'Settings', crumb: 'Admin / System / Settings', activeKey: 'settings', allowedRoles: ['admin'], anyPermission: ['settings.manage'] });
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

  // ---- Social media links (Super Admin only; the API enforces this too) ----
  if (user.role === 'super_admin') {
    const panel = document.getElementById('socialPanel');
    const socialForm = document.getElementById('socialForm');
    const fields = document.getElementById('socialFields');

    const res = await apiGet('/admin/social-links.php');
    const platforms = (res.data && res.data.platforms) || [];
    if (res.ok && platforms.length) {
      fields.innerHTML = platforms.map(p => `
        <div class="form-group">
          <label for="url_${escapeHtml(p.key)}"><i class="bi ${escapeHtml(p.icon)}"></i> ${escapeHtml(p.label)}</label>
          <input type="text" inputmode="url" id="url_${escapeHtml(p.key)}" name="url_${escapeHtml(p.key)}"
                 maxlength="300" value="${escapeHtml(p.url || '')}" placeholder="${escapeHtml(p.placeholder || '')}">
          <div class="small" data-err-for="${escapeHtml(p.key)}" style="color:#c0392b; display:none;"></div>
        </div>`).join('');
      panel.style.display = '';

      socialForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        fields.querySelectorAll('[data-err-for]').forEach(el => { el.style.display = 'none'; el.textContent = ''; });
        const fd = new FormData(socialForm);
        fd.append('action', 'save_links');
        const { data } = await apiPost('/admin/social-links.php', fd);
        if (data.errors) {
          Object.entries(data.errors).forEach(([key, msg]) => {
            const el = fields.querySelector('[data-err-for="' + key + '"]');
            if (el) { el.textContent = msg; el.style.display = 'block'; }
          });
        }
        if (data.success && data.links) {
          // Show the cleaned-up values the server actually saved (e.g. https:// added).
          Object.entries(data.links).forEach(([key, url]) => {
            const input = socialForm.elements['url_' + key];
            if (input) input.value = url || '';
          });
        }
        showFlash(data.message || 'Could not save the social media links.', data.success ? 'success' : 'error');
      });
    }
  }
})();
