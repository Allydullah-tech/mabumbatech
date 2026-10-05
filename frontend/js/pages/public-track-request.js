(async function () {
  await initPublicLayout('track');

  function fileSizeHuman(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || '';
  const phone = params.get('phone') || '';

  const tabByCode = document.getElementById('tabByCode');
  const tabByPhone = document.getElementById('tabByPhone');
  const trackForm = document.getElementById('trackForm');
  const phoneForm = document.getElementById('phoneForm');
  const phoneHint = document.getElementById('phoneHint');

  function showCodeTab() {
    tabByCode.classList.add('active');
    tabByPhone.classList.remove('active');
    trackForm.style.display = 'flex';
    phoneForm.style.display = 'none';
    phoneHint.style.display = 'none';
  }
  function showPhoneTab() {
    tabByPhone.classList.add('active');
    tabByCode.classList.remove('active');
    phoneForm.style.display = 'flex';
    trackForm.style.display = 'none';
    phoneHint.style.display = 'block';
  }

  tabByCode.addEventListener('click', (e) => { e.preventDefault(); showCodeTab(); });
  tabByPhone.addEventListener('click', (e) => { e.preventDefault(); showPhoneTab(); });

  document.getElementById('codeInput').value = code;
  document.getElementById('phoneInput').value = phone;

  trackForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = document.getElementById('codeInput').value.trim();
    window.location.href = pageUrl('/public/track-request.html') + (value ? '?code=' + encodeURIComponent(value) : '');
  });

  phoneForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = document.getElementById('phoneInput').value.trim();
    window.location.href = pageUrl('/public/track-request.html') + (value ? '?phone=' + encodeURIComponent(value) : '');
  });

  if (code || phone) document.getElementById('trackHelp').style.display = 'none';
  if (phone) showPhoneTab();
  if (code) await lookupByCode(code);
  if (phone) await lookupByPhone(phone);

  function requestCard(r, opts) {
    opts = opts || {};
    // Most requests are tied to a service; a product-interest request (e.g.
    // one a Marketing Officer registered on a customer's behalf) has no
    // service — fall back to the product name/type instead.
    const label = r.service_name || r.product_type_name || r.product_name || 'Product Request';
    const icon = r.icon || 'bi-box-seam';
    return `
      <article class="tr-card tr-card-main">
        <div class="tr-card-top">
          <span class="tag-pill"><i class="bi ${escapeHtml(icon)}"></i> ${escapeHtml(label)}</span>
          ${statusBadge(r.status)}
        </div>
        <h3>${escapeHtml(r.subject)}</h3>
        <p class="tr-msg">${escapeHtml(r.message)}</p>
        <dl class="tr-meta">
          <div><dt><i class="bi bi-upc-scan"></i> Tracking Code</dt><dd class="tr-code">${escapeHtml(r.tracking_code)}</dd></div>
          <div><dt><i class="bi bi-calendar-event"></i> Submitted</dt><dd>${new Date(r.created_at.replace(' ', 'T')).toLocaleString('en-GB')}</dd></div>
          ${r.status === 'completed' && r.completed_at ? `<div><dt><i class="bi bi-check-circle"></i> Completed</dt><dd>${new Date(r.completed_at.replace(' ', 'T')).toLocaleString('en-GB')}</dd></div>` : ''}
        </dl>
        ${opts.linkToDetail ? `<a class="btn btn-light btn-sm" href="${pageUrl('/public/track-request.html')}?code=${encodeURIComponent(r.tracking_code)}"><i class="bi bi-eye"></i> View Full Details</a>` : ''}
      </article>`;
  }

  function attachmentsHtml(attachments, trackingCode) {
    if (!attachments.length) return `<p class="tr-empty"><i class="bi bi-paperclip"></i> No files uploaded to this request yet.</p>`;
    return `<div class="tr-files">` + attachments.map(a => `
      <div class="tr-file">
        <div class="tr-file-info">
          <i class="bi bi-file-earmark-text"></i>
          <div>
            <b>${escapeHtml(a.original_name)}</b>
            <span>${fileSizeHuman(a.file_size)} · ${timeAgo(a.created_at)}</span>
          </div>
        </div>
        <a class="btn btn-light btn-sm" href="${APP_ROOT}/backend/includes/download.php?id=${a.id}&code=${encodeURIComponent(trackingCode)}"><i class="bi bi-download"></i> Download</a>
      </div>`).join('') + `</div>`;
  }

  function renderFullDetail(data) {
    const r = data.request;
    const staffHtml = data.assigned_staff.length
      ? `<div class="tr-people">` + data.assigned_staff.map(s => `<span class="tr-person"><i class="bi bi-person-check"></i> ${escapeHtml(s.full_name)}</span>`).join('') + `</div>`
      : `<p class="tr-empty"><i class="bi bi-person"></i> Not yet assigned to a specialist.</p>`;

    return `
      <section class="tr-card">
        <div class="tr-card-title"><i class="bi bi-graph-up-arrow"></i><h3>Progress</h3></div>
        ${renderProgressBar(r.progress)}
      </section>
      <section class="tr-card">
        <div class="tr-card-title"><i class="bi bi-person-check"></i><h3>Assigned To</h3></div>
        ${staffHtml}
      </section>
      <section class="tr-card">
        <div class="tr-card-title"><i class="bi bi-link-45deg"></i><h3>Project &amp; Deliverable Links</h3></div>
        ${renderLinksHtml(data.links, data.link_types, false)}
      </section>
      <section class="tr-card">
        <div class="tr-card-title"><i class="bi bi-paperclip"></i><h3>Files</h3><span class="tr-n">${data.attachments.length}</span></div>
        ${attachmentsHtml(data.attachments, r.tracking_code)}
      </section>`;
  }

  async function lookupByCode(c) {
    const { data } = await apiGet('/public/track-request.php?code=' + encodeURIComponent(c));
    const container = document.getElementById('resultContainer');
    if (data.searched && !data.request) {
      container.innerHTML = `<div class="tr-alert"><i class="bi bi-x-circle"></i><div>No request found for that tracking code.<span>Check the code and try again, or search with your phone number.</span></div></div>`;
      return;
    }
    if (!data.request) { container.innerHTML = ''; return; }
    container.innerHTML = requestCard(data.request, { wide: true }) + renderFullDetail(data);
  }

  async function lookupByPhone(p) {
    const { data } = await apiGet('/public/track-request.php?phone=' + encodeURIComponent(p));
    const container = document.getElementById('resultContainer');
    const requests = data.requests || [];
    if (data.searched && !requests.length) {
      container.innerHTML = `<div class="tr-alert"><i class="bi bi-x-circle"></i><div>No requests found for that phone number.<span>Check the number and try again, or search with your tracking code.</span></div></div>`;
      return;
    }
    if (!requests.length) { container.innerHTML = ''; return; }
    container.innerHTML = `<p class="tr-count"><b>${requests.length}</b> request${requests.length > 1 ? 's' : ''} found</p>` + requests.map(r => requestCard(r, { linkToDetail: true })).join('');
  }
})();
