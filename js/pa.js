// ==========================================================================
// ข้อตกลงในการพัฒนางาน (PA – Performance Agreement)
// บันทึก/แก้ไข PA ของครูแยกตามปีการศึกษา · บันทึกใน Firestore users/{uid}/pa/{docId}
// ==========================================================================

const PAState = {
  tab: 'agreement', // แท็บที่เปิดอยู่: 'agreement' (แบบฟอร์มข้อตกลง) | 'report' (แบบฟอร์มรายงาน)
  nextTab: null,    // navigate('pa-report-page') ตั้งค่านี้ให้ renderPAPage เปิดแท็บรายงานเลย
  view: 'list',     // มุมมองในแท็บข้อตกลง: 'list' | 'form'
  docId: null,      // null = สร้างใหม่ | string = แก้ไขที่มีอยู่
  doc: null,        // ข้อมูล PA ที่กำลังแก้
  list: null,       // แคชรายการ
};

// ------------------------------------------------------------------
// Firestore ref
// ------------------------------------------------------------------
function paCol(uid) {
  return db.collection('users').doc(uid).collection('pa_agreements');
}

function paRef(uid, docId) {
  return paCol(uid).doc(docId);
}

// ------------------------------------------------------------------
// โหลดรายการ PA ทั้งหมด
// ------------------------------------------------------------------
async function paLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await paCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------------------
// บันทึก PA
// ------------------------------------------------------------------
async function paSave(data) {
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  if (PAState.docId) {
    await paRef(uid, PAState.docId).update({ ...data, updatedAt: now });
    return PAState.docId;
  } else {
    const ref = await paCol(uid).add({ ...data, createdAt: now, updatedAt: now });
    PAState.docId = ref.id;
    return ref.id;
  }
}

// ------------------------------------------------------------------
// ลบ PA
// ------------------------------------------------------------------
async function paDelete(docId) {
  const uid = AppState.user?.uid;
  if (!uid) return;
  await paRef(uid, docId).delete();
  PAState.list = null;
}

// ------------------------------------------------------------------
// blank doc
// ------------------------------------------------------------------
function paBlankDoc() {
  const now = new Date();
  const thYear = (now.getFullYear() + 543).toString();
  const sem = now.getMonth() >= 4 && now.getMonth() <= 9 ? '1' : '2'; // พ.ค.–ต.ค. = ภาค 1
  return {
    year: thYear,
    semester: sem,
    teacherName: AppState.user?.displayName || '',
    position: 'ครู',
    level: '',
    department: '',
    school: '',
    tasks: [paBlankTask()],
    selfDev: '',
    status: 'draft',
  };
}

function paBlankTask() {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', goal: '', indicator: '', method: '', timeline: '' };
}

// ------------------------------------------------------------------
// ไอคอน SVG
// ------------------------------------------------------------------
const PA_ICO_ADD   = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`;
const PA_ICO_EDIT  = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16.2 3.6a2.4 2.4 0 0 1 3.4 0l.8.8a2.4 2.4 0 0 1 0 3.4L9.5 18.7a2 2 0 0 1-.9.5l-4.3 1.1a.8.8 0 0 1-1-1l1.1-4.3c.1-.3.3-.6.5-.9Z"/></svg>`;
const PA_ICO_DEL   = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const PA_ICO_PA    = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;

// ------------------------------------------------------------------
// ป้ายสถานะ
// ------------------------------------------------------------------
function paStatusBadge(status) {
  if (status === 'submitted') return `<span class="badge" style="background:var(--hue-teal);color:var(--on-w)">ส่งแล้ว</span>`;
  return `<span class="badge" style="background:var(--surface-sunken);color:var(--ink-soft)">ร่าง</span>`;
}

// ------------------------------------------------------------------
// โครงหน้า: หัวเรื่อง + แท็บ (แบบฟอร์มข้อตกลง | แบบฟอร์มรายงาน) + พื้นที่เนื้อหา
// ปุ่มเมนูข้างปุ่มเดียว (pa-page) เปิดหน้านี้ — สลับสองมุมมองด้วยแท็บโดยไม่วาดทั้งหน้าใหม่
// ------------------------------------------------------------------
const PA_TABS = [['agreement', 'แบบฟอร์มข้อตกลง'], ['report', 'แบบฟอร์มรายงาน']];

function paBuildShell() {
  const view = document.getElementById('view');
  view.innerHTML = `
    ${pageHeaderHtml('ข้อตกลง PA')}
    <div class="tabs" id="pa-tabs" role="tablist">
      ${PA_TABS.map(([id, label]) => `<div class="tab ${PAState.tab === id ? 'active' : ''}" data-tab="${id}" role="tab" aria-selected="${PAState.tab === id}" tabindex="0">${label}</div>`).join('')}
    </div>
    <div id="pa-tab-body"></div>`;
  const tabs = view.querySelector('#pa-tabs');
  initNavPill(tabs, '.tab', 'seg-pill');
  tabs.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => paSwitchTab(t.dataset.tab));
    t.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); paSwitchTab(t.dataset.tab); }
    });
  });
}

// พื้นที่เนื้อหาของแท็บ — ถ้ายังไม่มีโครง (เช่นถูกเรียกก่อน renderPAPage) ให้สร้างให้
function paMount() {
  const view = document.getElementById('view');
  if (!view.querySelector('#pa-tab-body')) paBuildShell();
  return view.querySelector('#pa-tab-body');
}

// เนื้อหาใหม่มาแล้ว: ยกเลิกตัวโหลด + จางเข้าเฉพาะพื้นที่เนื้อหา (แท็บไม่กะพริบ)
function paSwapIn(body) {
  clearLoading(body);
  body.classList.remove('is-switching', 'tab-swap');
  void body.offsetWidth; // รีสตาร์ทแอนิเมชันถ้าสลับซ้ำเร็วๆ
  body.classList.add('tab-swap');
}

function paRenderTab() {
  if (PAState.tab === 'report') return renderPAReportView();
  return PAState.view === 'form' ? renderPAFormView() : renderPAListView();
}

async function paSwitchTab(tab) {
  if (tab === PAState.tab || !PA_TABS.some(t => t[0] === tab)) return;
  // กำลังกรอกฟอร์มอยู่: เก็บค่าที่พิมพ์ค้างไว้ใน PAState.doc กลับมาที่แท็บข้อตกลงแล้วยังอยู่ครบ
  if (PAState.tab === 'agreement' && PAState.view === 'form') paCollectFormData();
  PAState.tab = tab;
  const tabs = document.getElementById('pa-tabs');
  tabs?.querySelectorAll('.tab').forEach(x => {
    const on = x.dataset.tab === tab;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
  });
  tabs?.__pillPlace?.(true);
  document.getElementById('pa-tab-body')?.classList.add('is-switching'); // หรี่เนื้อหาเดิมทันที ระหว่างรอข้อมูล
  await paRenderTab();
}

// ------------------------------------------------------------------
// หน้ารายการ PA (แท็บแบบฟอร์มข้อตกลง)
// ------------------------------------------------------------------
async function renderPAListView() {
  const view = paMount(); // = พื้นที่เนื้อหาของแท็บ
  showLoading('list', view);

  let list = [];
  try {
    list = await paLoadList();
    PAState.list = list;
  } catch (err) {
    if (!view.isConnected || PAState.tab !== 'agreement') return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }

  if (!view.isConnected || PAState.tab !== 'agreement' || PAState.view !== 'list') return;

  const rows = list.map(d => `
    <div class="pa-row card" data-id="${escapeHtml(d.id)}">
      <span class="pa-row-icon"><span class="nav-icon" style="--w:var(--hue-blue)">${PA_ICO_PA}</span></span>
      <div class="pa-row-info">
        <div class="pa-row-title">ปีการศึกษา ${escapeHtml(d.year || '—')} ภาคเรียนที่ ${escapeHtml(d.semester || '—')}</div>
        <div class="pa-row-sub">${escapeHtml(d.department || d.position || '')}${d.department && d.position ? ' · ' + escapeHtml(d.position) : ''}</div>
      </div>
      <div class="pa-row-meta">
        ${paStatusBadge(d.status)}
      </div>
      <div class="pa-row-actions">
        <button type="button" class="btn btn-ghost btn-sm pa-edit-btn" data-id="${escapeHtml(d.id)}" title="แก้ไข">${PA_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-danger-ghost btn-sm pa-del-btn" data-id="${escapeHtml(d.id)}" title="ลบ">${PA_ICO_DEL}</button>
      </div>
    </div>`).join('');

  const empty = list.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <div class="icon" style="background:var(--hue-blue)">${PA_ICO_PA}</div>
        <div style="font-weight:600;font-size:17px;margin-bottom:8px">ยังไม่มีข้อตกลง PA</div>
        <div style="color:var(--ink-soft);margin-bottom:20px">กดปุ่มด้านบนเพื่อสร้างข้อตกลง PA ปีการศึกษาใหม่</div>
        <button type="button" class="btn btn-primary pa-new-btn">${PA_ICO_ADD} สร้างข้อตกลง PA ใหม่</button>
      </div>
    </div>` : '';

  view.innerHTML = `
    <div class="pa-toolbar">
      <span style="color:var(--ink-soft);font-size:14px">${list.length > 0 ? `${list.length} รายการ` : ''}</span>
      ${list.length > 0 ? `<button type="button" class="btn btn-primary btn-sm pa-new-btn">${PA_ICO_ADD} สร้างใหม่</button>` : ''}
    </div>
    ${empty}
    <div class="pa-list">${rows}</div>
    <style>
      .pa-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      .pa-list{display:flex;flex-direction:column;gap:10px}
      .pa-row{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:box-shadow .15s}
      .pa-row:hover{box-shadow:0 0 0 2px var(--primary)}
      .pa-row-icon .nav-icon{width:40px;height:40px;border-radius:var(--radius-xs);display:grid;place-items:center;flex-shrink:0}
      .pa-row-icon .nav-icon::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(145deg,oklch(from var(--w) calc(l + .06) calc(c * 1.18) h),oklch(from var(--w) calc(l - .05) calc(c * 1.25) h));-webkit-mask:var(--squircle) center/100% 100% no-repeat;mask:var(--squircle) center/100% 100% no-repeat}
      .pa-row-info{flex:1;min-width:0}
      .pa-row-title{font-weight:600;font-size:15px;color:var(--ink)}
      .pa-row-sub{font-size:13px;color:var(--ink-soft);margin-top:2px}
      .pa-row-meta{flex-shrink:0}
      .pa-row-actions{display:flex;gap:6px;flex-shrink:0}
      .pa-row-actions .ico{width:16px;height:16px}
      .badge{display:inline-block;padding:3px 10px;border-radius:var(--radius-pill);font-size:12px;font-weight:600}
      @media(max-width:540px){.pa-row{flex-wrap:wrap}.pa-row-actions{width:100%;justify-content:flex-end}}
    </style>`;

  view.querySelectorAll('.pa-new-btn').forEach(b => b.addEventListener('click', () => {
    PAState.docId = null;
    PAState.doc = paBlankDoc();
    PAState.view = 'form';
    renderPAFormView();
  }));
  view.querySelectorAll('.pa-edit-btn').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.id;
    const d = PAState.list?.find(x => x.id === id);
    if (!d) return;
    PAState.docId = id;
    PAState.doc = JSON.parse(JSON.stringify(d)); // deep copy
    if (!Array.isArray(PAState.doc.tasks) || PAState.doc.tasks.length === 0) PAState.doc.tasks = [paBlankTask()];
    PAState.view = 'form';
    renderPAFormView();
  }));
  view.querySelectorAll('.pa-del-btn').forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = b.dataset.id;
    const d = PAState.list?.find(x => x.id === id);
    const label = d ? `ปีการศึกษา ${d.year} ภาค ${d.semester}` : 'รายการนี้';
    const row = b.closest('.pa-row');
    if (!row.dataset.confirmDel) {
      row.dataset.confirmDel = '1';
      b.textContent = 'ยืนยันลบ?';
      b.classList.add('btn-danger');
      b.classList.remove('btn-danger-ghost');
      setTimeout(() => { delete row.dataset.confirmDel; b.innerHTML = PA_ICO_DEL; b.classList.remove('btn-danger'); b.classList.add('btn-danger-ghost'); }, 3000);
      return;
    }
    b.disabled = true;
    try {
      await paDelete(id);
      await renderPAListView();
    } catch (err) {
      b.disabled = false;
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  }));

  view.classList.remove('is-switching');
  paSwapIn(view);
}

// ------------------------------------------------------------------
// หน้าฟอร์ม PA (อยู่ในแท็บแบบฟอร์มข้อตกลง)
// ------------------------------------------------------------------
function renderPAFormView() {
  const view = paMount(); // = พื้นที่เนื้อหาของแท็บ
  const d = PAState.doc;
  const isNew = !PAState.docId;

  const fieldRow = (label, id, val, placeholder = '', type = 'text', opts = '') =>
    `<div class="pa-field">
      <label class="pa-label" for="${id}">${label}</label>
      <input class="pa-input" type="${type}" id="${id}" name="${id}" value="${escapeHtml(val || '')}" placeholder="${escapeHtml(placeholder)}" ${opts}>
    </div>`;

  const tasksHtml = (tasks) => tasks.map((t, i) => `
    <div class="pa-task-card card" data-task-idx="${i}">
      <div class="pa-task-head">
        <span class="pa-task-num">งานที่ ${i + 1}</span>
        <button type="button" class="btn btn-danger-ghost btn-sm pa-del-task" data-idx="${i}" ${tasks.length === 1 ? 'disabled' : ''}>${PA_ICO_DEL} ลบ</button>
      </div>
      <div class="pa-task-grid">
        <div class="pa-field pa-field-full">
          <label class="pa-label" for="task-name-${i}">งาน / กิจกรรม / โครงการ</label>
          <input class="pa-input" type="text" id="task-name-${i}" name="task-name-${i}" value="${escapeHtml(t.name || '')}" placeholder="ระบุงานหรือกิจกรรมที่จะพัฒนา">
        </div>
        <div class="pa-field">
          <label class="pa-label" for="task-goal-${i}">เป้าหมาย / ผลที่คาดหวัง</label>
          <input class="pa-input" type="text" id="task-goal-${i}" name="task-goal-${i}" value="${escapeHtml(t.goal || '')}" placeholder="เช่น นักเรียนร้อยละ 80 ผ่านเกณฑ์">
        </div>
        <div class="pa-field">
          <label class="pa-label" for="task-indicator-${i}">ตัวชี้วัดความสำเร็จ</label>
          <input class="pa-input" type="text" id="task-indicator-${i}" name="task-indicator-${i}" value="${escapeHtml(t.indicator || '')}" placeholder="เช่น คะแนนเฉลี่ย ≥ 2.5">
        </div>
        <div class="pa-field">
          <label class="pa-label" for="task-method-${i}">วิธีการดำเนินงาน</label>
          <input class="pa-input" type="text" id="task-method-${i}" name="task-method-${i}" value="${escapeHtml(t.method || '')}" placeholder="เช่น จัดกิจกรรม PLC ทุกสัปดาห์">
        </div>
        <div class="pa-field">
          <label class="pa-label" for="task-timeline-${i}">กำหนดเวลา</label>
          <input class="pa-input" type="text" id="task-timeline-${i}" name="task-timeline-${i}" value="${escapeHtml(t.timeline || '')}" placeholder="เช่น ภาคเรียนที่ 1/2567">
        </div>
      </div>
    </div>`).join('');

  view.innerHTML = `
    <div class="pa-form-head">
      <button type="button" class="btn btn-ghost btn-sm pa-back-btn">← กลับ</button>
      <h2 class="pa-form-title">${isNew ? 'สร้างข้อตกลง PA ใหม่' : 'แก้ไขข้อตกลง PA'}</h2>
    </div>

    <form id="pa-form" novalidate>
      <!-- ส่วนที่ 1: ข้อมูลทั่วไป -->
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="pa-section-title">ส่วนที่ 1 · ข้อมูลทั่วไป</div>
        <div class="pa-grid">
          ${fieldRow('ชื่อ-นามสกุล', 'pa-teacherName', d.teacherName, 'ชื่อ นามสกุล')}
          ${fieldRow('ตำแหน่ง', 'pa-position', d.position, 'เช่น ครู, ครูชำนาญการ')}
          ${fieldRow('วิทยฐานะ', 'pa-level', d.level, 'เช่น ครูชำนาญการพิเศษ')}
          ${fieldRow('กลุ่มสาระ / ฝ่าย', 'pa-department', d.department, 'เช่น กลุ่มสาระคณิตศาสตร์')}
          ${fieldRow('โรงเรียน', 'pa-school', d.school, 'ชื่อสถานศึกษา')}
          ${fieldRow('ปีการศึกษา (พ.ศ.)', 'pa-year', d.year, '2567')}
        </div>
        <div class="pa-grid" style="grid-template-columns:1fr 1fr">
          <div class="pa-field">
            <label class="pa-label" for="pa-semester">ภาคเรียนที่</label>
            <select class="pa-input" id="pa-semester" name="pa-semester">
              <option value="1" ${d.semester === '1' ? 'selected' : ''}>1</option>
              <option value="2" ${d.semester === '2' ? 'selected' : ''}>2</option>
            </select>
          </div>
          <div class="pa-field">
            <label class="pa-label" for="pa-status">สถานะ</label>
            <select class="pa-input" id="pa-status" name="pa-status">
              <option value="draft" ${(d.status || 'draft') === 'draft' ? 'selected' : ''}>ร่าง</option>
              <option value="submitted" ${d.status === 'submitted' ? 'selected' : ''}>ส่งแล้ว</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ส่วนที่ 2: ข้อตกลงการพัฒนางาน -->
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="pa-section-title">ส่วนที่ 2 · ข้อตกลงในการพัฒนางาน</div>
        <div id="pa-tasks-container">${tasksHtml(d.tasks)}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="pa-add-task" style="margin-top:12px">${PA_ICO_ADD} เพิ่มงาน / กิจกรรม</button>
      </div>

      <!-- ส่วนที่ 3: การพัฒนาตนเอง -->
      <div class="card card-pad" style="margin-bottom:24px">
        <div class="pa-section-title">ส่วนที่ 3 · ข้อตกลงในการพัฒนาตนเอง</div>
        <div class="pa-field pa-field-full">
          <label class="pa-label" for="pa-selfDev">แผนการพัฒนาตนเองด้านวิชาชีพ</label>
          <textarea class="pa-input" id="pa-selfDev" name="pa-selfDev" rows="4" placeholder="ระบุแผนการอบรม การศึกษาต่อ หรือการพัฒนาตนเองที่วางแผนไว้ในปีการศึกษานี้">${escapeHtml(d.selfDev || '')}</textarea>
        </div>
      </div>

      <!-- ปุ่มบันทึก -->
      <div class="pa-form-footer">
        <button type="button" class="btn btn-ghost pa-cancel-btn">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="pa-save-btn">บันทึกข้อตกลง PA</button>
      </div>
    </form>

    <style>
      .pa-form-head{display:flex;align-items:center;gap:12px;margin-bottom:20px}
      .pa-form-title{font-size:20px;font-weight:700;margin:0;color:var(--ink)}
      .pa-section-title{font-size:13px;font-weight:700;color:var(--ink-soft);letter-spacing:.5px;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border)}
      .pa-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin-bottom:12px}
      .pa-field{display:flex;flex-direction:column;gap:5px}
      .pa-field-full{grid-column:1/-1}
      .pa-label{font-size:13px;font-weight:600;color:var(--ink-soft)}
      .pa-input{width:100%;box-sizing:border-box;padding:9px 12px;border-radius:var(--radius-s);border:1.5px solid var(--border);background:var(--surface);color:var(--ink);font-size:14.5px;font-family:var(--font);line-height:1.5;transition:border-color .15s}
      .pa-input:focus{outline:none;border-color:var(--primary)}
      textarea.pa-input{resize:vertical;min-height:80px}
      select.pa-input{cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23666' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
      .pa-task-card{padding:16px;margin-bottom:10px}
      .pa-task-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
      .pa-task-num{font-size:13px;font-weight:700;color:var(--ink-soft)}
      .pa-task-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
      .pa-task-grid .pa-field-full{grid-column:1/-1}
      .pa-form-footer{display:flex;gap:10px;justify-content:flex-end;padding-bottom:32px}
      @media(max-width:540px){.pa-grid,.pa-task-grid{grid-template-columns:1fr}.pa-form-footer{flex-direction:column-reverse}}
    </style>`;

  // --- กลับ
  view.querySelectorAll('.pa-back-btn, .pa-cancel-btn').forEach(b => b.addEventListener('click', () => {
    PAState.view = 'list'; renderPAListView();
  }));

  // --- เพิ่มงาน
  view.querySelector('#pa-add-task').addEventListener('click', () => {
    paCollectFormData();
    PAState.doc.tasks.push(paBlankTask());
    renderPAFormView();
  });

  // --- ลบงาน
  view.querySelectorAll('.pa-del-task').forEach(b => b.addEventListener('click', () => {
    const idx = parseInt(b.dataset.idx);
    paCollectFormData();
    PAState.doc.tasks.splice(idx, 1);
    renderPAFormView();
  }));

  // --- บันทึก
  view.querySelector('#pa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    paCollectFormData();
    const btn = view.querySelector('#pa-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      await paSave(PAState.doc);
      PAState.list = null; // clear cache
      if (typeof islandToast === 'function') islandToast('บันทึกข้อตกลง PA แล้ว', 'save');
      PAState.view = 'list';
      await renderPAListView();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'บันทึกข้อตกลง PA';
      alert('บันทึกไม่สำเร็จ: ' + err.message);
    }
  });

  view.classList.remove('is-switching');
  paSwapIn(view);
}

// ------------------------------------------------------------------
// เก็บค่าจากฟอร์มกลับเข้า PAState.doc
// ------------------------------------------------------------------
function paCollectFormData() {
  const get = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const d = PAState.doc;
  d.teacherName = get('pa-teacherName');
  d.position    = get('pa-position');
  d.level       = get('pa-level');
  d.department  = get('pa-department');
  d.school      = get('pa-school');
  d.year        = get('pa-year');
  d.semester    = get('pa-semester');
  d.status      = get('pa-status');
  d.selfDev     = (document.getElementById('pa-selfDev')?.value || '').trim();
  d.tasks = d.tasks.map((t, i) => ({
    ...t,
    name:      get(`task-name-${i}`),
    goal:      get(`task-goal-${i}`),
    indicator: get(`task-indicator-${i}`),
    method:    get(`task-method-${i}`),
    timeline:  get(`task-timeline-${i}`),
  }));
}

// ------------------------------------------------------------------
// renderPAPage — entry point เรียกจาก app.js
// ------------------------------------------------------------------
async function renderPAPage() {
  PAState.tab = PAState.nextTab || 'agreement'; // กดจากเมนูข้าง = เริ่มที่แท็บข้อตกลง (ยกเว้นมีคนขอแท็บรายงานมา)
  PAState.nextTab = null;
  PAState.view = 'list';
  paBuildShell();
  await paRenderTab();
}
