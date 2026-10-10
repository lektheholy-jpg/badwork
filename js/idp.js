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
const IDP_SAVE_LABEL = 'บันทึก ID-Plan'; // ป้ายปุ่มบันทึก (เหมือน PA: ข้อความล้วน อยู่ท้ายฟอร์ม)
const IDP_ICO_DOC = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;
function idpUpdatedAt(d) {
  const t = d.updatedAt || d.createdAt;
  const dt = t && typeof t.toDate === 'function' ? t.toDate() : null;
  return dt ? 'แก้ไขล่าสุด ' + dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// ------------------------------------------------------------------
// ดึงตารางสอน (หน้า "ข้อมูลส่วนตัว" → ตารางสอน) → 1.1 รายวิชา / 1.2 กิจกรรมพัฒนาผู้เรียน (1 คาบ = 1 ชม./สัปดาห์)
//   scope = { type: 'term'|'year'|'fiscal', year, sem } → รวมตารางของทุกภาคเรียนในช่วงนั้น (ไม่มีตาราง = รายการว่าง) · ดู ttScopeTerms ใน js/timetable.js
//   ไม่ส่ง scope → ใช้ตารางภาคเรียนที่ใช้งานอยู่ตอนนี้ (ใช้ตอนสร้างแผนใหม่)
//   วิชามีรหัส → 1.1 รายวิชา (เรียงตามรหัส) · ไม่มีรหัส/เป็นคาบกิจกรรม → 1.2 กิจกรรมพัฒนาผู้เรียน
//   ชื่อวิชาต่อท้ายด้วยระดับชั้นที่สอน เช่น "ค21101 คณิตศาสตร์พื้นฐาน ม.1" (มาจากช่องห้อง "ม.1/2" → "ม.1")
// ------------------------------------------------------------------
function idpClsLevel(cls) {
  return String(cls || '').split('/')[0].trim();
}
async function idpPullTimetable(scope) {
  await loadModule('timetable');
  if (scope && scope.year) {
    const { items, missing } = ttCollectScope(await loadAllTimetables(), scope);
    const sc = ttScopeTerms(scope)[0];
    return { ...ttAggregateTerms(items, true), sem: sc.sem, year: sc.year, missing, label: ttScopeLabel(scope) };
  }
  const tt = await loadTimetable();
  return { ...ttAggregateTerms([{ tt }], true), sem: tt.term?.sem, year: tt.term?.year, missing: [], label: ttTermLabel(tt.term) };
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
//   ระดับการศึกษา: แผนใหม่ดึงจากหน้าข้อมูลส่วนตัว (profileEducationLines) · ถ้าไม่มีให้ยกจากแผนล่าสุด · เก็บในแผน (doc.education) แก้ได้ · ปุ่ม "ดึงจากข้อมูลส่วนตัว" ใช้ซ้ำกับแผนเดิมได้
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
  d.specialGroup = String(d.specialGroup || '').trim(); // กลุ่มงานที่ต่อท้ายหัวข้อ "2. งานมอบหมายพิเศษ" (เช่น กลุ่มงานบริหารทั่วไป)
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
  // บริบทงานของผู้ช่วย AI (js/idp-ai.js) — ตัดความยาวตาม IDP_CONFIG.aiCtx.maxLen · 1 ฟิลด์ระดับบน (ไม่เกิน validDoc(30))
  const ac = d.aiCtx && typeof d.aiCtx === 'object' ? d.aiCtx : {};
  d.aiCtx = {};
  Object.entries(sys.config.aiCtx.maxLen).forEach(([k, n]) => { d.aiCtx[k] = String(ac[k] || '').slice(0, n); });
  return d;
}

// ชื่อสมรรถนะแบบไม่มีคำนำหน้ากลุ่ม (สมรรถนะหลัก / สมรรถนะประจำสายงาน) — ใช้ในตารางสรุปส่วนที่ 3 ตามแบบฟอร์ม
const idpCompTitle = fullName => String(fullName || '').replace(/^สมรรถนะ(?:หลัก|ประจำสายงาน)\s*/, '');

// แผนใหม่: ทุกช่องว่าง (ไม่เติมวิธีการ/รูปแบบการพัฒนาไว้ก่อน — ครูกรอกเอง หรือใช้ปุ่มผู้ช่วย AI ร่างให้)
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
  if (document.getElementById('idp-status')) doc.status = document.getElementById('idp-status').value || 'draft';

  // รายการส่วนที่ 1 — อ่านจากโครงกลางของ doc-shell.js (หน้าไม่มีบล็อกนั้น = คงค่าเดิม)
  doc.subjects   = docLRows('subjects')   || doc.subjects;
  doc.activities = docLRows('activities') || doc.activities;
  doc.education  = docLRows('education', false) || doc.education;
  doc.specials   = docLRows('specials', false)  || doc.specials;
  if (document.getElementById('idp-specialGroup')) doc.specialGroup = get('idp-specialGroup');

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

  // บริบทงานของผู้ช่วย AI — ช่องอยู่ในการ์ดที่ badwork-ai.js ติดให้ · ถ้าไม่มีช่อง (ไม่ได้โหลดไฟล์ AI) คงค่าเดิมไว้
  const ax = sys.config.aiCtx, aiCtx = {};
  Object.entries(ax.maxLen).forEach(([k, n]) => {
    aiCtx[k] = document.getElementById(ax.idPrefix + k) ? get(ax.idPrefix + k).slice(0, n) : (doc.aiCtx?.[k] || '');
  });
  doc.aiCtx = aiCtx;
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
    root.innerHTML = docListHtml({
      list, icon: IDP_ICO_DOC, hue: 'violet',
      title: d => idpDocTitle(d),
      sub: d => idpUpdatedAt(d),
      actions: ['print', 'dup', 'edit', 'del'],
      emptyTitle: 'ยังไม่มี ID-Plan',
      emptySub: 'กดปุ่มด้านล่างเพื่อสร้างแผนพัฒนาตนเอง (ID-Plan) ประจำปีการศึกษา',
      newLabel: 'สร้าง ID-Plan ใหม่',
    });
    docSwapIn(root);

    const openEdit = id => {
      const found = list.find(d => d.id === id);
      if (!found) return;
      sys.state.docId = id;
      sys.state.doc = idpNormalize(JSON.parse(JSON.stringify(found)));
      sys.state.view = 'form';
      idpRenderFormView();
    };
    docBindList(root, {
      create: () => {
        sys.state.doc = idpBlankDoc();
        sys.state.docId = null;
        sys.state.view = 'form';
        idpRenderFormView();
      },
      open: openEdit,
      edit: openEdit,
      dup: id => {
        const found = list.find(d => d.id === id);
        if (!found) return;
        const d = idpNormalize(JSON.parse(JSON.stringify(found)));
        ['id', 'createdAt', 'updatedAt'].forEach(k => { delete d[k]; });
        d.status = 'draft';
        d._ttTried = true; // มีรายวิชา/กิจกรรมจากฉบับเดิมแล้ว ไม่ดึงตารางสอนทับ
        sys.state.docId = null;
        sys.state.doc = d;
        sys.state.view = 'form';
        idpRenderFormView();
        showToast('คัดลอกแล้ว — แก้ไขตามต้องการ แล้วกด “บันทึก” จะได้เป็นฉบับใหม่');
      },
      print: id => {
        const found = list.find(d => d.id === id);
        if (!found) return;
        sys.state.docId = id;
        sys.state.doc = idpNormalize(JSON.parse(JSON.stringify(found)));
        sys.state.view = 'form'; // ตัวอย่าง/พิมพ์ อ่านจากแผนที่เปิดอยู่
        docSwitchTab('preview');
      },
      del: async id => { await idpDelete(id); await idpRenderListView(); },
    });
  } catch (e) {
    if (!root.isConnected) return;
    docSwapIn(root);
    root.innerHTML = `<div class="doc-error">โหลดรายการไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
  }
}

// แถว/บล็อกรายการของส่วนที่ 1 ใช้ตัวสร้างกลางใน js/doc-shell.js (docLBlockHtml · docLBind · docLRows) ร่วมกับ PA

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
    // ระดับการศึกษา: ดึงจากหน้าข้อมูลส่วนตัวก่อน (ไม่มี → ยกจากแผนล่าสุดด้านล่าง)
    try {
      const pr0 = await idpGetProfile();
      const eds = typeof profileEducationLines === 'function' ? profileEducationLines(pr0) : [];
      if (eds.length && !doc.education.length) doc.education = eds;
    } catch (e) { /* ใช้แผนล่าสุดแทน */ }
    // ระดับการศึกษา + งานมอบหมายพิเศษ มักไม่เปลี่ยนทุกภาคเรียน → ยกจากแผนล่าสุดมาให้ แก้ได้
    try {
      if (!sys.state.list) sys.state.list = await idpLoadList();
      const last = sys.state.list[0] && idpNormalize({ ...sys.state.list[0] });
      if (last) {
        if (!doc.education.length) doc.education = [...last.education];
        if (!doc.specials.length) doc.specials = [...last.specials];
        if (!doc.specialGroup) doc.specialGroup = last.specialGroup;
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
  comps.forEach(([cid, , fullName, subs]) => {
    const c = doc.comps?.[cid] || {};
    compsHtml += `
    <tr>
      <td data-label="สมรรถนะที่จะพัฒนา"><div class="doc-item-h"><div class="idp-comp-name">${escapeHtml(fullName)}</div></div>${(subs || []).map(([no, nm]) => `<div class="idp-comp-sub">${no} ${escapeHtml(nm)}</div>`).join('')}</td>
      <td data-label="อันดับความสำคัญ"><input class="input-sm" type="number" min="1" max="${comps.length}" placeholder="1–${comps.length}"
            data-comp-id="${cid}" data-comp-field="priority" value="${escapeHtml(c.priority || '')}"></td>
      <td data-label="วิธีการ / รูปแบบการพัฒนา"><textarea class="idp-ta" id="idp-${cid}-method"
            data-comp-id="${cid}" data-comp-field="method">${escapeHtml(c.method || '')}</textarea></td>
      <td data-label="ระยะเวลาเริ่มต้น"><input class="input-sm" type="text" placeholder="เช่น ต.ค. 68"
            data-comp-id="${cid}" data-comp-field="startDate" value="${escapeHtml(c.startDate || '')}"></td>
      <td data-label="ระยะเวลาสิ้นสุด"><input class="input-sm" type="text" placeholder="เช่น มี.ค. 69"
            data-comp-id="${cid}" data-comp-field="endDate" value="${escapeHtml(c.endDate || '')}"></td>
      <td data-label="เป้าหมาย"><textarea class="idp-ta" id="idp-${cid}-goal"
            data-comp-id="${cid}" data-comp-field="goal">${escapeHtml(c.goal || '')}</textarea></td>
      <td data-label="ประโยชน์ที่คาดว่าจะได้รับ"><textarea class="idp-ta" id="idp-${cid}-benefit"
            data-comp-id="${cid}" data-comp-field="benefit">${escapeHtml(c.benefit || '')}</textarea></td>
    </tr>`;
  });

  // ส่วนที่ 3: summary
  const sumCompOptions = comps.map(([cid, shortName]) =>
    `<option value="${cid}">${escapeHtml(shortName)}</option>`).join('');

  // ส่วนที่ 3: แถวที่เลือกสมรรถนะไว้แล้วแต่ช่องยังว่าง → เติมจากส่วนที่ 2 ให้ (ไม่ทับข้อความที่พิมพ์ไว้แล้ว)
  (doc.summary || []).forEach(sm => {
    const src = sm.compId && doc.comps?.[sm.compId];
    if (!src) return;
    ['method', 'startDate', 'endDate', 'benefit'].forEach(f => { if (!sm[f] && src[f]) sm[f] = src[f]; });
  });

  let summaryHtml = '';
  for (let i = 0; i < 3; i++) {
    const s = doc.summary?.[i] || {};
    summaryHtml += `
    <tr>
      <td class="idp-sum-rank" data-label="อันดับที่">${i + 1}</td>
      <td data-label="สมรรถนะที่จะพัฒนา"><select data-sum="${i}" data-sf="compId">
        <option value="">— เลือกสมรรถนะ —</option>
        ${comps.map(([cid, shortName]) =>
          `<option value="${cid}"${s.compId === cid ? ' selected' : ''}>${escapeHtml(shortName)}</option>`
        ).join('')}
      </select></td>
      <td data-label="วิธีการ / รูปแบบการพัฒนา"><textarea class="idp-ta" data-sum="${i}" data-sf="method">${escapeHtml(s.method || '')}</textarea></td>
      <td data-label="ระยะเวลา (เริ่ม–สิ้นสุด)"><input class="input-sm" type="text" placeholder="เช่น ต.ค. 68" data-sum="${i}" data-sf="startDate" value="${escapeHtml(s.startDate || '')}">–<input class="input-sm" type="text" placeholder="มี.ค. 69" data-sum="${i}" data-sf="endDate" value="${escapeHtml(s.endDate || '')}"></td>
      <td data-label="ประโยชน์ที่คาดว่าจะได้รับ"><textarea class="idp-ta" data-sum="${i}" data-sf="benefit">${escapeHtml(s.benefit || '')}</textarea></td>
    </tr>`;
  }

  root.innerHTML = `
  <div class="pa-form-head">
    <button type="button" class="btn btn-ghost btn-sm" id="idp-back-btn">← กลับ</button>
    <div>
      <h2 class="pa-form-title">ID-Plan · ${sys.state.docId ? 'แก้ไขแผน' : 'สร้างแผนใหม่'}</h2>
      <div class="u-note">แผนพัฒนาตนเองรายบุคคล (ID-Plan) สำหรับข้าราชการครูและบุคลากรทางการศึกษา</div>
    </div>
  </div>
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
        <label>สถานะ
          <select id="idp-status">
            <option value="draft"${(doc.status || 'draft') === 'draft' ? ' selected' : ''}>ร่าง</option>
            <option value="submitted"${doc.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option>
          </select>
        </label>
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

      ${docLBlockHtml({ key: 'education', title: 'ระดับการศึกษา', rows: doc.education.length ? doc.education : [''], hours: false, ph: 'เช่น ปริญญาตรี สาขาวิชาคณิตศาสตร์ มหาวิทยาลัย...', addLabel: 'เพิ่มวุฒิการศึกษา' })}
      <div class="u-mt-4"><button type="button" class="btn btn-ghost btn-sm" id="idp-edu-pull">ดึงจากข้อมูลส่วนตัว</button></div>
      ${docLBlockHtml({ key: 'subjects', title: '1.1 รายวิชาที่รับผิดชอบ', rows: doc.subjects.length ? doc.subjects : [{}], ph: 'วิชา / ระดับชั้น', addLabel: 'เพิ่มรายวิชา' })}
      ${docLBlockHtml({ key: 'activities', title: '1.2 กิจกรรมพัฒนาผู้เรียน', rows: doc.activities.length ? doc.activities : [{}], ph: 'กิจกรรม / ระดับชั้น', addLabel: 'เพิ่มกิจกรรม' })}
      ${docLTotalHtml({ label: 'รวมชั่วโมงสอน:', id: 'idp-total-hours', value: idpTotalHours(doc) })}
      ${docLBlockHtml({ key: 'specials', title: '1.3 งานมอบหมายพิเศษ / ภาระงานอื่น', rows: doc.specials.length ? doc.specials : [''], hours: false, ph: 'งาน / หน้าที่', addLabel: 'เพิ่มงาน' })}
      <div class="field u-mt-4"><label for="idp-specialGroup">กลุ่มงาน (ต่อท้ายหัวข้อ "2. งานมอบหมายพิเศษ" ในเอกสาร)</label>
        <input id="idp-specialGroup" type="text" maxlength="80" placeholder="เช่น กลุ่มงานบริหารทั่วไป" value="${escapeHtml(doc.specialGroup)}">
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

    <div class="pa-form-footer">
      ${sys.state.docId ? `<button type="button" class="btn btn-danger-ghost" id="idp-del-btn">${DOC_ICO_DEL} ลบ</button>` : ''}
      <button type="button" class="btn btn-ghost" id="idp-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="idp-save-btn">${IDP_SAVE_LABEL}</button>
    </div>

  </form>`;
  docSwapIn(root);
  if (typeof badworkAiMount === 'function') badworkAiMount(root, document.getElementById('idp-form'), sys); // ปุ่มผู้ช่วย AI (js/badwork-ai.js + ตัวต่อ js/idp-ai.js) — ไม่มีไฟล์นี้ฟอร์มก็ทำงานตามเดิม

  // Auto-expand textareas: แสดงข้อความทั้งหมดโดยไม่ซ่อน
  (function () {
    function idpExpandTa(ta) {
      if (!ta.offsetParent) return; // ซ่อนอยู่/ยังไม่ได้วางเลย์เอาต์ → วัดความสูงไม่ได้ (ได้ 0) ข้ามไปก่อน
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
    document.getElementById('idp-form')?.querySelectorAll('textarea.idp-ta').forEach(ta => {
      ta.style.overflow = 'hidden';
      ta.style.resize = 'none';
      idpExpandTa(ta);
      ta.addEventListener('input', () => idpExpandTa(ta));
    });
    // รองรับการที่ AI เติมข้อความ (fires input event บน textarea)
    window._idpExpandTa = idpExpandTa;
    // คำนวณความสูงใหม่เมื่อเลย์เอาต์เปลี่ยน (ย่อ/ขยายหน้าต่าง · สลับตาราง↔การ์ด · ฟอนต์โหลดเสร็จ) — ไม่งั้นช่องที่วัดไว้ตอนกว้างต่างกันจะตัดข้อความ
    const form = document.getElementById('idp-form');
    const reflow = () => form?.querySelectorAll('textarea.idp-ta').forEach(idpExpandTa);
    requestAnimationFrame(reflow);
    document.fonts?.ready.then(reflow);
    if (form && typeof ResizeObserver === 'function') {
      let w = form.clientWidth;
      new ResizeObserver(() => { if (form.clientWidth !== w) { w = form.clientWidth; reflow(); } }).observe(form);
    }
  })();

  // Wire events
  docLBind(document.getElementById('idp-form'), { totalKeys: ['subjects', 'activities'], totalEl: '#idp-total-hours' });

  // ส่วนที่ 3: เลือกสมรรถนะแล้วดึงวิธีการ/ระยะเวลา/ประโยชน์ที่กรอกไว้ในส่วนที่ 2 มาใส่ให้ (แก้ต่อในช่องได้)
  document.querySelectorAll('#idp-form select[data-sum][data-sf="compId"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = sel.dataset.sum, cid = sel.value;
      if (!cid) return;
      idpCollect(); // เก็บค่าล่าสุดของส่วนที่ 2 ก่อนดึง
      const src = sys.state.doc.comps?.[cid] || {};
      const fields = ['method', 'startDate', 'endDate', 'benefit'];
      const els = Object.fromEntries(fields.map(f => [f, document.querySelector(`#idp-form [data-sum="${i}"][data-sf="${f}"]`)]));
      if (!fields.some(f => src[f])) { showToast('ส่วนที่ 2 ของสมรรถนะนี้ยังไม่ได้กรอก — กรอกแล้วเลือกใหม่ หรือพิมพ์ในตารางนี้ได้เลย'); return; }
      if (fields.some(f => els[f]?.value.trim()) && !confirm('แทนที่ข้อความในแถวนี้ด้วยข้อมูลจากส่วนที่ 2?')) return;
      fields.forEach(f => {
        const el = els[f];
        if (!el) return;
        el.value = src[f] || '';
        if (el.tagName === 'TEXTAREA') window._idpExpandTa?.(el);
      });
    });
  });

  document.getElementById('idp-edu-pull')?.addEventListener('click', async () => {
    idpCollect();
    const sd = sys.state.doc;
    const lines = typeof profileEducationLines === 'function' ? profileEducationLines(await idpGetProfile()) : [];
    if (!lines.length) { showToast('ยังไม่ได้กรอกวุฒิการศึกษา — เพิ่มได้ที่ ข้อมูลส่วนตัว → วุฒิการศึกษา'); return; }
    if (sd.education.length && !confirm('แทนที่ระดับการศึกษาที่กรอกไว้ด้วยข้อมูลจากข้อมูลส่วนตัว?')) return;
    sd.education = lines;
    idpRenderFormView();
    showToast('ดึงวุฒิการศึกษาจากข้อมูลส่วนตัวแล้ว');
  });

  document.getElementById('idp-tt-pull')?.addEventListener('click', () => {
    idpCollect();
    const sd = sys.state.doc;
    docPickTtScope({
      scope: { type: 'term', year: sd.year, sem: sd.semester },
      onPick: async scope => {
        if ((sd.subjects.length || sd.activities.length) && !confirm('แทนที่รายวิชา/กิจกรรมที่กรอกไว้ด้วยข้อมูลจากตารางสอน?')) return;
        try {
          const t = await idpPullTimetable(scope);
          if (!t.subjects.length && !t.activities.length) { showToast(`ยังไม่มีตารางสอนของ${t.label} — เพิ่มได้ที่ ข้อมูลส่วนตัว → ตารางสอน`); return; }
          idpApplyTimetable(sd, t, true);
          idpRenderFormView();
          showToast(`ดึงจากตารางสอน ${t.label} แล้ว` + (t.missing.length ? ` (ไม่พบตารางของ ${t.missing.map(ttTermLabel).join(', ')})` : ''));
        } catch (e) {
          showToast('ดึงตารางสอนไม่สำเร็จ: ' + e.message, 'error');
        }
      },
    });
  });

  ['idp-back-btn', 'idp-cancel-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => {
    idpCollect();
    sys.state.view = 'list';
    idpRenderListView();
  }));

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
      btn.textContent = IDP_SAVE_LABEL;
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = IDP_SAVE_LABEL;
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
.idp1 .i1-h.i1-h0{margin-top:0}
.idp1 .i1-ind{padding-left:1.27cm}
.idp1 .i1-ind2{padding-left:2.2cm;text-indent:-.45cm}
.idp1 table{width:100%;border-collapse:collapse;margin-top:.4em}
.idp1 th,.idp1 td{border:1px solid #000;padding:.28em .4em;vertical-align:top;text-align:left;overflow-wrap:anywhere;font-size:14pt}
.idp1 th{text-align:center;font-weight:700;vertical-align:middle}
.idp1 thead{display:table-header-group}
.idp1 tr{break-inside:avoid;page-break-inside:avoid}
.idp1 .i1-sign{margin:2em 2cm 0 auto;width:9cm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.idp1 .i1-sub{padding-left:2.3em;text-indent:-2.3em}
.idp1 .i1-break{break-before:page;page-break-before:always;height:0}
.idp1 .i1-mid{text-align:center}
.idp1 .i1-big{font-size:1.1em}
.idp1 .i1-mt3{margin-top:.3em}
.idp1 .i1-mt5{margin-top:.5em}
.idp1 .i1-mb3{margin-bottom:.3em}
.idp1 .i1-mb5{margin-bottom:.5em}
.idp1 .i1-t13 th,.idp1 .i1-t13 td{font-size:13pt}
.idp1 .idp-w4{width:4%}.idp1 .idp-w6{width:6%}.idp1 .idp-w7{width:7%}.idp1 .idp-w8{width:8%}.idp1 .idp-w13{width:13%}.idp1 .idp-w15{width:15%}
.idp1 .idp-w20{width:20%}.idp1 .idp-w22{width:22%}.idp1 .idp-w25{width:25%}.idp1 .idp-w28{width:28%}.idp1 .idp-w30{width:30%}
@media screen{
  .idp1 .pg-port,.idp1 .pg-land{padding:.4em 1em}
  .idp1 .pg-land{border-top:2px dashed #999;margin-top:1em;padding-top:1em}
}
`;

// ------------------------------------------------------------------
// PAPER CSS — ตัวอย่างบนจอแสดงเป็นแผ่น A4 แยกหน้า (หน้าแรกแนวตั้ง · ส่วนที่ 2–3 แนวนอน) ขอบกระดาษเท่าตอนพิมพ์
//   #idp-src   = เอกสารต้นฉบับ (ใช้พิมพ์จริง — เบราว์เซอร์แบ่งหน้าเองด้วย named page) · ซ่อนบนจอเมื่อวาดแผ่นกระดาษเสร็จ (html.paper-on)
//   #idp-paper = แผ่นกระดาษที่ idpPaginate() ตัดแบ่งจาก #idp-src · ซ่อนตอนพิมพ์ · ย่อให้พอดีความกว้างด้วย --idp-zoom
// ------------------------------------------------------------------
const IDP_PAPER_CSS = `
@media screen{
  html{background:#dfe2e8}
  html.paper-on #idp-src{display:none}
  #idp-paper{display:none;zoom:var(--idp-zoom,1);padding:14px 0 2px}
  html.paper-on #idp-paper{display:block}
  .idp-pgwrap{margin:0 0 16px}
  .idp-sheet{box-sizing:border-box;margin:0 auto;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 2px 6px rgba(0,0,0,.18),0 10px 24px rgba(0,0,0,.10)}
  .idp-sheet.is-port{width:210mm;height:297mm;padding:20mm 20mm 20mm 25mm}
  .idp-sheet.is-land{width:297mm;height:210mm;padding:15mm}
  .idp-sheet-body{height:100%}
  .idp-sheet-body>:first-child{margin-top:0}
  .idp-pgno{margin-top:7px;font:calc(12px / var(--idp-zoom,1))/1 Tahoma,sans-serif;color:#5b6270;text-align:center}
}
@media print{#idp-paper{display:none}}
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
  const term = `ภาคเรียนที่ ${escapeHtml(d.semester)} ประจำปีการศึกษา ${escapeHtml(d.year)}`;

  // ส่วนที่ 1: การศึกษา / รายวิชา+กิจกรรม (ชม./สัปดาห์) / งานมอบหมายพิเศษ
  const bullet = (t, mark = '-') => `<div class="i1-ind2">${mark} ${t}</div>`;
  const eduItems = d.education.length ? d.education.map(e => bullet(escapeHtml(e), '•')).join('') : bullet(dots(30), '•');
  const teachRows = [...d.subjects, ...d.activities];
  const teachItems = teachRows.length
    ? teachRows.map(r => bullet(`${escapeHtml(r.name)}${r.hours ? `  จำนวน ${r.hours} ชั่วโมง/สัปดาห์` : ''}`)).join('')
    : bullet(dots(30));
  const specialItems = d.specials.length ? d.specials.map(x => bullet(escapeHtml(x))).join('') : bullet(dots(30));

  // ส่วนที่ 2
  const nl = t => escapeHtml(t || '').replace(/\n/g, '<br>');
  const compRows = comps.map(([cid, , fullName, subs], i) => {
    const c = d.comps?.[cid] || {};
    return `<tr>
      <td class="i1-mid">${i + 1}</td>
      <td><b>${escapeHtml(fullName)}</b>${(subs || []).map(([no, nm]) => `<div class="i1-sub">${no} ${escapeHtml(nm)}</div>`).join('')}</td>
      <td class="i1-mid">${escapeHtml(c.priority || '')}</td>
      <td>${nl(c.method)}</td>
      <td class="i1-mid">${escapeHtml(c.startDate || '')}</td>
      <td class="i1-mid">${escapeHtml(c.endDate || '')}</td>
      <td>${nl(c.goal)}</td>
      <td>${nl(c.benefit)}</td>
    </tr>`;
  }).join('');

  // ส่วนที่ 3
  const sumRows = d.summary.map((s, i) => {
    const compName = idpCompTitle(comps.find(([cid]) => cid === s.compId)?.[2]);
    return `<tr>
      <td class="i1-mid">${i + 1}</td>
      <td>${escapeHtml(compName)}</td>
      <td>${nl(s.method)}</td>
      <td class="i1-mid">${escapeHtml(s.startDate || '')}</td>
      <td class="i1-mid">${escapeHtml(s.endDate || '')}</td>
      <td>${nl(s.benefit)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><style>
body{margin:0;padding:0}
${docFontCss()}${IDP1_CSS}${IDP_PAPER_CSS}
</style></head>
<body><div id="idp-src"><div class="idp1">

<!-- หน้า 1 · แนวตั้ง · ข้อมูลส่วนบุคคล + ภาระงาน -->
<section class="pg-port">
  <div class="i1-c i1-big">แผนพัฒนาตนเองรายบุคคล</div>
  <div class="i1-c i1-big">(Individual Development Plan : ID PLAN)</div>
  <div class="i1-c i1-big">ของ ${escapeHtml(name)} ${escapeHtml(school)}</div>
  <div class="i1-c i1-big">${term}</div>
  <div class="i1-c">************************************</div>

  <div class="i1-h">ส่วนที่ 1  ข้อมูลส่วนบุคคล</div>
  <div class="i1-mt3"><b>ชื่อ</b>  ${escapeHtml(name)}</div>
  <div><b>ตำแหน่ง</b>  ${escapeHtml(position)}</div>
  <div>${escapeHtml(school)}${affiliation ? ' ' + escapeHtml(affiliation) : ''}</div>
  <div>สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน</div>
  <div>กระทรวงศึกษาธิการ</div>
  <div class="i1-mt3"><b>การศึกษาระดับ</b></div>
  ${eduItems}

  <div class="i1-h">ภารกิจ/บทบาทหน้าที่ในปีการศึกษาปัจจุบัน (ภาคเรียนที่ ${escapeHtml(d.semester)}/${escapeHtml(d.year)})</div>
  <div class="i1-mt3"><b>1. ด้านการเรียนการสอน</b>  กลุ่มสาระการเรียนรู้${escapeHtml(subjectGroup)}</div>
  <div class="i1-ind"><b>รายวิชาที่สอน</b></div>
  ${teachItems}
  <div class="i1-ind2"><b>รวม จำนวน ${idpTotalHours(d)} ชั่วโมง/สัปดาห์</b></div>
  <div class="i1-mt3"><b>2. งานมอบหมายพิเศษ${d.specialGroup ? ' ' + escapeHtml(d.specialGroup) : ''}</b></div>
  ${specialItems}
</section>

<!-- หน้า 2+ · แนวนอน · ส่วนที่ 2 และ 3 -->
<section class="pg-land">
  <div class="i1-h i1-h0">ส่วนที่ 2  รายละเอียดการพัฒนาตนเอง</div>
  <table class="i1-t13">
    <thead>
      <tr>
        <th rowspan="2" class="idp-w4">ที่</th>
        <th rowspan="2" class="idp-w22">สมรรถนะที่จะพัฒนา</th>
        <th rowspan="2" class="idp-w7">อันดับ<br>ความสำคัญ</th>
        <th rowspan="2" class="idp-w25">วิธีการ / รูปแบบการพัฒนา</th>
        <th colspan="2">ระยะเวลาในการพัฒนา</th>
        <th rowspan="2" class="idp-w13">เป้าหมาย</th>
        <th rowspan="2" class="idp-w15">ประโยชน์ที่คาดว่าจะได้รับ</th>
      </tr>
      <tr><th class="idp-w7">เริ่มต้น</th><th class="idp-w7">สิ้นสุด</th></tr>
    </thead>
    <tbody>${compRows}</tbody>
  </table>

  <div class="i1-break"></div>

  <div class="i1-h i1-h0">ส่วนที่ 3  ตารางสรุปแผนพัฒนาตนเอง</div>
  <div class="i1-ind i1-mb3 i1-keep">(ให้สรุปวิธีการ/รูปแบบการพัฒนา ที่มีความจำเป็นมากที่สุด ในสมรรถนะที่ต้องการพัฒนา 3 อันดับแรก)</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" class="idp-w6">อันดับที่</th>
        <th rowspan="2" class="idp-w20">สมรรถนะที่จะพัฒนา</th>
        <th rowspan="2" class="idp-w30">วิธีการ / รูปแบบการพัฒนา</th>
        <th colspan="2">ระยะเวลาในการพัฒนา</th>
        <th rowspan="2" class="idp-w28">ประโยชน์ที่คาดว่าจะได้รับ</th>
      </tr>
      <tr><th class="idp-w8">เริ่มต้น</th><th class="idp-w8">สิ้นสุด</th></tr>
    </thead>
    <tbody>${sumRows}</tbody>
  </table>

  <div class="i1-sign">
    <div>ผู้จัดทำ</div>
    <div>(${escapeHtml(name)})</div>${d.signDate ? `
    <div class="i1-mt3">วันที่ ${escapeHtml(d.signDate)}</div>` : ''}
  </div>
</section>

</div></div><div id="idp-paper"></div></body></html>`;
}

// ------------------------------------------------------------------
// PREVIEW VIEW — แสดงเป็นแผ่นกระดาษ A4 เหมือนตอนพิมพ์ (รูปแบบเดียวกับตัวอย่าง/พิมพ์ของ PA)
//   อ่านจากแผนที่เปิดอยู่ (รวมฉบับที่ยังไม่บันทึก) · เลือกดูแผนอื่นที่บันทึกไว้ได้จากรายการด้านบน
// ------------------------------------------------------------------
const IDP_SHEET = {
  port: { w: 210, h: 297, pad: [20, 20, 20, 25], label: 'A4 แนวตั้ง' },   // mm [บน, ขวา, ล่าง, ซ้าย] — ต้องตรงกับ @page idp-port
  land: { w: 297, h: 210, pad: [15, 15, 15, 15], label: 'A4 แนวนอน' },   // ต้องตรงกับ @page idp-land
};

// ตัด #idp-src ในเอกสารตัวอย่าง (doc) เป็นแผ่นกระดาษทีละหน้า วางลง #idp-paper → คืนจำนวนแผ่น
//   บล็อกยาวเกินหน้า = ขึ้นแผ่นใหม่ · ตารางแบ่งทีละแถว (ซ้ำหัวตารางทุกแผ่น) · หัวข้อ (.i1-h/.i1-keep) ไม่ถูกทิ้งไว้ท้ายแผ่นตามลำพัง
//   ต้องเรียกตอนฟอนต์โหลดแล้ว และตอน --idp-zoom ยังเป็น 1 (วัดความสูงจริง)
function idpPaginate(doc) {
  const src = doc.getElementById('idp-src'), paper = doc.getElementById('idp-paper');
  if (!src || !paper) return 0;
  paper.style.removeProperty('--idp-zoom');
  paper.textContent = '';
  doc.documentElement.classList.add('paper-on');

  const sheets = [];
  let cur = null;
  const newSheet = kind => {
    const spec = IDP_SHEET[kind];
    const wrap = doc.createElement('div');
    wrap.className = 'idp-pgwrap';
    const sheet = doc.createElement('section');
    sheet.className = 'idp-sheet is-' + kind;
    const body = doc.createElement('div');
    body.className = 'idp1 idp-sheet-body';
    sheet.appendChild(body);
    const no = doc.createElement('div');
    no.className = 'idp-pgno';
    wrap.append(sheet, no);
    paper.appendChild(wrap);
    cur = { kind, spec, body, no };
    sheets.push(cur);
  };
  const over = () => cur.body.scrollHeight > cur.body.clientHeight + 1;
  const isKeep = el => el.classList.contains('i1-h') || el.classList.contains('i1-keep');
  // หัวข้อที่อยู่ท้ายแผ่นปัจจุบัน → เอาออกเพื่อพาไปแผ่นใหม่พร้อมเนื้อหาที่ตามมา
  const takeKeep = () => {
    const out = [];
    while (cur.body.childElementCount > 1 && isKeep(cur.body.lastElementChild)) out.unshift(cur.body.removeChild(cur.body.lastElementChild));
    return out;
  };
  const moveToNewSheet = (...els) => {
    const kind = cur.kind, carry = takeKeep();
    newSheet(kind);
    [...carry, ...els].forEach(e => cur.body.appendChild(e));
  };
  const placeBlock = node => {
    const el = node.cloneNode(true);
    cur.body.appendChild(el);
    if (over() && cur.body.childElementCount > 1) { cur.body.removeChild(el); moveToNewSheet(el); }
  };
  const placeTable = tbl => {
    const mk = () => {
      const t = tbl.cloneNode(false);
      if (tbl.tHead) t.appendChild(tbl.tHead.cloneNode(true));
      const tb = doc.createElement('tbody');
      t.appendChild(tb);
      return { t, tb };
    };
    let { t, tb } = mk();
    cur.body.appendChild(t);
    for (const r of [...tbl.tBodies[0].rows]) {
      const row = r.cloneNode(true);
      tb.appendChild(row);
      if (!over()) continue;
      if (tb.rows.length > 1) {                      // แถวนี้ไม่พอที่ → ตารางต่อบนแผ่นใหม่ (หัวตารางซ้ำ)
        tb.removeChild(row);
        moveToNewSheet();
        ({ t, tb } = mk());
        cur.body.appendChild(t);
        tb.appendChild(row);
      } else if (cur.body.childElementCount > 1) {   // แถวแรกยังไม่พอที่ → ย้ายทั้งตาราง (พร้อมหัวข้อ) ไปแผ่นใหม่
        cur.body.removeChild(t);
        moveToNewSheet();
        ({ t, tb } = mk());
        cur.body.appendChild(t);
        tb.appendChild(row);
      }
    }
  };

  src.querySelectorAll('section').forEach(section => {
    newSheet(section.classList.contains('pg-land') ? 'land' : 'port');
    [...section.children].forEach(node => {
      if (node.classList.contains('i1-break')) { if (cur.body.childElementCount) newSheet(cur.kind); return; }
      if (node.tagName === 'TABLE') placeTable(node); else placeBlock(node);
    });
  });
  sheets.forEach((s, i) => { s.no.textContent = `หน้า ${i + 1} / ${sheets.length} · ${s.spec.label}`; });
  return sheets.length;
}

// ย่อแผ่นกระดาษให้พอดีความกว้างกรอบ (ไม่ขยายเกินขนาดจริง) แล้วปรับความสูง iframe ให้เท่าเนื้อหา — เลื่อนดูด้วยหน้าเพจ ไม่มีแถบเลื่อนซ้อน
function idpFitPaper(frame) {
  const doc = frame.contentDocument;
  const paper = doc && doc.getElementById('idp-paper');
  if (!paper || !doc.documentElement.classList.contains('paper-on')) return;
  paper.style.removeProperty('--idp-zoom');
  const widest = Math.max(0, ...[...paper.querySelectorAll('.idp-sheet')].map(s => s.offsetWidth));
  const zoom = widest ? Math.min(1, (frame.clientWidth - 16) / widest) : 1;
  paper.style.setProperty('--idp-zoom', zoom.toFixed(4));
  frame.style.setProperty('--fit-h', '100px');            // ลดก่อน เพื่อให้ scrollHeight = ความสูงเนื้อหาจริง
  frame.style.setProperty('--fit-h', doc.documentElement.scrollHeight + 'px');
}

async function idpRenderPreviewView(pickId) {
  const sys = docSystem();
  const root = docMount();
  const seq = sys.state.seq;
  docShowLoading(root);

  const open = sys.state.doc && sys.state.view === 'form' ? sys.state.doc : null;
  let list = [];
  try { list = await idpLoadList(); } catch (e) { /* โหลดรายการไม่ได้ → ดูได้เฉพาะแผนที่เปิดอยู่ */ }
  if (docStale(root, seq, sys) || sys.state.tab !== 'preview') return;

  if (!open && !list.length) {
    root.innerHTML = `<div class="card"><div class="empty-state"><div class="icon icon-violet">${IDP_ICO_DOC}</div><div class="empty-title">ยังไม่มี ID-Plan</div><div class="empty-sub">สร้างแผนพัฒนาตนเองก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่</div><button type="button" class="btn btn-primary" id="idp-prev-goto">ไปที่แบบฟอร์ม</button></div></div>`;
    docSwapIn(root);
    document.getElementById('idp-prev-goto')?.addEventListener('click', () => docSwitchTab('form'));
    return;
  }

  // รายการให้เลือก: แผนที่เปิดอยู่มาก่อน (ฉบับที่ยังไม่บันทึกก็ดูได้) ตามด้วยแผนที่บันทึกไว้
  const openKey = open ? (sys.state.docId || '__open__') : null;
  const opts = [];
  if (open) opts.push({ id: openKey, label: `${idpDocTitle(open)} · ${sys.state.docId ? 'กำลังแก้ไข' : 'ฉบับที่ยังไม่บันทึก'}` });
  list.filter(x => x.id !== openKey).forEach(x => opts.push({ id: x.id, label: idpDocTitle(x) }));
  const pid = opts.some(o => o.id === pickId) ? pickId : opts[0].id;
  const d = pid === openKey ? open : idpNormalize(JSON.parse(JSON.stringify(list.find(x => x.id === pid))));

  const profile = await idpGetProfile(); // อ่านล่าสุดทุกครั้งที่เปิดตัวอย่าง — แก้ข้อมูลส่วนตัวแล้วพิมพ์ได้เลย
  if (docStale(root, seq, sys) || sys.state.tab !== 'preview') return;

  root.innerHTML = `
    <div class="doc-preview-bar">
      <select class="doc-preview-select" id="idp-prev-select" aria-label="เลือกแผน">
        ${opts.map(o => `<option value="${escapeHtml(o.id)}"${o.id === pid ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>
      <div class="doc-preview-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="idp-prev-edit">${DOC_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-primary btn-sm" id="idp-print-btn">${DOC_ICO_PRINT} พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </div>
    <div class="u-note doc-preview-hint">ตัวอย่างตามแบบ ID-Plan ของ สพฐ. — หน้าแรกแนวตั้ง ส่วนที่ 2–3 แนวนอน (A4) · กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ใช้ Chrome/Edge จะแบ่งหน้าแนวตั้ง/แนวนอนได้ถูกต้องที่สุด</div>
    <div class="doc-preview-frame-wrap">
      <iframe id="idp-preview-frame" class="doc-preview-frame is-fit" title="ตัวอย่าง ID-Plan"></iframe>
    </div>`;
  docSwapIn(root);

  const frame = document.getElementById('idp-preview-frame');
  const loaded = new Promise(res => frame.addEventListener('load', res, { once: true }));
  frame.srcdoc = idpBuildPreviewHtml(d, profile);

  document.getElementById('idp-prev-select')?.addEventListener('change', e => idpRenderPreviewView(e.target.value));
  document.getElementById('idp-prev-edit')?.addEventListener('click', () => {
    if (pid !== openKey) { // เปิดแผนอื่นมาแก้ → แทนที่แผนที่เปิดอยู่ (ส่วนที่ยังไม่บันทึกจะหาย)
      if (open && !confirm('เปิดแผนนี้เพื่อแก้ไข? ส่วนที่แก้ในแผนที่เปิดอยู่และยังไม่ได้บันทึกจะหายไป')) return;
      sys.state.docId = pid;
      sys.state.doc = d;
      sys.state.view = 'form';
    }
    docSwitchTab('form');
  });
  document.getElementById('idp-print-btn')?.addEventListener('click', () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  });

  // รอเอกสารตัวอย่างโหลด + ฟอนต์พร้อม (ความสูงแถวขึ้นกับฟอนต์) แล้วค่อยตัดหน้า — ไม่งั้นจำนวนหน้าเพี้ยน
  await loaded;
  const fdoc = frame.contentDocument;
  const fl = fdoc && fdoc.fonts;
  if (fl && fl.load) {
    const loads = Promise.allSettled(["16pt 'PA Sarabun'", "bold 16pt 'PA Sarabun'", "13pt 'PA Sarabun'"].map(f => fl.load(f, 'กa')));
    await Promise.race([loads, new Promise(res => setTimeout(res, 2500))]);
    try { await fl.ready; } catch (e) { /* ไปต่อด้วยฟอนต์ที่มี */ }
  }
  if (!frame.isConnected) return;
  idpPaginate(fdoc);
  idpFitPaper(frame);

  const onResize = () => {
    if (!frame.isConnected || sys.state.tab !== 'preview') window.removeEventListener('resize', onResize);
    else idpFitPaper(frame);
  };
  window.addEventListener('resize', onResize);
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
