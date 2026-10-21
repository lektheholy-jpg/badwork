// ==========================================================================
// ธีม สว่าง / มืด / ตามระบบ + พื้นหลังหน้า — โหลดใน <head> ก่อนวาดหน้า เพื่อไม่ให้จอวาบขาวตอนเปิดโหมดมืด
// พื้นหลังมี 2 แบบ: ชุดสีสำเร็จรูป (BG_OPTIONS) และ "กำหนดเอง" (สีเดียว / ไล่สี / ลาย) ที่ผู้ใช้เลือกสีได้อิสระ
// สีตัวหนังสือที่วางบนพื้นหลังโดยตรง (ชื่อ เวรกรรม.. เมนู หัวหน้า) คำนวณใหม่ตามพื้นหลังทุกครั้ง
// ค่าเก็บใน localStorage ก่อนเสมอ (เปิดแอปได้ทันที/ออฟไลน์) แล้ว js/auth.js ซิงค์ขึ้นบัญชี Google (getAppearance / setAppearance / เหตุการณ์ 'myscore:appearance')
// ==========================================================================
(function () {
  var KEY = 'myscore-theme'; // 'auto' | 'light' | 'dark'
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var curCfg = null; // ค่าพื้นหลังแบบกำหนดเองที่ใช้อยู่ (null = ค่าเริ่มต้น/ชุดสำเร็จรูป)
  // แจ้งว่า "หน้าตา" เปลี่ยน (ธีม/พื้นหลัง/สี/ความโปร่งใส/ชุดตั้งค่า) → js/auth.js ฟังเหตุการณ์นี้แล้วซิงค์ขึ้นบัญชี Google
  // muted = ตอนนำค่าจากคลาวด์มาใช้ ไม่แจ้ง (กันวนส่งค่ากลับขึ้นคลาวด์)
  var muted = false;
  function notify() {
    if (muted) return;
    try { document.dispatchEvent(new CustomEvent('myscore:appearance')); } catch (e) {}
  }

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
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#121212' : '#F4F4F4'); // ให้แถบสถานะมือถือกลืนกับสีพื้นหลัง (--bg) ของแต่ละโหมด
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
  // ชุดสีไล่เฉดที่กำหนดเป็นค่า cfg (ไม่ใช่ตัวแปร --bgp-*) จึงผ่านการคำนวณสีตัวหนังสือ/ความทึบการ์ดเหมือนพื้นหลังกำหนดเอง
  //   classicblue    = linear-gradient(120deg, #20A2FF, #034EA2)
  //   calmblue       = linear-gradient(135deg, #CEDBEC, #9EB8DA, #6D94C7)
  //   softpurplepink = linear-gradient(135deg, #A56DF5, #685BC7, #1C4CD4)
  var PRESET_CFG = {
    classicblue:    { t: 'grad', c: ['#20a2ff', '#034ea2'], a: 120, k: 'linear' },
    calmblue:       { t: 'grad', c: ['#cedbec', '#9eb8da', '#6d94c7'], a: 135, k: 'linear' },
    softpurplepink: { t: 'grad', c: ['#a56df5', '#685bc7', '#1c4cd4'], a: 135, k: 'linear' },
    // สไตล์ One UI (พาสเทลนุ่ม ไล่เฉด 3 สี) — โทนและแนวไล่สีใกล้เคียงวอลเปเปอร์ One UI แต่เป็นค่าที่เลือกเอง ไม่ใช่ค่าทางการของ Samsung
    uimint:     { t: 'grad', c: ['#d4f1e4', '#a9dfd0', '#7cc4c0'], a: 135, k: 'linear' },
    uipeach:    { t: 'grad', c: ['#ffe3d0', '#ffc4b0', '#f79fa4'], a: 135, k: 'linear' },
    uilavender: { t: 'grad', c: ['#e6dcf8', '#c9b8ee', '#a493de'], a: 135, k: 'linear' },
    uirose:     { t: 'grad', c: ['#fde1ea', '#f8bdd2', '#e996b9'], a: 135, k: 'linear' },
    uisage:     { t: 'grad', c: ['#e3ecd6', '#c4d6b0', '#9fbb8a'], a: 135, k: 'linear' },
    uisand:     { t: 'grad', c: ['#f5ebd9', '#e8d4b3', '#d3b78f'], a: 135, k: 'linear' },
    uisky:      { t: 'grad', c: ['#dff0fb', '#b8dcf5', '#8fc3ee'], a: 135, k: 'linear' },
    uigraphite: { t: 'grad', c: ['#e4e6ea', '#c3c8d0', '#9aa2ae'], a: 135, k: 'linear' },
    // เข้มและสดใส
    midnight:   { t: 'grad', c: ['#1e2a4a', '#2d3b6b', '#4b4f9a'], a: 150, k: 'linear' },
    forest:     { t: 'grad', c: ['#0f3d3a', '#1b5e43', '#4f7d2c'], a: 150, k: 'linear' },
    berry:      { t: 'grad', c: ['#5e1740', '#8f2559', '#c2417c'], a: 150, k: 'linear' },
    sunsetpop:  { t: 'grad', c: ['#ff9a8b', '#ff6a88', '#c471f5'], a: 135, k: 'linear' },
    oceandeep:  { t: 'grad', c: ['#0a3560', '#0f5a8a', '#1d7ba3'], a: 160, k: 'linear' },
    lagoon:     { t: 'grad', c: ['#2193b0', '#6dd5ed'], a: 135, k: 'linear' }
  };
  var BG_IDS = ['lemon', 'sky', 'lilac', 'mint', 'ocean', 'aurora', 'sunny', 'dusk'].concat(Object.keys(PRESET_CFG));
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
  function toneBase() {
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

  // ---------- สีหลัก + ความโปร่งใสของส่วนต่างๆ (ผู้ใช้ปรับเองในหน้าตั้งค่า) ----------
  // ค่าที่เก็บ: { pc: สีหลัก hex | null, card: ความโปร่งใสการ์ด 0–90 | null, menu: ความโปร่งใสเมนู 0–90 | null, blur: ความเบลอเมนู 0–40 px | null }
  // null = ใช้ค่าเริ่มต้นของ css/style.css · ทับค่าที่ applyTone คำนวณ (พื้นหลังสวนธีม/ลาย) เพราะผู้ใช้ตั้งเอง
  var LOOK_KEY = 'myscore-look';
  var LOOK_DEFAULT = { card: { light: 65, dark: 60 }, menu: 70, blur: 30, glass: true }; // ตรงกับ --card-glass / --glass / --glass-blur ใน style.css
  var LOOK_VARS = ['--primary', '--primary-solid', '--primary-dark', '--primary-tint', '--on-primary', '--glass', '--glass-blur'];
  function cleanLook(o) {
    o = o && typeof o === 'object' ? o : {};
    function opt(v, lo, hi) { return v == null ? null : num(v, lo, hi, null); }
    return { pc: typeof o.pc === 'string' && HEX.test(o.pc) ? o.pc.toLowerCase() : null,
             card: opt(o.card, 0, 90), menu: opt(o.menu, 0, 90), blur: opt(o.blur, 0, 40),
             glass: typeof o.glass === 'boolean' ? o.glass : null }; // เอฟเฟกต์กระจกของการ์ด · null = ค่าเริ่มต้น (เปิด)
  }
  function readLook() {
    try { return cleanLook(JSON.parse(localStorage.getItem(LOOK_KEY))); } catch (e) { return cleanLook(null); }
  }
  // สีหลักเดียวต้องได้ 4 ระดับ (ปุ่ม / ตัวหนังสือสีหลัก / พื้นอ่อน / ตัวหนังสือบนปุ่ม) ที่อ่านชัดทั้งโหมดสว่างและมืด
  function primaryVars(hex, dark) {
    var p = hex2rgb(hex), black = [0, 0, 0], white = [255, 255, 255];
    var tint = dark ? mixRgb(p, [18, 18, 22], 0.78) : mixRgb(p, white, 0.88);
    var deep = null;
    for (var t = dark ? 0.35 : 0.2; t <= 0.9; t += 0.05) { // ขยับให้ตัวหนังสือสีหลักคอนทราสต์ ≥ 4.5 บนพื้นอ่อน
      deep = dark ? mixRgb(p, white, t) : mixRgb(p, black, t);
      if (contrast(deep, tint) >= 4.5) break;
    }
    var onP = contrast(white, p) >= contrast(DARK_INK, p) ? white : DARK_INK;
    return { '--primary': hex, '--primary-solid': hex, '--primary-dark': rgbHex(deep), '--primary-tint': rgbHex(tint), '--on-primary': rgbHex(onP) };
  }
  function applyLook() {
    var root = document.documentElement, st = root.style, L = readLook(), dark = root.dataset.theme === 'dark';
    LOOK_VARS.forEach(function (v) { st.removeProperty(v); });
    if (L.pc) { var pv = primaryVars(L.pc, dark); Object.keys(pv).forEach(function (k) { st.setProperty(k, pv[k]); }); }
    if (L.glass === false) delete root.dataset.glass; else root.dataset.glass = 'on'; // css: :root[data-glass="on"] → เบลอหลังการ์ด
    if (L.menu != null) st.setProperty('--glass', (100 - L.menu) + '%');
    if (L.blur != null) st.setProperty('--glass-blur', L.blur + 'px');
    if (L.card != null) {
      var a = 100 - L.card, rgb = dark ? 'rgb(70 70 78 / ' : 'rgb(255 255 255 / ';
      st.setProperty('--card-glass', rgb + a + '%)');
      st.setProperty('--card-glass-hover', rgb + Math.min(100, a + 15) + '%)');
    }
  }
  function applyTone() { toneBase(); applyLook(); }
  window.getLookPref = readLook;
  window.getLookDefaults = function () { return { card: LOOK_DEFAULT.card[resolve(readPref()) === 'dark' ? 'dark' : 'light'], menu: LOOK_DEFAULT.menu, blur: LOOK_DEFAULT.blur, glass: LOOK_DEFAULT.glass }; };
  window.setLookPref = function (patch) { // patch = บางคีย์ของค่าข้างบน · คืนค่าที่ผ่านการตรวจแล้ว
    var cur = readLook(), next = cleanLook(Object.assign({}, cur, patch));
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch (e) {}
    applyTone();
    notify();
    return next;
  };
  window.resetLookPref = function () {
    try { localStorage.removeItem(LOOK_KEY); } catch (e) {}
    applyTone();
    notify();
  };

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
    else if (PRESET_CFG[id]) curCfg = cleanCfg(PRESET_CFG[id]); // ชุดไล่เฉด: ใช้ทางเดียวกับกำหนดเอง (data-bg="custom" = พื้นที่คำนวณโทนตัวหนังสือแล้ว)
    if (curCfg) { root.style.setProperty('--page-bg', bgCss(curCfg)); root.dataset.bg = 'custom'; }
    else if (id === 'default' || id === 'custom') { root.style.removeProperty('--page-bg'); root.removeAttribute('data-bg'); }
    else { root.style.setProperty('--page-bg', 'var(--bgp-' + id + ')'); root.dataset.bg = id; }
    applyTone();
  }
  window.getBgPref = readBg;
  window.setBgPref = function (id) {
    try { if (id === 'default') localStorage.removeItem(BG_KEY); else localStorage.setItem(BG_KEY, id); } catch (e) {}
    applyBg(id);
    notify();
  };
  window.getBgCustom = function () { return parseCustom(readRaw()); };
  window.setBgCustom = function (cfg) { // คืน cfg ที่ผ่านการตรวจแล้ว (หรือ null ถ้าไม่ถูกต้อง)
    cfg = cleanCfg(cfg);
    if (!cfg) return null;
    try { localStorage.setItem(BG_KEY, JSON.stringify(cfg)); } catch (e) {}
    applyBg('custom');
    notify();
    return cfg;
  };
  // ---------- ชุดตั้งค่าของฉัน (preset) ----------
  // เก็บ "หน้าตา" ทั้งชุดในเครื่อง: พื้นหลัง (ชุดสำเร็จรูป / กำหนดเอง) + สีหลัก + ความโปร่งใสการ์ด/เมนู + ความเบลอ
  // รูปแบบที่เก็บ: [{ id, name, bg: 'default' | ชื่อชุดสำเร็จรูป | cfg พื้นหลังกำหนดเอง, look: { pc, card, menu, blur } }]
  // ไม่รวมโหมดสว่าง/มืด (ธีม) เพราะเป็นการตั้งค่าแยก · ค่าที่อ่านกลับผ่านตัวตรวจ cleanCfg/cleanLook ทุกครั้ง
  var PRESET_KEY = 'myscore-presets', PRESET_MAX = 12, PRESET_NAME_MAX = 40;
  function newPresetId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function cleanPresetName(n) { return typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX) : ''; }
  function cleanPreset(o) {
    if (!o || typeof o !== 'object') return null;
    var name = cleanPresetName(o.name);
    if (!name) return null;
    var bg = 'default';
    if (typeof o.bg === 'string' && BG_IDS.indexOf(o.bg) !== -1) bg = o.bg;
    else if (o.bg && typeof o.bg === 'object') bg = cleanCfg(o.bg) || 'default';
    return { id: typeof o.id === 'string' && /^[a-z0-9]{4,24}$/.test(o.id) ? o.id : newPresetId(), name: name, bg: bg, look: cleanLook(o.look) };
  }
  function readPresets() {
    try {
      var arr = JSON.parse(localStorage.getItem(PRESET_KEY));
      return (arr instanceof Array ? arr : []).map(cleanPreset).filter(Boolean).slice(0, PRESET_MAX);
    } catch (e) { return []; }
  }
  function writePresets(list) {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(list)); notify(); return true; } catch (e) { return false; }
  }
  function currentBgValue() { // พื้นหลังที่ใช้อยู่ ในรูปที่เก็บลง preset
    var raw = readRaw();
    if (BG_IDS.indexOf(raw) !== -1) return raw;
    return parseCustom(raw) || 'default';
  }
  window.getLookPresets = readPresets;
  window.LOOK_PRESET_MAX = PRESET_MAX;
  window.LOOK_PRESET_NAME_MAX = PRESET_NAME_MAX;
  // บันทึกค่าปัจจุบันเป็นชุดใหม่ (name) หรือเขียนทับชุดเดิม (id) · คืน { ok, preset } หรือ { ok:false, reason: 'name'|'dup'|'full'|'missing'|'storage' }
  window.saveLookPreset = function (name, id) {
    var list = readPresets(), cur = { bg: currentBgValue(), look: readLook() };
    if (id) {
      var i = list.findIndex(function (x) { return x.id === id; });
      if (i < 0) return { ok: false, reason: 'missing' };
      list[i] = { id: id, name: list[i].name, bg: cur.bg, look: cur.look };
      return writePresets(list) ? { ok: true, preset: list[i] } : { ok: false, reason: 'storage' };
    }
    name = cleanPresetName(name);
    if (!name) return { ok: false, reason: 'name' };
    if (list.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) return { ok: false, reason: 'dup' };
    if (list.length >= PRESET_MAX) return { ok: false, reason: 'full' };
    var p = { id: newPresetId(), name: name, bg: cur.bg, look: cur.look };
    list.push(p);
    return writePresets(list) ? { ok: true, preset: p } : { ok: false, reason: 'storage' };
  };
  window.applyLookPreset = function (id) { // ใช้ชุดที่บันทึกไว้ (พื้นหลัง + สี + ความโปร่งใส) · คืนชุดนั้น หรือ null ถ้าไม่พบ
    var p = readPresets().filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    try {
      if (p.bg === 'default') localStorage.removeItem(BG_KEY);
      else localStorage.setItem(BG_KEY, typeof p.bg === 'string' ? p.bg : JSON.stringify(p.bg));
      localStorage.setItem(LOOK_KEY, JSON.stringify(p.look));
    } catch (e) {}
    applyBg(readBg()); // applyBg → applyTone → applyLook : คำนวณสีตัวหนังสือ/การ์ดใหม่ให้ตรงกับชุดนี้
    notify();
    return p;
  };
  window.deleteLookPreset = function (id) {
    var list = readPresets(), next = list.filter(function (x) { return x.id !== id; });
    return next.length !== list.length && writePresets(next);
  };
  window.presetBgCss = function (bg) { // CSS พื้นหลังสำหรับช่องตัวอย่างของชุด
    if (bg && typeof bg === 'object') return bgCss(bg, 0.5);
    if (PRESET_CFG[bg]) return bgCss(cleanCfg(PRESET_CFG[bg]), 0.5);
    return BG_IDS.indexOf(bg) !== -1 ? 'var(--bgp-' + bg + ')' : 'var(--bg)';
  };
  window.bgCssOf = function (cfg, scale) { cfg = cleanCfg(cfg); return cfg ? bgCss(cfg, scale) : ''; }; // สำหรับช่องตัวอย่างในหน้าตั้งค่า
  window.bgPresetCss = function (id) { return PRESET_CFG[id] ? bgCss(cleanCfg(PRESET_CFG[id])) : ''; }; // สำหรับช่องตัวอย่างของชุดไล่เฉด
  window.BG_PATTERNS = PATTERNS;
  window.BG_OPTIONS = {
    solid: [['lemon', 'เหลือง'], ['sky', 'ฟ้า'], ['lilac', 'ม่วง'], ['mint', 'เขียวมิ้นต์']],
    gradient: [['ocean', 'ฟ้า-เขียว'], ['aurora', 'ออโรรา'], ['sunny', 'เหลือง-เขียว'], ['dusk', 'ฟ้า-ม่วง']],
    preset: [['classicblue', 'Classic Blue'], ['calmblue', 'One UI Calm Blue'], ['softpurplepink', 'One UI Soft Purple & Pink']],
    oneui: [['uimint', 'มิ้นต์'], ['uipeach', 'พีช'], ['uilavender', 'ลาเวนเดอร์'], ['uirose', 'โรส'],
            ['uisage', 'เขียวเซจ'], ['uisand', 'ทราย'], ['uisky', 'ฟ้าใส'], ['uigraphite', 'เทากราไฟต์']],
    vivid: [['midnight', 'กลางคืน'], ['forest', 'ป่าลึก'], ['berry', 'เบอร์รี'], ['sunsetpop', 'พระอาทิตย์ตก'],
            ['oceandeep', 'ทะเลลึก'], ['lagoon', 'ลากูน']]
  };

  // ---------- ซิงค์หน้าตาตามบัญชี Google (js/auth.js เรียกใช้) ----------
  // รูปแบบที่เก็บบนคลาวด์ (users/{uid}.appearance): { theme: 'auto'|'light'|'dark', bg: 'default' | ชื่อชุด | JSON พื้นหลังกำหนดเอง,
  //   look: { pc, card, menu, blur }, presets: JSON ของชุดตั้งค่าของฉัน } · ทุกค่าที่รับเข้าผ่านตัวตรวจเดิม (cleanCfg / cleanLook / cleanPreset)
  window.getAppearance = function () {
    var raw = readRaw(), bg = 'default';
    if (BG_IDS.indexOf(raw) !== -1) bg = raw;
    else { var c = parseCustom(raw); if (c) bg = JSON.stringify(c); }
    return { theme: readPref(), bg: bg, look: readLook(), presets: JSON.stringify(readPresets()) };
  };
  window.setAppearance = function (a) { // นำค่าจากคลาวด์มาใช้ในเครื่อง (ไม่แจ้ง notify) · คืน false ถ้าข้อมูลไม่ใช่ object
    if (!a || typeof a !== 'object') return false;
    var th = a.theme === 'light' || a.theme === 'dark' || a.theme === 'auto' ? a.theme : 'auto';
    muted = true;
    try {
      try {
        localStorage.setItem(KEY, th);
        var bg = typeof a.bg === 'string' ? a.bg : 'default';
        if (BG_IDS.indexOf(bg) !== -1) localStorage.setItem(BG_KEY, bg);
        else { var c = parseCustom(bg); if (c) localStorage.setItem(BG_KEY, JSON.stringify(c)); else localStorage.removeItem(BG_KEY); }
        localStorage.setItem(LOOK_KEY, JSON.stringify(cleanLook(a.look)));
        var arr = []; try { arr = JSON.parse(a.presets); } catch (e) {}
        writePresets((arr instanceof Array ? arr : []).map(cleanPreset).filter(Boolean).slice(0, PRESET_MAX));
      } catch (e) {}
      apply(th);
      applyBg(readBg());
    } finally { muted = false; }
    return true;
  };
  window.resetAppearance = function () { // กลับค่าเริ่มต้นทั้งหมด (ใช้เมื่อเครื่องนี้เคยเก็บหน้าตาของบัญชีอื่นไว้)
    muted = true;
    try {
      try { [KEY, BG_KEY, LOOK_KEY, PRESET_KEY].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      apply('auto');
      applyBg('default');
    } finally { muted = false; }
  };

  window.getThemePref = readPref;
  window.setThemePref = function (pref) {
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    apply(pref);
    notify();
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
