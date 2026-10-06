// ==========================================================================
// ธีม สว่าง / มืด / ตามระบบ — โหลดใน <head> ก่อนวาดหน้า เพื่อไม่ให้จอวาบขาวตอนเปิดโหมดมืด
// ==========================================================================
(function () {
  var KEY = 'myscore-theme'; // 'auto' | 'light' | 'dark'
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

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
  }

  // พื้นหลังหน้า: 'default' หรือชื่อชุดสี (ตัวแปร --bgp-<ชื่อ> ใน css/style.css) · ชนิดสีทึบ/ไล่สี ดูที่ BG_OPTIONS
  var BG_KEY = 'myscore-bg';
  var BG_IDS = ['lemon', 'sky', 'lilac', 'mint', 'ocean', 'aurora', 'sunny', 'dusk'];
  function readBg() {
    try { var v = localStorage.getItem(BG_KEY); if (BG_IDS.indexOf(v) !== -1) return v; } catch (e) {}
    return 'default';
  }
  function applyBg(id) {
    var root = document.documentElement;
    if (id === 'default') { root.style.removeProperty('--page-bg'); root.removeAttribute('data-bg'); }
    else { root.style.setProperty('--page-bg', 'var(--bgp-' + id + ')'); root.dataset.bg = id; }
  }
  window.getBgPref = readBg;
  window.setBgPref = function (id) {
    try { if (id === 'default') localStorage.removeItem(BG_KEY); else localStorage.setItem(BG_KEY, id); } catch (e) {}
    applyBg(id);
  };
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
})();
