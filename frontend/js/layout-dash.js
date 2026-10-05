function isAdminRole(role) { return role === 'admin' || role === 'super_admin'; }

/**
 * "Full Admin" = Super Admin, or an Admin with no job_role_key ("Generic
 * Administrator"). Mirrors is_full_admin() in backend/includes/session.php.
 * Sidebar hiding here is convenience only — every matching backend endpoint
 * (admins.php, staff.php, activity-log.php) enforces this independently via
 * api_require_full_admin(), so this can never be bypassed by editing the DOM.
 */
function isFullAdmin(user) {
  return user.role === 'super_admin' || (user.role === 'admin' && !user.job_role_key);
}

function roleLabel(role) {
  const map = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', customer: 'Customer' };
  return map[role] || role;
}

const CATEGORY_ICONS = {
  web_dev: 'bi-code-slash', app_dev: 'bi-phone', software_hardware: 'bi-cpu',
  it_consultancy: 'bi-diagram-3', ai_ml: 'bi-cpu-fill', multimedia: 'bi-film',
  graphics: 'bi-palette', other_services: 'bi-grid-3x3-gap',
};

const SIDEBAR_SCROLL_KEY = 'mbt_sidebar_scroll';

function renderSidebar(activeKey) {
  const user = CURRENT_USER;
  let navHtml = '';

  if (isAdminRole(user.role) && user.role !== 'super_admin' && user.job_role_key) {
    // Scoped job-role account (Secretary, Sales Officer, Accountant, ...):
    // build the nav from their permissions rather than showing every admin
    // page. Sidebar hiding is convenience, not the security boundary — the
    // matching backend endpoints enforce this independently.
    let ops = '';
    if (hasPerm('projects.view') || hasPerm('projects.manage')) ops += `<a href="${pageUrl('/admin/requests.html')}" class="${activeKey === 'requests' ? 'active' : ''}"><i class="bi bi-inboxes"></i> Service Requests</a>`;
    if (hasPerm('services.manage')) ops += `<a href="${pageUrl('/admin/services.html')}" class="${activeKey === 'services' ? 'active' : ''}"><i class="bi bi-grid-3x3-gap"></i> Services Catalogue</a>`;
    if (hasPerm('messages.manage')) ops += `<a href="${pageUrl('/admin/messages.html')}" class="${activeKey === 'messages' ? 'active' : ''}"><i class="bi bi-envelope"></i> Contact Messages</a>`;

    let sales = '';
    if (hasPerm('marketing.manage') || hasPerm('marketing.acquisition.manage')) sales += `<a href="${pageUrl('/admin/marketing-acquisition.html')}" class="${activeKey === 'marketing-acquisition' ? 'active' : ''}"><i class="bi bi-person-lines-fill"></i> Customer Acquisition</a>`;
    // The Operations Manager assigns product requests; the Sales Officer handles the ones forwarded to them.
    else if (['sales_officer', 'general_manager'].includes(user.job_role_key)) sales += `<a href="${pageUrl('/admin/marketing-acquisition.html')}" class="${activeKey === 'marketing-acquisition' ? 'active' : ''}"><i class="bi bi-bag-check"></i> Product Requests</a>`;
    if (hasPerm('finance.view') || hasPerm('finance.manage') || hasPerm('payroll.view') || hasPerm('payroll.manage')) sales += `<a href="${pageUrl('/admin/accountant.html')}" class="${activeKey === 'accountant' ? 'active' : ''}"><i class="bi bi-calculator"></i> Accountant Desk</a>`;
    if (hasPerm('legal.view') || hasPerm('legal.manage') || hasPerm('budget_requests.create') || hasPerm('budget_requests.manage')) sales += `<a href="${pageUrl('/admin/legal.html')}" class="${activeKey === 'legal' ? 'active' : ''}"><i class="bi bi-briefcase"></i> Legal &amp; Budget Requests</a>`;
    // Lawyer Desk: the Lawyer works in it; Manager (and Full Admins, below) get the same page view-only.
    if (user.job_role_key === 'lawyer' && hasPerm('legal.manage')) sales += `<a href="${pageUrl('/admin/legal-desk.html')}" class="${activeKey === 'legal-desk' ? 'active' : ''}"><i class="bi bi-journal-bookmark"></i> Lawyer Desk</a>`;
    else if (hasPerm('legal.records.view')) sales += `<a href="${pageUrl('/admin/legal-desk.html')}" class="${activeKey === 'legal-desk' ? 'active' : ''}"><i class="bi bi-journal-bookmark"></i> Legal Records</a>`;
    if (hasPerm('inventory.view') || hasPerm('inventory.manage')) ops += `<a href="${pageUrl('/admin/inventory.html')}" class="${activeKey === 'inventory' ? 'active' : ''}"><i class="bi bi-box-seam"></i> Inventory</a>`;
    if (hasPerm('inventory.sell') || hasPerm('inventory.manage')) ops += `<a href="${pageUrl('/admin/record-sale.html')}" class="${activeKey === 'record-sale' ? 'active' : ''}"><i class="bi bi-cart-check"></i> Record Sale</a>`;
    if (hasPerm('inventory.sell') || hasPerm('inventory.manage') || hasPerm('sales_overview.view') || hasPerm('finance.view') || hasPerm('finance.manage') || user.job_role_key === 'general_manager') ops += `<a href="${pageUrl('/admin/customer-debts.html')}" class="${activeKey === 'customer-debts' ? 'active' : ''}"><i class="bi bi-journal-text"></i> Customer Debts</a>`;
    if (hasPerm('sales_overview.view') || user.job_role_key === 'general_manager') ops += `<a href="${pageUrl('/admin/sales-overview.html')}" class="${activeKey === 'sales-overview' ? 'active' : ''}"><i class="bi bi-graph-up-arrow"></i> Sales &amp; Stock Overview</a>`;
    if (user.job_role_key === 'general_manager') ops += `<a href="${pageUrl('/admin/employees.html')}" class="${activeKey === 'employees' ? 'active' : ''}"><i class="bi bi-people"></i> Employees</a>`;

    navHtml = `
      <div class="group-title">Overview</div>
      <a href="${pageUrl('/admin/dashboard.html')}" class="${activeKey === 'dashboard' ? 'active' : ''}"><i class="bi bi-speedometer2"></i> Dashboard</a>
      <a href="${pageUrl('/notifications.html')}" class="${activeKey === 'notifications' ? 'active' : ''}"><i class="bi bi-bell"></i> Notifications</a>
      ${sales ? `<div class="group-title">Sales &amp; Marketing</div>${sales}` : ''}
      ${ops ? `<div class="group-title">Operations</div>${ops}` : ''}
      <div class="group-title">Company</div>
      <a href="${pageUrl('/company/directory.html')}" class="${activeKey === 'directory' ? 'active' : ''}"><i class="bi bi-people-fill"></i> Company Directory</a>
      <div class="group-title">Account</div>
      <a href="${pageUrl('/admin/profile.html')}" class="${activeKey === 'profile' ? 'active' : ''}"><i class="bi bi-person-gear"></i> My Profile</a>`;
  } else if (isAdminRole(user.role)) {
    navHtml = `
      <div class="group-title">Overview</div>
      <a href="${pageUrl('/admin/dashboard.html')}" class="${activeKey === 'dashboard' ? 'active' : ''}"><i class="bi bi-speedometer2"></i> Dashboard</a>
      <div class="group-title">People</div>
      <a href="${pageUrl('/admin/staff.html')}" class="${activeKey === 'staff' ? 'active' : ''}"><i class="bi bi-people"></i> Staff Accounts</a>
      <a href="${pageUrl('/admin/admins.html')}" class="${activeKey === 'admins' ? 'active' : ''}"><i class="bi bi-shield-lock"></i> Admin Accounts</a>
      <div class="group-title">Sales &amp; Marketing</div>
      <a href="${pageUrl('/admin/marketing-acquisition.html')}" class="${activeKey === 'marketing-acquisition' ? 'active' : ''}"><i class="bi bi-person-lines-fill"></i> Customer Acquisition</a>
      <a href="${pageUrl('/admin/product-requests.html')}" class="${activeKey === 'product-requests' ? 'active' : ''}"><i class="bi bi-bag-check"></i> Product Requests</a>
      <a href="${pageUrl('/admin/accountant.html')}" class="${activeKey === 'accountant' ? 'active' : ''}"><i class="bi bi-calculator"></i> Accountant Desk</a>
      <a href="${pageUrl('/admin/legal.html')}" class="${activeKey === 'legal' ? 'active' : ''}"><i class="bi bi-briefcase"></i> Legal &amp; Budget Requests</a>
      <a href="${pageUrl('/admin/legal-desk.html')}" class="${activeKey === 'legal-desk' ? 'active' : ''}"><i class="bi bi-journal-bookmark"></i> Legal Records</a>
      <div class="group-title">Operations</div>
      <a href="${pageUrl('/admin/requests.html')}" class="${activeKey === 'requests' ? 'active' : ''}"><i class="bi bi-inboxes"></i> Service Requests</a>
      <a href="${pageUrl('/admin/services.html')}" class="${activeKey === 'services' ? 'active' : ''}"><i class="bi bi-grid-3x3-gap"></i> Services Catalogue</a>
      <a href="${pageUrl('/admin/inventory.html')}" class="${activeKey === 'inventory' ? 'active' : ''}"><i class="bi bi-box-seam"></i> Inventory</a>
      <a href="${pageUrl('/admin/record-sale.html')}" class="${activeKey === 'record-sale' ? 'active' : ''}"><i class="bi bi-cart-check"></i> Record Sale</a>
      <a href="${pageUrl('/admin/customer-debts.html')}" class="${activeKey === 'customer-debts' ? 'active' : ''}"><i class="bi bi-journal-text"></i> Customer Debts</a>
      <a href="${pageUrl('/admin/sales-overview.html')}" class="${activeKey === 'sales-overview' ? 'active' : ''}"><i class="bi bi-graph-up-arrow"></i> Sales &amp; Stock Overview</a>
      <a href="${pageUrl('/admin/employees.html')}" class="${activeKey === 'employees' ? 'active' : ''}"><i class="bi bi-people"></i> Employees</a>
      <a href="${pageUrl('/admin/portfolio.html')}" class="${activeKey === 'portfolio' ? 'active' : ''}"><i class="bi bi-images"></i> Portfolio</a>
      <a href="${pageUrl('/admin/messages.html')}" class="${activeKey === 'messages' ? 'active' : ''}"><i class="bi bi-envelope"></i> Contact Messages</a>
      <a href="${pageUrl('/notifications.html')}" class="${activeKey === 'notifications' ? 'active' : ''}"><i class="bi bi-bell"></i> Notifications</a>
      <div class="group-title">System</div>
      <a href="${pageUrl('/admin/activity-log.html')}" class="${activeKey === 'activity-log' ? 'active' : ''}"><i class="bi bi-clock-history"></i> Activity Log</a>
      <a href="${pageUrl('/admin/reports.html')}" class="${activeKey === 'reports' ? 'active' : ''}"><i class="bi bi-bar-chart"></i> Reports</a>
      <a href="${pageUrl('/admin/settings.html')}" class="${activeKey === 'settings' ? 'active' : ''}"><i class="bi bi-sliders"></i> Mail Settings</a>
      <a href="${pageUrl('/admin/profile.html')}" class="${activeKey === 'profile' ? 'active' : ''}"><i class="bi bi-person-gear"></i> My Profile</a>`;
  } else if (user.role === 'staff') {
    navHtml = `
      <div class="group-title">Overview</div>
      <a href="${pageUrl('/staff/dashboard.html')}" class="${activeKey === 'dashboard' ? 'active' : ''}"><i class="bi bi-speedometer2"></i> Dashboard</a>
      <a href="${pageUrl('/staff/tasks.html')}" class="${activeKey === 'tasks' ? 'active' : ''}"><i class="bi bi-list-check"></i> My Tasks</a>
      ${user.staff_category === 'other_services' ? `<a href="${pageUrl('/staff/tasks.html')}?tab=new" class="${activeKey === 'open' ? 'active' : ''}"><i class="bi bi-broadcast"></i> Open Requests</a>` : ''}
      <a href="${pageUrl('/staff/leave.html')}" class="${activeKey === 'leave' ? 'active' : ''}"><i class="bi bi-calendar-check"></i> My Leave</a>
      <a href="${pageUrl('/notifications.html')}" class="${activeKey === 'notifications' ? 'active' : ''}"><i class="bi bi-bell"></i> Notifications</a>
      <div class="group-title">Company</div>
      <a href="${pageUrl('/company/directory.html')}" class="${activeKey === 'directory' ? 'active' : ''}"><i class="bi bi-people-fill"></i> Company Directory</a>
      <div class="group-title">Account</div>
      <a href="${pageUrl('/staff/profile.html')}" class="${activeKey === 'profile' ? 'active' : ''}"><i class="bi bi-person-gear"></i> My Profile</a>`;
  } else {
    // Customer accounts (and their dashboard/profile/requests pages) have
    // been removed per the system restructuring spec. This branch is now
    // unreachable in normal use — initDashLayout() below redirects any
    // 'customer'-role session away before renderSidebar() is ever called —
    // and is only left in place in case an old customer/*.html page is
    // still on disk pending its own removal.
    navHtml = `
      <div class="group-title">Overview</div>
      <a href="${pageUrl('/home.html')}"><i class="bi bi-speedometer2"></i> Home</a>`;
  }

  const html = `
  <div class="sidebar-brand">
    <img src="${APP_ROOT}/frontend/img/logo4.png" alt="MABUMBA TECH">
    <div><b>MABUMBA TECH</b><span>Technology. Innovation. Solution.</span></div>
  </div>
  <nav class="side-nav">
    ${navHtml}
    <div class="group-title">Website</div>
    <a href="${pageUrl('/home.html')}"><i class="bi bi-globe"></i> View Website</a>
  </nav>
  <div class="sidebar-foot">
    <div class="sidebar-user">
      <div class="avatar-sm" style="${user.role === 'super_admin' && !user.avatar ? 'background:var(--warn);' : ''}">${avatarHtml(user.full_name, user.avatar)}</div>
      <div><b>${escapeHtml(user.full_name)}</b><span>${escapeHtml(user.position_title || roleLabel(user.role))}</span></div>
    </div>
    <button class="btn btn-light btn-sm" style="width:100%;" onclick="doLogout()"><i class="bi bi-box-arrow-right"></i> Logout</button>
  </div>`;
  document.getElementById('sidebar').innerHTML = html;

  // The sidebar is rebuilt on every page, which used to throw its scroll
  // position back to the top (or jump to the active link) each time you
  // opened a page. Now it only moves when YOU scroll it: the position is
  // remembered as you scroll and put back exactly where you left it.
  const nav = document.querySelector('#sidebar .side-nav');
  if (nav) {
    let saved = null;
    try { saved = localStorage.getItem(SIDEBAR_SCROLL_KEY); } catch (e) { /* storage blocked — just start at the top */ }

    if (saved !== null && saved !== '' && !isNaN(Number(saved))) {
      nav.scrollTop = Number(saved);
    } else {
      // Very first visit only (nothing saved yet): make sure the current page's
      // link is visible, scrolling the sidebar itself and never the page.
      const activeLink = nav.querySelector('a.active');
      if (activeLink) {
        const navBox = nav.getBoundingClientRect();
        const linkBox = activeLink.getBoundingClientRect();
        if (linkBox.top < navBox.top || linkBox.bottom > navBox.bottom) {
          nav.scrollTop += (linkBox.top - navBox.top) - nav.clientHeight / 2;
        }
      }
    }

    let scrollTimer = null;
    nav.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        try { localStorage.setItem(SIDEBAR_SCROLL_KEY, String(Math.round(nav.scrollTop))); } catch (e) { /* ignore */ }
      }, 60);
    }, { passive: true });

    // Also save the instant you click a link, so a quick click straight after
    // scrolling can't lose the last few pixels.
    nav.addEventListener('click', () => {
      try { localStorage.setItem(SIDEBAR_SCROLL_KEY, String(Math.round(nav.scrollTop))); } catch (e) { /* ignore */ }
    });
  }
}

function renderTopbar(pageTitle, crumb) {
  const user = CURRENT_USER;
  const icon = user.role === 'staff' ? (CATEGORY_ICONS[user.staff_category] || 'bi-gear') : (user.role === 'customer' ? 'bi-person' : 'bi-shield-lock');
  const html = `
    <div style="display:flex;align-items:center;gap:10px;">
      <button id="sidebarBurger" class="icon-btn"><i class="bi bi-list"></i></button>
      <div>
        <h1>${escapeHtml(pageTitle)}</h1>
        ${crumb ? `<span class="crumb">${escapeHtml(crumb)}</span>` : ''}
      </div>
    </div>
    <div class="topbar-right">
      <div style="position:relative;">
        <button type="button" class="tag-pill user-menu-btn" id="userMenuBtn" aria-haspopup="menu" aria-expanded="false" title="Account menu">
          <i class="bi ${icon}"></i> <span>${escapeHtml(roleLabel(user.role))}</span> <i class="bi bi-chevron-down user-menu-caret"></i>
        </button>
        <div id="userMenu" class="user-menu" role="menu">
          <div class="user-menu-head"><b>${escapeHtml(user.full_name)}</b><span>${escapeHtml(user.position_title || roleLabel(user.role))}</span></div>
          <a href="${pageUrl(user.role === 'staff' ? '/staff/profile.html' : '/admin/profile.html')}" role="menuitem"><i class="bi bi-person-gear"></i> Profile</a>
          <button type="button" role="menuitem" class="user-menu-logout" onclick="doLogout()"><i class="bi bi-box-arrow-right"></i> Logout</button>
        </div>
      </div>
      <div style="position:relative;">
        <button type="button" class="icon-btn" id="notifBell"><i class="bi bi-bell"></i><span class="dot" id="notifDot" style="display:none;"></span></button>
        <div id="notifDropdown" class="notif-dropdown">
          <div class="notif-head"><b>Notifications</b>
            <button class="small" id="markAllReadBtn" style="background:none;border:none;color:var(--blue-700);cursor:pointer;display:none;">Mark all read</button>
          </div>
          <div class="notif-list" id="notifList"><div class="empty-state" style="padding:20px 10px;"><i class="bi bi-bell-slash"></i>Loading…</div></div>
          <a href="${pageUrl('/notifications.html')}" class="notif-view-all"><i class="bi bi-list-ul"></i> View all notifications</a>
        </div>
      </div>
    </div>`;
  document.getElementById('dashTopbar').innerHTML = html;

  setupMobileSidebar();

  // Role pill -> small Profile / Logout menu.
  const userBtn = document.getElementById('userMenuBtn');
  const userMenu = document.getElementById('userMenu');
  const closeUserMenu = () => { userMenu.classList.remove('show-menu'); userBtn.setAttribute('aria-expanded', 'false'); };
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notifDropdown').classList.remove('show-notif');
    const open = userMenu.classList.toggle('show-menu');
    userBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#userMenu')) closeUserMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserMenu(); });

  document.getElementById('notifBell').addEventListener('click', () => {
    closeUserMenu();
    document.getElementById('notifDropdown').classList.toggle('show-notif');
  });
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown.classList.contains('show-notif')) return;
    if (!e.target.closest('#notifDropdown') && !e.target.closest('#notifBell')) dropdown.classList.remove('show-notif');
  });
  document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    await apiPost('/notifications.php', {});
    loadNotifications();
  });

  loadNotifications();
}

/**
 * Mobile sidebar drawer: wires the hamburger burger button to open/close the
 * sidebar, adds a dimmed backdrop (created once, reused across pages) so a
 * tap outside the drawer closes it, and closes on Escape or on navigating to
 * a link. Also locks background scroll while the drawer is open so the page
 * behind it doesn't shift/scroll on touch devices.
 */
function setupMobileSidebar() {
  const burger = document.getElementById('sidebarBurger');
  const sidebar = document.getElementById('sidebar');
  if (!burger || !sidebar) return;

  let backdrop = document.getElementById('sidebarBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sidebarBackdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-lock-scroll');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sidebar-lock-scroll');
  }

  burger.setAttribute('aria-expanded', 'false');
  burger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
  });
  // Tapping a nav link closes the drawer immediately rather than leaving it
  // open behind the page that's about to load.
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeSidebar();
  });
}

/** Shows a one-time message stashed by redirectWithNotice() before navigating here. */
function showPendingFlash() {
  const msg = sessionStorage.getItem('pendingFlash');
  if (!msg) return;
  sessionStorage.removeItem('pendingFlash');
  const type = sessionStorage.getItem('pendingFlashType') || 'info';
  sessionStorage.removeItem('pendingFlashType');
  if (typeof showFlash === 'function') showFlash(msg, type);
}

/** Stashes a message for the next page to display, then navigates there. */
function redirectWithNotice(url, message, type) {
  sessionStorage.setItem('pendingFlash', message);
  sessionStorage.setItem('pendingFlashType', type || 'error');
  window.location.href = url;
}

async function loadNotifications() {
  const { data } = await apiGet('/notifications.php?unread_only=1');
  const list = document.getElementById('notifList');
  const dot = document.getElementById('notifDot');
  const markBtn = document.getElementById('markAllReadBtn');
  if (!list) return;

  dot.style.display = data.unread_count > 0 ? 'block' : 'none';
  markBtn.style.display = data.unread_count > 0 ? 'inline' : 'none';

  if (!data.notifications || data.notifications.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:20px 10px;"><i class="bi bi-bell-slash"></i>No notifications yet.</div>`;
    return;
  }
  list.innerHTML = data.notifications.map(n => `
    <a href="${n.link ? APP_ROOT + n.link.replace('/backend/', '/frontend/html/').replace(/\.php(\?|$)/, '.html$1') : '#'}" class="notif-item ${n.is_read == 0 ? 'unread' : ''}" onclick="markNotificationRead(${n.id}, this)">
      <i class="bi ${notificationIcon(n.type)}"></i>
      <span class="notif-item-body">
        <b>${escapeHtml(n.title)}</b>
        <span>${escapeHtml((n.message || '').slice(0, 90))}</span>
        <span class="notif-time">${timeAgo(n.created_at)}</span>
      </span>
    </a>`).join('');
}

/** Marks one notification read without waiting — the link navigation continues immediately either way. */
function markNotificationRead(id, el) {
  apiPost('/notifications.php', { action: 'mark_one', id }).then(() => {
    // Once read, a notification disappears from the bell list (still on the Notifications page).
    if (el && el.parentNode) el.remove();
    loadNotifications();
  }).catch(() => {});
}

function doLogout() {
  apiPost('/auth/logout.php', {}).then(({ data }) => { window.location.href = pageUrl(data.redirect.replace('/auth/login.php', '/auth/login.html')); });
}

/**
 * Call at the top of every dashboard page. Redirects to login if not
 * authenticated / wrong role.
 *
 * Two extra, optional RBAC guards for admin-tier pages — both are
 * convenience/UX only (avoids a scoped admin landing on a page that will
 * just crash when its API call 403s); the real security boundary is always
 * enforced server-side by the matching backend endpoint:
 *   - anyPermission: array of permission keys: page loads if the user has
 *     ANY of them (or is a Full Admin/Super Admin, who always pass).
 *   - fullAdminOnly: true restricts the page to Super Admin / Generic
 *     Administrator, mirroring api_require_full_admin() server-side.
 */
async function initDashLayout({ pageTitle, crumb, activeKey, allowedRoles, anyPermission, fullAdminOnly }) {
  await loadSession();
  if (!CURRENT_USER) { window.location.href = pageUrl('/auth/login.html'); return null; }
  const role = CURRENT_USER.role;
  // Customer accounts have been removed system-wide (spec: no customer
  // dashboard/login/profile) — send any lingering customer session (e.g. one
  // that was already logged in before this update) straight back to the
  // public site rather than into a dashboard that no longer exists for them.
  if (role === 'customer') { window.location.href = pageUrl('/home.html'); return null; }
  const ok = allowedRoles.some(r => r === 'admin' ? isAdminRole(role) : r === role);
  if (!ok) { window.location.href = pageUrl('/auth/login.html'); return null; }
  if (role === 'staff' && CURRENT_USER.must_reset == 1 && !window.location.pathname.endsWith('force-reset.html')) {
    window.location.href = pageUrl('/auth/force-reset.html');
    return null;
  }

  if (isAdminRole(role) && !isFullAdmin(CURRENT_USER)) {
    if (fullAdminOnly) {
      redirectWithNotice(pageUrl('/admin/profile.html'), 'That area is restricted to Super Administrators and full Administrators.', 'error');
      return null;
    }
    if (anyPermission && anyPermission.length && !anyPermission.some(p => hasPerm(p))) {
      redirectWithNotice(pageUrl('/admin/profile.html'), 'You do not have permission to access that page.', 'error');
      return null;
    }
  }

  renderSidebar(activeKey);
  renderTopbar(pageTitle, crumb);
  showPendingFlash();
  return CURRENT_USER;
}
