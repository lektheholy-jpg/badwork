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

  window.getThemePref = readPref;
  window.setThemePref = function (pref) {
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    apply(pref);
  };

  apply(readPref());
  if (mq) {
    var onChange = function () { if (readPref() === 'auto') apply('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
