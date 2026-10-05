/**
 * Project Management panels — progress bar and project links.
 * Shared by staff/task-view and admin/requests(view) (customer- and
 * public-facing project views also use the progress bar and links panel).
 * Read-only rendering when `editable` is false; full add/delete controls
 * when `editable` is true (staff/admin).
 * Milestones were removed per the system restructuring spec ("remove
 * complicated milestones and unnecessary project-management features").
 */

function linkTypeMeta(type, linkTypes) {
  return (linkTypes && linkTypes[type]) || { label: 'Project Link', icon: 'bi-link-45deg', cta: 'Open Link' };
}

function renderProgressBar(progress) {
  const pct = Math.max(0, Math.min(100, parseInt(progress, 10) || 0));
  return `
    <div class="progress-block">
      <div class="progress-label"><span>Project Progress</span><span>${pct}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function renderLinksHtml(links, linkTypes, editable) {
  const cards = (links || []).map(l => {
    const meta = linkTypeMeta(l.link_type, linkTypes);
    return `
      <div class="link-card">
        <div class="link-card-body">
          <i class="bi ${meta.icon}"></i>
          <div>
            <div class="link-card-title">${escapeHtml(l.title)}</div>
            ${l.description ? `<div class="small">${escapeHtml(l.description)}</div>` : ''}
            ${editable ? `<div class="small">${parseInt(l.is_customer_visible, 10) === 1 ? '<span class="badge badge-ok">Customer-visible</span>' : '<span class="badge badge-off">Internal only</span>'}</div>` : ''}
          </div>
        </div>
        <div class="link-card-actions">
          <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-light btn-sm"><i class="bi bi-box-arrow-up-right"></i> ${escapeHtml(meta.cta)}</a>
          ${editable ? `<button type="button" class="btn btn-light btn-sm" onclick="window.__deleteProjectLink(${l.id})"><i class="bi bi-trash"></i></button>` : ''}
        </div>
      </div>`;
  }).join('');

  const list = cards || `<p class="small empty-state"><i class="bi bi-link-45deg"></i> No project links yet.</p>`;
  if (!editable) return `<div class="link-cards">${list}</div>`;

  const typeOptions = Object.entries(linkTypes || {}).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('');
  return `
    <div class="link-cards">${list}</div>
    <form id="addLinkForm" class="stacked-form" style="margin-top:10px;">
      <div class="form-group"><label>Link Title</label><input name="title" placeholder="e.g. Live Website" required></div>
      <div class="form-group"><label>URL</label><input name="url" type="url" placeholder="https://" required></div>
      <div class="form-group"><label>Type</label><select name="link_type">${typeOptions}</select></div>
      <div class="form-group"><label>Description (optional)</label><input name="description"></div>
      <label class="checkbox-row"><input type="checkbox" name="is_customer_visible"> Visible to customer</label>
      <button class="btn btn-light btn-sm"><i class="bi bi-plus-lg"></i> Add Link</button>
    </form>`;
}

/**
 * Wires the add-link form and the per-link delete control rendered above.
 * Call this once, right after the HTML from renderLinksHtml has been
 * inserted into the DOM. `onChange` is called after any successful
 * mutation so the caller can re-fetch and re-render.
 */
function wireProjectPanels({ apiPath, requestId, onChange }) {
  window.__deleteProjectLink = async (linkId) => {
    if (!confirm('Remove this link?')) return;
    const { data } = await apiPost(apiPath, { action: 'delete_link', request_id: requestId, link_id: linkId });
    showFlash(data.message, data.success ? 'success' : 'error');
    if (data.success) onChange();
  };

  const linkForm = document.getElementById('addLinkForm');
  if (linkForm) {
    linkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { data } = await apiPost(apiPath, {
        action: 'add_link', request_id: requestId,
        title: fd.get('title'), url: fd.get('url'), link_type: fd.get('link_type'),
        description: fd.get('description'), is_customer_visible: fd.get('is_customer_visible') ? 1 : 0,
      });
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success) onChange();
    });
  }
}
