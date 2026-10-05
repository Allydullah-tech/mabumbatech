(async function () {
  await initPublicLayout('contact');

  const formEl = document.getElementById('contactForm');
  const btn = document.getElementById('ctSubmit');
  const btnIcon = btn.querySelector('i');
  const btnText = btn.querySelector('span');
  let sending = false;

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;                      // ignore double clicks while a message is on its way
    sending = true;
    btn.disabled = true;
    btnIcon.className = 'bi bi-arrow-repeat ct-spin';
    btnText.textContent = 'Sending…';
    try {
      const { data } = await apiPost('/public/contact.php', new FormData(formEl));
      showFlash(data.message || 'Something went wrong. Please try again.', data.success ? 'success' : 'error');
      if (data.success) formEl.reset();
    } catch (err) {
      showFlash('Could not send your message. Please check your connection and try again.', 'error');
    } finally {
      sending = false;
      btn.disabled = false;
      btnIcon.className = 'bi bi-send';
      btnText.textContent = 'Send Message';
    }
  });
})();
