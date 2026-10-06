// ==========================================================================
// เครื่องมือ: สุ่มเรียกชื่อ · แบ่งกลุ่ม · จับเวลา
// รายชื่อดึงจากห้องที่เลือก หรือพิมพ์/วางเองได้ (ไม่บันทึกอะไรลงฐานข้อมูล)
// ==========================================================================

const ToolsState = {
  tool: 'pick',          // 'pick' | 'group' | 'timer'
  roomKey: '',           // "courseId|sectionId" ของห้องที่เลือก
  names: '',             // ข้อความรายชื่อ บรรทัดละคน
  picked: [],            // ประวัติที่สุ่มได้
  noRepeat: true,
  groupCount: 4,
  groups: [],
  timerTotal: 300,       // วินาทีที่ตั้งไว้
  timerLeft: 300,
  timerEndAt: 0,         // เวลาสิ้นสุด (ms) ตอนกำลังเดิน
  timerId: null,
  rooms: null,           // [{ key, label }] แคชรายการห้อง
};

const TOOL_SVG = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TOOL_ICONS = {
  pick: TOOL_SVG('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>'),
  group: TOOL_SVG('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.5 14.6c2.4 0 4 1.3 4.5 3.9"/>'),
  timer: TOOL_SVG('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 1.6"/><path d="M9.5 3h5"/>'),
  list: TOOL_SVG('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8" fill="currentColor"/><circle cx="4" cy="12" r=".8" fill="currentColor"/><circle cx="4" cy="18" r=".8" fill="currentColor"/>'),
};
const TOOL_HUES = ['violet', 'teal', 'orange', 'blue', 'pink', 'amber']; // สีไล่วนให้แต่ละกลุ่ม
const RING_LEN = 2 * Math.PI * 52;

function toolsRing() {
  const r = document.getElementById('timer-ring');
  if (r) r.style.strokeDashoffset = String(RING_LEN * (1 - ToolsState.timerLeft / ToolsState.timerTotal));
}

function toolsNameList() {
  return ToolsState.names.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function toolsShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toolsFmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

async function toolsLoadRooms() {
  if (ToolsState.rooms) return ToolsState.rooms;
  const { courses, sectionCards } = await loadCoursesWithGrades();
  const nameOf = new Map(courses.map(c => [c.id, c]));
  ToolsState.rooms = sectionCards.map(sc => {
    const c = nameOf.get(sc.courseId);
    return { key: `${sc.courseId}|${sc.sectionId}`, label: `${c ? (c.level ? c.level + ' ' : '') + c.name : 'วิชา'} · ห้อง ${sc.room}` };
  });
  return ToolsState.rooms;
}

async function toolsLoadStudents(roomKey) {
  const [courseId, sectionId] = roomKey.split('|');
  const snap = await sectionRef(AppState.user.uid, courseId, sectionId).collection('students').orderBy('no', 'asc').get();
  return snap.docs.map(d => d.data()).map(s => `${s.firstName || ''} ${s.lastName || ''}`.trim()).filter(Boolean);
}

async function renderToolsPage() {
  toolsStopTimerIfDetached();
  const view = document.getElementById('view');
  view.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  let rooms = [];
  try { rooms = await toolsLoadRooms(); } catch (err) { console.error(err); }

  const tab = (id, label) => `<button type="button" class="theme-opt" data-tool="${id}" aria-pressed="${ToolsState.tool === id}">${TOOL_ICONS[id]}${label}</button>`;
  view.innerHTML = `
    <div class="page-header"><h1>เครื่องมือ</h1><div class="sub">ตัวช่วยใช้ในห้องเรียน</div></div>
    <div class="theme-seg tools-tabs" role="group" aria-label="เครื่องมือ">
      ${tab('pick', 'สุ่มเรียกชื่อ')}${tab('group', 'แบ่งกลุ่ม')}${tab('timer', 'จับเวลา')}
    </div>
    <div id="tools-body" class="tools-stage" data-stage="${ToolsState.tool}"></div>
  `;
  view.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
    ToolsState.tool = b.dataset.tool;
    view.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    document.getElementById('tools-body').dataset.stage = ToolsState.tool;
    drawToolBody(rooms);
  }));
  drawToolBody(rooms);
}

function drawToolBody(rooms) {
  const body = document.getElementById('tools-body');
  if (!body) return;
  if (ToolsState.tool === 'timer') { drawTimer(body); return; }

  const roomOpts = rooms.map(r => `<option value="${escapeHtml(r.key)}" ${r.key === ToolsState.roomKey ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('');
  body.innerHTML = `
    <div class="tools-grid">
      <div class="card tools-card tools-names">
        <div class="tools-card-head">
          <span class="tools-ico">${TOOL_ICONS.list}</span>
          <div><div class="tools-title">รายชื่อ</div><div class="tools-pill" id="tools-count"></div></div>
        </div>
        <select id="tools-room"><option value="">— เลือกห้อง หรือพิมพ์เอง —</option>${roomOpts}</select>
        <textarea id="tools-names" rows="10" placeholder="พิมพ์หรือวางรายชื่อ บรรทัดละ 1 คน"></textarea>
      </div>
      <div class="card tools-card tools-main" id="tools-main"></div>
    </div>`;

  const ta = document.getElementById('tools-names');
  ta.value = ToolsState.names;
  const count = () => { document.getElementById('tools-count').textContent = `${toolsNameList().length} คน`; };
  count();
  ta.addEventListener('input', () => { ToolsState.names = ta.value; ToolsState.picked = []; count(); });
  document.getElementById('tools-room').addEventListener('change', async (e) => {
    ToolsState.roomKey = e.target.value;
    ToolsState.picked = [];
    if (!ToolsState.roomKey) return;
    try {
      ta.value = ToolsState.names = (await toolsLoadStudents(ToolsState.roomKey)).join('\n');
      count();
    } catch (err) { console.error(err); showToast('โหลดรายชื่อไม่สำเร็จ'); }
  });
  if (ToolsState.tool === 'pick') drawPicker(); else drawGroups();
}

function drawPicker() {
  const main = document.getElementById('tools-main');
  const pickedHtml = () => ToolsState.picked.length
    ? ToolsState.picked.map((n, i) => `<span class="tools-chip"><b>${i + 1}</b>${escapeHtml(n)}</span>`).join('')
    : '<span class="tools-muted">ยังไม่มีประวัติ</span>';
  main.innerHTML = `
    <div class="tools-display"><div class="tools-big" id="pick-out" aria-live="polite">—</div></div>
    <div class="tools-row u-center-x">
      <button type="button" class="btn tools-btn" id="pick-go">สุ่มเลย</button>
      <label class="tools-check"><input type="checkbox" id="pick-norepeat" ${ToolsState.noRepeat ? 'checked' : ''}> ไม่สุ่มซ้ำ</label>
      <button type="button" class="btn btn-ghost btn-sm" id="pick-reset">ล้างประวัติ</button>
    </div>
    <div class="tools-label u-mt-18">ที่สุ่มได้แล้ว</div>
    <div class="tools-chips" id="pick-hist">${pickedHtml()}</div>`;
  document.getElementById('pick-norepeat').addEventListener('change', (e) => { ToolsState.noRepeat = e.target.checked; });
  document.getElementById('pick-reset').addEventListener('click', () => { ToolsState.picked = []; drawPicker(); });
  document.getElementById('pick-go').addEventListener('click', () => {
    const all = toolsNameList();
    if (!all.length) { showToast('ใส่รายชื่อก่อน'); return; }
    let pool = ToolsState.noRepeat ? all.filter(n => !ToolsState.picked.includes(n)) : all;
    if (!pool.length) { showToast('สุ่มครบทุกคนแล้ว กด "ล้างประวัติ" เพื่อเริ่มใหม่'); return; }
    const out = document.getElementById('pick-out');
    const final = pool[Math.floor(Math.random() * pool.length)];
    let n = 0;
    const spin = setInterval(() => {   // เอฟเฟกต์สลับชื่อสั้นๆ ก่อนหยุด
      out.textContent = all[Math.floor(Math.random() * all.length)];
      if (++n >= 12) {
        clearInterval(spin);
        out.textContent = final;
        ToolsState.picked.push(final);
        document.getElementById('pick-hist').innerHTML = pickedHtml();
      }
    }, 60);
  });
}

function drawGroups() {
  const main = document.getElementById('tools-main');
  main.innerHTML = `
    <div class="tools-row">
      <label class="tools-label u-m-0" for="grp-n">จำนวนกลุ่ม</label>
      <input type="number" id="grp-n" class="tools-input u-w-84" min="2" max="30" value="${ToolsState.groupCount}">
      <button type="button" class="btn tools-btn" id="grp-go">แบ่งกลุ่ม</button>
      <button type="button" class="btn btn-ghost btn-sm" id="grp-copy">คัดลอก</button>
    </div>
    <div class="tools-groups" id="grp-out"></div>`;
  const show = () => {
    document.getElementById('grp-out').innerHTML = ToolsState.groups.length
      ? ToolsState.groups.map((g, i) => `<div class="tools-group" style="--w:var(--hue-${TOOL_HUES[i % TOOL_HUES.length]})"><div class="tools-group-title"><span class="tools-dot"></span>กลุ่ม ${i + 1}<span class="tools-pill">${g.length} คน</span></div>${g.map(n => `<div class="tools-name">${escapeHtml(n)}</div>`).join('')}</div>`).join('')
      : '<div class="tools-empty">ใส่รายชื่อ แล้วกด "แบ่งกลุ่ม"</div>';
  };
  show();
  document.getElementById('grp-go').addEventListener('click', () => {
    const names = toolsNameList();
    const k = Math.min(30, Math.max(2, Number(document.getElementById('grp-n').value) || 2));
    if (names.length < k) { showToast('จำนวนคนน้อยกว่าจำนวนกลุ่ม'); return; }
    ToolsState.groupCount = k;
    const groups = Array.from({ length: k }, () => []);
    toolsShuffle(names).forEach((n, i) => groups[i % k].push(n)); // แจกวนเพื่อให้แต่ละกลุ่มคนเท่ากันที่สุด
    ToolsState.groups = groups;
    show();
  });
  document.getElementById('grp-copy').addEventListener('click', async () => {
    if (!ToolsState.groups.length) { showToast('ยังไม่มีผลแบ่งกลุ่ม'); return; }
    const text = ToolsState.groups.map((g, i) => `กลุ่ม ${i + 1}\n${g.join('\n')}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); showToast('คัดลอกแล้ว'); } catch (e) { showToast('คัดลอกไม่สำเร็จ'); }
  });
}

// ---------- จับเวลา ----------
function toolsStopTimerIfDetached() {
  if (ToolsState.timerId && !document.getElementById('timer-out')) {
    clearInterval(ToolsState.timerId); ToolsState.timerId = null; ToolsState.timerEndAt = 0;
  }
}

function toolsBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) {}
}

function drawTimer(body) {
  const presets = [1, 3, 5, 10, 15, 30];
  body.innerHTML = `
    <div class="card tools-card tools-timer">
      <div class="tools-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="tools-ring-track" cx="60" cy="60" r="52"/><circle class="tools-ring-bar" id="timer-ring" cx="60" cy="60" r="52" stroke-dasharray="${RING_LEN}" stroke-dashoffset="0"/></svg>
        <div class="tools-big" id="timer-out" aria-live="off">${toolsFmtTime(ToolsState.timerLeft)}</div>
      </div>
      <div class="tools-chips u-center-x u-mt-4 u-mb-14">
        ${presets.map(m => `<button type="button" class="tools-preset" data-min="${m}" aria-pressed="${Math.round(ToolsState.timerTotal / 60) === m}">${m} นาที</button>`).join('')}
      </div>
      <div class="tools-row u-center-x">
        <input type="number" id="timer-min" class="tools-input u-w-84" min="1" max="180" value="${Math.round(ToolsState.timerTotal / 60)}" aria-label="นาที"> <span class="tools-muted">นาที</span>
        <button type="button" class="btn tools-btn" id="timer-toggle">${ToolsState.timerId ? 'หยุดชั่วคราว' : 'เริ่ม'}</button>
        <button type="button" class="btn btn-ghost" id="timer-reset">รีเซ็ต</button>
      </div>
    </div>`;
  const out = document.getElementById('timer-out');
  const toggle = document.getElementById('timer-toggle');
  const setTotal = (min) => {
    stop(); ToolsState.timerTotal = ToolsState.timerLeft = Math.min(180, Math.max(1, min)) * 60;
    out.textContent = toolsFmtTime(ToolsState.timerLeft); toggle.textContent = 'เริ่ม'; toolsRing();
    body.querySelectorAll('[data-min]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.min) * 60 === ToolsState.timerTotal)));
    document.getElementById('timer-min').value = Math.round(ToolsState.timerTotal / 60);
  };
  function stop() { if (ToolsState.timerId) clearInterval(ToolsState.timerId); ToolsState.timerId = null; }
  function tick() {
    if (!document.getElementById('timer-out')) { stop(); return; }   // ออกจากหน้านี้แล้ว
    ToolsState.timerLeft = Math.max(0, Math.ceil((ToolsState.timerEndAt - Date.now()) / 1000));
    document.getElementById('timer-out').textContent = toolsFmtTime(ToolsState.timerLeft);
    toolsRing();
    if (ToolsState.timerLeft <= 0) {
      stop(); toolsBeep(); showToast('หมดเวลา');
      const t = document.getElementById('timer-toggle'); if (t) t.textContent = 'เริ่ม';
    }
  }
  toolsRing();
  if (ToolsState.timerId) { clearInterval(ToolsState.timerId); ToolsState.timerId = setInterval(tick, 250); } // กลับมาที่แท็บนี้ระหว่างนับ
  body.querySelectorAll('[data-min]').forEach(b => b.addEventListener('click', () => setTotal(Number(b.dataset.min))));
  document.getElementById('timer-min').addEventListener('change', (e) => setTotal(Number(e.target.value) || 1));
  document.getElementById('timer-reset').addEventListener('click', () => setTotal(Math.round(ToolsState.timerTotal / 60)));
  toggle.addEventListener('click', () => {
    if (ToolsState.timerId) { stop(); toggle.textContent = 'เริ่ม'; return; }
    if (ToolsState.timerLeft <= 0) ToolsState.timerLeft = ToolsState.timerTotal;
    ToolsState.timerEndAt = Date.now() + ToolsState.timerLeft * 1000;
    ToolsState.timerId = setInterval(tick, 250);
    toggle.textContent = 'หยุดชั่วคราว';
  });
}
