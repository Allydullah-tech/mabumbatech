/**
 * MABUMBA TECH — client-side app config
 * Since frontend/html/*.html files are pure static HTML (no PHP), the app's
 * root URL is detected here in JS instead of being injected server-side.
 */
const APP_ROOT = (function () {
  const path = window.location.pathname;
  const marker = '/frontend/';
  const idx = path.indexOf(marker);
  return idx === -1 ? '' : path.substring(0, idx);
})();

const API_BASE = APP_ROOT + '/backend/api';

/** Build a link to another page under frontend/html/, e.g. link('/admin/dashboard.html') */
function pageUrl(path) {
  return APP_ROOT + '/frontend/html' + path;
}

/** Build an absolute API URL, e.g. apiUrl('/admin/staff.php') */
function apiUrl(path) {
  return API_BASE + path;
}

let CSRF_TOKEN = null;
let CURRENT_USER = null;
let CURRENT_PERMISSIONS = [];

/** Fetch the logged-in user + CSRF token. Every dashboard/auth page calls this first. */
async function loadSession() {
  const res = await fetch(apiUrl('/auth/me.php'), { credentials: 'same-origin' });
  const data = await res.json();
  CSRF_TOKEN = data.csrf_token;
  CURRENT_USER = data.user;
  CURRENT_PERMISSIONS = data.permissions || [];
  if (CURRENT_USER && data.job_role_label) CURRENT_USER.job_role_label = data.job_role_label;
  return data;
}

/** True if the logged-in user has this permission key (see backend/includes/permissions.php). */
function hasPerm(key) {
  return CURRENT_PERMISSIONS.includes(key);
}

/** POST helper — sends FormData (works for both plain fields and file uploads) with CSRF attached. */
async function apiPost(path, formData) {
  if (!(formData instanceof FormData)) {
    const fd = new FormData();
    Object.entries(formData || {}).forEach(([k, v]) => fd.append(k, v));
    formData = fd;
  }
  if (CSRF_TOKEN) formData.append('csrf_token', CSRF_TOKEN);
  // Only a genuinely fully-qualified URL (http://...) is used as-is. Every other
  // path — including ones starting with '/', which is the convention used across
  // every page script — is resolved against the API base (APP_ROOT + /backend/api).
  const url = path.startsWith('http') ? path : apiUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  });
  let data;
  try { data = await res.json(); } catch (e) { data = { success: false, message: 'Unexpected server response.' }; }
  return { ok: res.ok, status: res.status, data };
}

async function apiGet(path) {
  const url = path.startsWith('http') ? path : apiUrl(path);
  const res = await fetch(url, { credentials: 'same-origin' });
  let data;
  try { data = await res.json(); } catch (e) { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

/** Small helpers used across pages */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/**
 * Renders a person's circular avatar: their uploaded photo if they have
 * one (backend/uploads/avatars/...), otherwise the first letter of their
 * name. Used everywhere a person's avatar appears — sidebar, dashboards,
 * management tables, Company Directory, and the public Team page.
 */
function avatarHtml(fullName, avatarFile) {
  const initial = escapeHtml((fullName || '?').charAt(0).toUpperCase());
  if (avatarFile) {
    return `<img src="${APP_ROOT}/backend/uploads/avatars/${encodeURIComponent(avatarFile)}" alt="${escapeHtml(fullName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
  return initial;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr.replace(' ', 'T'))) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
  const map = {
    pending: 'badge-warn', assigned: 'badge-info', in_progress: 'badge-info', review: 'badge-info',
    completed: 'badge-ok', delivered: 'badge-ok', cancelled: 'badge-off', new: 'badge-warn',
    accepted: 'badge-info', declined: 'badge-off', active: 'badge-ok', suspended: 'badge-off', done: 'badge-ok',
    // Sales/CRM pipeline (leads + quotations)
    contacted: 'badge-info', qualified: 'badge-info', quotation: 'badge-warn', negotiation: 'badge-warn',
    won: 'badge-ok', lost: 'badge-off', draft: 'badge-off', sent: 'badge-info', rejected: 'badge-off', expired: 'badge-off',
    planned: 'badge-info', paused: 'badge-off',
    // Leave requests
    approved: 'badge-ok',
  };
  const cls = map[status] || 'badge-info';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `<span class="badge ${cls}">${label}</span>`;
}

/**
 * Where a customer/lead came from — key => label. Mirrors lead_source_options()
 * in backend/includes/crm.php (the order here is the order shown in dropdowns).
 */
const LEAD_SOURCE_LABELS = {
  advertisement: 'Advertisement (saw our ad)',
  own_search: 'Own Search (Google / online)',
  social_media: 'Social Media',
  referral: 'Referral',
  website_contact: 'Website Contact Form',
  phone_call: 'Phone Call',
  walk_in: 'Walk-in',
  email: 'Email',
  manual: 'Direct Outreach',
  other: 'Other',
};

function leadSourceLabel(key) {
  return LEAD_SOURCE_LABELS[key] || String(key || '—').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Icon for a notification's `type` field — used in the bell dropdown and the full notifications page. */
function notificationIcon(type) {
  const map = {
    new_request: 'bi-inbox-fill', task_assigned: 'bi-person-check-fill', task_broadcast: 'bi-broadcast',
    task_completed: 'bi-check-circle-fill', status_change: 'bi-arrow-repeat', thread_message: 'bi-chat-dots-fill',
    project_link: 'bi-link-45deg', deadline_approaching: 'bi-alarm-fill', system_announcement: 'bi-megaphone-fill',
  };
  return map[type] || 'bi-bell-fill';
}

function toast(message, type = 'info') {
  let el = document.getElementById('toastBox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastBox';
    el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:500;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(el);
  }
  const item = document.createElement('div');
  item.className = 'alert alert-' + (type === 'error' ? 'err' : type === 'success' ? 'ok' : 'info');
  item.style.cssText = 'box-shadow:var(--shadow-lg);min-width:240px;';
  item.innerHTML = `<i class="bi bi-info-circle"></i> ${escapeHtml(message)}`;
  el.appendChild(item);
  setTimeout(() => { item.style.transition = 'opacity .4s'; item.style.opacity = '0'; setTimeout(() => item.remove(), 400); }, 4000);
}

/** Inline banner near the top of a page's content — used for one-off page-load messages. */
function showFlash(message, type = 'info') {
  const el = document.getElementById('flashContainer');
  if (!el) { toast(message, type); return; }
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'err' : type === 'success' ? 'ok' : 'info'}" data-autohide><i class="bi bi-info-circle"></i> ${escapeHtml(message)}</div>`;
  setTimeout(() => { const a = el.querySelector('.alert'); if (a) { a.style.transition = 'opacity .4s'; a.style.opacity = '0'; setTimeout(() => el.innerHTML = '', 400); } }, 4000);
}

/**
 * Show/hide toggle for every password field on the page. Runs automatically on
 * every page that loads config.js — no per-form setup needed. Safe to call more
 * than once (e.g. after a modal opens) since it skips fields already wrapped.
 */
function enablePasswordToggles(root) {
  (root || document).querySelectorAll('input[type="password"]').forEach(function (input) {
    if (input.dataset.toggleAdded) return;
    input.dataset.toggleAdded = '1';

    const wrap = document.createElement('div');
    wrap.className = 'password-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = '<i class="bi bi-eye"></i>';
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });
}

document.addEventListener('DOMContentLoaded', function () { enablePasswordToggles(); });
