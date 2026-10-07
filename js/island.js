// ==========================================================================
// Dynamic Island — แคปซูลดำกลางบนจอ
//   ตอนพัก     : แสดงวัน · เวลา (มือถือแสดงเฉพาะวัน เพราะแถบสถานะของเครื่องมีเวลาอยู่แล้ว) | ไอคอน ชื่อหน้าที่เปิดอยู่ เช่น "จ. 6 ต.ค. · 14:30 | ✎ บันทึกคะแนน"
//                แสดงตลอด ไม่ต้องชี้เมาส์ · เปลี่ยนหน้า = ไอคอน/ชื่อเก่าเลื่อนขึ้นจางหาย อันใหม่เลื่อนขึ้นมาแทน พร้อมแคปซูลยืด/หดลื่นๆ (หน้าหลักไม่แสดงไอคอน/ชื่อ)
//   ตอนใช้งาน : เปลี่ยนเป็นแจ้งเตือน / สถานะบันทึกอัตโนมัติ / เลิกทำ / แถบความคืบหน้า / ออนไลน์-ออฟไลน์
//                ความสูงคงที่เท่าตอนพัก บรรทัดเดียว — เปลี่ยนสถานะ = เปลี่ยนข้อความ ถ้ายาวขึ้นจะขยายออกด้านข้างเท่านั้น (สุดจอแล้วตัดด้วย …)
//
//   showToast('ข้อความ', 'success|warn|error|info|loading')   แจ้งเตือนทั่วไป (เดาชนิดจากข้อความได้ ข้อความลงท้าย ... = กำลังโหลด)
//   islandSetPage(route)   ตั้งชื่อ/ไอคอนหน้าที่เปิดอยู่ (setActiveNav ใน app.js เรียกให้เองทุกครั้งที่เปลี่ยนหน้า — ดึงจากปุ่มเมนูข้าง)
//   islandSave('saving' | 'saved' | 'error', { count, retry })  สถานะบันทึกอัตโนมัติ
//   islandUndo('ลบนักเรียนแล้ว', async () => { ...กู้คืน... }, 5000)  ปุ่มเลิกทำ พร้อมแถบนับถอยหลัง
//   const p = islandProgress({ label: 'นำเข้า', total: 45, unit: 'คน' });  p.update(32); p.finish('นำเข้าแล้ว'); p.fail('ไม่สำเร็จ')
//     (ไม่ใส่ total = แถบวิ่งไม่รู้ความยาว)
//
//   ลำดับความสำคัญ: ข้อความที่สำคัญกว่าจะไม่ถูกข้อความที่เบากว่าทับ (key เดียวกันทับกันเองได้เสมอ)
//   สไตล์อยู่ที่บล็อก .island ใน css/style.css · มาร์กอัปอยู่ใน index.html
// ==========================================================================

const ISLAND_SVG = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ISLAND_ICONS = {
  success: ISLAND_SVG('<circle cx="12" cy="12" r="9"/><path class="island-check" d="m8 12.5 2.8 2.8L16 9.5"/>'),
  warn: ISLAND_SVG('<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5"/><path d="M12 17.3v.01"/>'),
  error: ISLAND_SVG('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>'),
  info: ISLAND_SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.8v.01"/>'),
  trash: ISLAND_SVG('<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/>'),
  offline: ISLAND_SVG('<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M19 12.9a10 10 0 0 0-2-1.5"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8a15 15 0 0 0-11.3-3.8"/><path d="m2 2 20 20"/>'),
  loading: '<span class="island-spin"></span>',
  progress: '<span class="island-spin"></span>',
};

function islandKind(msg) {
  if (/(\.{2,}|…)\s*$/.test(msg)) return 'loading';
  if (/ไม่สำเร็จ|ผิดพลาด|ล้มเหลว/.test(msg)) return 'error';
  if (/^กรุณา|^คำเตือน|ยังไม่|เกิน|อยู่แล้ว|ไม่พบ|ตกหล่น/.test(msg)) return 'warn';
  if (/สำเร็จ|แล้ว|เรียบร้อย/.test(msg)) return 'success';
  return 'info';
}

const IslandUI = (() => {
  const el = document.getElementById('island');
  if (!el) return null;
  const body = el.querySelector('.island-body');
  const iconEl = el.querySelector('.island-icon');
  const textEl = el.querySelector('.island-text');
  const actionEl = el.querySelector('.island-action');
  const idleMain = el.querySelector('.island-idle-main');   // วัน · เวลา (· ออฟไลน์)
  const idleDate = el.querySelector('.island-idle-date');
  const idleTime = el.querySelector('.island-idle-time');
  const pageSlot = el.querySelector('.island-idle-page');   // ช่องชื่อหน้า: กว้างตาม --pw
  const layers = pageSlot.querySelectorAll('.pg');          // 2 ชั้นสลับกัน (ชั้นเก่าออก ชั้นใหม่เข้า)

  // ลำดับความสำคัญ (เลขมาก = สำคัญกว่า)
  const PRIO = { save: 1, info: 2, success: 2, warn: 3, loading: 3, undo: 4, progress: 5, error: 5, net: 6 };
  let cur = null;        // ข้อความที่แสดงอยู่ { key, kind, text, prio }
  let timer = 0;
  let actionFn = null;
  let offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // ---------- ตอนพัก: วัน · เวลา | ไอคอน ชื่อหน้า ----------
  const pad2 = n => String(n).padStart(2, '0');
  let activeLayer = 0;   // ชั้นที่กำลังแสดงชื่อหน้าอยู่
  let pageKey = null;    // ชื่อหน้าที่แสดงอยู่ ('' = หน้าหลัก ไม่แสดง) · null = ยังไม่เคยตั้ง
  let pageW = 0;         // ความกว้างจริงของไอคอน + ชื่อหน้าที่แสดงอยู่
  function sizeIdle() {
    // วัดความกว้างจริงทุกครั้ง (ฟอนต์โหลดเสร็จ / ย่อขยายจอ / ออฟไลน์ / ขึ้นนาทีใหม่ ก็ถูกต้อง)
    pageW = pageKey ? Math.ceil(layers[activeLayer].offsetWidth) : 0;
    const base = Math.ceil(idleMain.offsetWidth);
    el.style.setProperty('--pw', pageW + 'px');
    el.style.setProperty('--iw', (base + pageW + 30) + 'px'); // 30 = ขอบซ้าย-ขวาด้านละ 15
  }
  // info = { icon: '<svg…>', label: 'บันทึกคะแนน' } หรือ null (หน้าหลัก)
  function setPage(info) {
    const key = info ? info.label : '';
    if (key === pageKey) return;
    const instant = pageKey === null;                 // ครั้งแรกตอนเปิดแอป: ตั้งเลย ไม่ต้องแอนิเมชัน
    const prev = layers[activeLayer], next = layers[1 - activeLayer];

    // เตรียมชั้นใหม่ที่ตำแหน่งเริ่มต้น (ปิด transition ชั่วคราวไม่ให้เห็นการรีเซ็ต)
    next.classList.add('no-t'); next.classList.remove('on', 'out');
    next.textContent = '';
    if (info) {
      const div = document.createElement('i'); div.className = 'pg-div';
      const ico = document.createElement('span'); ico.className = 'pg-ico'; ico.innerHTML = info.icon;
      const name = document.createElement('b'); name.className = 'pg-name'; name.textContent = info.label;
      next.append(div, ico, name);
    }
    void next.offsetWidth;
    next.classList.remove('no-t');

    if (instant) el.classList.add('island-instant');
    pageKey = key; activeLayer = 1 - activeLayer;
    prev.classList.remove('on'); prev.classList.add('out');   // ของเก่าเลื่อนขึ้นแล้วจาง
    if (info) next.classList.add('on');                       // ของใหม่เลื่อนขึ้นมาแทน
    sizeIdle();                                               // แคปซูล + ช่องชื่อหน้ายืด/หดพร้อมกัน
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('island-instant')));
  }
  function tick() {
    const d = new Date();
    idleDate.textContent = d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
    idleTime.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    sizeIdle();
    clearTimeout(tick.t);
    tick.t = setTimeout(tick, 60000 - (Date.now() % 60000) + 80); // เปลี่ยนตอนขึ้นนาทีใหม่พอดี
  }
  function setOffline(v) {
    offline = v;
    el.classList.toggle('is-offline', v);
    sizeIdle();
  }

  // ---------- แสดงข้อความ ----------
  function setBar(o, quiet) {
    if (o.progress != null) {
      el.style.setProperty('--p', Math.max(0, Math.min(1, o.progress)));
      el.dataset.bar = 'progress';
    } else if (o.indeterminate) {
      el.dataset.bar = 'indeterminate';
    } else if (o.countdown) {
      el.style.setProperty('--cd', o.countdown + 'ms');
      el.dataset.bar = '';
      void el.offsetWidth; // เริ่มแอนิเมชันนับถอยหลังใหม่
      el.dataset.bar = 'countdown';
    } else if (!quiet || el.dataset.bar) {
      el.dataset.bar = '';
    }
  }

  function end() {
    clearTimeout(timer);
    cur = null; actionFn = null;
    actionEl.hidden = true;
    el.classList.remove('open');
    body.classList.remove('pop');
    el.dataset.bar = ''; el.dataset.mode = '';
  }

  // o = { key, kind, text, prio, ms, mode, action:{label,fn}, progress, indeterminate, countdown, quiet }
  function present(o) {
    const prio = PRIO[o.prio || o.kind] || 2;
    if (cur && cur.prio > prio && cur.key !== o.key) return false; // มีเรื่องสำคัญกว่าแสดงอยู่

    const quiet = !!(o.quiet && cur && cur.key === o.key && cur.kind === o.kind);
    cur = { key: o.key || o.kind, kind: o.kind, text: o.text, prio };
    el.dataset.kind = o.kind;
    el.dataset.mode = o.mode || '';
    if (!quiet) iconEl.innerHTML = ISLAND_ICONS[o.kind] || ISLAND_ICONS.info;
    textEl.textContent = o.text;
    actionFn = o.action ? o.action.fn : null;
    actionEl.hidden = !o.action;
    if (o.action) actionEl.textContent = o.action.label;
    setBar(o, quiet);

    // วัดความกว้างเนื้อหาจริง แล้วส่งให้ CSS เป็นความกว้างปลายทาง (CSS transition ทำแอนิเมชันให้) — ความสูงคงที่ ไม่วัด/ไม่เปลี่ยน
    el.style.setProperty('--ow', Math.ceil(body.offsetWidth) + 'px');
    if (!quiet) { body.classList.remove('pop'); void body.offsetWidth; body.classList.add('pop'); }
    el.classList.add('open');

    clearTimeout(timer);
    timer = setTimeout(end, o.ms || 60000); // ไม่ระบุเวลา = กันค้างไว้ 60 วินาที
    return true;
  }

  actionEl.addEventListener('click', () => { const f = actionFn; if (f) f(); });

  // ---------- ออนไลน์ / ออฟไลน์ ----------
  window.addEventListener('offline', () => {
    setOffline(true);
    // เปิดแคชออฟไลน์อยู่ (FS_PERSISTENCE = 'on') → คะแนนที่พิมพ์จะเก็บในเครื่องและซิงค์ให้เองทีหลัง
    const local = typeof FS_PERSISTENCE !== 'undefined' && FS_PERSISTENCE === 'on';
    present({ key: 'net', kind: 'offline', text: local ? 'ออฟไลน์ · คะแนนจะบันทึกในเครื่อง แล้วซิงค์ให้เอง' : 'ออฟไลน์ · ข้อมูลยังไม่ซิงค์', prio: 'net', ms: 4500 });
  });
  window.addEventListener('online', async () => {
    setOffline(false);
    present({ key: 'net', kind: 'loading', text: 'กำลังซิงค์...', prio: 'net', ms: 25000 });
    let ok = true;
    try {
      // รอให้ Firestore ส่งคะแนนที่ค้างในคิวขึ้นเซิร์ฟเวอร์จริง ก่อนบอกว่า "ซิงค์แล้ว"
      if (typeof db !== 'undefined' && db.waitForPendingWrites) {
        await Promise.race([db.waitForPendingWrites(), new Promise((_, rej) => setTimeout(rej, 15000))]);
      }
    } catch (e) { ok = false; }
    if (cur && cur.key === 'net') {
      present(ok
        ? { key: 'net', kind: 'success', text: 'ซิงค์แล้ว', prio: 'net', ms: 2200 }
        : { key: 'net', kind: 'warn', text: 'กลับมาออนไลน์ · ยังซิงค์ต่อเบื้องหลัง', prio: 'net', ms: 3600 });
    }
  });

  // ---------- คะแนนที่ค้างคิวมาจากรอบก่อน (รีเฟรช/ปิดแท็บตอนออฟไลน์) ----------
  // ตอนเปิดแอป ถ้า Firestore ยังมีคิวเขียนค้างอยู่ ให้บอกผู้ใช้ แล้วแจ้ง "ซิงค์แล้ว" เมื่อคิวหมด
  async function checkCarriedOverWrites() {
    if (typeof db === 'undefined' || !db.waitForPendingWrites) return;
    try { if (typeof FS_PERSISTENCE_READY !== 'undefined') await FS_PERSISTENCE_READY; } catch (e) { return; }
    if (typeof FS_PERSISTENCE === 'undefined' || FS_PERSISTENCE !== 'on') return;
    const SLOW = Symbol('slow');
    const pending = db.waitForPendingWrites();
    const first = await Promise.race([pending.then(() => 'done', () => 'done'), new Promise(r => setTimeout(() => r(SLOW), 2500))]);
    if (first !== SLOW) return; // ไม่มีคิวค้าง (หรือส่งเสร็จเร็ว)
    present({ key: 'net', kind: 'warn', text: 'มีคะแนนที่บันทึกในเครื่องรอซิงค์ · จะส่งให้เองเมื่อมีอินเทอร์เน็ต', prio: 'net', ms: 5000 });
    try { await pending; } catch (e) { return; }
    present({ key: 'net', kind: 'success', text: 'ซิงค์คะแนนที่ค้างแล้ว', prio: 'net', ms: 2600 });
  }
  // เรียกหลังผู้ใช้ล็อกอินแล้ว (คิวเขียนผูกกับบัญชี) — auth.js เรียกผ่าน islandCheckPending()
  window.islandCheckPending = () => { checkCarriedOverWrites(); };

  // ---------- เริ่มทำงาน ----------
  if (offline) el.classList.add('is-offline');
  tick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('resize', () => requestAnimationFrame(sizeIdle)); // มือถือซ่อนเวลา → ความกว้างเปลี่ยน
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeIdle);

  // ปิดข้อความของ key นั้นทันที (ใช้เมื่องานจบแล้วแต่ไม่อยากขึ้นข้อความซ้ำ)
  function clear(key) { if (cur && cur.key === key) end(); }

  return { present, clear, setPage };
})();

// ---------- ชื่อ/ไอคอนหน้าที่เปิดอยู่ (แสดงตลอด) — ดึงจากปุ่มเมนูข้างตาม data-route จึงตรงกับเมนูเสมอ ----------
const ISLAND_PAGE_ALIAS = { course: 'courses' }; // หน้าภายในวิชา นับเป็น "รายวิชาของฉัน"
function islandSetPage(route) {
  if (!IslandUI) return;
  const key = ISLAND_PAGE_ALIAS[route] || route;
  if (key === 'profile') { IslandUI.setPage({ label: 'ข้อมูลส่วนตัว', icon: window.icon('user') }); return; } // เปิดจากไอคอนบัญชี ไม่ได้อยู่ในรายการเมนู
  const nav = key && key !== 'dashboard' ? document.querySelector(`.nav-item[data-route="${key}"]`) : null;
  const label = nav && (nav.querySelector('.nav-label')?.textContent || '').trim();
  const icon = nav && nav.querySelector('.nav-icon')?.innerHTML;
  IslandUI.setPage(label ? { label, icon: icon || '' } : null);
}

// ---------- API ที่ส่วนอื่นของแอปเรียกใช้ ----------
function showToast(msg, kind) {
  if (!IslandUI) return;
  msg = String(msg == null ? '' : msg);
  if (!ISLAND_ICONS[kind]) kind = islandKind(msg);
  const ms = kind === 'loading' ? 12000 : (kind === 'warn' || kind === 'error' ? 3600 : 2400) + Math.min(msg.length * 25, 1500);
  IslandUI.present({ key: 'toast', kind, text: msg, ms });
}

function islandSave(state, info) {
  if (!IslandUI) return;
  if (state === 'saving') IslandUI.present({ key: 'save', kind: 'loading', text: 'กำลังบันทึก...', prio: 'save', ms: 20000 });
  else if (state === 'saved') IslandUI.present({ key: 'save', kind: 'success', text: 'บันทึกแล้ว', prio: 'save', ms: 1600 });
  else if (state === 'queued') IslandUI.present({ key: 'save', kind: 'warn', text: `บันทึกในเครื่องแล้ว · รอซิงค์ ${(info && info.count) || ''} ช่อง`.replace('  ', ' '), prio: 'save', ms: 4000 });
  else if (state === 'error') {
    IslandUI.present({
      key: 'save', kind: 'error', text: `บันทึกไม่สำเร็จ ${(info && info.count) || ''} ช่อง`.replace('  ', ' '), prio: 'error', ms: 8000,
      action: info && info.retry ? { label: 'ลองใหม่', fn: info.retry } : null,
    });
  }
}

// ลบแล้วให้กดย้อนได้ภายใน ms (ค่าเริ่มต้น 5 วินาที) · onUndo ต้องคืนข้อมูลจริง (ถ้าโยน error จะขึ้น "กู้คืนไม่สำเร็จ")
function islandUndo(text, onUndo, ms = 5000) {
  if (!IslandUI) return;
  IslandUI.present({
    key: 'undo', kind: 'trash', mode: 'undo', text, prio: 'undo', ms, countdown: ms,
    action: {
      label: 'เลิกทำ',
      fn: async () => {
        IslandUI.present({ key: 'undo', kind: 'loading', text: 'กำลังกู้คืน...', prio: 'undo', ms: 30000 });
        try {
          await onUndo();
          IslandUI.present({ key: 'undo', kind: 'success', text: 'กู้คืนแล้ว', prio: 'undo', ms: 2200 });
        } catch (err) {
          console.error(err);
          IslandUI.present({ key: 'undo', kind: 'error', text: 'กู้คืนไม่สำเร็จ', prio: 'undo', ms: 3600 });
        }
      },
    },
  });
}

function islandProgress({ label, total = 0, unit = '' }) {
  const text = n => (total ? `${label} ${n}/${total}${unit ? ' ' + unit : ''}` : label);
  const show = n => IslandUI && IslandUI.present({
    key: 'progress', kind: 'progress', mode: 'progress', text: text(n), prio: 'progress', ms: 90000, quiet: true,
    ...(total ? { progress: n / total } : { indeterminate: true }),
  });
  show(0);
  return {
    update: n => show(total ? Math.min(n, total) : n),
    finish: msg => IslandUI && IslandUI.present({ key: 'progress', kind: 'success', text: msg, prio: 'progress', ms: 2800 }),
    fail: msg => IslandUI && IslandUI.present({ key: 'progress', kind: 'error', text: msg, prio: 'error', ms: 4200 }),
    clear: () => IslandUI && IslandUI.clear('progress'),
  };
}
