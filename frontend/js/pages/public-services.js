(async function () {
  await initPublicLayout('services');

  // Images live in frontend/img/service-images/ (file names must match exactly).
  const IMG_BASE = APP_ROOT + '/frontend/img/service-images/';
  const imgUrl = (file) => IMG_BASE + encodeURIComponent(file);

  const OVERVIEW_IMG = 'All digital services under one roof.png';
  const GENERIC_IMG = 'All other digital services.png';

  /* -------------------------------------------------------------------
     Detailed content for each service, keyed by the service's category_key.
     Edit the wording here — no database change needed.
     ------------------------------------------------------------------- */
  const CONTENT = {
    web_dev: {
      img: 'Web development.png', short: 'Web',
      tagline: 'Websites and web platforms that turn visitors into customers.',
      details: 'We plan, design and build fast, secure and mobile-friendly websites — from a professional company site to a full online store or a custom web system. Every project is built with clean code, a search-friendly structure and content you can manage yourself.',
      features: [
        ['bi-window-sidebar', 'Business Websites', 'Professional company, portfolio and organisation sites.'],
        ['bi-cart3', 'E-commerce Stores', 'Product catalogues, carts and secure online checkout.'],
        ['bi-columns-gap', 'Web Applications', 'Portals, dashboards and custom business systems.'],
        ['bi-phone-landscape', 'Responsive UI/UX', 'Clean layouts that work on phones, tablets and desktops.'],
        ['bi-globe2', 'Domains, Hosting & SEO', 'Get online, get found and stay online.'],
        ['bi-tools', 'Maintenance & Support', 'Updates, backups and fixes after launch.']
      ],
      ideal: ['Startups', 'Shops & retailers', 'Schools & NGOs', 'Companies']
    },
    app_dev: {
      img: 'App development.png', short: 'Apps',
      tagline: 'Mobile apps your customers will actually enjoy using.',
      details: 'From idea and prototype to store launch, we build Android, iOS and cross-platform apps that are smooth, secure and easy to use, backed by reliable back-end systems and APIs.',
      features: [
        ['bi-android2', 'Android Apps', 'Native apps built for the Android ecosystem.'],
        ['bi-apple', 'iOS Apps', 'Polished apps for iPhone and iPad.'],
        ['bi-layers', 'Cross-Platform Apps', 'One codebase running on both Android and iOS.'],
        ['bi-layout-wtf', 'App UI/UX Design', 'Intuitive screens and smooth user journeys.'],
        ['bi-hdd-network', 'Back-end & APIs', 'Secure servers, databases and integrations.'],
        ['bi-cloud-upload', 'Publishing & Updates', 'Store submission, upgrades and ongoing support.']
      ],
      ideal: ['Startups', 'Service businesses', 'Retail & delivery', 'Institutions']
    },
    software_hardware: {
      img: 'Software and hardware solutions.png', short: 'Software & Hardware',
      tagline: 'Reliable systems, from the code to the circuit board.',
      details: 'We build custom software and also keep the hardware behind it running — installing, configuring, repairing and maintaining computers, servers and networks so your operations never slow down.',
      features: [
        ['bi-boxes', 'Custom Software & ERP', 'Business systems tailored to how you work.'],
        ['bi-motherboard', 'System Installation', 'Setup of operating systems, software and workstations.'],
        ['bi-wrench-adjustable', 'Repair & Upgrades', 'Diagnosis and repair of laptops, desktops and devices.'],
        ['bi-router', 'Networking & Cabling', 'Office networks, Wi-Fi and structured cabling.'],
        ['bi-shield-check', 'Preventive Maintenance', 'Regular checks that prevent costly downtime.'],
        ['bi-hdd', 'Backup & Recovery', 'Protect your data and restore it when needed.']
      ],
      ideal: ['Offices', 'Schools', 'Clinics & shops', 'Growing teams']
    },
    equipment: {
      img: 'Selling IT equipments.png', short: 'IT Equipment',
      tagline: 'The right hardware for your business, supplied and set up.',
      details: 'Get quality computers, networking gear and office technology from one trusted supplier. We help you choose equipment that fits your needs and budget, and we can install and configure it for you.',
      features: [
        ['bi-laptop', 'Laptops & Desktops', 'Reliable computers for work, study and business.'],
        ['bi-wifi', 'Networking Equipment', 'Routers, switches and Wi-Fi access points.'],
        ['bi-printer', 'Printers & Accessories', 'Printers, peripherals and everyday office tech.'],
        ['bi-server', 'Servers & Storage', 'Hardware to host, share and safeguard your data.'],
        ['bi-camera-video', 'Security & CCTV', 'Cameras and devices to protect your premises.'],
        ['bi-patch-check', 'Setup & Warranty Support', 'Installation help and after-sales support.']
      ],
      ideal: ['Businesses', 'Schools', 'Offices', 'Individuals']
    },
    network: {
      img: 'Network Installation.png', poster: true, short: 'Network Installation',
      tagline: 'Reliable. Secure. High performance.',
      details: 'We design, install and configure professional network solutions for homes, offices and businesses — from the cables in the wall to the Wi-Fi in the air — so your team stays connected and works smarter.',
      features: [
        ['bi-diagram-3', 'LAN & WAN Setup', 'Wired and wide-area networks designed around your site.'],
        ['bi-router', 'Switches & Routers', 'Installation and configuration of core network equipment.'],
        ['bi-wifi', 'Wi-Fi Networks & Access Points', 'Strong, even wireless coverage in every room.'],
        ['bi-ethernet', 'Structured Cabling (UTP/Fibre)', 'Neat, labelled and certified cabling that lasts.'],
        ['bi-shield-lock', 'Network Security & Firewall', 'Protect your data and block unwanted access.'],
        ['bi-activity', 'Network Monitoring & Support', 'Keep an eye on performance and fix issues fast.']
      ],
      ideal: ['Homes', 'Offices', 'Businesses', 'Schools']
    },
    camera: {
      img: 'Camera Installation.png', poster: true, short: 'Camera Installation',
      tagline: 'Smarter security. Safer tomorrow.',
      details: 'We install high-quality CCTV camera systems for homes, offices, shops, schools and businesses, so you can keep what matters most under watch, anytime, anywhere.',
      features: [
        ['bi-camera-video', 'High Definition, Clear Footage', 'Sharp HD video you can rely on.'],
        ['bi-moon-stars', 'Night Vision (up to 100m+)', 'Clear pictures even in complete darkness.'],
        ['bi-phone', 'Remote Monitoring', 'Watch live from your phone, anywhere, anytime.'],
        ['bi-gear', 'Professional Installation & Setup', 'Cameras, cabling and recorders set up properly.'],
        ['bi-shield-check', 'Reliable & Secure Systems', 'Dependable equipment with protected access.'],
        ['bi-tools', 'Upgrades & Support', 'Extra cameras, checks and help after installation.']
      ],
      ideal: ['Homes', 'Offices', 'Shops', 'Schools', 'Businesses']
    },
    it_consultancy: {
      img: 'IT Consultancy.png', short: 'IT Consultancy',
      tagline: 'Clear technology decisions, from plan to implementation.',
      details: 'Our consultants review how you use technology today and give you a practical roadmap — what to improve, what to buy, and how to secure and grow your digital operations with confidence.',
      features: [
        ['bi-signpost-split', 'IT Strategy & Roadmaps', 'A practical plan aligned to your business goals.'],
        ['bi-shield-lock', 'Systems & Security Audit', 'Find weaknesses and risks before they cost you.'],
        ['bi-arrow-repeat', 'Digital Transformation', 'Move paper-based processes to efficient digital ones.'],
        ['bi-cloud', 'Cloud & Infrastructure', 'Advice on hosting, storage and business tools.'],
        ['bi-clipboard-check', 'IT Procurement Advice', 'Buy the right systems at the right price.'],
        ['bi-mortarboard', 'Training & Support', 'Help your team get the most from technology.']
      ],
      ideal: ['Management teams', 'SMEs', 'Institutions', 'Startups']
    },
    ai_ml: {
      img: 'AI and Machine learning projects.png', short: 'AI & ML',
      tagline: 'Intelligent solutions that save time and reveal insight.',
      details: 'We turn your data into working AI — collecting and preparing data, training and evaluating models, and deploying them into real tools that automate routine work and support better decisions.',
      features: [
        ['bi-cpu-fill', 'Machine Learning Models', 'Custom models trained on your own data.'],
        ['bi-robot', 'Process Automation', 'Let software handle repetitive tasks.'],
        ['bi-bar-chart-line', 'Data Analysis & Dashboards', 'Turn raw numbers into clear insight.'],
        ['bi-chat-dots', 'Chatbots & Assistants', 'Smart helpers for customers and staff.'],
        ['bi-eye', 'Computer Vision', 'Systems that recognise images and video.'],
        ['bi-graph-up-arrow', 'Predictive Analytics', 'Forecast trends and plan ahead.']
      ],
      ideal: ['Data-driven teams', 'Customer service', 'Operations', 'Researchers']
    },
    multimedia: {
      img: 'Multimedia and animation projects.png', short: 'Multimedia',
      tagline: 'Turn ideas into visual stories people remember.',
      details: 'Our creative team produces videos, animations and multimedia content that explain your product, promote your brand and keep audiences engaged on every screen.',
      features: [
        ['bi-camera-reels', 'Video Editing & Production', 'Professional editing, colour and sound.'],
        ['bi-film', '2D & 3D Animation', 'Characters, scenes and visual storytelling.'],
        ['bi-play-circle', 'Motion Graphics', 'Animated titles, logos and infographics.'],
        ['bi-megaphone', 'Promo & Explainer Videos', 'Short videos that sell and simplify.'],
        ['bi-share', 'Social Media Content', 'Ready-to-post clips and visuals.'],
        ['bi-journal-text', 'Storyboarding & Scripting', 'Plan the story before production begins.']
      ],
      ideal: ['Brands', 'Events', 'Educators', 'Content creators']
    },
    graphics: {
      img: 'Graphics Designing.png', short: 'Graphics',
      tagline: 'Design that builds a brand people trust.',
      details: 'From your first logo to a complete visual identity, we create clear, consistent and eye-catching designs for print and digital, so your business looks as professional as it is.',
      features: [
        ['bi-bezier2', 'Logo & Branding', 'A distinctive mark and brand direction.'],
        ['bi-palette', 'Brand Identity Kits', 'Colours, fonts and guidelines that stay consistent.'],
        ['bi-easel', 'Posters, Flyers & Banners', 'Eye-catching promotional material.'],
        ['bi-images', 'Social Media Graphics', 'Templates and posts that match your brand.'],
        ['bi-file-earmark-image', 'Print-Ready Artwork', 'Files prepared correctly for the printer.'],
        ['bi-box-seam', 'Packaging & Merchandise', 'Labels, packaging and branded items.']
      ],
      ideal: ['New businesses', 'Events', 'Retail', 'Organisations']
    },
    other_services: {
      img: 'All other digital services.png', short: 'Other Services',
      tagline: 'Something else in mind? We will find the right team for it.',
      details: 'Beyond our core services we handle a wide range of digital needs. Tell us what you are looking for and our admin team will review your request and assign the right specialist.',
      features: [
        ['bi-bullseye', 'Digital Marketing', 'Reach and grow your audience online.'],
        ['bi-hdd-stack', 'Domain & Hosting', 'Names, hosting and email set up for you.'],
        ['bi-stars', 'Online Branding', 'Build a consistent presence across the web.'],
        ['bi-bag-check', 'E-commerce Solutions', 'Sell products and services online.'],
        ['bi-headset', 'Training & Support', 'Practical help to use your digital tools.'],
        ['bi-lightbulb', 'Custom Requests', 'Tell us the goal — we plan the route.']
      ],
      ideal: ['Individuals', 'Businesses', 'Organisations']
    }
  };

  // Shown for services an admin added that have no dedicated content above.
  const GENERIC_FEATURES = [
    ['bi-clipboard-check', 'Reviewed by Our Team', 'Your request is checked by the admin team.'],
    ['bi-people', 'Matched to a Specialist', 'The right expert is assigned to your project.'],
    ['bi-clipboard-data', 'Track Your Progress', 'Follow your request online at any time.'],
    ['bi-headset', 'Support After Delivery', 'We stay available once the work is done.']
  ];

  // Order and names used if the services API can't be reached.
  const FALLBACK_LIST = [
    ['web_dev', 'Web Development', 'bi-code-slash'],
    ['app_dev', 'App Development', 'bi-phone'],
    ['software_hardware', 'Software & Hardware Solutions', 'bi-cpu'],
    ['equipment', 'IT Equipment Sales', 'bi-pc-display'],
    ['it_consultancy', 'IT Consultancy', 'bi-diagram-3'],
    ['ai_ml', 'AI/ML Projects', 'bi-cpu-fill'],
    ['multimedia', 'Multimedia/Animation Projects', 'bi-film'],
    ['graphics', 'Graphics Designing', 'bi-palette'],
    ['other_services', 'All Other Digital Services', 'bi-grid-3x3-gap']
  ].map(([key, name, icon]) => ({ id: null, category_key: key, name, icon, description: '', is_active: 1, _fallback: true }));

  /* ---------------- load services ---------------- */
  let services = [];
  try {
    const { data } = await apiGet('/public/services.php');
    services = Array.isArray(data.services) ? data.services : [];
  } catch (e) { services = []; }
  if (!services.length) services = FALLBACK_LIST;

  /* ---------------- match each service to its content ---------------- */
  const used = new Set();
  const nameKey = (name) => {
    if (/camera|cctv/i.test(name)) return 'camera';
    if (/^network/i.test(name)) return 'network';
    if (/equipment|selling/i.test(name)) return 'equipment';
    return null;
  };
  const items = services.map((s) => ({ s, key: nameKey(s.name || ''), full: false }));
  items.forEach((it) => { if (it.key && !used.has(it.key)) { it.full = true; used.add(it.key); } else if (it.key) { it.key = null; } });
  items.forEach((it) => {                       // everything else matches by its department key (first one wins)
    if (it.full) return;
    const k = it.s.category_key;
    if (CONTENT[k] && !used.has(k)) { it.key = k; it.full = true; used.add(k); }
  });

  // These services may not be in the database yet: show each as its own section,
  // in this order, right after Software & Hardware — unless an admin already added it.
  [
    ['equipment', 'IT Equipment Sales', 'bi-pc-display', 'software_hardware'],
    ['network', 'Network Installation', 'bi-hdd-network', 'equipment'],
    ['camera', 'Camera Installation', 'bi-camera-video', 'network']
  ].forEach(([key, name, icon, after]) => {
    if (used.has(key)) return;
    const builtin = { s: { id: null, category_key: key, name, icon, description: '', is_active: 1, _equipment: key === 'equipment', _builtin: true }, key, full: true };
    const at = items.findIndex((it) => it.key === after);
    if (at >= 0) items.splice(at + 1, 0, builtin); else items.push(builtin);
    used.add(key);
  });
  // Services an admin added later land at the end of the list — keep these three together, in order.
  [['equipment', 'software_hardware'], ['network', 'equipment'], ['camera', 'network']].forEach(([key, after]) => {
    const from = items.findIndex((it) => it.key === key);
    if (from < 0) return;
    const [moved] = items.splice(from, 1);
    const at = items.findIndex((it) => it.key === after);
    if (at >= 0) items.splice(at + 1, 0, moved); else items.splice(from, 0, moved);
  });

  /* ---------------- helpers ---------------- */
  const esc = escapeHtml;
  const requestHref = (s) => s.id ? `request-service.html?service=${encodeURIComponent(s.id)}` : 'request-service.html';

  function featureCards(list) {
    return list.map(([icon, title, text]) => `
      <li class="sv-fc"><i class="bi ${esc(icon)}"></i><div><b>${esc(title)}</b><span>${esc(text)}</span></div></li>`).join('');
  }

  function actionsHtml(s, unavailable) {
    if (unavailable) {
      return `<span class="badge badge-off">Currently Unavailable</span><span class="sv-unavailable">Not accepting new requests right now.</span>`;
    }
    if (s._equipment) {
      return `<a href="contact.html" class="btn btn-primary"><i class="bi bi-chat-left-text"></i> Get a Quote</a>
              <a href="request-service.html" class="btn btn-outline"><i class="bi bi-send"></i> Request a Service</a>`;
    }
    return `<a href="${requestHref(s)}" class="btn btn-primary"><i class="bi bi-send"></i> Request This Service</a>
            <a href="contact.html" class="btn btn-outline"><i class="bi bi-chat-left-text"></i> Talk to Us</a>`;
  }

  /* ---------------- overview ---------------- */
  document.getElementById('svOverview').innerHTML = `
    <div class="sv-overview sv-reveal">
      <div class="sv-media-wrap">
        <figure class="sv-media">
          <img src="${imgUrl(OVERVIEW_IMG)}" alt="The MABUMBA TECH team serving clients under one roof" width="1774" height="887" decoding="async">
          <span class="sv-cap"><i class="bi bi-house-heart"></i> All digital services under one roof</span>
        </figure>
      </div>
      <div>
        <span class="sv-eyebrow">${items.length} Service Lines</span>
        <h3>One team for every digital need</h3>
        <p><b>MABUMBA TECH</b> brings design, engineering and technology expertise together in one place. Whether you need a website, a mobile app, an AI solution or the right IT equipment, one team plans, builds and supports it — so you don't have to juggle several vendors.</p>
        <ul class="sv-points">
          <li><i class="bi bi-people"></i><div><b>Specialist teams</b><span>Every request is matched to the right expert.</span></div></li>
          <li><i class="bi bi-clipboard-data"></i><div><b>Track your request</b><span>Follow progress online at any time.</span></div></li>
          <li><i class="bi bi-shield-check"></i><div><b>Secure &amp; reliable</b><span>Quality solutions built to last.</span></div></li>
          <li><i class="bi bi-headset"></i><div><b>Ongoing support</b><span>We stay with you after delivery.</span></div></li>
        </ul>
      </div>
    </div>`;

  /* ---------------- quick-jump nav + service panels ---------------- */
  const nav = [];
  const panels = items.map(({ s, key, full }, i) => {
    const c = key ? CONTENT[key] : null;
    const unavailable = s.is_active != 1;
    const id = 'svc-' + (full && key ? key : 'custom-' + (s.id || i));
    const icon = s.icon || (key === 'equipment' ? 'bi-pc-display' : 'bi-grid-3x3-gap');
    const name = s.name || 'Service';
    const img = c ? c.img : GENERIC_IMG;
    const short = full && c ? c.short : name;
    const tagline = full && c ? c.tagline : (s.description || 'Tell us what you need — we will take it from there.');
    const details = full && c ? c.details : 'Send us your requirements and our admin team will review your request and assign the right specialist to deliver it.';
    const features = full && c ? c.features : GENERIC_FEATURES;
    const ideal = full && c ? c.ideal : [];
    const num = String(i + 1).padStart(2, '0');

    nav.push(`<a href="#${id}" class="sv-chip" data-target="${id}"><i class="bi ${esc(icon)}"></i>${esc(short)}</a>`);

    return `
    <article class="sv-feature sv-reveal ${i % 2 ? 'rev' : ''} ${unavailable ? 'sv-off' : ''} ${c && c.poster ? 'sv-wide' : ''}" id="${id}">
      <div class="sv-media-wrap">
        <figure class="sv-media${c && c.poster ? ' sv-poster' : ''}">
          <img src="${imgUrl(img)}" alt="${esc(name)} — MABUMBA TECH" width="${c && c.poster ? 1672 : 1536}" height="${c && c.poster ? 940 : 1024}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
          <span class="sv-num">${num}</span>
          <span class="sv-cap"><i class="bi ${esc(icon)}"></i> ${esc(name)}</span>
        </figure>
      </div>
      <div class="sv-body">
        <div class="sv-head">
          <span class="sv-ic"><i class="bi ${esc(icon)}"></i></span>
          <h3 class="sv-title">${esc(name)}</h3>
        </div>
        <p class="sv-tagline">${esc(tagline)}</p>
        <p class="sv-desc">${esc(details)}</p>
        <ul class="sv-features">${featureCards(features)}</ul>
        ${ideal.length ? `<div class="sv-ideal"><small>Ideal for</small>${ideal.map((t) => `<span class="sv-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="sv-actions">${actionsHtml(s, unavailable)}</div>
      </div>
    </article>`;
  });

  document.getElementById('svNav').innerHTML = nav.join('');
  document.getElementById('svList').innerHTML = panels.join('');

  document.getElementById('svCta').innerHTML = `
    <div class="sv-cta sv-reveal">
      <div>
        <h3>Not sure which service you need?</h3>
        <p>Describe your idea or problem and our team will recommend the best way forward — no obligation.</p>
      </div>
      <div class="sv-actions">
        <a href="request-service.html" class="btn btn-light"><i class="bi bi-send"></i> Request a Service</a>
        <a href="contact.html" class="btn btn-outline"><i class="bi bi-chat-left-text"></i> Contact Us</a>
      </div>
    </div>`;

  /* ---------------- image fallback (missing file => tidy gradient tile) ---------------- */
  document.querySelectorAll('.sv-media img').forEach((im) => {
    const fail = () => im.parentNode.classList.add('sv-noimg');
    im.addEventListener('error', fail);
    if (im.complete && im.naturalWidth === 0 && im.src) fail();
  });

  /* ---------------- sticky nav: sit right under the site header ---------------- */
  const navEl = document.getElementById('svNav');
  const header = document.querySelector('.topbar');
  const placeNav = () => { if (header) navEl.style.top = (header.offsetHeight + 8) + 'px'; };
  placeNav();
  window.addEventListener('resize', placeNav);

  /* ---------------- highlight the chip of the panel being read ---------------- */
  const chips = Array.from(navEl.querySelectorAll('.sv-chip'));
  const setActive = (id) => {
    chips.forEach((c) => c.classList.toggle('active', c.dataset.target === id));
    const on = chips.find((c) => c.dataset.target === id);
    if (on) {
      const left = on.offsetLeft - (navEl.clientWidth - on.offsetWidth) / 2;
      navEl.scrollTo({ left, behavior: 'smooth' });
    }
  };

  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('sv-js');

    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('sv-in'); reveal.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.sv-reveal').forEach((el) => reveal.observe(el));

    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-35% 0px -55% 0px' });
    document.querySelectorAll('.sv-feature').forEach((el) => spy.observe(el));
  }
})();
