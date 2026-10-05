/**
 * Lawyer Desk — legal notes, legal documents, reported issues/cases/emergencies.
 * The Lawyer gets full control of their own records; General Manager, Super Admin
 * and Generic Admin get the very same page in view-only mode (the backend enforces
 * this independently — hiding buttons here is only convenience).
 */
const API = '/admin/legal-records.php';
const esc = (v) => escapeHtml(v);
let DATA = null;
let CAN_WRITE = false;
let TAB = 'cases';
let CASE_FILTER = 'all';
let DEEP_LINK_ID = 0;

const TYPE_META = {
  issue:     { label: 'Legal issue', icon: 'bi-exclamation-circle', hint: 'A concern or risk that needs attention' },
  case:      { label: 'Legal case', icon: 'bi-briefcase', hint: 'A dispute, claim or proceeding' },
  emergency: { label: 'Emergency', icon: 'bi-exclamation-octagon', hint: 'Urgent — needs immediate action' },
};
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

const caseRef = (id) => 'LC-' + String(id).padStart(4, '0');
function fmtDate(dt, withTime) {
  if (!dt) return '—';
  const d = new Date(String(dt).replace(' ', 'T'));
  if (isNaN(d)) return esc(dt);
  let out = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (withTime) out += ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return out;
}
function fmtSize(b) {
  b = Number(b || 0);
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}
const typePill = (t) => `<span class="ld-pill t-${esc(t)}"><i class="bi ${TYPE_META[t]?.icon || 'bi-dot'}"></i>${esc(TYPE_META[t]?.label || t)}</span>`;
const priorityPill = (p) => `<span class="ld-pill p-${esc(p)}">${esc(PRIORITY_LABEL[p] || p)}</span>`;
const statusPill = (s) => `<span class="ld-pill s-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
const root = () => document.getElementById('pageBody');

/* ------------------------------------------------------------------ data */
async function load() {
  const { ok, data } = await apiGet(API);
  if (!ok || data.can_write === undefined) {
    root().innerHTML = `<div class="empty-state"><i class="bi bi-shield-lock"></i>${esc(data.message || 'You do not have access to this page.')}</div>`;
    return false;
  }
  DATA = data;
  CAN_WRITE = !!data.can_write;
  return true;
}

async function reloadAndShow(tab) {
  if (tab) TAB = tab;
  if (await load()) renderList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ list view */
function renderList() {
  const cases = DATA.cases, notes = DATA.notes, docs = DATA.documents;
  const openCases = cases.filter(c => c.status === 'open' || c.status === 'in_progress');
  const emergencies = openCases.filter(c => c.record_type === 'emergency');

  const actions = CAN_WRITE ? `
    <div class="ld-actions">
      <button class="btn btn-primary" onclick="openCaseForm(0)"><i class="bi bi-flag"></i> Report issue</button>
      <button class="btn btn-light" onclick="openNoteForm(0)"><i class="bi bi-journal-plus"></i> New note</button>
      <button class="btn btn-light" onclick="openDocForm(0)"><i class="bi bi-cloud-arrow-up"></i> Upload document</button>
    </div>` : `<span class="ld-viewonly"><i class="bi bi-eye"></i> View-only access</span>`;

  const stat = (icon, tone, label, n) => `
    <div class="card stat-card"><div class="ic ${tone}"><i class="bi ${icon}"></i></div><div><b>${n}</b><span>${label}</span></div></div>`;

  const tab = (key, label, n) => `<a href="#" data-tab="${key}" class="${TAB === key ? 'active' : ''}">${label} (${n})</a>`;

  root().innerHTML = `
    <div class="ld-head">
      <div>
        <h2>${CAN_WRITE ? 'Lawyer Desk' : 'Legal Records'}</h2>
        <p>${CAN_WRITE
          ? 'Your legal notes, company legal documents, and reported issues, cases and emergencies — all in one place.'
          : 'Notes, documents and reported matters submitted by the Lawyer. You can view and download them, but not change them.'}</p>
      </div>
      ${actions}
    </div>

    <div class="grid grid-4 ld-kpis">
      ${stat('bi-flag', 'orange', 'Open cases &amp; issues', openCases.length)}
      ${stat('bi-exclamation-octagon', 'red', 'Open emergencies', emergencies.length)}
      ${stat('bi-journal-text', 'blue', 'Legal notes', notes.length)}
      ${stat('bi-folder2-open', 'green', 'Legal documents', docs.length)}
    </div>

    <div class="tabs-row" id="ldTabs">
      ${tab('cases', 'Cases &amp; Issues', cases.length)}
      ${tab('notes', 'Legal Notes', notes.length)}
      ${tab('documents', 'Documents', docs.length)}
    </div>

    <div class="panel" id="ldPanel"></div>`;

  document.querySelectorAll('#ldTabs a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault(); TAB = a.dataset.tab; renderList();
  }));

  if (TAB === 'notes') renderNotes();
  else if (TAB === 'documents') renderDocuments();
  else renderCases();
}

function emptyBox(icon, text, btn) {
  return `<div class="empty-state"><i class="bi ${icon}"></i>${text}${btn ? `<div style="margin-top:12px;">${btn}</div>` : ''}</div>`;
}

/* ---- cases ---- */
function renderCases() {
  const all = DATA.cases;
  const rows = all.filter(c => CASE_FILTER === 'all' || c.status === CASE_FILTER);
  const cnt = (s) => all.filter(c => s === 'all' || c.status === s).length;
  const chip = (k, l) => `<a href="#" data-f="${k}" class="${CASE_FILTER === k ? 'active' : ''}">${l} (${cnt(k)})</a>`;

  document.getElementById('ldPanel').innerHTML = `
    <div class="panel-head"><h3><i class="bi bi-flag"></i> Cases &amp; Issues</h3>
      <span class="small">${all.length} record${all.length === 1 ? '' : 's'}</span></div>
    <div class="tabs-row ld-filters" id="ldCaseFilters">${chip('all', 'All')}${chip('open', 'Open')}${chip('in_progress', 'In progress')}${chip('resolved', 'Resolved')}${chip('closed', 'Closed')}</div>
    ${rows.length ? `
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Ref</th><th>Type</th><th>Title</th><th>Priority</th><th>Status</th>${CAN_WRITE ? '' : '<th>Reported by</th>'}<th>Reported</th><th></th></tr></thead>
      <tbody>${rows.map(c => `
        <tr class="ld-clickable" onclick="openCaseForm(${c.id})">
          <td><span class="ld-ref">${caseRef(c.id)}</span></td>
          <td>${typePill(c.record_type)}</td>
          <td><div class="ld-row-title">${esc(c.title)}</div><div class="ld-row-sub">${esc(c.description)}</div></td>
          <td>${priorityPill(c.priority)}</td>
          <td>${statusPill(c.status)}</td>
          ${CAN_WRITE ? '' : `<td class="small">${esc(c.author_name)}</td>`}
          <td class="small" style="white-space:nowrap;">${fmtDate(c.created_at)}</td>
          <td onclick="event.stopPropagation()"><div class="ld-row-actions">
            ${CAN_WRITE
              ? `<button class="btn btn-light btn-sm" onclick="openCaseForm(${c.id})" title="Edit"><i class="bi bi-pencil"></i></button>`
              : `<button class="btn btn-light btn-sm" onclick="openCaseForm(${c.id})" title="View"><i class="bi bi-eye"></i> View</button>`}
          </div></td>
        </tr>`).join('')}</tbody>
    </table></div>`
    : emptyBox('bi-inbox', all.length ? 'No records with this status.' : (CAN_WRITE ? 'You have not reported anything yet.' : 'Nothing has been reported yet.'),
        CAN_WRITE && !all.length ? '<button class="btn btn-primary btn-sm" onclick="openCaseForm(0)"><i class="bi bi-flag"></i> Report an issue</button>' : '')}`;

  document.querySelectorAll('#ldCaseFilters a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault(); CASE_FILTER = a.dataset.f; renderCases();
  }));
}

/* ---- notes ---- */
function renderNotes() {
  const notes = DATA.notes;
  document.getElementById('ldPanel').innerHTML = `
    <div class="panel-head"><h3><i class="bi bi-journal-text"></i> Legal Notes</h3>
      <span class="small">${notes.length} note${notes.length === 1 ? '' : 's'}</span></div>
    ${notes.length ? `<div class="ld-notes">${notes.map(n => `
      <div class="ld-note" onclick="openNoteForm(${n.id})">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <h4>${esc(n.title)}</h4><span class="ld-pill">${esc(n.category)}</span>
        </div>
        <p>${esc(n.body)}</p>
        <div class="ld-note-foot">
          <span>${CAN_WRITE ? 'Updated ' + fmtDate(n.updated_at) : esc(n.author_name) + ' · ' + fmtDate(n.updated_at)}</span>
          ${CAN_WRITE ? `<button class="btn btn-light btn-sm" onclick="event.stopPropagation();deleteNote(${n.id})" title="Delete"><i class="bi bi-trash"></i></button>` : ''}
        </div>
      </div>`).join('')}</div>`
    : emptyBox('bi-journal', CAN_WRITE ? 'No legal notes yet.' : 'No legal notes have been written yet.',
        CAN_WRITE ? '<button class="btn btn-primary btn-sm" onclick="openNoteForm(0)"><i class="bi bi-journal-plus"></i> Write a note</button>' : '')}`;
}

/* ---- documents ---- */
function renderDocuments() {
  const docs = DATA.documents;
  document.getElementById('ldPanel').innerHTML = `
    <div class="panel-head"><h3><i class="bi bi-folder2-open"></i> Legal Documents</h3>
      <span class="small">${docs.length} document${docs.length === 1 ? '' : 's'}</span></div>
    ${docs.length ? `
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Document</th><th>Type</th><th>File</th>${CAN_WRITE ? '' : '<th>Uploaded by</th>'}<th>Uploaded</th><th></th></tr></thead>
      <tbody>${docs.map(d => `
        <tr>
          <td style="min-width:220px;"><div class="ld-row-title">${esc(d.title)}</div>${d.description ? `<div class="ld-row-sub" style="white-space:normal;">${esc(d.description)}</div>` : ''}</td>
          <td><span class="ld-pill">${esc(d.doc_type)}</span></td>
          <td class="small"><i class="bi bi-paperclip"></i> ${esc(d.original_name)}<div>${fmtSize(d.file_size)}</div></td>
          ${CAN_WRITE ? '' : `<td class="small">${esc(d.author_name)}</td>`}
          <td class="small" style="white-space:nowrap;">${fmtDate(d.created_at)}</td>
          <td><div class="ld-row-actions">
            <a class="btn btn-light btn-sm" href="${apiUrl(API + '?download=' + d.id)}" title="Download"><i class="bi bi-download"></i> Download</a>
            ${CAN_WRITE ? `
              <button class="btn btn-light btn-sm" onclick="openDocForm(${d.id})" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-light btn-sm" onclick="deleteDoc(${d.id})" title="Delete"><i class="bi bi-trash"></i></button>` : ''}
          </div></td>
        </tr>`).join('')}</tbody>
    </table></div>`
    : emptyBox('bi-folder2', CAN_WRITE ? 'No legal documents uploaded yet.' : 'No legal documents have been uploaded yet.',
        CAN_WRITE ? '<button class="btn btn-primary btn-sm" onclick="openDocForm(0)"><i class="bi bi-cloud-arrow-up"></i> Upload a document</button>' : '')}`;
}

/* ------------------------------------------------------------------ full-page forms */
function formShell({ title, sub, body, submitLabel, submitIcon, readOnly, metaHtml, noticeHtml }) {
  root().innerHTML = `
    <div class="ld-form-wrap">
      <button type="button" class="ld-back" onclick="backToList()"><i class="bi bi-arrow-left"></i> Back to ${TAB === 'notes' ? 'notes' : TAB === 'documents' ? 'documents' : 'cases &amp; issues'}</button>
      <div class="panel">
        <div class="ld-form-head"><h2>${title}</h2><p>${sub}</p></div>
        ${metaHtml ? `<div class="ld-meta" style="padding-top:12px;">${metaHtml}</div>` : ''}
        <form id="ldForm" class="ld-form" enctype="multipart/form-data" novalidate>
          <fieldset ${readOnly ? 'disabled' : ''}>${body}</fieldset>
        </form>
        ${noticeHtml || ''}
        <div class="ld-form-foot">
          ${readOnly ? '' : `<button type="submit" form="ldForm" class="btn btn-primary" id="ldSubmit"><i class="bi ${submitIcon}"></i> ${submitLabel}</button>`}
          <button type="button" class="btn btn-light" onclick="backToList()">${readOnly ? 'Back' : 'Cancel'}</button>
        </div>
      </div>
    </div>`;
  window.scrollTo({ top: 0 });
}

function backToList() { renderList(); }

async function submitForm(action, extra) {
  const form = document.getElementById('ldForm');
  const btn = document.getElementById('ldSubmit');
  const fd = new FormData(form);
  fd.append('action', action);
  Object.entries(extra || {}).forEach(([k, v]) => fd.append(k, v));
  if (btn) btn.disabled = true;
  const { data } = await apiPost(API, fd);
  if (btn) btn.disabled = false;
  showFlash(data.message || 'Something went wrong.', data.success ? 'success' : 'error');
  return !!data.success;
}

const opts = (list, selected) => list.map(o => `<option value="${esc(o)}" ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('');

/* ---- issue / case / emergency ---- */
function openCaseForm(id) {
  TAB = 'cases';
  const c = id ? DATA.cases.find(x => Number(x.id) === Number(id)) : null;
  if (id && !c) { showFlash('That record could not be found.', 'error'); return; }
  const ro = !CAN_WRITE;
  const type = c ? c.record_type : 'issue';

  const typeCards = Object.entries(TYPE_META).map(([k, m]) => `
    <label class="ld-type t-${k}"><input type="radio" name="record_type" value="${k}" ${k === type ? 'checked' : ''}>
      <span><i class="bi ${m.icon}"></i><b>${m.label}</b><small>${m.hint}</small></span></label>`).join('');

  const body = `
    <label class="ld-label">What are you reporting?</label>
    <div class="ld-types">${typeCards}</div>
    <div class="form-group"><label>Title</label><input type="text" name="title" maxlength="200" required placeholder="e.g. Supplier contract breach — Dodoma delivery" value="${esc(c?.title)}"></div>
    <div class="form-row">
      <div class="form-group"><label>Priority</label>
        <select name="priority">${Object.entries(PRIORITY_LABEL).map(([k, l]) => `<option value="${k}" ${k === (c?.priority || 'medium') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-group"><label>Date it happened</label><input type="date" name="incident_date" value="${esc(c?.incident_date || '')}"></div>
      ${c ? `<div class="form-group"><label>Status</label>
        <select name="status">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="form-group"><label>Parties involved <span class="small">(optional)</span></label><input type="text" name="parties" maxlength="255" placeholder="People, companies or authorities involved" value="${esc(c?.parties)}"></div>
    <div class="form-group"><label>What happened</label><textarea name="description" required placeholder="Describe the situation clearly: what, when, who, and why it matters.">${esc(c?.description)}</textarea></div>
    <div class="form-group"><label>Action taken or recommended <span class="small">(optional)</span></label><textarea name="action_taken" placeholder="Steps already taken, and what you recommend management does next.">${esc(c?.action_taken)}</textarea></div>`;

  const meta = c ? `<span><b>${caseRef(c.id)}</b></span><span>Reported by ${esc(c.author_name)}</span><span>${fmtDate(c.created_at, true)}</span>${c.updated_at !== c.created_at ? `<span>Last updated ${fmtDate(c.updated_at, true)}</span>` : ''}` : '';

  formShell({
    title: c ? (ro ? 'Legal record' : 'Edit legal record') : 'Report a legal issue, case or emergency',
    sub: ro ? 'View-only — only the Lawyer can change this record.' : (c ? 'Update the details or move it to a new status.' : 'Management is notified as soon as you submit.'),
    body, readOnly: ro, metaHtml: meta,
    submitLabel: c ? 'Save changes' : 'Submit report', submitIcon: c ? 'bi-check2-circle' : 'bi-send',
  });

  document.getElementById('ldForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await submitForm('save_case', c ? { id: c.id } : {})) reloadAndShow('cases');
  });
}

/* ---- note ---- */
function openNoteForm(id) {
  TAB = 'notes';
  const n = id ? DATA.notes.find(x => Number(x.id) === Number(id)) : null;
  if (id && !n) { showFlash('That note could not be found.', 'error'); return; }
  const ro = !CAN_WRITE;
  const body = `
    <div class="form-row">
      <div class="form-group" style="flex:2 1 280px;"><label>Title</label><input type="text" name="title" maxlength="200" required placeholder="e.g. Advice on the office lease renewal" value="${esc(n?.title)}"></div>
      <div class="form-group"><label>Category</label><select name="category">${opts(DATA.options.note_categories, n?.category || 'General')}</select></div>
    </div>
    <div class="form-group"><label>Note</label><textarea class="tall" name="body" required placeholder="Write your legal note here…">${esc(n?.body)}</textarea></div>`;
  const meta = n ? `<span>By ${esc(n.author_name)}</span><span>Created ${fmtDate(n.created_at, true)}</span>${n.updated_at !== n.created_at ? `<span>Updated ${fmtDate(n.updated_at, true)}</span>` : ''}` : '';

  formShell({
    title: n ? (ro ? 'Legal note' : 'Edit legal note') : 'New legal note',
    sub: ro ? 'View-only — only the Lawyer can change this note.' : 'Notes are saved to the legal records and visible to management (view-only).',
    body, readOnly: ro, metaHtml: meta, submitLabel: 'Save note', submitIcon: 'bi-check2-circle',
  });
  document.getElementById('ldForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await submitForm('save_note', n ? { id: n.id } : {})) reloadAndShow('notes');
  });
}

async function deleteNote(id) {
  if (!confirm('Delete this note permanently?')) return;
  const { data } = await apiPost(API, { action: 'delete_note', id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) reloadAndShow('notes');
}

/* ---- document ---- */
function openDocForm(id) {
  TAB = 'documents';
  if (!CAN_WRITE) return;
  const d = id ? DATA.documents.find(x => Number(x.id) === Number(id)) : null;
  if (id && !d) { showFlash('That document could not be found.', 'error'); return; }
  const body = `
    <div class="form-row">
      <div class="form-group" style="flex:2 1 280px;"><label>Document title</label><input type="text" name="title" maxlength="200" required placeholder="e.g. Business licence 2026" value="${esc(d?.title)}"></div>
      <div class="form-group"><label>Type</label><select name="doc_type">${opts(DATA.options.doc_types, d?.doc_type || 'Other')}</select></div>
    </div>
    <div class="form-group"><label>Description <span class="small">(optional)</span></label><textarea name="description" maxlength="500" style="min-height:90px;" placeholder="What is this document and why does the company keep it?">${esc(d?.description)}</textarea></div>
    <div class="form-group"><label>${d ? 'Replace file <span class="small">(optional)</span>' : 'File'}</label>
      ${d ? `<div class="ld-current-file"><i class="bi bi-paperclip"></i> ${esc(d.original_name)} · ${fmtSize(d.file_size)}</div>` : ''}
      <input type="file" name="file" ${d ? '' : 'required'} accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt">
      <span class="ld-hint">PDF, Word, Excel, PowerPoint, images, ZIP or text — up to 10&nbsp;MB.</span></div>`;

  formShell({
    title: d ? 'Edit legal document' : 'Upload a legal document',
    sub: 'Company legal documents are stored privately and are only visible to you and to management (view-only).',
    body, readOnly: false, submitLabel: d ? 'Save changes' : 'Upload document', submitIcon: d ? 'bi-check2-circle' : 'bi-cloud-arrow-up',
  });
  document.getElementById('ldForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!d && !e.target.file.files.length) { showFlash('Please choose the document file to upload.', 'error'); return; }
    if (await submitForm('save_document', d ? { id: d.id } : {})) reloadAndShow('documents');
  });
}

async function deleteDoc(id) {
  if (!confirm('Delete this document and its file permanently?')) return;
  const { data } = await apiPost(API, { action: 'delete_document', id });
  showFlash(data.message, data.success ? 'success' : 'error');
  if (data.success) reloadAndShow('documents');
}

/* ------------------------------------------------------------------ boot */
(async function () {
  const user = await initDashLayout({
    pageTitle: 'Legal Desk', crumb: 'Admin / Legal', activeKey: 'legal-desk',
    allowedRoles: ['admin'],
    anyPermission: ['legal.manage', 'legal.records.view'],
  });
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  if (['cases', 'notes', 'documents'].includes(params.get('tab'))) TAB = params.get('tab');
  DEEP_LINK_ID = parseInt(params.get('id') || '0', 10) || 0;

  if (!(await load())) return;
  if (DEEP_LINK_ID && TAB === 'cases' && DATA.cases.some(c => Number(c.id) === DEEP_LINK_ID)) {
    openCaseForm(DEEP_LINK_ID);
  } else {
    renderList();
  }
})();
