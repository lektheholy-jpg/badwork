// ==========================================================================
// แผนพัฒนาตนเอง (ID-Plan — Individual Development Plan)
// บันทึก/แก้ไข ID-Plan ของครูตามปีการศึกษา · Firestore: users/{uid}/idp_plans/{docId}
// โครงเอกสารตามแบบฟอร์ม ID-Plan ของ สพฐ.:
//   ส่วนที่ 1  ภาระงาน (รายวิชา + กิจกรรม + งานมอบหมายพิเศษ)
//   ส่วนที่ 2  รายละเอียดการพัฒนาตนเอง (10 สมรรถนะ × วิธี/ลำดับ/ระยะเวลา/เป้าหมาย/ประโยชน์)
//   ส่วนที่ 3  ตารางสรุปแผน 3 อันดับแรก
// ข้อมูลผู้จัดทำดึงจากหน้าข้อมูลส่วนตัว
// ==========================================================================

// ------------------------------------------------------------------
// ตัวช่วยเฉพาะ ID-Plan (ไอคอน + วันที่แก้ไขล่าสุด) — ไอคอนส่วนกลางอยู่ใน js/doc-shell.js
// ------------------------------------------------------------------
const IDP_ICO_BACK = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const IDP_ICO_SAVE = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
function idpUpdatedAt(d) {
  const t = d.updatedAt || d.createdAt;
  const dt = t && typeof t.toDate === 'function' ? t.toDate() : null;
  return dt ? 'แก้ไขล่าสุด ' + dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// ------------------------------------------------------------------
// ดึงตารางสอน (หน้า "ข้อมูลส่วนตัว" → ตารางสอน) → 1.1 รายวิชา / 1.2 กิจกรรมพัฒนาผู้เรียน (1 คาบ = 1 ชม./สัปดาห์)
//   term = { sem, year } → ใช้ตารางของภาคเรียนนั้นพอดี (ไม่มีตาราง = คืนรายการว่าง)
//   ไม่ส่ง term → ใช้ตารางภาคเรียนที่ใช้งานอยู่ตอนนี้ (ใช้ตอนสร้างแผนใหม่)
//   ชื่อวิชาต่อท้ายด้วยระดับชั้นที่สอน เช่น "ค21101 คณิตศาสตร์พื้นฐาน ม.1" (มาจากช่องห้อง "ม.1/2" → "ม.1")
// ------------------------------------------------------------------
function idpClsLevel(cls) {
  return String(cls || '').split('/')[0].trim();
}
async function idpPullTimetable(term) {
  await loadModule('timetable');
  let tt;
  if (term && term.sem && term.year) {
    const all = await loadAllTimetables();
    const hit = ttPick(all, ttTermKey({ sem: Number(term.sem), year: Number(term.year) }));
    tt = hit ? { term: { sem: Number(term.sem), year: Number(term.year) }, ...hit } : { term, entries: [] };
  } else {
    tt = await loadTimetable();
  }
  const placed = ttStats(tt).placed;
  const agg = kind => {
    const m = new Map();
    placed.filter(e => e.kind === kind).forEach(e => {
      const key = (e.code || '') + '|' + e.title;
      const cur = m.get(key) || { code: e.code, title: e.title, levels: new Set(), hours: 0 };
      if (e.cls) cur.levels.add(idpClsLevel(e.cls));
      cur.hours += e.span;
      m.set(key, cur);
    });
    return [...m.values()].map(c => ({
      name: [c.code, c.title, [...c.levels].filter(Boolean).join(', ')].filter(Boolean).join(' '),
      hours: c.hours,
    }));
  };
  return { subjects: agg('class'), activities: agg('activity'), sem: tt.term?.sem, year: tt.term?.year };
}
function idpApplyTimetable(doc, t, keepTerm) {
  doc.subjects = t.subjects;
  doc.activities = t.activities;
  if (!keepTerm) {
    if (t.sem) doc.semester = String(t.sem);
    if (t.year) doc.year = String(t.year);
  }
}

// ------------------------------------------------------------------
// ข้อมูลส่วนบุคคล — ดึงจากหน้า "ข้อมูลส่วนตัว" (profile) ทุกครั้งที่เปิดฟอร์ม/พิมพ์ ไม่ต้องกรอกซ้ำ
//   ระดับการศึกษาไม่มีในหน้าข้อมูลส่วนตัว → เก็บในแผน (doc.education) และยกจากแผนล่าสุดมาให้ตอนสร้างแผนใหม่
// ------------------------------------------------------------------
async function idpGetProfile() {
  try {
    await loadModule('profile');
    return await loadTeacherProfile();
  } catch (e) {
    return AppState.teacherProfile || null;
  }
}
function idpProfileInfo(p) {
  p = p || {};
  const name = [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' ');
  const position = [p.position, p.academicStanding].filter(Boolean).join(' ');
  return { name, position, subjectGroup: p.subjectGroup || '', school: p.school || '', affiliation: p.affiliation || '' };
}
function idpTotalHours(d) {
  const sum = a => (a || []).reduce((t, r) => t + (Number(r.hours) || 0), 0);
  return sum(d.subjects) + sum(d.activities);
}

// ------------------------------------------------------------------
// Firestore helpers
// ------------------------------------------------------------------
function idpCol(uid) {
  return docSystem('idp').col('plans', uid);
}

async function idpLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await idpCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function idpSave(data) {
  const sys = docSystem('idp');
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data;
  Object.keys(clean).forEach(k => { if (k[0] === '_') delete clean[k]; });
  if (sys.state.docId) {
    await idpCol(uid).doc(sys.state.docId).update({ ...clean, updatedAt: now });
    return sys.state.docId;
  } else {
    const ref = await idpCol(uid).add({ ...clean, createdAt: now, updatedAt: now });
    sys.state.docId = ref.id;
    return ref.id;
  }
}

async function idpDelete(docId) {
  const sys = docSystem('idp');
  const uid = AppState.user?.uid;
  if (!uid) return;
  await idpCol(uid).doc(docId).delete();
  sys.state.list = null;
}

// ------------------------------------------------------------------
// Normalize / blank doc
// ------------------------------------------------------------------
function idpNormalize(d) {
  const sys = docSystem('idp');
  d = d || {};
  d.semester = String(d.semester || '1');
  d.year     = String(d.year || String(new Date().getFullYear() + 543));
  d.signDate = String(d.signDate || '');
  // ส่วนที่ 1: ข้อมูลส่วนบุคคล (ระดับการศึกษา) + ภาระงาน
  d.education = Array.isArray(d.education) ? d.education.map(r => String(r?.name ?? r ?? '').trim()).filter(Boolean) : [];
  const norm = arr => (Array.isArray(arr) ? arr : []).map(r => ({
    name: String(r?.name || ''), hours: Number(r?.hours) || 0,
  }));
  d.subjects   = norm(d.subjects);
  d.activities = norm(d.activities);
  d.specials   = Array.isArray(d.specials) ? d.specials.map(r => String(r?.name ?? r ?? '').trim()).filter(Boolean) : []; // เก็บเป็นข้อความ (idpCollect) · รับแบบ {name} จากเอกสารเก่าด้วย
  // ส่วนที่ 2: สมรรถนะ
  d.comps = d.comps && typeof d.comps === 'object' ? d.comps : {};
  sys.config.competencies.forEach(([cid]) => {
    const c = d.comps[cid] || {};
    d.comps[cid] = {
      priority:  String(c.priority  || ''),
      method:    String(c.method    || ''),
      startDate: String(c.startDate || ''),
      endDate:   String(c.endDate   || ''),
      goal:      String(c.goal      || ''),
      benefit:   String(c.benefit   || ''),
    };
  });
  // ส่วนที่ 3: สรุป 3 อันดับแรก
  d.summary = Array.isArray(d.summary) ? d.summary : [];
  while (d.summary.length < 3) d.summary.push({ compId: '', method: '', startDate: '', endDate: '', benefit: '' });
  d.summary = d.summary.slice(0, 3).map(s => ({
    compId:    String(s?.compId    || ''),
    method:    String(s?.method    || ''),
    startDate: String(s?.startDate || ''),
    endDate:   String(s?.endDate   || ''),
    benefit:   String(s?.benefit   || ''),
  }));
  return d;
}

function idpBlankDoc() {
  return idpNormalize({ semester: '1', year: String(new Date().getFullYear() + 543), status: 'draft' });
}

function idpDocTitle(d) {
  return `ภาคเรียนที่ ${d.semester || '—'} ปีการศึกษา ${d.year || '—'}`;
}

// ------------------------------------------------------------------
// Collect form data → state.doc
// ------------------------------------------------------------------
function idpCollect() {
  const sys = docSystem();
  if (!document.getElementById('idp-form')) return;
  const get = id => (document.getElementById(id)?.value || '').trim();
  const doc = sys.state.doc;

  doc.semester  = get('idp-semester');
  doc.year      = get('idp-year');
  doc.signDate  = get('idp-signDate');

  // subjects
  doc.subjects = [...document.querySelectorAll('.idp-subject-row')].map(r => ({
    name:  r.querySelector('.idp-sub-name')?.value.trim() || '',
    hours: Number(r.querySelector('.idp-sub-hours')?.value) || 0,
  })).filter(r => r.name || r.hours);

  // activities
  doc.activities = [...document.querySelectorAll('.idp-activity-row')].map(r => ({
    name:  r.querySelector('.idp-act-name')?.value.trim() || '',
    hours: Number(r.querySelector('.idp-act-hours')?.value) || 0,
  })).filter(r => r.name || r.hours);

  // education
  doc.education = [...document.querySelectorAll('.idp-edu-row input')].map(r => r.value.trim()).filter(Boolean);

  // specials
  doc.specials = [...document.querySelectorAll('.idp-special-row input')].map(r => r.value.trim()).filter(Boolean);

  // competencies
  doc.comps = doc.comps || {};
  document.querySelectorAll('[data-comp-id]').forEach(el => {
    const cid = el.dataset.compId;
    const field = el.dataset.compField;
    if (!doc.comps[cid]) doc.comps[cid] = {};
    doc.comps[cid][field] = el.value.trim();
  });

  // summary
  doc.summary = [0, 1, 2].map(i => ({
    compId:    (document.querySelector(`[data-sum="${i}"][data-sf="compId"]`)?.value || '').trim(),
    method:    (document.querySelector(`[data-sum="${i}"][data-sf="method"]`)?.value || '').trim(),
    startDate: (document.querySelector(`[data-sum="${i}"][data-sf="startDate"]`)?.value || '').trim(),
    endDate:   (document.querySelector(`[data-sum="${i}"][data-sf="endDate"]`)?.value || '').trim(),
    benefit:   (document.querySelector(`[data-sum="${i}"][data-sf="benefit"]`)?.value || '').trim(),
  }));
}

// ------------------------------------------------------------------
// LIST VIEW
// ------------------------------------------------------------------
async function idpRenderListView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;
  docShowLoading(root);

  try {
    if (!sys.state.list) sys.state.list = await idpLoadList();
    if (docStale(root, seq, sys) || sys.state.tab !== 'form' || sys.state.view !== 'list') return;
    const list = sys.state.list;
    const canNew = true;
    let html = `<div class="doc-list-wrap">`;
    if (canNew) html += `<button class="btn btn-primary doc-new-btn" id="idp-new-btn">${DOC_ICO_ADD} สร้าง ID-Plan ใหม่</button>`;
    if (!list.length) {
      html += `<div class="doc-empty"><p>ยังไม่มี ID-Plan<br><span class="u-muted">กด "สร้าง ID-Plan ใหม่" เพื่อเริ่มต้น</span></p></div>`;
    } else {
      html += `<ul class="doc-list">`;
      list.forEach(d => {
        const badge = docStatusBadge(d.status);
        html += `<li class="doc-list-item" data-id="${escapeHtml(d.id)}">
          <div class="doc-list-main">
            <span class="doc-list-title">${escapeHtml(idpDocTitle(d))}</span>
            ${badge}
          </div>
          <div class="doc-list-sub u-muted">${escapeHtml(idpUpdatedAt(d))}</div>
        </li>`;
      });
      html += `</ul>`;
    }
    html += `</div>`;
    root.innerHTML = html;
    docSwapIn(root);

    document.getElementById('idp-new-btn')?.addEventListener('click', () => {
      sys.state.doc = idpBlankDoc();
      sys.state.docId = null;
      sys.state.view = 'form';
      idpRenderFormView();
    });
    root.querySelectorAll('.doc-list-item').forEach(li => {
      li.addEventListener('click', async () => {
        const id = li.dataset.id;
        const found = list.find(d => d.id === id);
        if (!found) return;
        sys.state.docId = id;
        sys.state.doc = idpNormalize({ ...found });
        sys.state.view = 'form';
        idpRenderFormView();
      });
    });
  } catch (e) {
    if (!root.isConnected) return;
    docSwapIn(root);
    root.innerHTML = `<div class="doc-error">โหลดรายการไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
  }
}

// ------------------------------------------------------------------
// Helper: row builders for part 1
// ------------------------------------------------------------------
function idpSubjectRowHtml(r) {
  return `<div class="idp-subject-row doc-lrow">
    <input class="idp-sub-name doc-l-name" type="text" placeholder="วิชา / ระดับชั้น" value="${escapeHtml(r?.name || '')}">
    <input class="idp-sub-hours doc-l-hours" type="number" min="0" max="99" placeholder="ชม./สป." value="${r?.hours || ''}">
    <button type="button" class="btn-icon doc-lrow-del" title="ลบ" aria-label="ลบ">${DOC_ICO_DEL}</button>
  </div>`;
}

function idpActivityRowHtml(r) {
  return `<div class="idp-activity-row doc-lrow">
    <input class="idp-act-name doc-l-name" type="text" placeholder="กิจกรรม / ระดับชั้น" value="${escapeHtml(r?.name || '')}">
    <input class="idp-act-hours doc-l-hours" type="number" min="0" max="99" placeholder="ชม./สป." value="${r?.hours || ''}">
    <button type="button" class="btn-icon doc-lrow-del" title="ลบ" aria-label="ลบ">${DOC_ICO_DEL}</button>
  </div>`;
}

function idpSpecialRowHtml(name) {
  return `<div class="idp-special-row doc-lrow">
    <input type="text" class="doc-l-name" placeholder="งาน / หน้าที่" value="${escapeHtml(name || '')}">
    <button type="button" class="btn-icon doc-lrow-del" title="ลบ" aria-label="ลบ">${DOC_ICO_DEL}</button>
  </div>`;
}

function idpEducationRowHtml(name) {
  return `<div class="idp-edu-row doc-lrow">
    <input type="text" class="doc-l-name" placeholder="เช่น ปริญญาตรี สาขาวิชาคณิตศาสตร์ มหาวิทยาลัย..." value="${escapeHtml(name || '')}">
    <button type="button" class="btn-icon doc-lrow-del" title="ลบ" aria-label="ลบ">${DOC_ICO_DEL}</button>
  </div>`;
}

// รวมชั่วโมงสอน/สัปดาห์ = รายวิชา + กิจกรรม (ตัวเลขที่พิมพ์ในส่วนที่ 1 ของแผน)
function idpUpdateTotal() {
  const el = document.getElementById('idp-total-hours');
  if (!el) return;
  const sum = sel => [...document.querySelectorAll(sel)].reduce((t, i) => t + (Number(i.value) || 0), 0);
  el.textContent = `รวม ${sum('.idp-sub-hours') + sum('.idp-act-hours')} ชั่วโมง/สัปดาห์`;
}

function idpAddRowHandler(container, buildFn) {
  container.addEventListener('click', e => {
    if (e.target.closest('.doc-lrow-del')) {
      e.target.closest('.doc-lrow').remove();
      idpUpdateTotal();
    }
  });
}

// ------------------------------------------------------------------
// FORM VIEW
// ------------------------------------------------------------------
async function idpRenderFormView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;

  const doc = sys.state.doc || idpBlankDoc();
  sys.state.doc = doc;
  const stillHere = () => !docStale(root, seq, sys) && sys.state.tab === 'form' && sys.state.view === 'form';

  // แผนใหม่: ดึงรายวิชา/กิจกรรมจากตารางสอนให้เลยครั้งเดียว (ไม่มีตารางสอน = เว้นว่างให้กรอกเอง)
  if (!sys.state.docId && !doc._ttTried) {
    doc._ttTried = true;
    docShowLoading(root);
    try {
      const t = await idpPullTimetable();
      if (!doc.subjects.length && !doc.activities.length && (t.subjects.length || t.activities.length)) idpApplyTimetable(doc, t);
    } catch (e) { /* ไม่มีตารางสอน/โหลดไม่ได้ → กรอกเอง */ }
    // ระดับการศึกษา + งานมอบหมายพิเศษ มักไม่เปลี่ยนทุกภาคเรียน → ยกจากแผนล่าสุดมาให้ แก้ได้
    try {
      if (!sys.state.list) sys.state.list = await idpLoadList();
      const last = sys.state.list[0] && idpNormalize({ ...sys.state.list[0] });
      if (last) {
        if (!doc.education.length) doc.education = [...last.education];
        if (!doc.specials.length) doc.specials = [...last.specials];
      }
    } catch (e) { /* ไม่มีแผนเก่า → กรอกเอง */ }
    if (!stillHere()) return;
  }
  // ข้อมูลส่วนบุคคลดึงจากหน้า "ข้อมูลส่วนตัว" (ใช้ค่าที่แคชไว้ก่อน ไม่ต้องอ่านซ้ำทุกครั้งที่วาดฟอร์ม)
  const prof = AppState.teacherProfile || await idpGetProfile();
  if (!stillHere()) return;
  const pi = idpProfileInfo(prof);

  const comps = sys.config.competencies;

  // ส่วนที่ 2 rows
  let compsHtml = '';
  comps.forEach(([cid, , fullName]) => {
    const c = doc.comps?.[cid] || {};
    compsHtml += `
    <tr>
      <td class="idp-comp-name">${escapeHtml(fullName)}</td>
      <td><input class="input-sm" type="number" min="1" max="10" placeholder="1–10"
            data-comp-id="${cid}" data-comp-field="priority" value="${escapeHtml(c.priority || '')}"></td>
      <td><textarea class="idp-ta" rows="3"
            data-comp-id="${cid}" data-comp-field="method">${escapeHtml(c.method || '')}</textarea></td>
      <td><input class="input-sm" type="text" placeholder="เช่น ต.ค. 68"
            data-comp-id="${cid}" data-comp-field="startDate" value="${escapeHtml(c.startDate || '')}"></td>
      <td><input class="input-sm" type="text" placeholder="เช่น มี.ค. 69"
            data-comp-id="${cid}" data-comp-field="endDate" value="${escapeHtml(c.endDate || '')}"></td>
      <td><textarea class="idp-ta" rows="3"
            data-comp-id="${cid}" data-comp-field="goal">${escapeHtml(c.goal || '')}</textarea></td>
      <td><textarea class="idp-ta" rows="3"
            data-comp-id="${cid}" data-comp-field="benefit">${escapeHtml(c.benefit || '')}</textarea></td>
    </tr>`;
  });

  // ส่วนที่ 3: summary
  const sumCompOptions = comps.map(([cid, shortName]) =>
    `<option value="${cid}">${escapeHtml(shortName)}</option>`).join('');

  let summaryHtml = '';
  for (let i = 0; i < 3; i++) {
    const s = doc.summary?.[i] || {};
    summaryHtml += `
    <tr>
      <td class="idp-sum-rank">${i + 1}</td>
      <td><select data-sum="${i}" data-sf="compId">
        <option value="">— เลือกสมรรถนะ —</option>
        ${comps.map(([cid, shortName]) =>
          `<option value="${cid}"${s.compId === cid ? ' selected' : ''}>${escapeHtml(shortName)}</option>`
        ).join('')}
      </select></td>
      <td><textarea class="idp-ta" rows="2" data-sum="${i}" data-sf="method">${escapeHtml(s.method || '')}</textarea></td>
      <td><input class="input-sm" type="text" placeholder="เช่น ต.ค. 68" data-sum="${i}" data-sf="startDate" value="${escapeHtml(s.startDate || '')}">–<input class="input-sm" type="text" placeholder="มี.ค. 69" data-sum="${i}" data-sf="endDate" value="${escapeHtml(s.endDate || '')}"></td>
      <td><textarea class="idp-ta" rows="2" data-sum="${i}" data-sf="benefit">${escapeHtml(s.benefit || '')}</textarea></td>
    </tr>`;
  }

  root.innerHTML = `
  <form id="idp-form" class="doc-form" autocomplete="off" novalidate>

    <!-- แถบบนฟอร์ม -->
    <div class="doc-form-header">
      <div class="doc-form-meta">
        <label>ภาคเรียนที่
          <select id="idp-semester">
            <option value="1"${doc.semester === '1' ? ' selected' : ''}>1</option>
            <option value="2"${doc.semester === '2' ? ' selected' : ''}>2</option>
          </select>
        </label>
        <label>ปีการศึกษา
          <input id="idp-year" type="text" inputmode="numeric" maxlength="4" value="${escapeHtml(doc.year)}">
        </label>
        <label>วันที่ลงนาม
          <input id="idp-signDate" type="text" placeholder="เช่น 8 มิ.ย. 2569" value="${escapeHtml(doc.signDate)}">
        </label>
      </div>
      <div class="doc-form-actions">
        <button type="button" class="btn btn-ghost" id="idp-back-btn">${IDP_ICO_BACK} รายการ</button>
        <button type="button" class="btn btn-primary" id="idp-save-btn">${IDP_ICO_SAVE} บันทึก</button>
        ${sys.state.docId ? `<button type="button" class="btn btn-danger-ghost" id="idp-del-btn">${DOC_ICO_DEL} ลบ</button>` : ''}
      </div>
    </div>

    <!-- ส่วนที่ 1: ข้อมูลส่วนบุคคล + ภาระงาน (พิมพ์เป็นหน้าแรก แนวตั้ง) -->
    <section class="doc-section">
      <div class="doc-sec-head">
        <h2 class="doc-sec-title">ส่วนที่ 1  ข้อมูลส่วนบุคคล และภาระงาน</h2>
        <button type="button" class="btn btn-ghost btn-sm" id="idp-tt-pull">ดึงจากตารางสอน</button>
      </div>

      <div class="doc-subsec">
        <div class="doc-subsec-hd">ข้อมูลส่วนบุคคล <span class="doc-sec-note">(ดึงจากหน้าข้อมูลส่วนตัวอัตโนมัติ)</span></div>
        ${pi.name ? `
          <div class="u-mt-4"><span class="u-muted">ชื่อ</span> <span class="u-semibold">${escapeHtml(pi.name)}</span></div>
          <div class="u-mt-4"><span class="u-muted">ตำแหน่ง</span> <span class="u-semibold">${escapeHtml(pi.position || '—')}</span>${pi.subjectGroup ? ` <span class="u-muted">กลุ่มสาระฯ</span> <span class="u-semibold">${escapeHtml(pi.subjectGroup)}</span>` : ''}</div>
          <div class="u-mt-4"><span class="u-muted">สถานศึกษา</span> <span class="u-semibold">${escapeHtml(pi.school || '—')}</span>${pi.affiliation ? ` <span class="u-muted">สังกัด</span> <span class="u-semibold">${escapeHtml(pi.affiliation)}</span>` : ''}</div>`
        : `<div class="u-note">ยังไม่ได้กรอกข้อมูลส่วนตัว — กรอกที่ไอคอนบัญชี (มุมซ้ายล่าง) → ข้อมูลส่วนตัว แล้วกลับมาเปิดแผนนี้ใหม่ ชื่อ/ตำแหน่ง/โรงเรียนจะขึ้นเองและพิมพ์ลงแผนให้</div>`}
      </div>

      <div class="doc-subsec">
        <div class="doc-subsec-hd">ระดับการศึกษา</div>
        <div id="idp-education-box" class="doc-lrows">
          ${(doc.education.length ? doc.education : ['']).map(idpEducationRowHtml).join('')}
        </div>
        <button type="button" class="btn-text doc-add-row" id="idp-add-education">${DOC_ICO_ADD} เพิ่มวุฒิการศึกษา</button>
      </div>

      <div class="doc-subsec">
        <div class="doc-subsec-hd">1.1 รายวิชาที่รับผิดชอบ</div>
        <div class="doc-lrow-header">
          <span class="doc-l-name">วิชา / ระดับชั้น</span>
          <span class="doc-l-hours">ชม./สป.</span>
          <span class="doc-l-act"></span>
        </div>
        <div id="idp-subjects-box" class="doc-lrows">
          ${(doc.subjects.length ? doc.subjects : [{}]).map(idpSubjectRowHtml).join('')}
        </div>
        <button type="button" class="btn-text doc-add-row" id="idp-add-subject">${DOC_ICO_ADD} เพิ่มรายวิชา</button>
      </div>

      <div class="doc-subsec">
        <div class="doc-subsec-hd">1.2 กิจกรรมพัฒนาผู้เรียน</div>
        <div class="doc-lrow-header">
          <span class="doc-l-name">กิจกรรม / ระดับชั้น</span>
          <span class="doc-l-hours">ชม./สป.</span>
          <span class="doc-l-act"></span>
        </div>
        <div id="idp-activities-box" class="doc-lrows">
          ${(doc.activities.length ? doc.activities : [{}]).map(idpActivityRowHtml).join('')}
        </div>
        <button type="button" class="btn-text doc-add-row" id="idp-add-activity">${DOC_ICO_ADD} เพิ่มกิจกรรม</button>
        <div class="u-semibold u-mt-4" id="idp-total-hours">รวม ${idpTotalHours(doc)} ชั่วโมง/สัปดาห์</div>
      </div>

      <div class="doc-subsec">
        <div class="doc-subsec-hd">1.3 งานมอบหมายพิเศษ / ภาระงานอื่น</div>
        <div id="idp-specials-box" class="doc-lrows">
          ${(doc.specials.length ? doc.specials : ['']).map(idpSpecialRowHtml).join('')}
        </div>
        <button type="button" class="btn-text doc-add-row" id="idp-add-special">${DOC_ICO_ADD} เพิ่มงาน</button>
      </div>
    </section>

    <!-- ส่วนที่ 2: รายละเอียดการพัฒนาตนเอง -->
    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 2  รายละเอียดการพัฒนาตนเอง</h2>
      <div class="idp-table-wrap">
        <table class="idp-comp-table">
          <thead>
            <tr>
              <th class="idp-w15">สมรรถนะที่จะพัฒนา</th>
              <th class="idp-w9">อันดับ<br>ความสำคัญ</th>
              <th class="idp-w20">วิธีการ / รูปแบบ<br>การพัฒนา</th>
              <th class="idp-w9">ระยะเวลา<br>เริ่มต้น</th>
              <th class="idp-w9">ระยะเวลา<br>สิ้นสุด</th>
              <th class="idp-w19">เป้าหมาย</th>
              <th class="idp-w19">ประโยชน์ที่<br>คาดว่าจะได้รับ</th>
            </tr>
          </thead>
          <tbody id="idp-comps-body">
            ${compsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <!-- ส่วนที่ 3: สรุปแผนพัฒนา 3 อันดับแรก -->
    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 3  ตารางสรุปแผนพัฒนาตนเอง <span class="doc-sec-note">(3 อันดับแรก)</span></h2>
      <div class="idp-table-wrap">
        <table class="idp-sum-table">
          <thead>
            <tr>
              <th class="idp-w6">อันดับที่</th>
              <th class="idp-w20">สมรรถนะที่จะพัฒนา</th>
              <th class="idp-w28">วิธีการ / รูปแบบการพัฒนา</th>
              <th class="idp-w22">ระยะเวลา (เริ่ม–สิ้นสุด)</th>
              <th class="idp-w24">ประโยชน์ที่คาดว่าจะได้รับ</th>
            </tr>
          </thead>
          <tbody>${summaryHtml}</tbody>
        </table>
      </div>
    </section>

  </form>`;
  docSwapIn(root);

  // Wire events
  const subBox = document.getElementById('idp-subjects-box');
  const actBox = document.getElementById('idp-activities-box');
  const spcBox = document.getElementById('idp-specials-box');
  const eduBox = document.getElementById('idp-education-box');
  idpAddRowHandler(eduBox);
  idpAddRowHandler(subBox);
  idpAddRowHandler(actBox);
  idpAddRowHandler(spcBox);

  document.getElementById('idp-add-education')?.addEventListener('click', () => {
    eduBox.insertAdjacentHTML('beforeend', idpEducationRowHtml(''));
  });
  document.getElementById('idp-form')?.addEventListener('input', e => {
    if (e.target.matches('.idp-sub-hours, .idp-act-hours')) idpUpdateTotal();
  });
  document.getElementById('idp-add-subject')?.addEventListener('click', () => {
    subBox.insertAdjacentHTML('beforeend', idpSubjectRowHtml({}));
  });
  document.getElementById('idp-add-activity')?.addEventListener('click', () => {
    actBox.insertAdjacentHTML('beforeend', idpActivityRowHtml({}));
  });
  document.getElementById('idp-add-special')?.addEventListener('click', () => {
    spcBox.insertAdjacentHTML('beforeend', idpSpecialRowHtml(''));
  });

  document.getElementById('idp-tt-pull')?.addEventListener('click', async () => {
    idpCollect();
    if ((doc.subjects.length || doc.activities.length) && !confirm('แทนที่รายวิชา/กิจกรรมที่กรอกไว้ด้วยข้อมูลจากตารางสอน?')) return;
    try {
      const sd = sys.state.doc;
      const t = await idpPullTimetable({ sem: sd.semester, year: sd.year });
      if (!t.subjects.length && !t.activities.length) { showToast(`ยังไม่มีตารางสอนของภาคเรียนที่ ${sd.semester}/${sd.year} — เพิ่มได้ที่ ข้อมูลส่วนตัว → ตารางสอน`); return; }
      idpApplyTimetable(sd, t, true);
      idpRenderFormView();
      showToast('ดึงจากตารางสอนแล้ว');
    } catch (e) {
      showToast('ดึงตารางสอนไม่สำเร็จ: ' + e.message, 'error');
    }
  });

  document.getElementById('idp-back-btn')?.addEventListener('click', () => {
    idpCollect();
    sys.state.view = 'list';
    idpRenderListView();
  });

  document.getElementById('idp-save-btn')?.addEventListener('click', async () => {
    idpCollect();
    const btn = document.getElementById('idp-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      sys.state.doc.status = sys.state.doc.status || 'draft';
      await idpSave(sys.state.doc);
      sys.state.list = null; // force reload list
      showToast('บันทึกแล้ว');
      btn.disabled = false;
      btn.innerHTML = `${IDP_ICO_SAVE} บันทึก`;
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `${IDP_ICO_SAVE} บันทึก`;
    }
  });

  document.getElementById('idp-del-btn')?.addEventListener('click', async () => {
    if (!confirm('ลบ ID-Plan นี้?')) return;
    try {
      await idpDelete(sys.state.docId);
      sys.state.docId = null;
      sys.state.doc = null;
      sys.state.view = 'list';
      idpRenderListView();
    } catch (e) {
      showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
  });
}

// ------------------------------------------------------------------
// PRINT CSS
//   หน้าแรก (.pg-port) = A4 แนวตั้ง · ตั้งแต่หน้าที่ 2 (.pg-land) = A4 แนวนอน — ใช้ named page (@page + คุณสมบัติ page)
//   เปลี่ยนชื่อหน้า = ขึ้นหน้าใหม่ให้เอง · รองรับใน Chrome/Edge (แนะนำ) และ Firefox 110+
// ------------------------------------------------------------------
const IDP1_CSS = `
@page{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}
@page idp-port{size:A4 portrait;margin:2cm 2cm 2cm 2.5cm}
@page idp-land{size:A4 landscape;margin:1.5cm 1.5cm 1.5cm 1.5cm}
.idp1 .pg-port{page:idp-port}
.idp1 .pg-land{page:idp-land}
.idp1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.22;text-align:left}
.idp1 *{box-sizing:border-box}
.idp1 b{font-weight:700}
.idp1 .i1-c{text-align:center;font-weight:700}
.idp1 .i1-h{font-weight:700;margin-top:.7em;break-after:avoid;page-break-after:avoid}
.idp1 .i1-ind{padding-left:1.27cm}
.idp1 .i1-ind2{padding-left:2.2cm;text-indent:-.45cm}
.idp1 table{width:100%;border-collapse:collapse;margin-top:.4em}
.idp1 th,.idp1 td{border:1px solid #000;padding:.28em .4em;vertical-align:top;text-align:left;overflow-wrap:anywhere;font-size:14pt}
.idp1 th{text-align:center;font-weight:700;background:#fcc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.idp1 thead{display:table-header-group}
.idp1 tr{break-inside:avoid;page-break-inside:avoid}
.idp1 .i1-sign{margin:2em 2cm 0 auto;width:9cm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.idp1 .i1-line{border-bottom:1px dotted #000;height:1.4em;margin-bottom:.2em}
.idp1 .i1-break{break-before:page;page-break-before:always;height:0}
.idp1 .i1-mid{text-align:center}
.idp1 .i1-big{font-size:1.1em}
.idp1 .i1-mt3{margin-top:.3em}
.idp1 .i1-mt5{margin-top:.5em}
.idp1 .i1-mb3{margin-bottom:.3em}
.idp1 .i1-mb5{margin-bottom:.5em}
.idp1 .i1-t13 th,.idp1 .i1-t13 td{font-size:13pt}
.idp1 .idp-w6{width:6%}.idp1 .idp-w8{width:8%}.idp1 .idp-w18{width:18%}.idp1 .idp-w19{width:19%}
.idp1 .idp-w20{width:20%}.idp1 .idp-w22{width:22%}.idp1 .idp-w24{width:24%}.idp1 .idp-w28{width:28%}
@media screen{
  .idp1 .pg-port,.idp1 .pg-land{padding:.4em 1em}
  .idp1 .pg-land{border-top:2px dashed #999;margin-top:1em;padding-top:1em}
}
`;

// ------------------------------------------------------------------
// Build preview HTML
//   หน้า 1 (แนวตั้ง): ข้อมูลส่วนบุคคล + ภาระงาน (ชั่วโมงสอน) — ไม่มีบันทึกข้อความนำส่ง
//   หน้า 2+ (แนวนอน): ส่วนที่ 2 ตารางสมรรถนะ · ส่วนที่ 3 ตารางสรุป + ลงชื่อผู้จัดทำ
// ------------------------------------------------------------------
function idpBuildPreviewHtml(d, profile) {
  d = idpNormalize(d);
  const sys = docSystem('idp');
  const comps = sys.config.competencies;

  const pi = idpProfileInfo(profile);
  const dots = n => '…'.repeat(n);
  const name = pi.name || dots(20);
  const position = pi.position || dots(12);
  const subjectGroup = pi.subjectGroup || dots(20);
  const school = pi.school || dots(20);
  const affiliation = pi.affiliation;
  const term = `ภาคเรียนที่ ${escapeHtml(d.semester)}  ปีการศึกษา ${escapeHtml(d.year)}`;

  // ส่วนที่ 1: การศึกษา / รายวิชา+กิจกรรม (ชม./สัปดาห์) / งานมอบหมายพิเศษ
  const bullet = t => `<div class="i1-ind2">- ${t}</div>`;
  const eduItems = d.education.length ? d.education.map(e => bullet(escapeHtml(e))).join('') : bullet(dots(30));
  const teachRows = [...d.subjects, ...d.activities];
  const teachItems = teachRows.length
    ? teachRows.map(r => bullet(`${escapeHtml(r.name)}${r.hours ? `  จำนวน ${r.hours} ชั่วโมง/สัปดาห์` : ''}`)).join('')
    : bullet(dots(30));
  const specialItems = d.specials.length ? d.specials.map(x => bullet(escapeHtml(x))).join('') : bullet(dots(30));

  // ส่วนที่ 2
  const compRows = comps.map(([cid, , fullName]) => {
    const c = d.comps?.[cid] || {};
    return `<tr>
      <td>${escapeHtml(fullName)}</td>
      <td class="i1-mid">${escapeHtml(c.priority || '')}</td>
      <td>${escapeHtml(c.method || '').replace(/\n/g, '<br>')}</td>
      <td class="i1-mid">${escapeHtml(c.startDate || '')}</td>
      <td class="i1-mid">${escapeHtml(c.endDate || '')}</td>
      <td>${escapeHtml(c.goal || '').replace(/\n/g, '<br>')}</td>
      <td>${escapeHtml(c.benefit || '').replace(/\n/g, '<br>')}</td>
    </tr>`;
  }).join('');

  // ส่วนที่ 3
  const sumRows = d.summary.map((s, i) => {
    const compName = comps.find(([cid]) => cid === s.compId)?.[2] || '';
    return `<tr>
      <td class="i1-mid">${i + 1}</td>
      <td>${escapeHtml(compName)}</td>
      <td>${escapeHtml(s.method || '').replace(/\n/g, '<br>')}</td>
      <td class="i1-mid">${escapeHtml(s.startDate || '')}${s.startDate && s.endDate ? ' – ' : ''}${escapeHtml(s.endDate || '')}</td>
      <td>${escapeHtml(s.benefit || '').replace(/\n/g, '<br>')}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><style>
body{margin:0;padding:0}
${docFontCss()}${IDP1_CSS}
</style></head>
<body><div class="idp1">

<!-- หน้า 1 · แนวตั้ง · ข้อมูลส่วนบุคคล + ภาระงาน -->
<section class="pg-port">
  <div class="i1-c i1-big">แผนพัฒนาตนเองรายบุคคล</div>
  <div class="i1-c i1-big">(Individual Development Plan : ID PLAN)</div>
  <div class="i1-c i1-big">ของ ${escapeHtml(name)} ${escapeHtml(school)}</div>
  <div class="i1-c i1-big">${term}</div>

  <div class="i1-h">ส่วนที่ 1  ข้อมูลส่วนบุคคล</div>
  <div class="i1-mt3"><b>ชื่อ</b>  ${escapeHtml(name)}</div>
  <div><b>ตำแหน่ง</b>  ${escapeHtml(position)}</div>
  <div>${escapeHtml(school)}${affiliation ? ' ' + escapeHtml(affiliation) : ''}</div>
  <div class="i1-mt3"><b>การศึกษาระดับ</b></div>
  ${eduItems}

  <div class="i1-h">ภารกิจ/บทบาทหน้าที่ในปีการศึกษาปัจจุบัน (ภาคเรียนที่ ${escapeHtml(d.semester)}/${escapeHtml(d.year)})</div>
  <div class="i1-mt3"><b>1. ด้านการเรียนการสอน</b>  กลุ่มสาระการเรียนรู้${escapeHtml(subjectGroup)}</div>
  <div class="i1-ind"><b>รายวิชาที่สอน</b></div>
  ${teachItems}
  <div class="i1-ind2"><b>รวม จำนวน ${idpTotalHours(d)} ชั่วโมง/สัปดาห์</b></div>
  <div class="i1-mt3"><b>2. งานมอบหมายพิเศษ</b></div>
  ${specialItems}
</section>

<!-- หน้า 2+ · แนวนอน · ส่วนที่ 2 และ 3 -->
<section class="pg-land">
  <div class="i1-h" style="margin-top:0">ส่วนที่ 2  รายละเอียดการพัฒนาตนเอง</div>
  <table class="i1-t13">
    <thead>
      <tr>
        <th class="idp-w18">สมรรถนะที่จะพัฒนา</th>
        <th class="idp-w8">อันดับ<br>ความสำคัญ</th>
        <th class="idp-w20">วิธีการ / รูปแบบ<br>การพัฒนา</th>
        <th class="idp-w8">ระยะเวลา<br>เริ่มต้น</th>
        <th class="idp-w8">ระยะเวลา<br>สิ้นสุด</th>
        <th class="idp-w19">เป้าหมาย</th>
        <th class="idp-w19">ประโยชน์ที่<br>คาดว่าจะได้รับ</th>
      </tr>
    </thead>
    <tbody>${compRows}</tbody>
  </table>

  <div class="i1-break"></div>

  <div class="i1-h" style="margin-top:0">ส่วนที่ 3  ตารางสรุปแผนพัฒนาตนเอง</div>
  <div class="i1-ind i1-mb3">(สรุปวิธีการ/รูปแบบการพัฒนา ที่มีความจำเป็นมากที่สุดในสมรรถนะ 3 อันดับแรก)</div>
  <table>
    <thead>
      <tr>
        <th class="idp-w6">อันดับที่</th>
        <th class="idp-w22">สมรรถนะที่จะพัฒนา</th>
        <th class="idp-w28">วิธีการ / รูปแบบการพัฒนา</th>
        <th class="idp-w20">ระยะเวลา</th>
        <th class="idp-w24">ประโยชน์ที่คาดว่าจะได้รับ</th>
      </tr>
    </thead>
    <tbody>${sumRows}</tbody>
  </table>

  <div class="i1-sign">
    <div class="i1-line"></div>
    <div>ผู้จัดทำ</div>
    <div>(${escapeHtml(name)})</div>
    <div>ตำแหน่ง ${escapeHtml(position)}</div>
    <div class="i1-mt3">วันที่ ${escapeHtml(d.signDate) || '……………………………………………'}</div>
  </div>
</section>

</div></body></html>`;
}

// ------------------------------------------------------------------
// PREVIEW VIEW
// ------------------------------------------------------------------
async function idpRenderPreviewView() {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;

  // โหลด doc ถ้ายังไม่มี
  if (!sys.state.doc && sys.state.docId) {
    docShowLoading(root);
    try {
      const uid = AppState.user?.uid;
      if (uid) {
        const snap = await idpCol(uid).doc(sys.state.docId).get();
        if (snap.exists) sys.state.doc = idpNormalize(snap.data());
      }
    } catch (e) { /* ignore */ }
  }

  if (!sys.state.doc || sys.state.view !== 'form') {
    root.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-title">ยังไม่ได้เปิด ID-Plan</div><div class="empty-sub">เปิดหรือสร้างแผนจากแท็บ "แบบฟอร์ม" ก่อน แล้วจึงดูตัวอย่าง / พิมพ์</div></div></div>`;
    docSwapIn(root);
    return;
  }
  const doc = sys.state.doc;

  // โหลด profile
  const profile = await idpGetProfile(); // อ่านล่าสุดทุกครั้งที่เปิดตัวอย่าง — แก้ข้อมูลส่วนตัวแล้วพิมพ์ได้เลย
  if (docStale(root, seq, sys) || sys.state.tab !== 'preview') return;
  const html = idpBuildPreviewHtml(doc, profile);

  root.innerHTML = `
    <div class="doc-preview-bar">
      <button type="button" class="btn btn-ghost" id="idp-prev-back">${IDP_ICO_BACK} กลับ</button>
      <button type="button" class="btn btn-primary" id="idp-print-btn">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M6 2.5h12a2 2 0 0 1 2 2v5H4v-5a2 2 0 0 1 2-2Z"/><rect opacity=".55" x="4" y="9.5" width="16" height="9" rx="2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/></g></svg>
        พิมพ์
      </button>
    </div>
    <div class="doc-preview-frame-wrap">
      <iframe id="idp-preview-frame" class="doc-preview-frame" title="ตัวอย่าง ID-Plan"></iframe>
    </div>`;

  docSwapIn(root);
  const frame = document.getElementById('idp-preview-frame');
  frame.srcdoc = html;

  document.getElementById('idp-prev-back')?.addEventListener('click', () => {
    docSwitchTab('form');
  });
  document.getElementById('idp-print-btn')?.addEventListener('click', () => {
    frame.contentWindow?.print();
  });
}

// ------------------------------------------------------------------
// ลงทะเบียน UI ของระบบ ID-Plan
// ------------------------------------------------------------------
registerDocUi('idp', {
  tabs: {
    preview: () => idpRenderPreviewView(),
    default: sys => sys.state.view === 'form' ? idpRenderFormView() : idpRenderListView(),
  },
  beforeLeave(sys) {
    if (sys.state.tab === 'form' && sys.state.view === 'form') idpCollect();
  },
});
