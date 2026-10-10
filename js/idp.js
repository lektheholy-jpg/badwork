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
// ------------------------------------------------------------------
async function idpPullTimetable() {
  await loadModule('timetable');
  const tt = await loadTimetable();
  const placed = ttStats(tt).placed;
  const agg = kind => {
    const m = new Map();
    placed.filter(e => e.kind === kind).forEach(e => {
      const key = (e.code || '') + '|' + e.title;
      const cur = m.get(key) || { name: [e.code, e.title].filter(Boolean).join(' '), hours: 0 };
      cur.hours += e.span;
      m.set(key, cur);
    });
    return [...m.values()];
  };
  return { subjects: agg('class'), activities: agg('activity'), sem: tt.term?.sem, year: tt.term?.year };
}
function idpApplyTimetable(doc, t) {
  doc.subjects = t.subjects;
  doc.activities = t.activities;
  if (t.sem) doc.semester = String(t.sem);
  if (t.year) doc.year = String(t.year);
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
  // ส่วนที่ 1: ภาระงาน
  const norm = arr => (Array.isArray(arr) ? arr : []).map(r => ({
    name: String(r?.name || ''), hours: Number(r?.hours) || 0,
  }));
  d.subjects   = norm(d.subjects);
  d.activities = norm(d.activities);
  d.specials   = Array.isArray(d.specials) ? d.specials.map(r => String(r?.name || '')).filter(Boolean) : [];
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

function idpAddRowHandler(container, buildFn) {
  container.addEventListener('click', e => {
    if (e.target.closest('.doc-lrow-del')) {
      e.target.closest('.doc-lrow').remove();
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
    if (!stillHere()) return;
  }

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

    <!-- ส่วนที่ 1: ภาระงาน -->
    <section class="doc-section">
      <div class="doc-sec-head">
        <h2 class="doc-sec-title">ส่วนที่ 1  ภาระงาน</h2>
        <button type="button" class="btn btn-ghost btn-sm" id="idp-tt-pull">ดึงจากตารางสอน</button>
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
  idpAddRowHandler(subBox);
  idpAddRowHandler(actBox);
  idpAddRowHandler(spcBox);

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
      const t = await idpPullTimetable();
      if (!t.subjects.length && !t.activities.length) { showToast('ยังไม่มีตารางสอน — เพิ่มได้ที่ ข้อมูลส่วนตัว → ตารางสอน'); return; }
      idpApplyTimetable(sys.state.doc, t);
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
// ------------------------------------------------------------------
const IDP1_CSS = `
.idp1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.22;text-align:left}
.idp1 *{box-sizing:border-box}
.idp1 b{font-weight:700}
.idp1 .i1-c{text-align:center;font-weight:700}
.idp1 .i1-r{text-align:right}
.idp1 .i1-h{font-weight:700;margin-top:.7em;break-after:avoid;page-break-after:avoid}
.idp1 .i1-p{text-indent:1.27cm}
.idp1 .i1-ind{padding-left:1.27cm}
.idp1 table{width:100%;border-collapse:collapse;margin-top:.4em}
.idp1 th,.idp1 td{border:1px solid #000;padding:.28em .4em;vertical-align:top;text-align:left;overflow-wrap:anywhere;font-size:14pt}
.idp1 th{text-align:center;font-weight:700;background:#fcc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.idp1 thead{display:table-header-group}
.idp1 .i1-sign{margin:2em 0 0 6cm;width:9cm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.idp1 .i1-line{border-bottom:1px dotted #000;height:1.4em;margin-bottom:.2em}
.idp1 .i1-break{break-before:page;page-break-before:always;height:0}
.idp1 .i1-memo-header{margin-bottom:1em}
.idp1 .i1-approve{display:grid;grid-template-columns:1fr 1fr;gap:1em;margin-top:1em;border:1px solid #000}
.idp1 .i1-approve>div{padding:.5em .7em;border-right:1px solid #000}
.idp1 .i1-approve>div:last-child{border-right:none}
.idp1 .i1-mid{text-align:center}
.idp1 .i1-big{font-size:1.1em}
.idp1 .i1-mt3{margin-top:.3em}
.idp1 .i1-mt5{margin-top:.5em}
.idp1 .i1-mb3{margin-bottom:.3em}
.idp1 .i1-mb5{margin-bottom:.5em}
.idp1 .i1-flex{display:flex;gap:2em}
.idp1 .i1-gap{height:2.5em}
.idp1 .i1-t13 th,.idp1 .i1-t13 td{font-size:13pt}
.idp1 .idp-w6{width:6%}.idp1 .idp-w8{width:8%}.idp1 .idp-w18{width:18%}.idp1 .idp-w19{width:19%}
.idp1 .idp-w20{width:20%}.idp1 .idp-w22{width:22%}.idp1 .idp-w24{width:24%}.idp1 .idp-w28{width:28%}
`;

// ------------------------------------------------------------------
// Build preview HTML
// ------------------------------------------------------------------
function idpBuildPreviewHtml(d, profile) {
  d = idpNormalize(d);
  const sys = docSystem('idp');
  const comps = sys.config.competencies;

  const p = profile || {};
  const name = [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' ') || '…………………………………';
  const position = p.position || '…………………';
  const subjectGroup = p.subjectGroup || '…………………………………';
  const school = p.school || '…………………………………';

  // ส่วนที่ 1
  const subjectRows = (d.subjects.length ? d.subjects : [{name:'', hours:''}]).map(r =>
    `<tr><td>${escapeHtml(r.name)}</td><td class="i1-mid">${r.hours || ''}</td></tr>`).join('');
  const activityRows = (d.activities.length ? d.activities : [{name:'', hours:''}]).map(r =>
    `<tr><td>${escapeHtml(r.name)}</td><td class="i1-mid">${r.hours || ''}</td></tr>`).join('');
  const specialItems = d.specials.length
    ? d.specials.map(s => `<div class="i1-ind">- ${escapeHtml(s)}</div>`).join('')
    : '<div class="i1-ind">-</div>';

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
@page{size:A4;margin:1.5cm 1.5cm 2cm}
body{margin:0;padding:0}
${docFontCss()}${IDP1_CSS}
</style></head>
<body><div class="idp1">

<div class="i1-memo-header">
  <div class="i1-c i1-big">บันทึกข้อความ</div>
  <div class="i1-mt5"><b>ส่วนราชการ</b>  ${escapeHtml(school)}</div>
  <div class="i1-flex i1-mt3">
    <div><b>เรื่อง</b>  ส่งแผนพัฒนาตนเอง (ID-PLAN)  ภาคเรียนที่ ${escapeHtml(d.semester)}  ปีการศึกษา  ${escapeHtml(d.year)}</div>
  </div>
  <div class="i1-mt3"><b>เรียน</b>  ผู้อำนวยการ${escapeHtml(school)}</div>
  <div class="i1-p i1-mt5">ด้วยข้าพเจ้า${escapeHtml(name)}  ตำแหน่ง  ${escapeHtml(position)}  กลุ่มสาระการเรียนรู้${escapeHtml(subjectGroup)} ได้จัดทำแผนพัฒนาตนเอง (ID-PLAN) ภาคเรียนที่ ${escapeHtml(d.semester)} ปีการศึกษา ${escapeHtml(d.year)} ซึ่งเป็นการพัฒนาที่สนองตอบความต้องการแต่ละบุคคล เพื่อให้การปฏิบัติงานในหน้าที่ที่ได้รับมอบหมายมีความสมบูรณ์ มีประสิทธิภาพและประสิทธิผล จึงเสนอรายงานแผนพัฒนาตนเอง ตามรายละเอียดแนบท้ายนี้</div>
  <div class="i1-p i1-mt3">จึงเรียนมาเพื่อโปรดทราบ</div>
  <div class="i1-sign">
    <div class="i1-line"></div>
    <div>ผู้รายงาน</div>
    <div>(${escapeHtml(name)})</div>
    <div>ตำแหน่ง ${escapeHtml(position)}</div>
    <div class="i1-mt3">วันที่ ${escapeHtml(d.signDate) || '……………………………………………'}</div>
  </div>
  <div class="i1-approve">
    <div>
      <div><b>ความเห็นหัวหน้ากลุ่มสาระการเรียนรู้</b></div>
      <div class="i1-gap"></div>
      <div class="i1-line"></div>
      <div>หัวหน้ากลุ่มสาระฯ</div>
    </div>
    <div>
      <div><b>ความเห็นผู้ช่วยผู้อำนวยการกลุ่มบริหารงานบุคคล</b></div>
      <div class="i1-gap"></div>
      <div class="i1-line"></div>
      <div>ผู้ช่วยผู้อำนวยการ</div>
    </div>
  </div>
</div>

<div class="i1-break"></div>

<!-- แผนพัฒนาตนเอง (ID-PLAN) -->
<div class="i1-c i1-big i1-mb5">แผนพัฒนาตนเอง (ID-PLAN)<br>ภาคเรียนที่ ${escapeHtml(d.semester)}  ปีการศึกษา ${escapeHtml(d.year)}</div>
<div class="i1-mb3">${escapeHtml(name)}  ตำแหน่ง ${escapeHtml(position)}  กลุ่มสาระ${escapeHtml(subjectGroup)}</div>

<div class="i1-h">ส่วนที่ 1  ภาระงาน</div>

<div class="i1-h">1.1 รายวิชาที่รับผิดชอบ</div>
<table>
  <thead><tr><th>รายวิชา / ระดับชั้น</th><th class="idp-w20">จำนวนชั่วโมง/สัปดาห์</th></tr></thead>
  <tbody>${subjectRows}</tbody>
</table>

<div class="i1-h">1.2 กิจกรรมพัฒนาผู้เรียน</div>
<table>
  <thead><tr><th>กิจกรรม / ระดับชั้น</th><th class="idp-w20">จำนวนชั่วโมง/สัปดาห์</th></tr></thead>
  <tbody>${activityRows}</tbody>
</table>

<div class="i1-h">1.3 งานมอบหมายพิเศษ / ภาระงานอื่น</div>
${specialItems}

<div class="i1-break"></div>

<div class="i1-h">ส่วนที่ 2  รายละเอียดการพัฒนาตนเอง</div>
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

<div class="i1-h">ส่วนที่ 3  ตารางสรุปแผนพัฒนาตนเอง</div>
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
  <div>(${escapeHtml(name)})</div>
  <div>ตำแหน่ง ${escapeHtml(position)}</div>
  <div class="i1-mt3">วันที่ ${escapeHtml(d.signDate) || '……………………………………………'}</div>
</div>

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
  let profile = null;
  try {
    await loadModule('profile');
    profile = await loadTeacherProfile();
  } catch (e) { /* ignore */ }

  if (!profile) profile = AppState.teacherProfile || null;
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
