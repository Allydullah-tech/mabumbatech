/**
 * Customer Acquisition — customer sources ("By Source" tab) and the Source
 * drop-down used when registering a customer request.
 * Loaded BEFORE admin-marketing-acquisition.js, which calls initLeadsUI()
 * once the dashboard layout is ready (so the sidebar is only built once).
 *
 * The old leads pipeline (stages, quotations, negotiation) has been removed.
 */
const SOURCE_DETAIL_LABELS = {
  advertisement: 'Which advertisement? (where did they see it)',
  own_search: 'What did they search / where did they find us?',
  social_media: 'Which platform? (Facebook, Instagram, WhatsApp…)',
  referral: 'Who referred them?',
  website_contact: 'Details (optional)',
  phone_call: 'Details (optional)',
  walk_in: 'Details (optional)',
  email: 'Details (optional)',
  manual: 'Details (optional)',
  other: 'Please describe the source',
};

const leadState = { sources: {}, range: 'all' };

/* ------------------------------------------------------------- init/tabs */

async function initLeadsUI() {
  setupAcqTabs();

  // Source choices for the "New Customer Request" form come with the request list.
  const { data } = await apiGet('/admin/marketing-acquisition.php?status=all');
  leadState.sources = (data && data.sources) || {};
  fillSourceSelects();
  document.querySelectorAll('.js-source-select').forEach(sel => setupSourceFields(sel.closest('form')));

  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'sources') switchAcqTab('sources');
}

function setupAcqTabs() {
  document.querySelectorAll('#acqTabs a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); switchAcqTab(a.dataset.tab); }));
}

function switchAcqTab(tab) {
  document.querySelectorAll('#acqTabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  ['sources', 'requests'].forEach(t => { document.getElementById('tab-' + t).style.display = t === tab ? '' : 'none'; });
  if (tab === 'sources') loadSources();
}

/* ------------------------------------------------------- source dropdowns */

function fillSourceSelects() {
  const sourceOpts = Object.entries(leadState.sources).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('');
  document.querySelectorAll('.js-source-select').forEach(sel => {
    if (sel.dataset.filled) return;
    sel.insertAdjacentHTML('beforeend', sourceOpts);
    sel.dataset.filled = '1';
  });
}

function setupSourceFields(form) {
  if (!form) return;
  const sel = form.querySelector('.js-source-select');
  sel.addEventListener('change', () => updateSourceFields(form));
  form.addEventListener('reset', () => setTimeout(() => updateSourceFields(form), 0));
  updateSourceFields(form);
}

/** A details box (which ad, who referred…) appears once a source is chosen. */
function updateSourceFields(form) {
  const src = form.querySelector('.js-source-select').value;
  const detailGroup = form.querySelector('.js-detail-group');
  detailGroup.style.display = src ? '' : 'none';
  if (src) form.querySelector('.js-detail-label').textContent = SOURCE_DETAIL_LABELS[src] || 'Details (optional)';
}

/* ------------------------------------------------------- source analysis */

const SOURCE_RANGES = [['all', 'All time'], ['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year']];

async function loadSources() {
  document.getElementById('sourceRangeTabs').innerHTML = SOURCE_RANGES.map(([k, label]) => `<a href="#" data-range="${k}" class="${leadState.range === k ? 'active' : ''}">${label}</a>`).join('');
  document.querySelectorAll('#sourceRangeTabs a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); leadState.range = a.dataset.range; loadSources(); }));

  const { data } = await apiGet('/admin/marketing-acquisition.php?mode=sources&range=' + leadState.range);
  const rows = data.sources || [];
  const total = rows.reduce((n, r) => n + r.total, 0);
  const maxTotal = Math.max(1, ...rows.map(r => r.total));
  const top = rows.length ? rows.reduce((a, b) => (b.total > a.total ? b : a)) : null;

  document.getElementById('sourcesBody').innerHTML = `
    <div class="grid grid-3" style="margin-bottom:14px;">
      <div class="card stat-card"><div class="ic blue"><i class="bi bi-people"></i></div><div><b>${total}</b><span>Customers (${escapeHtml(data.range.label)})</span></div></div>
      <div class="card stat-card"><div class="ic orange"><i class="bi bi-award"></i></div><div><b style="font-size:.85rem;">${top ? escapeHtml(top.label) : '—'}</b><span>Top source${top ? ' (' + top.total + ')' : ''}</span></div></div>
      <div class="card stat-card"><div class="ic green"><i class="bi bi-diagram-3"></i></div><div><b>${rows.length}</b><span>Sources used</span></div></div>
    </div>

    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-head"><h3><i class="bi bi-bar-chart-line"></i> Which source brings the most customers?</h3></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Source</th><th>Customers</th><th>Share</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td style="min-width:220px;"><b>${escapeHtml(r.label)}</b>${top && r.source === top.source ? ' <span class="badge badge-ok">top</span>' : ''}
              <div class="source-bar"><div style="width:${Math.round(r.total * 100 / maxTotal)}%"></div></div></td>
            <td><b>${r.total}</b></td>
            <td>${total ? Math.round(r.total * 100 / total) : 0}%</td>
          </tr>`).join('') : '<tr><td colspan="3" class="empty-state"><i class="bi bi-bar-chart"></i>No customers recorded in this period yet.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
