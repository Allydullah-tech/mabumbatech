/** Copy-to-clipboard helper used on pages that show a tracking code. */
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  navigator.clipboard.writeText(btn.getAttribute('data-copy'));
  const original = btn.innerHTML;
  btn.innerHTML = '<i class="bi bi-check2"></i> Copied';
  setTimeout(function () { btn.innerHTML = original; }, 1500);
});
