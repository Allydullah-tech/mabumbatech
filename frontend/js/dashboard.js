/** Small reusable modal helpers used across dashboard pages. */
function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

/**
 * Every modal must have a clear, reliable way to cancel/close it — not just
 * the visible X button. This adds two more standard escape hatches on top
 * of the existing `.modal-close` (X) buttons already in the markup:
 *   1. Clicking the dimmed backdrop outside the modal box closes it.
 *   2. Pressing Escape closes whichever modal is currently open.
 * Both only ever close a modal — they never submit or trigger any action —
 * so this is purely a UX safety net, added once, globally.
 */
document.addEventListener('click', function (e) {
  if (e.target.classList && e.target.classList.contains('modal-bg') && e.target.classList.contains('show')) {
    e.target.classList.remove('show');
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-bg.show').forEach(function (el) { el.classList.remove('show'); });
});
