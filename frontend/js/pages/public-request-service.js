(async function () {
  await initPublicLayout(null);

  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('service') || '';

  // Customer accounts have been removed (system restructuring spec) — this
  // form is always the guest fields; there is no logged-in-customer branch
  // to skip them anymore.

  const { data } = await apiGet('/public/services.php');
  const select = document.getElementById('serviceSelect');
  const activeServices = data.services.filter(s => s.is_active == 1); // suspended services aren't requestable
  activeServices.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (String(s.id) === preselect) opt.selected = true;
    select.appendChild(opt);
  });
  // If someone deep-links to a now-suspended service, let them know instead of silently ignoring it.
  if (preselect && !activeServices.some(s => String(s.id) === preselect)) {
    showFlash('That service is currently unavailable. Please choose another below, or contact us.', 'info');
  }

  // ---- Attachment picker: shows the chosen files (the server keeps the first 3) ----
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const fileDrop = document.getElementById('fileDrop');
  const MAX_FILES = 3, MAX_BYTES = 10 * 1024 * 1024;
  const prettySize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function renderFiles() {
    const files = Array.from(fileInput.files || []);
    fileList.innerHTML = files.map((f, i) => {
      const bad = i >= MAX_FILES || f.size > MAX_BYTES;
      const why = i >= MAX_FILES ? 'not sent (max 3)' : f.size > MAX_BYTES ? 'over 10MB' : prettySize(f.size);
      return `<li class="${bad ? 'bad' : ''}"><i class="bi ${bad ? 'bi-exclamation-circle' : 'bi-paperclip'}"></i><span>${escapeHtml(f.name)}</span><em>${why}</em></li>`;
    }).join('');
  }
  if (fileInput) {
    fileInput.addEventListener('change', renderFiles);
    ['dragenter', 'dragover'].forEach(ev => fileDrop.addEventListener(ev, () => fileDrop.classList.add('drag')));
    ['dragleave', 'drop'].forEach(ev => fileDrop.addEventListener(ev, () => fileDrop.classList.remove('drag')));
  }

  document.getElementById('requestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const btnHtml = btn.innerHTML;
    if (btn.disabled) return;   // already sending — ignore a second click
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Sending…';
    const form = new FormData(e.target);
    const { data } = await apiPost('/public/request-service.php', form);
    btn.disabled = false;
    btn.innerHTML = btnHtml;
    if (data.success) {
      // Show the confirmation immediately on this page, per spec, rather
      // than whisking the visitor away to a separate tracking page.
      document.getElementById('requestWrap').style.display = 'none';
      document.getElementById('requestSuccessCode').textContent = data.tracking_code;
      document.getElementById('requestSuccessTrackLink').href =
        pageUrl('/public/track-request.html?code=' + encodeURIComponent(data.tracking_code));
      const success = document.getElementById('requestSuccess');
      success.style.display = 'block';
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showFlash(data.message || 'Something went wrong. Please try again.', 'error');
    }
  });
})();
