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

  let pending = null;   // worker ใหม่ที่รออยู่ (ผู้ใช้ยังไม่กดอัปเดต)
  let lastOffer = 0;
  const island = () => (typeof IslandUI !== 'undefined' ? IslandUI : null);
  function applyUpdate() {
    if (!pending) return;
    const ui = island();
    if (ui) ui.present({ key: 'sw', kind: 'loading', text: 'กำลังอัปเดต...', prio: 'warn', ms: 15000, indeterminate: true });
    pending.postMessage({ type: 'SKIP_WAITING' }); // → controllerchange ด้านบน บันทึกคะแนนค้างแล้วรีโหลดเป็นเวอร์ชันใหม่
  }
  function offerUpdate(worker) {
    pending = worker;
    const ui = island();
    if (!ui) { worker.postMessage({ type: 'SKIP_WAITING' }); return; }
    lastOffer = Date.now();
    ui.present({
      key: 'sw', kind: 'info', text: 'มีเวอร์ชันใหม่ของแอป', prio: 'warn', ms: 30000,
      action: { label: 'อัปเดต', fn: applyUpdate },
    });
  }
  // ผู้ใช้ปล่อยผ่าน (ข้อความหายเองใน 30 วินาที) → เตือนซ้ำตอนเปลี่ยนหน้า/กลับมาเปิดแอป · เฉพาะตอน Island ว่าง และห่างกันอย่างน้อย 5 นาที (ไม่แย่งจังหวะกรอกคะแนน)
  function reoffer() {
    const ui = island();
    if (!pending || !ui || !ui.idle() || Date.now() - lastOffer < 5 * 60 * 1000) return;
    offerUpdate(pending);
  }
  if (typeof islandOnPage === 'function') islandOnPage(() => setTimeout(reoffer, 1500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(reoffer, 1500); });

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
