// ==========================================================================
// PWA: ลงทะเบียน Service Worker (sw.js) ให้เปิดแอปได้ตอนออฟไลน์ + แจ้งเมื่อมีเวอร์ชันใหม่
//   - ติดตั้งครั้งแรก: เงียบ ๆ (ไม่มีข้อความ)
//   - มีเวอร์ชันใหม่: Dynamic Island ขึ้น "มีเวอร์ชันใหม่ของแอป [อัปเดต]" — กดแล้วจึงรีโหลด
//     ไม่รีโหลดเองกลางคัน เพราะครูอาจกำลังกรอกคะแนนอยู่
//   - ต้องรันผ่าน https หรือ localhost (เปิดแบบ file:// จะไม่ทำงาน)
// ==========================================================================
(function () {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;

  const hadController = !!navigator.serviceWorker.controller; // ครั้งแรกที่ติดตั้ง SW จะ claim หน้านี้ → ไม่ต้องรีโหลด
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    try { if (AppState && AppState.flushScoreSaves) AppState.flushScoreSaves(); } catch (e) { /* ไม่เป็นไร: คะแนนค้างอยู่ในคิวเครื่องอยู่แล้ว */ }
    location.reload();
  });

  function offerUpdate(worker) {
    const ui = typeof IslandUI !== 'undefined' ? IslandUI : null;
    if (!ui) { worker.postMessage({ type: 'SKIP_WAITING' }); return; }
    ui.present({
      key: 'sw', kind: 'info', text: 'มีเวอร์ชันใหม่ของแอป', prio: 'warn', ms: 30000,
      action: { label: 'อัปเดต', fn: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
    });
  }

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.warn('ลงทะเบียน Service Worker ไม่สำเร็จ:', err);
      return;
    }
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
    // เช็กเวอร์ชันใหม่เป็นระยะ และตอนกลับมาเปิดแอป (แอปที่ค้างหน้าจอทั้งวันจะได้ไม่ใช้ของเก่า)
    const check = () => { if (navigator.onLine !== false) reg.update().catch(() => {}); };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  });
})();
