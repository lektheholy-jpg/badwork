// ==========================================================================
// ธีม สว่าง / มืด / ตามระบบ + พื้นหลังหน้า — โหลดใน <head> ก่อนวาดหน้า เพื่อไม่ให้จอวาบขาวตอนเปิดโหมดมืด
// พื้นหลังมี 2 แบบ: ชุดสีสำเร็จรูป (BG_OPTIONS) และ "กำหนดเอง" (สีเดียว / ไล่สี / ลาย) ที่ผู้ใช้เลือกสีได้อิสระ
// สีตัวหนังสือที่วางบนพื้นหลังโดยตรง (ชื่อ เวรกรรม.. เมนู หัวหน้า) คำนวณใหม่ตามพื้นหลังทุกครั้ง
// ==========================================================================
(function () {
  var KEY = 'myscore-theme'; // 'auto' | 'light' | 'dark'
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var curCfg = null; // ค่าพื้นหลังแบบกำหนดเองที่ใช้อยู่ (null = ค่าเริ่มต้น/ชุดสำเร็จรูป)

  function readPref() {
    try { var v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'auto') return v; } catch (e) {}
    return 'auto';
  }
  function resolve(pref) {
    return pref === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : pref;
  }
  function apply(pref) {
    var theme = resolve(pref);
    document.documentElement.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#F4F4F6'); // ให้แถบสถานะมือถือกลืนกับสีพื้นหลัง (--bg) ของแต่ละโหมด
    applyTone(); // พื้นหลังกำหนดเอง: สีตัวหนังสือ/การ์ดต้องคำนวณใหม่เมื่อสลับสว่าง-มืด
  }

  // ---------- ตัวช่วยเรื่องสี ----------
  var HEX = /^#[0-9a-f]{6}$/i;
  var DARK_INK = [16, 17, 20], LIGHT_INK = [248, 249, 251];
  function hex2rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbCss(c, a) {
    var r = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]);
    return a == null ? 'rgb(' + r + ')' : 'rgba(' + r + ',' + a + ')';
  }
  function rgbHex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function relLum(c) {
    var l = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }
  function contrast(a, b) { var x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function num(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.round(clamp(v, lo, hi)) : d; }

  // ---------- ชุดสีสำเร็จรูป (ตัวแปร --bgp-<ชื่อ> ใน css/style.css) ----------
  var BG_KEY = 'myscore-bg'; // ค่าที่เก็บ: ชื่อชุดสำเร็จรูป หรือ JSON ของพื้นหลังกำหนดเอง (ขึ้นต้นด้วย '{')
  var BG_IDS = ['lemon', 'sky', 'lilac', 'mint', 'ocean', 'aurora', 'sunny', 'dusk'];
  var PATTERNS = [['dots', 'จุด'], ['grid', 'ตาราง'], ['lines', 'เส้นบรรทัด'], ['diag', 'ทแยง'],
                  ['mesh', 'ตาข่าย'], ['checker', 'หมากรุก'], ['zigzag', 'ซิกแซก'], ['rings', 'วงกลม']];
  var PATTERN_COVER = { dots: 0.12, grid: 0.15, lines: 0.1, diag: 0.2, mesh: 0.35, checker: 0.5, zigzag: 0.5, rings: 0.2 }; // สัดส่วนพื้นที่ที่ลายครอบ (ใช้ประมาณความสว่างเฉลี่ย)

  // ---------- พื้นหลังกำหนดเอง ----------
  // cfg = { t: 'solid'|'grad'|'pattern', c: [สี hex 1–3 สี], a: มุมไล่สี 0–360, k: 'linear'|'radial',
  //         (เฉพาะลาย) p: ชื่อลาย, ink: สีลาย, s: ขนาดลาย px, o: ความเข้มลาย % }
  function cleanCfg(o) {
    if (!o || typeof o !== 'object') return null;
    var t = o.t;
    if (t !== 'solid' && t !== 'grad' && t !== 'pattern') return null;
    var cs = (o.c instanceof Array ? o.c : []).filter(function (x) { return typeof x === 'string' && HEX.test(x); })
      .map(function (x) { return x.toLowerCase(); });
    if (t === 'solid') cs = cs.slice(0, 1);
    else if (t === 'grad') cs = cs.slice(0, 3);
    else cs = cs.slice(0, 2);
    if (cs.length < (t === 'grad' ? 2 : 1)) return null;
    var cfg = { t: t, c: cs, a: num(o.a, 0, 360, 180), k: o.k === 'radial' ? 'radial' : 'linear' };
    if (t === 'pattern') {
      cfg.p = PATTERNS.some(function (x) { return x[0] === o.p; }) ? o.p : 'dots';
      cfg.ink = typeof o.ink === 'string' && HEX.test(o.ink) ? o.ink.toLowerCase() : '#000000';
      cfg.s = num(o.s, 12, 72, 28);
      cfg.o = num(o.o, 8, 100, 30);
    }
    return cfg;
  }
  function baseCss(cfg) {
    var cs = cfg.c;
    if (cs.length === 1) return cs[0];
    if (cfg.k === 'radial') return 'radial-gradient(circle at 50% 30%, ' + cs.join(', ') + ')';
    return 'linear-gradient(' + cfg.a + 'deg, ' + cs.join(', ') + ')';
  }
  // ลายทั้งหมดสร้างจาก CSS gradient ล้วน (ไม่โหลดรูป) · scale ใช้ย่อลายสำหรับช่องตัวอย่าง
  function patternLayers(cfg, scale) {
    var s = Math.max(6, Math.round(cfg.s * (scale || 1)));
    var I = rgbCss(hex2rgb(cfg.ink), cfg.o / 100);
    var w = Math.max(1, Math.round(s / 14)), r = Math.max(2, Math.round(s * 0.1)), half = Math.round(s / 2);
    var sz = s + 'px ' + s + 'px';
    function stripe(deg) { return 'repeating-linear-gradient(' + deg + 'deg, ' + I + ' 0px, ' + I + ' ' + w + 'px, transparent ' + w + 'px, transparent ' + half + 'px)'; }
    switch (cfg.p) {
      case 'grid':
        return ['linear-gradient(' + I + ' ' + w + 'px, transparent ' + w + 'px) 0 0 / ' + sz,
                'linear-gradient(90deg, ' + I + ' ' + w + 'px, transparent ' + w + 'px) 0 0 / ' + sz];
      case 'lines': return ['linear-gradient(' + I + ' ' + w + 'px, transparent ' + w + 'px) 0 0 / 100% ' + s + 'px'];
      case 'diag': return [stripe(45)];
      case 'mesh': return [stripe(45), stripe(-45)];
      case 'checker':
        return ['conic-gradient(' + I + ' 25%, transparent 25%, transparent 50%, ' + I + ' 50%, ' + I + ' 75%, transparent 75%) 0 0 / ' + sz];
      case 'zigzag':
        return ['linear-gradient(135deg, ' + I + ' 25%, transparent 25%) -' + half + 'px 0 / ' + sz,
                'linear-gradient(225deg, ' + I + ' 25%, transparent 25%) -' + half + 'px 0 / ' + sz,
                'linear-gradient(315deg, ' + I + ' 25%, transparent 25%) 0 0 / ' + sz,
                'linear-gradient(45deg, ' + I + ' 25%, transparent 25%) 0 0 / ' + sz];
      case 'rings': {
        var r1 = Math.round(s * 0.28);
        return ['radial-gradient(circle, transparent ' + r1 + 'px, ' + I + ' ' + r1 + 'px, ' + I + ' ' + (r1 + w) + 'px, transparent ' + (r1 + w) + 'px) 0 0 / ' + sz];
      }
      default: return ['radial-gradient(circle, ' + I + ' ' + r + 'px, transparent ' + (r + 1) + 'px) 0 0 / ' + sz]; // dots
    }
  }
  function bgCss(cfg, scale) {
    var layers = cfg.t === 'pattern' ? patternLayers(cfg, scale) : [];
    layers.push(baseCss(cfg));
    return layers.join(', ');
  }

  // สีของพื้นหลัง ณ จุด (x, y) บนจอ — ใช้หาสีตัวหนังสือที่ชัดที่สุด (พื้นหลังเป็น fixed จึงอ้างอิงขนาดจอ W×H)
  function baseAt(cfg, x, y, W, H) {
    var cols = cfg.c.map(hex2rgb), n = cols.length - 1;
    if (n < 1) return cols[0];
    var t;
    if (cfg.k === 'radial') {
      var cx = W * 0.5, cy = H * 0.3;
      var d = function (px, py) { return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)); };
      t = d(x, y) / Math.max(d(0, 0), d(W, 0), d(0, H), d(W, H));
    } else {
      var rad = cfg.a * Math.PI / 180, sn = Math.sin(rad), cs = Math.cos(rad);
      t = 0.5 + ((x - W / 2) * sn - (y - H / 2) * cs) / (Math.abs(W * sn) + Math.abs(H * cs));
    }
    var p = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(p));
    return mixRgb(cols[i], cols[i + 1], p - i);
  }
  // สีที่ต้องอ่านให้ออกทั้งหมด ณ จุดนั้น: พื้น และ (ถ้ามีลาย) พื้นตรงที่ลายเข้มสุด
  function samplesAt(cfg, x, y, W, H) {
    var b = baseAt(cfg, x, y, W, H);
    return cfg.t === 'pattern' ? [b, mixRgb(b, hex2rgb(cfg.ink), cfg.o / 100)] : [b];
  }
  function avgLum(cfg, W, H) {
    var sum = 0, n = 0, cover = cfg.t === 'pattern' ? (PATTERN_COVER[cfg.p] || 0.2) * cfg.o / 100 : 0;
    [0.1, 0.35, 0.6, 0.85].forEach(function (fx) {
      [0.1, 0.4, 0.7, 0.95].forEach(function (fy) {
        var b = baseAt(cfg, W * fx, H * fy, W, H);
        sum += relLum(cover ? mixRgb(b, hex2rgb(cfg.ink), cover) : b); n++;
      });
    });
    return sum / n;
  }
  // เลือกสีตัวหนังสือ (เข้ม/อ่อน) ที่คอนทราสต์ต่ำสุดดีที่สุดในทุกจุด · ถ้ายังไม่ถึง 4.5:1 ใส่เงารอบตัวอักษรสีตรงข้ามช่วย
  function pickInk(samples) {
    var best = null;
    [DARK_INK, LIGHT_INK].forEach(function (cand) {
      var min = Infinity;
      samples.forEach(function (s) { min = Math.min(min, contrast(cand, s)); });
      if (!best || min > best.min) best = { c: cand, min: min };
    });
    var opp = best.c === DARK_INK ? LIGHT_INK : DARK_INK;
    return { ink: rgbCss(best.c), soft: rgbCss(best.c, 0.72), hover: rgbCss(best.c, 0.12),
             halo: best.min < 4.5 ? rgbCss(opp, 0.65) : 'transparent' };
  }
  function pointsOf(cfg, W, H, pts) {
    var out = [];
    pts.forEach(function (p) { out = out.concat(samplesAt(cfg, clamp(p[0], 0, W), clamp(p[1], 0, H), W, H)); });
    return out;
  }

  var TONE_VARS = ['--on-bg', '--on-bg-soft', '--on-bg-hover', '--on-bg-halo', '--on-bg-accent', '--on-brand', '--on-brand-halo', '--card-glass', '--card-glass-hover'];
  // ตั้งค่าตัวแปรที่ขึ้นกับพื้นหลังกำหนดเอง: สีตัวหนังสือบนพื้น (--on-bg*), สีชื่อแอป (--on-brand*), ความทึบการ์ด, สีแถบสถานะ
  function applyTone() {
    var root = document.documentElement, st = root.style;
    if (!curCfg) { TONE_VARS.forEach(function (v) { st.removeProperty(v); }); return; }
    var W = window.innerWidth || 1280, H = window.innerHeight || 800;
    // ทั้งหน้า: ตัวหนังสือบนพื้นอยู่ได้ทุกตำแหน่ง จึงเช็กทั้งตาราง 4×4
    var grid = [];
    [0.08, 0.35, 0.65, 0.92].forEach(function (fx) { [0.06, 0.35, 0.65, 0.94].forEach(function (fy) { grid.push([W * fx, H * fy]); }); });
    var pageSamples = pointsOf(curCfg, W, H, grid);
    var page = pickInk(pageSamples);
    st.setProperty('--on-bg', page.ink); st.setProperty('--on-bg-soft', page.soft);
    st.setProperty('--on-bg-hover', page.hover); st.setProperty('--on-bg-halo', page.halo);
    // เมนูที่เลือกอยู่ใช้สีหลัก (--primary-dark) · ถ้าสีนั้นอ่านยากบนพื้นหลังที่เลือก ให้ใช้สีตัวหนังสือบนพื้นแทน
    var pd = (getComputedStyle(root).getPropertyValue('--primary-dark') || '').trim();
    var accentOk = HEX.test(pd) && pageSamples.every(function (c) { return contrast(hex2rgb(pd), c) >= 4.5; });
    if (accentOk) st.removeProperty('--on-bg-accent'); else st.setProperty('--on-bg-accent', page.ink);
    // ชื่อแอป (มุมบนซ้าย): เช็กเฉพาะบริเวณที่ตัวอักษรอยู่ จึงเปลี่ยนสีได้ตรงกับพื้นตรงนั้น
    var brand = pickInk(pointsOf(curCfg, W, H, [[30, 22], [30, 64], [130, 22], [130, 64], [240, 22], [240, 64], [130, 44]]));
    st.setProperty('--on-brand', brand.ink); st.setProperty('--on-brand-halo', brand.halo);
    // พื้นทึบสวนกับธีม (พื้นมืดในโหมดสว่าง / พื้นสว่างในโหมดมืด) → การ์ดโปร่งอ่านยาก จึงเพิ่มความทึบการ์ด
    // ลายก็เพิ่มความทึบการ์ดเช่นกัน ไม่ให้ลายตัดกับตัวหนังสือในการ์ด
    var L = avgLum(curCfg, W, H), dark = root.dataset.theme === 'dark', clash = dark ? L > 0.12 : L < 0.35;
    var alpha = clash ? 84 : (curCfg.t === 'pattern' ? 72 : 0);
    if (!alpha) { st.removeProperty('--card-glass'); st.removeProperty('--card-glass-hover'); }
    else {
      st.setProperty('--card-glass', (dark ? 'rgb(28 28 31 / ' : 'rgb(255 255 255 / ') + alpha + '%)');
      st.setProperty('--card-glass-hover', (dark ? 'rgb(40 40 44 / ' : 'rgb(255 255 255 / ') + (alpha + 10) + '%)');
    }
    var meta = document.querySelector('meta[name="theme-color"]'); // แถบสถานะมือถือกลืนกับสีพื้นหลังด้านบน
    if (meta) meta.setAttribute('content', rgbHex(samplesAt(curCfg, W / 2, 0, W, H)[0]));
  }

  function readRaw() { try { return localStorage.getItem(BG_KEY); } catch (e) { return null; } }
  function parseCustom(raw) {
    if (!raw || raw.charAt(0) !== '{') return null;
    try { return cleanCfg(JSON.parse(raw)); } catch (e) { return null; }
  }
  function readBg() { // 'default' | ชื่อชุดสำเร็จรูป | 'custom'
    var v = readRaw();
    if (BG_IDS.indexOf(v) !== -1) return v;
    return parseCustom(v) ? 'custom' : 'default';
  }
  function applyBg(id) {
    var root = document.documentElement;
    curCfg = null;
    if (id === 'custom') curCfg = parseCustom(readRaw());
    if (curCfg) { root.style.setProperty('--page-bg', bgCss(curCfg)); root.dataset.bg = 'custom'; }
    else if (id === 'default' || id === 'custom') { root.style.removeProperty('--page-bg'); root.removeAttribute('data-bg'); }
    else { root.style.setProperty('--page-bg', 'var(--bgp-' + id + ')'); root.dataset.bg = id; }
    applyTone();
  }
  window.getBgPref = readBg;
  window.setBgPref = function (id) {
    try { if (id === 'default') localStorage.removeItem(BG_KEY); else localStorage.setItem(BG_KEY, id); } catch (e) {}
    applyBg(id);
  };
  window.getBgCustom = function () { return parseCustom(readRaw()); };
  window.setBgCustom = function (cfg) { // คืน cfg ที่ผ่านการตรวจแล้ว (หรือ null ถ้าไม่ถูกต้อง)
    cfg = cleanCfg(cfg);
    if (!cfg) return null;
    try { localStorage.setItem(BG_KEY, JSON.stringify(cfg)); } catch (e) {}
    applyBg('custom');
    return cfg;
  };
  window.bgCssOf = function (cfg, scale) { cfg = cleanCfg(cfg); return cfg ? bgCss(cfg, scale) : ''; }; // สำหรับช่องตัวอย่างในหน้าตั้งค่า
  window.BG_PATTERNS = PATTERNS;
  window.BG_OPTIONS = {
    solid: [['lemon', 'เหลือง'], ['sky', 'ฟ้า'], ['lilac', 'ม่วง'], ['mint', 'เขียวมิ้นต์']],
    gradient: [['ocean', 'ฟ้า-เขียว'], ['aurora', 'ออโรรา'], ['sunny', 'เหลือง-เขียว'], ['dusk', 'ฟ้า-ม่วง']]
  };

  window.getThemePref = readPref;
  window.setThemePref = function (pref) {
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    apply(pref);
  };

  apply(readPref());
  applyBg(readBg());
  if (mq) {
    var onChange = function () { if (readPref() === 'auto') apply('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  // หมุนจอ/ย่อขยายหน้าต่าง: ไล่สีเป็น fixed ตามขนาดจอ ต้องคำนวณสีตัวหนังสือใหม่
  var toneTimer = 0;
  window.addEventListener('resize', function () {
    if (!curCfg) return;
    clearTimeout(toneTimer); toneTimer = setTimeout(applyTone, 120);
  });
})();
