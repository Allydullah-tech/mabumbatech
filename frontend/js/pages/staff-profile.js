(async function () {
  const user = await initDashLayout({ pageTitle: 'My Profile', crumb: 'Staff / My Profile', activeKey: 'profile', allowedRoles: ['staff'] });
  if (!user) return;

  const catLabels = {
    web_dev: 'Web Development', app_dev: 'App Development', software_hardware: 'Software & Hardware Solutions',
    it_consultancy: 'IT Consultancy', ai_ml: 'AI/ML Projects', multimedia: 'Multimedia/Animation Projects',
    graphics: 'Graphics Designing', other_services: 'All Other Digital Services',
  };

  document.getElementById('fullNameField').value = user.full_name;
  document.getElementById('usernameField').value = user.username;
  document.getElementById('emailField').value = user.email;
  document.getElementById('departmentField').value = catLabels[user.staff_category] || user.staff_category || '';
  document.getElementById('positionField').value = user.position_title || '';
  document.getElementById('profileForm').phone.value = user.phone || '';

  document.getElementById('avatarPreview').innerHTML = avatarHtml(user.full_name, user.avatar);
  document.getElementById('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('action', 'update_avatar');
    fd.append('avatar', file);
    const { data } = await apiPost('/staff/profile.php', fd);
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      user.avatar = data.avatar;
      document.getElementById('avatarPreview').innerHTML = avatarHtml(user.full_name, user.avatar);
      renderSidebar('profile');
    }
  });

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = e.target.phone.value;
    const { data } = await apiPost('/staff/profile.php', { action: 'update_profile', phone });
    showFlash(data.message, data.success ? 'success' : 'error');
  });
})();
