// ==========================================================================
// NavHistory — เชื่อมแอปหน้าเดียวเข้ากับ History API ของเบราว์เซอร์
//   ผลที่ได้: ปุ่ม/ท่าย้อนกลับของระบบ (Android ปัดจากขอบจอ · iOS Safari ปัดจากขอบ · ปุ่ม Back ของเบราว์เซอร์)
//   ถอยไปหน้าก่อนหน้าในแอป แทนที่จะออกจากแอปไปเว็บก่อนหน้า
//
//   entry ในประวัติมี 3 แบบ (เก็บใน history.state ร่วมกับ nh:1 และ idx = ลำดับ):
//     { kind: 'route',  route }                          หน้าหลัก (navigate)
//     { kind: 'course', courseId, sectionId, tab }       หน้าในรายวิชา (openCourse) — แท็บ/ห้องอัปเดตด้วย replaceState
//     { kind: 'layer' }                                  "ชั้น" ที่ซ้อนอยู่บนหน้า เช่น ป๊อปอัป — กดย้อนกลับ = ปิดชั้น ไม่ใช่เปลี่ยนหน้า
//
//   การใช้งาน
//     NavHistory.record({ kind: 'route', route })        ตอนเปลี่ยนหน้า (app.js navigate)
//     NavHistory.record({ kind: 'course', courseId })    ตอนเปิดรายวิชา (courses.js openCourse)
//     NavHistory.patch({ courseId, sectionId, tab })     จำแท็บ/ห้องล่าสุดของรายวิชาไว้ใน entry ปัจจุบัน
//     const l = NavHistory.layer(onBack)                 เปิดชั้น: onBack ถูกเรียกเมื่อผู้ใช้กดย้อนกลับ
//     l.release()                                        ปิดชั้นจากโค้ดเอง (ปุ่มปิด/ยกเลิก) — ถอด entry ของชั้นออกให้
//     NavHistory.backTo('courses')                       ปุ่ม "กลับ" ในหน้า: ถ้า entry ก่อนหน้าคือหน้านั้นพอดีจะถอยจริง (ไม่ซ้อน entry)
//     NavHistory.direction()                             ทิศทางของการเปลี่ยนหน้าล่าสุด: 'fwd' (หน้าใหม่/เดินหน้า) หรือ 'back' (ย้อนกลับ) — playViewEnter ใช้เลือกท่าเลื่อนเข้า
//     NavHistory.applyScroll()                           เรียกเมื่อหน้าวาดเสร็จ (drawRoute / renderCourseShell): ย้อนกลับ/เดินหน้า = เลื่อนกลับตำแหน่งเดิมของ entry นั้น,
//                                                        เปลี่ยนหน้าใหม่ = เลื่อนขึ้นบนสุด · เรียกซ้ำโดยไม่มีงานค้าง (เช่น สลับแท็บ) ไม่ทำอะไร
//
//   ตำแหน่งเลื่อน: เก็บตอน "ออก" จาก entry (push หน้าใหม่ หรือ popstate) ในหน่วยความจำของเซสชัน (scrolls[idx]) แล้วเลื่อนกลับหลังวาดเสร็จ
//     ตั้ง history.scrollRestoration = 'manual' เพื่อไม่ให้เบราว์เซอร์เลื่อนเองไปชนกัน (มันเลื่อนก่อนที่แอปจะวาดหน้า → ถูกบีบกลับขึ้นบนสุด)
//
//   ข้อควรระวัง: history.back() ทำงานแบบอะซิงก์ — ถ้าปิดชั้นแล้วเปลี่ยนหน้าต่อทันที การ pushState ของหน้าใหม่
//   ต้องรอให้ถอยเสร็จก่อน (ไม่งั้นจะไปทับ entry ผิดตัว) จึงมีคิว queued ด้านล่าง
// ==========================================================================

const NavHistory = (() => {
  const ok = typeof history !== 'undefined' && typeof history.pushState === 'function';
  const stack = [];            // stack[i] = state ของ entry ลำดับ i (เท่าที่รู้ในเซสชันนี้ — หายเมื่อรีโหลด)
  let idx = (ok && history.state && history.state.nh) ? history.state.idx : 0;
  let booted = false;          // การ record ครั้งแรกของเซสชัน = หน้าเริ่มต้น → replaceState ไม่ push
  let restoring = false;       // กำลังวาดหน้าตาม popstate → ห้ามเขียนประวัติซ้ำ
  const layers = [];           // ชั้นที่เปิดค้าง (ใหม่สุดอยู่ท้าย)
  let backPending = false, queued = [], backTimer = null;
  const scrolls = {};          // scrolls[i] = ตำแหน่งเลื่อน (px) ของหน้าใน entry ลำดับ i ตอนที่ผู้ใช้ออกจากมัน
  let dir = 'fwd';             // ทิศทางล่าสุด: record/push = 'fwd' · popstate ไป idx ที่น้อยลง = 'back'
  let pendingScroll = null;    // ตำแหน่งที่รอเลื่อนไปเมื่อหน้าวาดเสร็จ (ตัวเลข px) · null = ไม่มีงานค้าง
  if (ok && 'scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) { /* ข้าม */ } }

  const getY = () => (typeof window !== 'undefined' && (window.scrollY || document.documentElement.scrollTop)) || 0;
  // จำตำแหน่งเลื่อนของ entry i (ข้าม entry ของชั้น — ชั้นไม่มีหน้าของตัวเอง)
  function saveScroll(i) {
    const s = stack[i] || (ok && history.state && history.state.idx === i ? history.state : null);
    if (s && s.kind !== 'layer') scrolls[i] = getY();
  }

  const cur = () => stack[idx] || (ok && history.state) || null;

  function write(mode, st) {
    if (mode === 'push') {
      saveScroll(idx);    // จำตำแหน่งเลื่อนของหน้าที่กำลังจะออกจาก
      idx++;
      stack.length = idx; // ตัด entry ข้างหน้า (forward) ที่ไม่ใช้แล้วออกจากความจำ
      for (const k of Object.keys(scrolls)) if (+k >= idx) delete scrolls[k];
      st = { ...st, nh: 1, idx };
      stack[idx] = st;
      history.pushState(st, '');
    } else {
      st = { ...st, nh: 1, idx };
      stack[idx] = st;
      history.replaceState(st, '');
    }
  }

  const same = (a, b) => !!a && a.kind === b.kind &&
    (b.kind === 'route' ? a.route === b.route : b.kind === 'course' ? a.courseId === b.courseId : false);

  // ถอยหนึ่งขั้นจากโค้ด (ปิดชั้น) — งานที่ต้อง push หลังจากนี้จะรอใน queued จน popstate มา (หรือครบ 400ms)
  function histBack() {
    backPending = true;
    history.back();
    clearTimeout(backTimer);
    backTimer = setTimeout(finishBack, 400);
  }
  function finishBack() {
    clearTimeout(backTimer);
    backPending = false;
    const q = queued; queued = [];
    q.forEach(fn => fn());
  }
  const defer = fn => { if (backPending) queued.push(fn); else fn(); };

  function record(st) {
    if (!ok || restoring) return;
    defer(() => {
      dir = 'fwd';
      pendingScroll = 0; // หน้าใหม่ (ไม่ใช่ย้อนกลับ) → เริ่มที่บนสุดเมื่อวาดเสร็จ
      if (!booted) { booted = true; write('replace', st); return; }
      // เปลี่ยนหน้าขณะมีชั้นค้างอยู่ (เช่นกดปุ่มในป๊อปอัปแล้ว navigate): ชั้นนั้นเลิกนับ — entry ของมันที่ค้างอยู่จะถูกข้ามเองตอนกดย้อน
      for (const l of layers) l.active = false;
      layers.length = 0;
      if (same(cur(), st)) write('replace', { ...cur(), ...st });
      else write('push', st);
    });
  }

  // อัปเดต entry รายวิชาปัจจุบัน (แท็บ/ห้องที่เลือก) เพื่อให้ย้อนกลับมาแล้วเห็นแท็บเดิม
  function patch(fields) {
    if (!ok || restoring || backPending) return;
    const c = cur();
    if (!c || c.kind !== 'course' || c.courseId !== fields.courseId) return;
    if (c.tab === fields.tab && c.sectionId === fields.sectionId) return;
    write('replace', { ...c, ...fields });
  }

  function layer(onBack) {
    const l = {
      active: true,
      onBack,
      release() {
        if (!l.active) return;
        l.active = false;
        const i = layers.indexOf(l);
        if (i >= 0) layers.splice(i, 1);
        histBack();
      },
    };
    if (!ok) { l.active = false; return l; }
    layers.push(l);
    defer(() => { if (l.active) write('push', { kind: 'layer' }); });
    return l;
  }

  function backTo(route) {
    const prev = stack[idx - 1];
    if (ok && !layers.length && !backPending && prev && prev.kind === 'route' && prev.route === route) {
      history.back();
      return true;
    }
    return false;
  }

  // หน้าที่แสดงอยู่ตรงกับ entry นี้แล้วหรือยัง (กันวาดซ้ำตอนข้าม entry ของชั้นที่ค้าง)
  function isShowing(st) {
    if (typeof AppState === 'undefined') return false;
    if (st.kind === 'course') return AppState.currentRoute === 'course' && AppState.currentCourseId === st.courseId;
    if (st.kind === 'route') return AppState.currentRoute === st.route;
    return false;
  }

  function restore(st) {
    AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์แล้วรีบกดย้อนกลับ
    pendingScroll = scrolls[st.idx] || 0; // วาดเสร็จแล้วเลื่อนกลับตำแหน่งเดิม (applyScroll)
    restoring = true;
    try {
      if (st.kind === 'course' && typeof openCourse === 'function') openCourse(st.courseId, { sectionId: st.sectionId, tab: st.tab });
      else if (st.kind === 'route' && typeof navigate === 'function') navigate(st.route);
    } finally { restoring = false; }
  }

  if (ok) {
    window.addEventListener('popstate', e => {
      const st = e.state;
      if (st && st.nh) { saveScroll(idx); dir = st.idx < idx ? 'back' : 'fwd'; idx = st.idx; stack[idx] = st; } // จำตำแหน่งเลื่อนของ entry ที่กำลังออกก่อนสลับ idx
      if (backPending) { finishBack(); return; }       // ถอยที่เราสั่งเอง (ปิดชั้น) — ไม่ต้องทำอะไรต่อ
      if (layers.length) {                              // ผู้ใช้กดย้อนขณะมีชั้นเปิดอยู่ → ปิดชั้นบนสุด
        const l = layers.pop();
        l.active = false;
        l.onBack();
        return;
      }
      if (!st || !st.nh) return;
      if (st.kind === 'layer') { history.back(); return; } // entry ค้างของชั้นที่ปิดไปแล้ว → ข้ามไปอีกขั้น
      if (typeof AppState === 'undefined' || !AppState.user) return; // ยังไม่ล็อกอิน/ออกจากระบบแล้ว
      if (isShowing(st)) return; // หน้านี้แสดงอยู่แล้ว (เช่นข้าม entry ของชั้นที่ค้าง) — ไม่ต้องวาดซ้ำ
      restore(st);
    });
  }

  // เรียกเมื่อหน้าวาดเสร็จจริง (หลัง await ข้อมูล) — ทำครั้งเดียวต่อการเปลี่ยนหน้า
  function applyScroll() {
    if (pendingScroll === null || typeof window === 'undefined') return;
    const y = pendingScroll;
    pendingScroll = null;
    window.scrollTo(0, y);
    // เนื้อหาบางส่วนยังขยายตามมา (รูป/วิดเจ็ตที่โหลดทีหลัง) → ถ้าครั้งแรกถูกบีบด้วยความสูงหน้า ลองอีกครั้งในเฟรมถัดไป
    if (y > 0 && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { if (pendingScroll === null && Math.abs(getY() - y) > 2) window.scrollTo(0, y); });
    }
  }

  return { record, patch, layer, backTo, applyScroll, direction: () => dir, _debug: () => ({ idx, stack: stack.slice(), layers: layers.length, backPending, scrolls: { ...scrolls }, pendingScroll }) };
})();
