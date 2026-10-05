function renderPublicHeader(activeKey) {
  const user = CURRENT_USER;
  let ctaHtml;
  if (user) {
    const home = user.role === 'staff' ? '/staff/dashboard.html' : '/admin/dashboard.html';
    ctaHtml = `<a href="${pageUrl(home)}" class="btn btn-primary btn-sm"><i class="bi bi-speedometer2"></i> Dashboard</a>`;
  } else {
    // Customer accounts have been removed — the only accounts left are
    // Staff/Admin, so the header CTA says so plainly instead of a plain
    // "Login" that visitors might mistake for a customer login.
    ctaHtml = `<a href="${pageUrl('/auth/login.html')}" class="btn btn-outline btn-sm">Staff/Admin Login</a>
      <a href="${pageUrl('/public/request-service.html')}" class="btn btn-primary btn-sm"><i class="bi bi-send"></i> Request Service</a>`;
  }

  const nav = [
    ['home', '/home.html', 'Home'],
    ['about', '/public/about.html', 'About'],
    ['team', '/public/team.html', 'Team'],
    ['services', '/public/services.html', 'Services'],
    ['portfolio', '/public/portfolio.html', 'Portfolio'],
    ['track', '/public/track-request.html', 'Track Request'],
    ['contact', '/public/contact.html', 'Contact'],
  ].map(([key, href, label]) => `<a href="${pageUrl(href)}" class="${activeKey === key ? 'active' : ''}">${label}</a>`).join('');

  const html = `
  <header class="topbar topbar-home">
    <div class="topbar-inner">
      <a href="${pageUrl('/home.html')}" class="brand brand-home">
        <img src="${APP_ROOT}/frontend/img/logo4.png" alt="MABUMBA TECH">
        <span class="brand-name">MABUMBA TECH</span>
      </a>
      <nav class="nav-links">${nav}</nav>
      <div class="nav-cta">
        ${ctaHtml}
        <button class="nav-toggle" aria-label="Menu"><i class="bi bi-list"></i></button>
      </div>
    </div>
  </header>
  <div id="flashContainer" class="container" style="padding-top:14px;"></div>`;

  document.getElementById('siteHeader').innerHTML = html;

  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    let backdrop = document.getElementById('navBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'navBackdrop';
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }

    function openNav() {
      links.classList.add('open-mobile');
      links.style.display = 'flex';
      backdrop.classList.add('show');
      toggle.innerHTML = '<i class="bi bi-x-lg"></i>';
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('sidebar-lock-scroll');
    }
    function closeNav() {
      links.classList.remove('open-mobile');
      links.style.display = '';
      backdrop.classList.remove('show');
      toggle.innerHTML = '<i class="bi bi-list"></i>';
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('sidebar-lock-scroll');
    }

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      links.classList.contains('open-mobile') ? closeNav() : openNav();
    });
    backdrop.addEventListener('click', closeNav);
    links.addEventListener('click', (e) => { if (e.target.closest('a')) closeNav(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('open-mobile')) closeNav();
    });
    // A resize back up to desktop width should never leave the drawer's
    // "open" state (and its backdrop/scroll-lock) stuck active underneath
    // the now-visible, always-on desktop nav.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 960 && links.classList.contains('open-mobile')) closeNav();
    });
  }
}

function renderPublicFooter() {
  // Call-to-action band above the footer on every public page except the request form itself.
  const showCta = !/request-service/.test(window.location.pathname);
  const ctaHtml = showCta ? `
  <section class="lp-cta-inner">
    <div class="lp-wrap">
      <div class="lp-cta-panel">
        <div>
          <h2>Ready to start your project?</h2>
          <p>Tell us about your idea &mdash; our team will get back to you shortly.</p>
        </div>
        <div class="lp-cta-actions">
          <a href="${pageUrl('/public/request-service.html')}" class="btn btn-light"><i class="bi bi-send"></i> Get Started</a>
          <a href="${pageUrl('/public/contact.html')}" class="btn btn-ghost"><i class="bi bi-chat-dots"></i> Contact Us</a>
        </div>
      </div>
    </div>
  </section>` : '';
  const html = ctaHtml + `
  <footer>
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">
            <img src="${APP_ROOT}/frontend/img/logo.png" alt="logo">
            <span>MABUMBA TECH</span>
          </div>
          <p>Technology. Innovation. Solution. To deliver quality and affordable technology solutions that turn ideas into practical results and help people, businesses, and organizations grow.</p>
          <div class="social-row">
            <a href="#"><i class="bi bi-facebook"></i></a>
            <a href="#"><i class="bi bi-twitter-x"></i></a>
            <a href="#"><i class="bi bi-linkedin"></i></a>
            <a href="#"><i class="bi bi-instagram"></i></a>
          </div>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><a href="${pageUrl('/public/about.html')}">About Us</a></li>
            <li><a href="${pageUrl('/public/portfolio.html')}">Portfolio</a></li>
            <li><a href="${pageUrl('/public/contact.html')}">Contact</a></li>
            <li><a href="${pageUrl('/public/terms.html')}">Terms &amp; Conditions</a></li>
            <li><a href="${pageUrl('/auth/login.html')}?as=staff">Staff Login</a></li>
          </ul>
        </div>
        <div>
          <h4>Services</h4>
          <ul>
            <li><a href="${pageUrl('/public/services.html')}">Web Development</a></li>
            <li><a href="${pageUrl('/public/services.html')}">App Development</a></li>
            <li><a href="${pageUrl('/public/services.html')}">AI/ML Projects</a></li>
            <li><a href="${pageUrl('/public/services.html')}">Graphics Designing</a></li>
          </ul>
        </div>
        <div>
          <h4>Get in Touch</h4>
          <ul>
            <li><i class="bi bi-geo-alt"></i> Mbeya, Tanzania</li>
            <li><i class="bi bi-envelope"></i> mabumbatech@gmail.com</li>
            <li><i class="bi bi-telephone"></i> +255 620 839 640 / +255 760 620 418</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} MABUMBA TECH. All rights reserved.</span>
        <span>Technology. Innovation. Solution.</span>
      </div>
    </div>
  </footer>`;
  document.getElementById('siteFooter').innerHTML = html;
}

async function initPublicLayout(activeKey) {
  await loadSession();
  renderPublicHeader(activeKey);
  renderPublicFooter();
  renderFloatingWhatsApp();
  initScrollReveal();
}

/** A small always-on-brand touch for an East-Africa-facing company — WhatsApp is the primary contact channel for most visitors here. */
function renderFloatingWhatsApp() {
  if (document.getElementById('floatingWhatsapp')) return;
  const html = `<a id="floatingWhatsapp" href="https://wa.me/255620839640" target="_blank" rel="noopener noreferrer" class="floating-whatsapp" aria-label="Chat with us on WhatsApp"><i class="bi bi-whatsapp"></i></a>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

/**
 * Subtle fade-and-rise entrance for cards/section headers as they scroll into view.
 * Purely additive — reveals a plain, fully-visible page if JS/IntersectionObserver
 * is unavailable, and respects prefers-reduced-motion via CSS.
 * Pages that inject content dynamically (services grid, portfolio grid, etc.)
 * should call this again after rendering their cards so those animate in too.
 */
function initScrollReveal() {
  const selector = '.card:not(.reveal):not(.in-view), .section-head:not(.reveal):not(.in-view), .hero-text:not(.reveal):not(.in-view), .hero-logo-wrap:not(.reveal):not(.in-view), .service-card:not(.reveal):not(.in-view), .portfolio-card:not(.reveal):not(.in-view)';
  const els = document.querySelectorAll(selector);
  if (!els.length) return;

  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('in-view'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = (Math.min(i % 6, 5) * 60) + 'ms';
    observer.observe(el);
  });
}
