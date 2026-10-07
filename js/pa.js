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
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data; // ฟิลด์ระบบไม่ถูกเขียนกลับ
  data = clean;
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
// ปีงบประมาณเริ่ม 1 ต.ค. (ต.ค.–ธ.ค. นับเป็นปีงบประมาณถัดไป)
function paFiscalYear(d = new Date()) { return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0); }
function paPeriodText(y) {
  y = Number(y);
  return y > 2400 ? `ระหว่างวันที่ 1 เดือน ตุลาคม พ.ศ. ${y - 1} ถึงวันที่ 30 เดือน กันยายน พ.ศ. ${y}` : '';
}
function paDocTitle(d) {
  return d.fiscalYear ? `ปีงบประมาณ พ.ศ. ${d.fiscalYear}` : `ปีการศึกษา ${d.year || '—'} ภาคเรียนที่ ${d.semester || '—'}`; // รายการเก่าใช้ปีการศึกษา/ภาคเรียน
}

const PA_WORKLOAD_TEMPLATE = `1.1 ชั่วโมงสอนตามตารางสอน รวมจำนวน … ชั่วโมง/สัปดาห์ ดังนี้
- กลุ่มสาระการเรียนรู้ …
- รายวิชา … จำนวน … ชั่วโมง/สัปดาห์
- กิจกรรมพัฒนาผู้เรียน … จำนวน … ชั่วโมง/สัปดาห์
1.2 งานส่งเสริมและสนับสนุนการจัดการเรียนรู้ จำนวน … ชั่วโมง/สัปดาห์
1.3 งานพัฒนาคุณภาพการจัดการศึกษาของสถานศึกษา จำนวน … ชั่วโมง/สัปดาห์`;

// ข้อมูลผู้จัดทำ (ชื่อ ตำแหน่ง วิทยฐานะ สถานศึกษา สังกัด เงินเดือน) ไม่เก็บใน PA — ดึงจากหน้าข้อมูลส่วนตัวตอนเปิดฟอร์ม
function paBlankDoc() {
  return {
    fiscalYear: String(paFiscalYear()),
    classroomBasic: true,
    workload: PA_WORKLOAD_TEMPLATE,
    challengeTitle: '', problem: '', method: '', outcome: '',
    status: 'draft',
  };
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
  if (status === 'submitted') return `<span class="badge badge-success">ส่งแล้ว</span>`;
  return `<span class="badge badge-neutral">ร่าง</span>`;
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
        <div class="pa-row-title">${escapeHtml(paDocTitle(d))}</div>
        <div class="pa-row-sub">${escapeHtml(d.challengeTitle || d.department || d.position || '')}</div>
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
        <div class="icon">${PA_ICO_PA}</div>
        <div class="empty-title">ยังไม่มีข้อตกลง PA</div>
        <div class="empty-sub">กดปุ่มด้านบนเพื่อสร้างข้อตกลง PA ปีการศึกษาใหม่</div>
        <button type="button" class="btn btn-primary pa-new-btn">${PA_ICO_ADD} สร้างข้อตกลง PA ใหม่</button>
      </div>
    </div>` : '';

  view.innerHTML = `
    <div class="pa-toolbar">
      <span class="u-note">${list.length > 0 ? `${list.length} รายการ` : ''}</span>
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
    PAState.view = 'form';
    renderPAFormView();
  }));
  view.querySelectorAll('.pa-del-btn').forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = b.dataset.id;
    const d = PAState.list?.find(x => x.id === id);
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
async function renderPAFormView() {
  const view = paMount(); // = พื้นที่เนื้อหาของแท็บ
  const d = PAState.doc;
  const isNew = !PAState.docId;
  showLoading('list', view);
  let p;
  try { await loadModule('profile'); p = await loadTeacherProfile(); } catch (err) { p = AppState.teacherProfile || {}; }
  if (!view.isConnected || PAState.tab !== 'agreement' || PAState.view !== 'form') return; // ผู้ใช้สลับแท็บ/ออกไปแล้ว

  const name = [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' ');
  const hasSalary = p.salary !== '' && p.salary != null;
  const pay = [p.ksLevel, hasSalary && 'อัตราเงินเดือน ' + formatSalary(p.salary) + ' บาท'].filter(Boolean).join(' ');
  const item = (label, val, wide) => `<div class="pa-pf-item${wide ? ' pa-pf-wide' : ''}"><dt>${label}</dt><dd>${val ? escapeHtml(val) : '—'}</dd></div>`;
  const area = (id, label, val, rows, ph = '') =>
    `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}" placeholder="${escapeHtml(ph)}">${escapeHtml(val || '')}</textarea></div>`;

  view.innerHTML = `
    <div class="pa-form-head">
      <button type="button" class="btn btn-ghost btn-sm pa-back-btn">← กลับ</button>
      <div>
        <h2 class="pa-form-title">PA 1/ส · ${isNew ? 'สร้างข้อตกลงใหม่' : 'แก้ไขข้อตกลง'}</h2>
        <div class="u-note">แบบตกลงในการพัฒนางาน (PA) สำหรับข้าราชการครูและบุคลากรทางการศึกษา ตำแหน่ง ครู (สังกัด สพฐ.)</div>
      </div>
    </div>

    <form id="pa-form" class="pa-form" novalidate>
      <div class="card card-pad">
        <h2 class="card-title">ผู้จัดทำข้อตกลง</h2>
        <dl class="pa-pf">
          ${item('ชื่อ-นามสกุล', name)}${item('ตำแหน่ง', p.position)}
          ${item('วิทยฐานะ', p.academicStanding)}${item('รับเงินเดือนในตำแหน่ง', pay)}
          ${item('สถานศึกษา', p.school)}${item('สังกัด', p.affiliation)}
        </dl>
        <div class="pa-pf-note">
          <span>ข้อมูลนี้ดึงจากหน้าข้อมูลส่วนตัว${!name || !p.school ? ' — ยังกรอกไม่ครบ' : ''}</span>
          <button type="button" class="btn btn-ghost btn-sm pa-goto-profile">ไปแก้ในข้อมูลส่วนตัว</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="pa-fiscalYear">ปีงบประมาณ พ.ศ.</label>
            <input id="pa-fiscalYear" type="text" inputmode="numeric" maxlength="4" value="${escapeHtml(d.fiscalYear || '')}" placeholder="${paFiscalYear()}">
            <div class="field-hint" id="pa-period">${escapeHtml(paPeriodText(d.fiscalYear))}</div>
          </div>
          <div class="field">
            <label for="pa-status">สถานะ</label>
            <select id="pa-status">
              <option value="draft"${(d.status || 'draft') === 'draft' ? ' selected' : ''}>ร่าง</option>
              <option value="submitted"${d.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option>
            </select>
          </div>
        </div>
        <div class="pa-sub">ประเภทห้องเรียนที่จัดการเรียนรู้</div>
        <label class="pa-check"><input type="checkbox" id="pa-classroomBasic"${d.classroomBasic ? ' checked' : ''}> ห้องเรียนวิชาสามัญหรือวิชาพื้นฐาน</label>
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ส่วนที่ 1 ข้อตกลงในการพัฒนางานตามมาตรฐานตำแหน่ง</h2>
        ${area('pa-workload', '1. ภาระงาน (ชั่วโมงสอนตามตารางสอน รวม … ชั่วโมง/สัปดาห์)', d.workload, 9)}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ส่วนที่ 2 ข้อตกลงในการพัฒนางานที่เป็นประเด็นท้าทาย</h2>
        ${area('pa-challengeTitle', 'เรื่อง ประเด็นท้าทาย', d.challengeTitle, 3, 'เช่น การพัฒนาทักษะ … ของนักเรียนระดับชั้น … โดยใช้ …')}
        ${area('pa-problem', '1. สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้', d.problem, 5)}
        ${area('pa-method', '2. วิธีการดำเนินการให้บรรลุผล', d.method, 5)}
        ${area('pa-outcome', '3. ผลลัพธ์การพัฒนาที่คาดหวัง', d.outcome, 5, '- เชิงปริมาณ: …\n- เชิงคุณภาพ: …')}
      </div>

      <div class="pa-form-footer">
        <button type="button" class="btn btn-ghost pa-cancel-btn">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="pa-save-btn">บันทึกข้อตกลง PA</button>
      </div>
    </form>`;

  view.querySelectorAll('.pa-back-btn, .pa-cancel-btn').forEach(b => b.addEventListener('click', () => {
    PAState.view = 'list'; renderPAListView();
  }));
  view.querySelector('.pa-goto-profile').addEventListener('click', () => { paCollectFormData(); navigate('profile'); });
  view.querySelector('#pa-fiscalYear').addEventListener('input', e => {
    view.querySelector('#pa-period').textContent = paPeriodText(e.target.value);
  });

  view.querySelector('#pa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    paCollectFormData();
    if (!/^\d{4}$/.test(PAState.doc.fiscalYear)) { showToast('ปีงบประมาณต้องเป็นตัวเลข 4 หลัก เช่น ' + paFiscalYear()); view.querySelector('#pa-fiscalYear').focus(); return; }
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
      showToast(err.code === 'permission-denied' ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)' : 'บันทึกไม่สำเร็จ: ' + (err.message || err));
    }
  });

  view.classList.remove('is-switching');
  paSwapIn(view);
}

// ------------------------------------------------------------------
// เก็บค่าจากฟอร์มกลับเข้า PAState.doc
// ------------------------------------------------------------------
function paCollectFormData() {
  const el = id => document.getElementById(id);
  if (!el('pa-form')) return; // ไม่ได้อยู่ในหน้าฟอร์ม
  const get = id => (el(id)?.value || '').trim();
  Object.assign(PAState.doc, {
    fiscalYear: get('pa-fiscalYear'),
    status: get('pa-status') || 'draft',
    classroomBasic: !!el('pa-classroomBasic')?.checked,
    workload: get('pa-workload'),
    challengeTitle: get('pa-challengeTitle'),
    problem: get('pa-problem'),
    method: get('pa-method'),
    outcome: get('pa-outcome'),
  });
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
