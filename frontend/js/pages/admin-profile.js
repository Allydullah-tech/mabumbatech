(async function () {
  const user = await initDashLayout({ pageTitle: 'My Profile', crumb: 'Admin / My Profile', activeKey: 'profile', allowedRoles: ['admin'] });
  if (!user) return;

  const form = document.getElementById('profileForm');
  form.full_name.value = user.full_name;
  document.getElementById('usernameField').value = user.username;
  document.getElementById('emailField').value = user.email;
  form.phone.value = user.phone || '';
  form.position_title.value = user.position_title || '';

  document.getElementById('avatarPreview').innerHTML = avatarHtml(user.full_name, user.avatar);
  document.getElementById('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('action', 'update_avatar');
    fd.append('avatar', file);
    const { data } = await apiPost('/admin/profile.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      user.avatar = data.avatar;
      document.getElementById('avatarPreview').innerHTML = avatarHtml(user.full_name, user.avatar);
      renderSidebar('profile');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    fd.append('action', 'update_profile');
    const { data } = await apiPost('/admin/profile.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
  });

  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('action', 'change_password');
    const { data } = await apiPost('/admin/profile.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) e.target.reset();
  });
})();
