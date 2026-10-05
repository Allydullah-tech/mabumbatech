(async function () {
  await loadSession();

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const { data } = await apiPost('/auth/register.php', form);
    if (data.success) {
      window.location.href = pageUrl('/auth/login.html?as=customer&registered=' + encodeURIComponent(data.username));
    } else {
      showFlash(data.message || 'Registration failed.', 'error');
    }
  });
})();
