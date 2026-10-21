// ==========================================================================
// PWA: ลงทะเบียน Service Worker (sw.js) ให้เปิดแอปได้ตอนออฟไลน์ + แจ้งเมื่อมีเวอร์ชันใหม่
//   - ติดตั้งครั้งแรก: เงียบ ๆ (ไม่มีข้อความ)
//   - มีเวอร์ชันใหม่: Dynamic Island ขึ้น "มีเวอร์ชันใหม่ของแอป [อัปเดต]" — กดแล้วจึงรีโหลด
//     ไม่รีโหลดเองกลางคัน เพราะครูอาจกำลังกรอกคะแนนอยู่
//   - ต้องรันผ่าน https หรือ localhost (เปิดแบบ file:// จะไม่ทำงาน)
// ==========================================================================
// ==========================================================================
// ติดตั้งแอป (ปุ่มในตั้งค่า > เกี่ยวกับ): แสดงเฉพาะมือถือ (Android / iPhone / iPad)
//   - Android (Chrome): เบราว์เซอร์ส่ง beforeinstallprompt มาตอนโหลดหน้า → เก็บไว้ แล้วเรียก prompt() ตอนผู้ใช้กดปุ่ม
//   - iPhone/iPad (Safari): ไม่มีคำสั่งติดตั้งให้เว็บเรียก → ผู้ใช้ต้องทำเอง (แชร์ → เพิ่มไปยังหน้าจอโฮม) การ์ดจึงแสดงขั้นตอนแทน
//   - ติดตั้งแล้ว / เปิดจากแอปที่ติดตั้ง (display-mode: standalone) → mode() = 'installed' หน้าตั้งค่าซ่อนการ์ด
// PwaInstall.mode(): 'prompt' | 'ios' | 'installed' | 'none' · onChange(fn) คืนฟังก์ชันยกเลิกการฟัง
// ==========================================================================
(function () {
  let deferred = null, installed = false;
  const subs = [];
  const ua = navigator.userAgent || '';
  const isIos = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIos || /Android/i.test(ua);
  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const notify = () => subs.slice().forEach(fn => { try { fn(); } catch (e) { /* ผู้ฟังพังไม่กระทบตัวอื่น */ } });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; notify(); });
  window.PwaInstall = {
    mode() {
      if (!isMobile) return 'none';
      if (installed || standalone()) return 'installed';
      if (deferred) return 'prompt';
      return isIos ? 'ios' : 'none';
    },
    async prompt() { // คืน true ถ้าผู้ใช้กดยอมรับ · event ใช้ได้ครั้งเดียว (ถ้าปฏิเสธ ต้องรอเบราว์เซอร์ส่งใหม่)
      if (!deferred) return false;
      const d = deferred; deferred = null;
      let accepted = false;
      try { d.prompt(); accepted = (await d.userChoice).outcome === 'accepted'; } catch (e) { /* เบราว์เซอร์ไม่ให้เรียกซ้ำ */ }
      notify();
      return accepted;
    },
    onChange(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  };
})();

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
