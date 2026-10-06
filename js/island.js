// ==========================================================================
// Dynamic Island — แคปซูลดำกลางบนจอ
//   ตอนพัก     : แสดงวัน · เวลา (มือถือแสดงเฉพาะวัน เพราะแถบสถานะของเครื่องมีเวลาอยู่แล้ว)
//   ตอนใช้งาน : ขยายเป็นแจ้งเตือน / สถานะบันทึกอัตโนมัติ / เลิกทำ / แถบความคืบหน้า / ออนไลน์-ออฟไลน์
//
//   showToast('ข้อความ', 'success|warn|error|info|loading')   แจ้งเตือนทั่วไป (เดาชนิดจากข้อความได้ ข้อความลงท้าย ... = กำลังโหลด)
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
  const idleEl = el.querySelector('.island-idle');
  const idleDate = el.querySelector('.island-idle-date');
  const idleTime = el.querySelector('.island-idle-time');

  // ลำดับความสำคัญ (เลขมาก = สำคัญกว่า)
  const PRIO = { save: 1, info: 2, success: 2, warn: 3, loading: 3, undo: 4, progress: 5, error: 5, net: 6 };
  let cur = null;        // ข้อความที่แสดงอยู่ { key, kind, text, prio }
  let timer = 0;
  let actionFn = null;
  let offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // ---------- ตอนพัก: วัน · เวลา ----------
  const pad2 = n => String(n).padStart(2, '0');
  function sizeIdle() {
    el.style.setProperty('--iw', (Math.ceil(idleEl.offsetWidth) + 30) + 'px');
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

    // วัดขนาดเนื้อหาจริง แล้วส่งให้ CSS เป็นขนาดปลายทางของการขยาย (CSS transition ทำแอนิเมชันให้)
    const w = Math.ceil(body.offsetWidth), h = Math.ceil(body.offsetHeight);
    el.style.setProperty('--ow', w + 'px');
    el.style.setProperty('--oh', h + 'px');
    el.style.setProperty('--or', Math.min(h / 2, 28) + 'px');
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
    present({ key: 'net', kind: 'offline', text: 'ออฟไลน์ · ข้อมูลยังไม่ซิงค์', prio: 'net', ms: 4500 });
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

  // ---------- เริ่มทำงาน ----------
  if (offline) el.classList.add('is-offline');
  tick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('resize', () => requestAnimationFrame(sizeIdle)); // มือถือซ่อนเวลา → ความกว้างเปลี่ยน
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeIdle);

  // ปิดข้อความของ key นั้นทันที (ใช้เมื่องานจบแล้วแต่ไม่อยากขึ้นข้อความซ้ำ)
  function clear(key) { if (cur && cur.key === key) end(); }

  return { present, clear };
})();

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
