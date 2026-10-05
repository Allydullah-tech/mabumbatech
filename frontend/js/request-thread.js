const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', customer: 'Customer', system: 'System' };

/**
 * Renders the attachments + Q&A thread panel into containerEl.
 * @param {HTMLElement} containerEl
 * @param {object} opts { attachments, thread, viewerId, viewerRole, canReply, apiPath (e.g. '/admin/requests.php'), requestId, downloadBase }
 */
function renderRequestThread(containerEl, opts) {
  const { attachments, thread, viewerId, viewerRole, canReply, apiPath, requestId } = opts;
  const canModerate = viewerRole === 'admin' || viewerRole === 'super_admin';

  // Keep the original (unescaped) message text around so the edit box can
  // be pre-filled without round-tripping through the DOM.
  const messageById = {};
  thread.forEach(m => { messageById[m.id] = m; });

  const attachmentsHtml = attachments.length
    ? attachments.map(a => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="bi bi-file-earmark-text" style="color:var(--blue-700);"></i>
          <div>
            <b style="font-size:.8rem;display:block;">${escapeHtml(a.original_name)}</b>
            <span class="small">${fileSizeHuman(a.file_size)} · uploaded by ${escapeHtml(a.full_name || 'Guest')} · ${timeAgo(a.created_at)}</span>
          </div>
        </div>
        <a class="btn btn-light btn-sm" href="${APP_ROOT}/backend/includes/download.php?id=${a.id}"><i class="bi bi-download"></i></a>
      </div>`).join('')
    : `<p class="small">No files attached to this request.</p>`;

  const threadHtml = thread.length ? thread.map(m => messageRowHtml(m, viewerId, canModerate)).join('') : '';

  containerEl.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><h3><i class="bi bi-paperclip"></i> Attachments (${attachments.length})</h3></div>
      <div class="panel-body">
        ${attachmentsHtml}
        ${canReply ? `
        <form id="uploadAttachmentForm" enctype="multipart/form-data" style="margin-top:12px;">
          <div class="form-row" style="align-items:end;">
            <div class="form-group"><label>Attach a file (optional)</label><input type="file" name="attachment"></div>
            <div class="form-group" style="flex:0;"><button class="btn btn-light btn-sm"><i class="bi bi-upload"></i> Upload</button></div>
          </div>
        </form>` : ''}
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><h3><i class="bi bi-chat-dots"></i> Questions &amp; Updates</h3></div>
      <div class="panel-body">
        <div id="threadMessages">${threadHtml || `<p class="small">No messages yet. Ask a question or post an update below.</p>`}</div>
        ${canReply ? `
        <form id="postMessageForm" style="margin-top:10px;">
          <div class="form-group"><textarea name="message" rows="3" placeholder="Write a question or update…" required></textarea></div>
          <button type="submit" class="btn btn-primary btn-sm"><i class="bi bi-send"></i> Send Message</button>
        </form>` : ''}
      </div>
    </div>`;

  if (canReply) {
    document.getElementById('uploadAttachmentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      fd.append('action', 'upload_attachment');
      fd.append('request_id', requestId);
      const { data } = await apiPost(apiPath, fd);
      showFlash(data.message, data.success ? 'success' : 'error');
      if (data.success && opts.onChange) opts.onChange();
    });

    const postForm = document.getElementById('postMessageForm');
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sendBtn = postForm.querySelector('button[type="submit"]');
      // Guard against a user mistakenly sending the same message twice —
      // a double-click, or hitting submit again while the first request is
      // still in flight. Once disabled, further clicks/submits are ignored
      // until this request finishes.
      if (sendBtn.disabled) return;

      const textarea = postForm.querySelector('textarea[name="message"]');
      const message = textarea.value.trim();
      if (!message) return;

      const originalBtnHtml = sendBtn.innerHTML;
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Sending…';

      try {
        const fd = new FormData();
        fd.append('action', 'post_message');
        fd.append('request_id', requestId);
        fd.append('message', message);
        const { data } = await apiPost(apiPath, fd);
        if (data.success) {
          textarea.value = '';
          if (opts.onChange) opts.onChange();
        } else {
          showFlash(data.message || 'Could not send message.', 'error');
        }
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalBtnHtml;
      }
    });
  }

  const messagesEl = document.getElementById('threadMessages');
  if (messagesEl) {
    messagesEl.addEventListener('click', (e) => handleThreadMessageClick(e, messagesEl, messageById, opts));
    messagesEl.addEventListener('submit', (e) => handleThreadMessageEditSubmit(e, messagesEl, apiPath, requestId, opts));
  }
}

/** Icon-only edit/delete controls + message body for one thread row. */
function messageRowHtml(m, viewerId, canModerate) {
  const mine = String(m.sender_id) === String(viewerId);
  const deleted = !!m.is_deleted;
  const canEdit = mine && !deleted;
  const canDelete = (mine || canModerate) && !deleted;

  const actionsHtml = (canEdit || canDelete) ? `
    <div style="display:flex;align-items:center;gap:6px;">
      ${canEdit ? iconButtonHtml('edit', m.id, 'bi-pencil', 'Edit message') : ''}
      ${canDelete ? iconButtonHtml('delete', m.id, 'bi-trash', 'Delete message', true) : ''}
    </div>` : '';

  return `
    <div class="thread-msg" data-msg-id="${m.id}" style="margin-bottom:12px;padding:10px 12px;border-radius:9px;background:${mine ? 'var(--blue-100)' : 'var(--blue-50)'};border:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:8px;">
        <b style="font-size:.78rem;">${escapeHtml(m.full_name || 'Guest')} <span class="badge badge-info" style="margin-left:4px;">${escapeHtml(ROLE_LABELS[m.sender_role] || m.sender_role)}</span></b>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="small">${timeAgo(m.created_at)}${(m.edited_at && !deleted) ? ' · <i>edited</i>' : ''}</span>
          ${actionsHtml}
        </div>
      </div>
      <div data-msg-body>${messageBodyHtml(m)}</div>
    </div>`;
}

function messageBodyHtml(m) {
  if (m.is_deleted) {
    return `<p class="small" style="margin:0;font-style:italic;"><i class="bi bi-slash-circle"></i> This message was deleted.</p>`;
  }
  return `<p style="margin:0;font-size:.82rem;white-space:pre-wrap;">${escapeHtml(m.message)}</p>`;
}

function iconButtonHtml(action, msgId, iconClass, title, danger) {
  const color = danger ? 'var(--danger)' : 'var(--blue-700)';
  return `<button type="button" data-msg-action="${action}" data-msg-id="${msgId}" title="${title}" aria-label="${title}"
    style="width:26px;height:26px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid var(--line);background:#fff;color:${color};cursor:pointer;">
    <i class="bi ${iconClass}" style="font-size:.85rem;"></i>
  </button>`;
}

function handleThreadMessageClick(e, messagesEl, messageById, opts) {
  const btn = e.target.closest('[data-msg-action]');
  if (!btn) return;

  const action = btn.getAttribute('data-msg-action');
  const msgId = btn.getAttribute('data-msg-id');
  const msgEl = messagesEl.querySelector(`.thread-msg[data-msg-id="${msgId}"]`);
  if (!msgEl) return;

  if (action === 'edit') {
    const orig = messageById[msgId];
    if (!orig) return;
    const bodyEl = msgEl.querySelector('[data-msg-body]');
    bodyEl.innerHTML = `
      <form data-edit-form style="margin:4px 0;">
        <textarea name="message" rows="3" style="width:100%;font-size:.82rem;" required>${escapeHtml(orig.message)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;">
          ${iconButtonHtml('save-edit', msgId, 'bi-check2', 'Save')}
          ${iconButtonHtml('cancel-edit', msgId, 'bi-x-lg', 'Cancel')}
        </div>
      </form>`;
    const ta = bodyEl.querySelector('textarea');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return;
  }

  if (action === 'cancel-edit') {
    const orig = messageById[msgId];
    if (!orig) return;
    msgEl.querySelector('[data-msg-body]').innerHTML = messageBodyHtml(orig);
    return;
  }

  if (action === 'delete') {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    if (btn.disabled) return;
    btn.disabled = true;
    (async () => {
      const fd = new FormData();
      fd.append('action', 'delete_message');
      fd.append('request_id', opts.requestId);
      fd.append('message_id', msgId);
      const { data } = await apiPost(opts.apiPath, fd);
      if (data.success) {
        if (opts.onChange) opts.onChange();
      } else {
        showFlash(data.message || 'Could not delete message.', 'error');
        btn.disabled = false;
      }
    })();
  }

  // 'save-edit' is a submit button inside data-edit-form — handled by the
  // form's submit listener below, not here.
}

function handleThreadMessageEditSubmit(e, messagesEl, apiPath, requestId, opts) {
  const form = e.target.closest('[data-edit-form]');
  if (!form) return;
  e.preventDefault();

  const msgEl = form.closest('.thread-msg');
  const msgId = msgEl ? msgEl.getAttribute('data-msg-id') : null;
  if (!msgId) return;

  const textarea = form.querySelector('textarea[name="message"]');
  const newMessage = textarea.value.trim();
  if (!newMessage) return;

  const saveBtn = form.querySelector('[data-msg-action="save-edit"]');
  if (saveBtn.disabled) return;
  saveBtn.disabled = true;

  (async () => {
    const fd = new FormData();
    fd.append('action', 'edit_message');
    fd.append('request_id', requestId);
    fd.append('message_id', msgId);
    fd.append('message', newMessage);
    const { data } = await apiPost(apiPath, fd);
    if (data.success) {
      if (opts.onChange) opts.onChange();
    } else {
      showFlash(data.message || 'Could not update message.', 'error');
      saveBtn.disabled = false;
    }
  })();
}

function fileSizeHuman(bytes) {
  bytes = Number(bytes);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
