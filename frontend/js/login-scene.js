/* =============================================================================
   MABUMBA TECH — Login scene
   A continuously animated, anime-inspired night-city painting drawn on one
   <canvas>. Layers (back to front): dusk sky, twinkling stars, ringed moon with
   light rays, drifting clouds, three parallax skyline layers with flickering
   windows, flowing brand-colour light ribbons carrying data pulses, a rooftop
   character with wind-blown hair, coat and scarf, wind-blown petals, rising
   light motes, periodic wind-gust speed lines and shooting stars.

   Performance: static art is pre-rendered once per resize, only motion is drawn
   per frame; pauses when the tab is hidden; automatically lowers quality on slow
   devices; renders one still frame when the visitor prefers reduced motion.
   ============================================================================= */
(function () {
  'use strict';

  var canvas = document.getElementById('lgScene');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var PI = Math.PI, TAU = Math.PI * 2;
  var PADX = 40, PADY = 14;                 // spare pixels around skyline layers for parallax

  var W = 0, H = 0, dpr = 1, quality = 1;
  var mx = 0, my = 0, mr = 0;               // moon centre + radius
  var showFigure = false, roofY = 0, figX = 0;
  var sky = null, skyline = [], sprites = [], clouds = [];
  var glow = null, halo = null, rayGrad = null, ribbonGrad = null;
  var stars = [], petals = [], motes = [], shooters = [];
  var gust = { left: 0, next: 4, lines: [] };
  var shootNext = 2.5;
  var t = 0, last = 0, raf = 0, avg = 16, frames = 0, resizeTimer = 0;
  var px = 0, py = 0, tpx = 0, tpy = 0;     // smoothed / target pointer (-1..1)

  /* ---------- helpers ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var a = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
      return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
    };
  }
  function layer(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    c.cw = w; c.ch = h;
    c.g = c.getContext('2d');
    c.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }
  function put(cv, x, y) { ctx.drawImage(cv, x, y, cv.cw, cv.ch); }

  /* ---------- pre-rendered sprites ---------- */
  function buildGlow() {
    glow = layer(64, 64);
    var g = glow.g, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, 'rgba(170,228,255,.7)');
    gr.addColorStop(0.55, 'rgba(60,160,255,.22)');
    gr.addColorStop(1, 'rgba(40,140,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);

    halo = layer(256, 256);
    g = halo.g;
    gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(190,235,255,.85)');
    gr.addColorStop(0.12, 'rgba(120,200,255,.5)');
    gr.addColorStop(0.35, 'rgba(50,140,240,.2)');
    gr.addColorStop(1, 'rgba(20,80,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }

  function buildSky() {
    var cv = layer(W, H), g = cv.g;
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#02060f');
    gr.addColorStop(0.3, '#061640');
    gr.addColorStop(0.52, '#0b3a86');
    gr.addColorStop(0.68, '#1672d2');
    gr.addColorStop(0.8, '#4cc3e6');
    gr.addColorStop(0.9, '#a9ecf3');
    gr.addColorStop(1, '#d8f7f8');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);

    // warm kiss of light on the horizon
    g.save();
    g.translate(W * 0.64, H * 0.86); g.scale(1, 0.3);
    var wr = Math.max(W, H) * 0.7;
    var wg = g.createRadialGradient(0, 0, 0, 0, 0, wr);
    wg.addColorStop(0, 'rgba(255,200,130,.5)');
    wg.addColorStop(0.45, 'rgba(255,170,120,.16)');
    wg.addColorStop(1, 'rgba(255,170,120,0)');
    g.fillStyle = wg; g.fillRect(-wr, -wr, wr * 2, wr * 2);
    g.restore();
    sky = cv;
  }

  function buildStars() {
    var r = rng(5), n = Math.min(170, Math.floor(W * H / 8500));
    stars = [];
    for (var i = 0; i < n; i++) {
      var y = Math.pow(r(), 1.6) * H * 0.62;
      stars.push({ x: r() * W, y: y, s: 0.8 + r() * 1.3, ph: r() * 60, sp: 0.6 + r() * 2.4, big: r() < 0.06 });
    }
  }

  function buildClouds() {
    sprites = [];
    var r = rng(77), s, i;
    for (s = 0; s < 4; s++) {
      var w = Math.max(380, W * (0.42 + r() * 0.26)), h = w * 0.34;
      var cv = layer(w, h), g = cv.g, n = 18 + ((r() * 8) | 0), blobs = [];
      for (i = 0; i < n; i++) {
        var u = i / (n - 1), env = Math.sin(u * PI);
        blobs.push({
          x: w * (0.1 + 0.8 * u) + (r() - 0.5) * w * 0.05,
          y: h * (0.7 - 0.2 * env) + (r() - 0.5) * h * 0.06,
          r: h * (0.14 + 0.18 * r()) * (0.6 + 0.5 * env)
        });
      }
      blobs.forEach(function (b) {
        var gb = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        gb.addColorStop(0, 'rgba(14,46,108,.6)');
        gb.addColorStop(0.6, 'rgba(14,46,108,.32)');
        gb.addColorStop(1, 'rgba(14,46,108,0)');
        g.fillStyle = gb; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      });
      blobs.forEach(function (b) {            // moonlit upper edges
        var cx = b.x - b.r * 0.1, cy = b.y - b.r * 0.38, rr = b.r * 0.8;
        var gh = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
        gh.addColorStop(0, 'rgba(196,230,255,.42)');
        gh.addColorStop(1, 'rgba(196,230,255,0)');
        g.fillStyle = gh; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
      });
      g.globalCompositeOperation = 'destination-out';   // flatten the underside
      var fl = g.createLinearGradient(0, h * 0.72, 0, h);
      fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fl; g.fillRect(0, h * 0.72, w, h * 0.28);
      g.globalCompositeOperation = 'source-over';
      sprites.push(cv);
    }

    clouds = [];
    function add(layerId, count, yMin, yMax, vMin, vMax, scMin, scMax, aMin, aMax, flat) {
      for (var k = 0; k < count; k++) {
        var sp = sprites[(r() * sprites.length) | 0], sc = scMin + r() * (scMax - scMin);
        clouds.push({
          l: layerId, sp: sp, sc: sc, flat: flat || 1,
          x: r() * (W + sp.cw * sc) - sp.cw * sc * 0.5,
          y: H * (yMin + r() * (yMax - yMin)),
          v: vMin + r() * (vMax - vMin),
          a: aMin + r() * (aMax - aMin)
        });
      }
    }
    add(0, 5, 0.06, 0.46, 5, 12, 0.8, 1.4, 0.55, 0.9, 1);
    add(1, 3, 0.52, 0.66, 12, 20, 0.9, 1.5, 0.4, 0.62, 0.8);
    add(2, 3, 0.8, 0.95, 22, 34, 1.5, 2.2, 0.26, 0.4, 0.55);
  }

  /* ---------- skyline layers ---------- */
  function buildSkyline() {
    skyline = [];
    var specs = [
      { seed: 11, top: '#2c68b8', bot: '#0b2a62', rim: 'rgba(160,220,255,.6)', minW: 46, maxW: 110, minH: 0.08, maxH: 0.2, win: false },
      { seed: 23, top: '#10357a', bot: '#071a45', rim: 'rgba(130,205,255,.5)', minW: 56, maxW: 130, minH: 0.12, maxH: 0.3, win: true, cw: 9, ch: 13, lit: 0.17 },
      { seed: 37, top: '#071436', bot: '#030814', rim: 'rgba(110,200,255,.4)', minW: 70, maxW: 160, minH: 0.1, maxH: 0.26, win: true, cw: 12, ch: 17, lit: 0.14, near: true }
    ];

    specs.forEach(function (sp) {
      var cv = layer(W + PADX * 2, H + PADY * 2), g = cv.g, r = rng(sp.seed);
      var wins = [], beacons = [], bottom = H + PADY * 2;
      var fg = g.createLinearGradient(0, PADY + H * (1 - sp.maxH - 0.1), 0, bottom);
      fg.addColorStop(0, sp.top); fg.addColorStop(1, sp.bot);

      function addWindows(x, bw, top) {
        if (!sp.win) return;
        var cols = Math.floor((bw - 12) / sp.cw), rows = Math.floor((bottom - top - 24) / sp.ch);
        rows = Math.min(rows, 14);
        for (var cy = 0; cy < rows; cy++) {
          for (var cx = 0; cx < cols; cx++) {
            if (r() < sp.lit * quality) {
              wins.push({
                x: x + 6 + cx * sp.cw, y: top + 14 + cy * sp.ch, w: sp.cw * 0.46, h: sp.ch * 0.5,
                ph: r() * 100, sp: 0.4 + r() * 1.6, c: r() < 0.72 ? 0 : 1
              });
            }
          }
        }
      }

      function building(x, bw, bh, forceFlat) {
        var top = PADY + H - bh, kind = forceFlat ? 0 : Math.floor(r() * 4), tw, th;
        g.fillStyle = fg;
        g.strokeStyle = sp.rim; g.lineWidth = 1.3;
        if (kind === 2) {                                  // slanted roof
          var d = Math.min(26, bw * 0.3);
          g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw, top + d); g.lineTo(x + bw, bottom); g.lineTo(x, bottom); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw, top + d); g.stroke();
        } else {
          g.fillRect(x, top, bw, bottom - top);
          g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw, top); g.stroke();
          if (kind === 1) {                                // stepped tower
            tw = bw * (0.4 + r() * 0.2); th = bh * (0.14 + r() * 0.12);
            var tx = x + bw * (0.1 + r() * 0.3);
            g.fillRect(tx, top - th, tw, th + 1);
            g.beginPath(); g.moveTo(tx, top - th); g.lineTo(tx + tw, top - th); g.stroke();
          } else if (kind === 3) {                         // antenna
            var ax = x + bw * (0.3 + r() * 0.4), ah = 28 + r() * 40;
            g.fillRect(ax - 0.8, top - ah, 1.6, ah);
            beacons.push({ x: ax, y: top - ah, ph: r() * 20 });
          }
        }
        addWindows(x, bw, top + (kind === 2 ? 14 : 0));
      }

      var x = -20, skipA = -1, skipB = -1;

      if (sp.near && showFigure) {                          // the character's rooftop
        var sx = PADX + W * 0.04, ex = PADX + W * 0.34, bh0 = H - roofY;
        skipA = sx; skipB = ex;
        building(sx, ex - sx, bh0, true);
        var top0 = PADY + roofY;
        g.strokeStyle = 'rgba(120,205,255,.5)'; g.lineWidth = 1;          // railing
        g.beginPath(); g.moveTo(sx, top0 - 9); g.lineTo(ex, top0 - 9); g.stroke();
        for (var p = sx + 6; p < ex; p += 22) { g.beginPath(); g.moveTo(p, top0 - 9); g.lineTo(p, top0); g.stroke(); }
        g.fillStyle = '#040a1a';                                           // water tank + mast
        var tkx = sx + (ex - sx) * 0.78;
        g.fillRect(tkx, top0 - 30, 34, 24);
        g.fillRect(tkx + 4, top0 - 8, 3, 8); g.fillRect(tkx + 27, top0 - 8, 3, 8);
        g.fillRect(tkx - 2, top0 - 33, 38, 4);
        var mastX = ex - 26;
        g.fillRect(mastX, top0 - 70, 2, 70);
        beacons.push({ x: mastX + 1, y: top0 - 70, ph: 3 });
      }

      while (x < W + PADX * 2 + 20) {
        var bw = sp.minW + r() * (sp.maxW - sp.minW), bh = H * (sp.minH + r() * (sp.maxH - sp.minH));
        if (skipA >= 0 && x + bw > skipA - 4 && x < skipB + 4) { x = skipB + 4; continue; }
        building(x, bw, bh, false);
        x += bw + (r() < 0.3 ? 4 + r() * 10 : -2);
      }
      skyline.push({ cv: cv, wins: wins, beacons: beacons, near: !!sp.near });
    });
  }

  function drawSkyline(i, offX, offY) {
    var L = skyline[i], ox = -PADX + offX, oy = -PADY + offY, k;
    put(L.cv, ox, oy);
    var w = L.wins, n = w.length;
    if (n) {
      var cur = -1;
      for (k = 0; k < n; k++) {
        var q = w[k], a = 0.85;
        if (Math.sin(t * q.sp * 0.5 + q.ph * 7) > 0.985) a = 0.12;      // occasional blink
        else a = 0.7 + 0.3 * Math.sin(t * q.sp + q.ph);
        if (q.c !== cur) { cur = q.c; ctx.fillStyle = cur ? '#a7dcff' : '#ffd79c'; }
        ctx.globalAlpha = a;
        ctx.fillRect(ox + q.x, oy + q.y, q.w, q.h);
      }
      ctx.globalAlpha = 1;
    }
    var b = L.beacons;
    if (b.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (k = 0; k < b.length; k++) {
        var bb = b[k], on = Math.sin(t * 2.2 + bb.ph) > 0.1;
        ctx.globalAlpha = on ? 1 : 0.12;
        ctx.drawImage(glow, ox + bb.x - 9, oy + bb.y - 9, 18, 18);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (L.near && showFigure) drawFigure(figX + offX, roofY + offY + Math.sin(t * 1.3) * 0.35, H * 0.0018, t);
  }

  /* ---------- sky furniture ---------- */
  function drawStars() {
    ctx.fillStyle = '#dff1ff';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], a = (0.45 + 0.55 * Math.sin(t * s.sp + s.ph)) * (1 - s.y / (H * 0.7));
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      if (s.big) {
        var l = 5 + 3 * Math.sin(t * s.sp + s.ph);
        ctx.fillRect(s.x - l, s.y - 0.5, l * 2, 1); ctx.fillRect(s.x - 0.5, s.y - l, 1, l * 2);
        ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
      } else {
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMoon() {
    var pulse = 0.86 + 0.14 * Math.sin(t * 0.6), R, i;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9 * pulse;
    ctx.drawImage(halo, mx - mr * 9, my - mr * 9, mr * 18, mr * 18);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    ctx.save(); ctx.translate(mx, my); ctx.rotate(-0.32); ctx.scale(1, 0.28);   // ring, far half
    ctx.strokeStyle = 'rgba(150,222,255,.5)';
    var rr = [1.85, 2.05, 2.32], lw = [6, 3, 2], al = [0.4, 0.55, 0.35];
    for (i = 0; i < 3; i++) { ctx.globalAlpha = al[i]; ctx.lineWidth = lw[i]; ctx.beginPath(); ctx.arc(0, 0, mr * rr[i], PI, TAU); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;

    var d = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    d.addColorStop(0, '#ffffff'); d.addColorStop(0.6, '#d6efff'); d.addColorStop(1, '#7fb8ee');
    ctx.fillStyle = d; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip();
    ctx.fillStyle = 'rgba(70,120,190,.16)';
    var cr = [[-0.3, -0.1, 0.22], [0.25, 0.3, 0.17], [0.05, -0.45, 0.12], [-0.45, 0.35, 0.1], [0.45, -0.2, 0.09]];
    for (i = 0; i < cr.length; i++) { ctx.beginPath(); ctx.arc(mx + cr[i][0] * mr, my + cr[i][1] * mr, cr[i][2] * mr, 0, TAU); ctx.fill(); }
    var sh = ctx.createRadialGradient(mx - mr * 0.5, my - mr * 0.5, mr * 0.5, mx + mr * 0.2, my + mr * 0.2, mr * 1.25);
    sh.addColorStop(0, 'rgba(5,24,70,0)'); sh.addColorStop(1, 'rgba(5,24,70,.5)');
    ctx.fillStyle = sh; ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    ctx.restore();

    ctx.save(); ctx.translate(mx, my); ctx.rotate(-0.32); ctx.scale(1, 0.28);   // ring, near half
    ctx.strokeStyle = 'rgba(190,236,255,.8)';
    for (i = 0; i < 3; i++) { ctx.globalAlpha = al[i] + 0.25; ctx.lineWidth = lw[i]; ctx.beginPath(); ctx.arc(0, 0, mr * rr[i], 0, PI); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;

    // a small satellite circling the ring
    var a = t * 0.35, ex = Math.cos(a) * mr * 2.05, ey = Math.sin(a) * mr * 2.05 * 0.28;
    var rx = mx + ex * Math.cos(-0.32) - ey * Math.sin(-0.32), ry = my + ex * Math.sin(-0.32) + ey * Math.cos(-0.32);
    if (Math.sin(a) > 0 || Math.abs(ex) > mr) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow, rx - 9, ry - 9, 18, 18);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawRays() {
    var L = Math.hypot(W, H), base = PI / 2 + 0.14 + Math.sin(t * 0.12) * 0.12, i;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rayGrad;
    for (i = 0; i < 7; i++) {
      var a = base + (i - 3) * 0.17 + Math.sin(t * 0.2 + i * 1.3) * 0.03;
      var w = 0.028 + 0.016 * ((i * 7) % 3);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.5 + i * 2);
      ctx.beginPath(); ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a - w) * L, my + Math.sin(a - w) * L);
      ctx.lineTo(mx + Math.cos(a + w) * L, my + Math.sin(a + w) * L);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawClouds(id, dt) {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      if (c.l !== id) continue;
      c.x -= c.v * dt;
      var w = c.sp.cw * c.sc;
      if (c.x < -w) c.x = W + 20;
      ctx.globalAlpha = c.a;
      ctx.drawImage(c.sp, c.x, c.y, w, c.sp.ch * c.sc * c.flat);
    }
    ctx.globalAlpha = 1;
  }

  function drawShooters(dt) {
    shootNext -= dt;
    if (shootNext <= 0 && shooters.length < 2) {
      shootNext = 3.5 + Math.random() * 4.5;
      shooters.push({ x: W * (0.3 + Math.random() * 0.7), y: H * Math.random() * 0.32, vx: -(750 + Math.random() * 350), vy: 240 + Math.random() * 160, life: 0 });
    }
    for (var i = shooters.length - 1; i >= 0; i--) {
      var s = shooters[i];
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life > 1.1) { shooters.splice(i, 1); continue; }
      var f = Math.sin(Math.min(1, s.life / 1.1) * PI), tx = s.x - s.vx * 0.16, ty = s.y - s.vy * 0.16;
      var g = ctx.createLinearGradient(tx, ty, s.x, s.y);
      g.addColorStop(0, 'rgba(180,230,255,0)'); g.addColorStop(1, 'rgba(255,255,255,' + f + ')');
      ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f;
      ctx.drawImage(glow, s.x - 9, s.y - 9, 18, 18);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------- brand light ribbons with data pulses ---------- */
  function ribbonY(i, x, tt) {
    var u = x / W;
    return H * (0.58 + i * 0.075)
      + Math.sin(u * 5.2 + tt * (0.55 + i * 0.12) + i * 1.7) * H * 0.045
      + Math.sin(u * 11 - tt * 0.8 + i) * H * 0.012
      - u * H * 0.06 * (i % 2 ? -1 : 1);
  }
  function drawRibbons() {
    var i, x, k;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ribbonGrad;
    for (i = 0; i < 3; i++) {
      ctx.beginPath();
      for (x = -10; x <= W + 10; x += 16) { var y = ribbonY(i, x, t); if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.globalAlpha = 0.07; ctx.lineWidth = 16; ctx.stroke();
      ctx.globalAlpha = 0.17; ctx.lineWidth = 5; ctx.stroke();
      ctx.globalAlpha = 0.85; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < 3; i++) {
      for (k = 0; k < 4; k++) {
        var u = (t * 0.055 * (1 + i * 0.25) + k / 4 + i * 0.13) % 1, hx = u * W;
        for (var tr = 0; tr < 4; tr++) {
          var tx = hx - tr * 11, s = 26 - tr * 5;
          ctx.globalAlpha = 1 - tr * 0.25;
          ctx.drawImage(glow, tx - s / 2, ribbonY(i, tx, t) - s / 2, s, s);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- particles ---------- */
  function buildParticles() {
    var r = rng(91), i, small = W < 700;
    petals = []; motes = [];
    var np = small ? 22 : 40, nm = small ? 24 : 44;
    for (i = 0; i < np; i++) petals.push({ x: r() * W, y: r() * H, d: 0.5 + r() * 0.9, rot: r() * TAU, vr: (r() - 0.5) * 2.4, ph: r() * 20, tint: r() < 0.6 ? 0 : 1, a: 0.5 + r() * 0.4 });
    for (i = 0; i < nm; i++) motes.push({ x: r() * W, y: r() * H, v: 10 + r() * 22, s: 6 + r() * 10, ph: r() * 40 });
  }
  function windNow() {
    var g = 0;
    if (gust.left > 0) g = Math.sin(PI * (1 - gust.left / 1.6)) * 170;
    return 40 + 22 * Math.sin(t * 0.35) + g;
  }
  function drawParticles(dt) {
    var wind = windNow(), i, np = Math.floor(petals.length * quality), nm = Math.floor(motes.length * quality);
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < nm; i++) {
      var m = motes[i];
      m.y -= m.v * dt; m.x += (Math.sin(t * 0.7 + m.ph) * 8 - wind * 0.25) * dt;
      if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W; }
      if (m.x < -20) m.x = W + 20;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.6 + m.ph);
      ctx.drawImage(glow, m.x - m.s / 2, m.y - m.s / 2, m.s, m.s);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < np; i++) {
      var p = petals[i], s = 5 + p.d * 4.5;
      p.x -= (wind * p.d + Math.sin(t * 0.9 + p.ph) * 10) * dt;
      p.y += (22 + 26 * p.d + Math.cos(t * 1.1 + p.ph) * 10) * dt;
      p.rot += p.vr * dt;
      if (p.x < -20) { p.x = W + 20; p.y = Math.random() * H * 0.9; }
      if (p.y > H + 20) { p.y = -20; p.x = Math.random() * (W + 80); }
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.cos(t * 2.4 + p.ph) * 0.8 + 0.2, 1);
      ctx.globalAlpha = p.a * (0.55 + 0.45 * p.d);
      ctx.fillStyle = p.tint ? 'rgb(150,205,255)' : 'rgb(222,242,255)';
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.7, s * 0.7, 0, s);
      ctx.bezierCurveTo(-s * 0.7, s * 0.7, -s * 0.9, -s * 0.5, 0, -s);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawGust(dt) {
    gust.next -= dt;
    if (gust.next <= 0 && gust.left <= 0) {
      gust.left = 1.6; gust.next = 7 + Math.random() * 5; gust.lines = [];
      var n = W < 700 ? 8 : 15;
      for (var i = 0; i < n; i++) gust.lines.push({ x: W * (0.9 + Math.random() * 0.5), y: H * (0.05 + Math.random() * 0.75), len: 130 + Math.random() * 260, v: 1500 + Math.random() * 900, a: 0.25 + Math.random() * 0.35 });
    }
    if (gust.left <= 0) return;
    gust.left -= dt;
    var env = Math.sin(PI * Math.max(0, 1 - gust.left / 1.6));
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgb(210,238,255)'; ctx.lineWidth = 1.2;
    for (var j = 0; j < gust.lines.length; j++) {
      var l = gust.lines[j];
      l.x -= l.v * dt;
      var fr = [1, 0.6, 0.3];
      for (var k = 0; k < 3; k++) {
        ctx.globalAlpha = l.a * env * 0.45;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + l.len * fr[k], l.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlares() {
    var cx = W * 0.5, cy = H * 0.5, vx = cx - mx, vy = cy - my, ks = [0.35, 0.62, 0.9, 1.25], sz = [70, 36, 110, 52], i;
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < ks.length; i++) {
      ctx.globalAlpha = 0.07 * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 1.7));
      ctx.drawImage(glow, mx + vx * ks[i] - sz[i] / 2, my + vy * ks[i] - sz[i] / 2, sz[i], sz[i]);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- the character on the rooftop ---------- */
  function drawFigure(x, y, s, tt) {
    var wob = Math.sin(tt * 2.1), wob2 = Math.sin(tt * 3.1 + 1), i;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    function shapes(col) {
      ctx.fillStyle = col; ctx.strokeStyle = col;
      ctx.lineWidth = 7;                                           // legs
      ctx.beginPath(); ctx.moveTo(-3, -62); ctx.lineTo(-7, 0); ctx.moveTo(4, -62); ctx.lineTo(7, 0); ctx.stroke();
      var hl = -17 - 4 * (0.5 + 0.5 * wob), hr = 12 + 2 * wob2;    // coat with wind-blown hem
      ctx.beginPath();
      ctx.moveTo(-8, -118); ctx.lineTo(8, -118); ctx.lineTo(10, -90);
      ctx.quadraticCurveTo(hr + 2, -62, hr, -40 + wob2);
      ctx.quadraticCurveTo(-2, -34 + wob * 1.5, hl, -40 + wob * 2.5);
      ctx.quadraticCurveTo(-13, -80, -8, -118);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(1, -121); ctx.lineTo(2, -126); ctx.stroke();   // neck
      ctx.beginPath(); ctx.arc(3, -131, 8.4, 0, TAU); ctx.fill();                                    // head
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(4, -114); ctx.lineTo(9, -93); ctx.lineTo(6, -75); ctx.stroke(); // arm
      for (i = 0; i < 6; i++) {                                    // flowing hair
        var ax = -3, ay = -137 + i * 2.1, L = 26 + i * 5;
        ctx.lineWidth = 3.8 - i * 0.38;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.bezierCurveTo(ax - L * 0.35, ay - 2 + Math.sin(tt * 3 + i) * 4,
                          ax - L * 0.7, ay + 4 + Math.cos(tt * 2.6 + i * 1.3) * 6,
                          ax - L, ay + 8 + i * 1.5 + Math.sin(tt * 3.4 + i * 0.8) * 7);
        ctx.stroke();
      }
    }
    ctx.save(); ctx.translate(1.4, -1.1); shapes('#66d3ff'); ctx.restore();   // moonlit rim
    shapes('#040a1a');

    // brand-blue scarf streaming in the wind
    var top = [], bot = [], N = 16, u, px0, py0, wd;
    for (i = 0; i <= N; i++) {
      u = i / N;
      px0 = -2 - u * 64; py0 = -119 + Math.sin(tt * 3.2 - u * 5.2) * 6 * u + u * u * 16;
      wd = 6.5 * (1 - u) + 1.6;
      top.push([px0, py0 - wd / 2]); bot.push([px0, py0 + wd / 2]);
    }
    var sg = ctx.createLinearGradient(-66, 0, 0, 0);
    sg.addColorStop(0, '#5da2f5'); sg.addColorStop(0.5, '#2f83f0'); sg.addColorStop(1, '#0054b8');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (i = 1; i <= N; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath(); ctx.fill();

    // holographic interface orbiting the raised hand
    ctx.globalCompositeOperation = 'lighter';
    var hx = 20, hy = -94;
    ctx.strokeStyle = 'rgba(120,225,255,.85)'; ctx.lineWidth = 0.9;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tt * 0.8);
    ctx.beginPath();
    for (i = 0; i < 6; i++) { var ha = i / 6 * TAU; ctx.lineTo(Math.cos(ha) * 9, Math.sin(ha) * 9); }
    ctx.closePath(); ctx.stroke();
    ctx.rotate(-tt * 1.6); ctx.strokeStyle = 'rgba(160,235,255,.5)';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0.3, 4.2); ctx.stroke();
    ctx.restore();
    for (i = 0; i < 5; i++) {
      var oa = tt * 1.3 + i * (TAU / 5);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(glow, hx + Math.cos(oa) * 19 - 4, hy + Math.sin(oa) * 7 - 4, 8, 8);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /* ---------- build + frame ---------- */
  function build() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, quality === 1 ? 1.5 : 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var wide = W >= 900;
    mx = wide ? W * 0.4 : W * 0.72;
    my = wide ? H * 0.23 : H * 0.1;
    mr = Math.max(28, Math.min(W, H) * (wide ? 0.088 : 0.07));
    showFigure = wide && H >= 520;
    roofY = H * 0.72; figX = W * 0.19;

    buildGlow(); buildSky(); buildStars(); buildClouds(); buildSkyline(); buildParticles();

    var L = Math.hypot(W, H);
    rayGrad = ctx.createRadialGradient(mx, my, 0, mx, my, L);
    rayGrad.addColorStop(0, 'rgba(150,210,255,.16)');
    rayGrad.addColorStop(0.5, 'rgba(100,180,255,.06)');
    rayGrad.addColorStop(1, 'rgba(80,160,255,0)');
    ribbonGrad = ctx.createLinearGradient(0, 0, W, 0);
    ribbonGrad.addColorStop(0, 'rgba(47,131,240,0)');
    ribbonGrad.addColorStop(0.25, 'rgba(47,131,240,1)');
    ribbonGrad.addColorStop(0.55, 'rgba(23,184,214,1)');
    ribbonGrad.addColorStop(0.85, 'rgba(160,225,255,1)');
    ribbonGrad.addColorStop(1, 'rgba(160,225,255,0)');
  }

  function frame(dt) {
    t += dt;
    px += (tpx - px) * Math.min(1, dt * 2.5);
    py += (tpy - py) * Math.min(1, dt * 2.5);
    var sway = Math.sin(t * 0.18);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    put(sky, 0, 0);
    drawStars();
    drawMoon();
    drawRays();
    drawClouds(0, dt);
    drawShooters(dt);
    drawSkyline(0, -px * 6 - sway * 4, -py * 3);
    drawClouds(1, dt);
    drawSkyline(1, -px * 12 - sway * 7, -py * 5);
    drawRibbons();
    drawSkyline(2, -px * 22 - sway * 10, -py * 8);
    drawClouds(2, dt);
    drawParticles(dt);
    drawGust(dt);
    drawFlares();
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    frame(dt);
    frames++; avg += (dt * 1000 - avg) * 0.05;
    if (frames === 120 && avg > 27 && quality === 1) { quality = 0.6; build(); }   // slow device: lighten up
  }
  function start() { if (!raf && !reduce) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  build();
  if (reduce) { t = 7; frame(0); } else { start(); }

  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (Math.abs(window.innerWidth - W) > 0 || Math.abs(window.innerHeight - H) > 100) {
        build();
        if (reduce) frame(0);
      }
    }, 160);
  });
  window.addEventListener('pointermove', function (e) {
    tpx = (e.clientX / (W || 1) - 0.5) * 2; tpy = (e.clientY / (H || 1) - 0.5) * 2;
  }, { passive: true });
})();
