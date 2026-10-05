/**
 * MABUMBA TECH — Terms & Conditions (frontend).
 *
 * The actual wording lives in one place server-side
 * (backend/includes/terms_content.php) and is fetched here as JSON, so the
 * dedicated /public/terms.html page, the "read before you agree" modal
 * (registration + service-request forms), and the downloadable PDF
 * (backend/api/public/terms-pdf.php) can never drift out of sync.
 */

let _termsDataPromise = null;

/** Fetches (once, then cached for the page's lifetime) { version, updated, sections }. */
function fetchTermsData() {
    if (!_termsDataPromise) {
        _termsDataPromise = apiGet('/public/terms-content.php').then(({ data }) => data);
    }
    return _termsDataPromise;
}

/** Builds a table-of-contents + numbered sections HTML block from the fetched data. */
function renderTermsSectionsHtml(data) {
    const toc = data.sections
        .filter((s) => s.id !== 'intro')
        .map((s) => `<li><a href="#terms-${s.id}">${escapeHtml(s.title)}</a></li>`)
        .join('');

    const body = data.sections
        .map((s) => `<div id="terms-${s.id}" class="terms-section"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p></div>`)
        .join('');

    return `
    <p class="small">Version ${escapeHtml(data.version)} &middot; Last updated ${escapeHtml(data.updated)}</p>
    <div class="terms-toc"><h4>Contents</h4><ul>${toc}</ul></div>
    ${body}`;
}

/** The "Download PDF" link, shared by the modal and the dedicated page. */
function termsDownloadButtonHtml() {
    return `<a class="btn btn-outline btn-sm" href="${apiUrl('/public/terms-pdf.php')}" download><i class="bi bi-file-earmark-pdf"></i> Download PDF</a>`;
}

/**
 * Opens the read-only Terms & Conditions modal. Injects the modal markup on
 * first use (with a brief loading state while the content is fetched), then
 * just toggles it open on subsequent calls. Works on any page that has
 * loaded style.css/forms.css (for .terms-modal-* styles) and this script.
 */
function openTermsModal() {
    let bg = document.getElementById('termsModalBg');
    if (!bg) {
        bg = document.createElement('div');
        bg.id = 'termsModalBg';
        bg.className = 'terms-modal-bg';
        bg.innerHTML = `
      <div class="terms-modal-box" role="dialog" aria-modal="true" aria-labelledby="termsModalTitle">
        <div class="terms-modal-head">
          <h3 id="termsModalTitle"><i class="bi bi-file-earmark-text"></i> Terms &amp; Conditions</h3>
          <button type="button" class="terms-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="terms-modal-body" id="termsModalBody"><p class="small"><i class="bi bi-hourglass-split"></i> Loading…</p></div>
        <div class="terms-modal-foot">
          <span id="termsModalDownload"></span>
          <button type="button" class="btn btn-primary btn-sm terms-modal-ok">Close</button>
        </div>
      </div>`;
        document.body.appendChild(bg);

        const close = () => bg.classList.remove('show');
        bg.querySelector('.terms-modal-close').addEventListener('click', close);
        bg.querySelector('.terms-modal-ok').addEventListener('click', close);
        bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && bg.classList.contains('show')) close();
        });

        fetchTermsData().then((data) => {
            document.getElementById('termsModalBody').innerHTML = renderTermsSectionsHtml(data);
            document.getElementById('termsModalDownload').innerHTML = termsDownloadButtonHtml();
        }).catch(() => {
            document.getElementById('termsModalBody').innerHTML = '<p class="small">Could not load the Terms & Conditions right now. Please try again, or reach us at mabumbatech@gmail.com.</p>';
        });
    }
    bg.classList.add('show');
}

/**
 * Renders the full Terms & Conditions page into the given container id —
 * used by terms.html. Includes the same table of contents/sections as the
 * modal, plus a Download PDF button up top.
 */
function renderTermsPage(containerId) {
    const el = document.getElementById(containerId);
    fetchTermsData().then((data) => {
        el.innerHTML = `<div class="terms-page-head">${termsDownloadButtonHtml()}</div>` + renderTermsSectionsHtml(data);
    }).catch(() => {
        el.innerHTML = '<p>Could not load the Terms & Conditions right now. Please try again, or reach us at mabumbatech@gmail.com.</p>';
    });
}

/** Any link/button with data-open-terms opens the modal instead of navigating away. */
document.addEventListener('click', function (e) {
    const trigger = e.target.closest('[data-open-terms]');
    if (!trigger) return;
    e.preventDefault();
    openTermsModal();
});
