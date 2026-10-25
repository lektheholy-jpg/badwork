// ==========================================================================
// Courses: list, create (เลือกเทอม → เลือกวิชาจากแม่แบบ → เลือกห้อง), detail shell (tabs)
// ==========================================================================

// ==========================================================================
// แม่แบบวิชา (courseTemplates) กับรายวิชาที่เปิดสอนในเทอม (courses)
//
//   courseTemplates/{tid}  รหัส · ชื่อ · ระดับชั้น · หน่วยกิต + assessments + settings/structure|grading   (ไม่ระบุเทอม)
//   courses/{cid}          เทอมที่เปิดสอนจริง: ภาคเรียน · ปีการศึกษา · ห้อง · นักเรียน · คะแนน + templateId
//                          assessments ของวิชาเก็บ templateItemId = id ของรายการเดียวกันในแม่แบบ
//                          (ใช้จับคู่ตอนอัปเดตตามแม่แบบ โดยคง id เดิมไว้ → คะแนนที่กรอกแล้วไม่หลุด)
// ==========================================================================
const templatesCol = () => db.collection('users').doc(AppState.user.uid).collection('courseTemplates');
const coursesCol = () => db.collection('users').doc(AppState.user.uid).collection('courses');
const tplMillis = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
const tplKey = (d) => [d.code, d.name, d.level].map(x => String(x || '').trim().toLowerCase()).join('|');
const tplLabel = (t) => (t.code ? t.code + ' - ' : '') + (t.name || '');

async function loadTemplates() {
  const snap = await templatesCol().get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'th') || (a.name || '').localeCompare(b.name || '', 'th'));
  return list;
}

// วิชาเดิมที่ยังไม่มี templateId (สร้างก่อนมีระบบแม่แบบ) → สร้างแม่แบบให้อัตโนมัติ แล้วผูกกลับ
// วิชาที่รหัส+ชื่อ+ระดับชั้นเดียวกัน (เช่น วิชาเดียวกันที่สอนหลายเทอม) ใช้แม่แบบเดียวกัน โดยเอาโครงสร้างจากเทอมล่าสุด
// รายวิชาเดิมยังอยู่ครบ ห้อง/นักเรียน/คะแนนไม่ถูกแตะ — ทำซ้ำได้ปลอดภัย (ข้ามวิชาที่มี templateId แล้ว)
async function migrateCoursesToTemplates() {
  const [courseSnap, tplList] = await Promise.all([coursesCol().get(), loadTemplates()]);
  const unlinked = courseSnap.docs.filter(d => !d.data().templateId);
  if (!unlinked.length) return 0;

  const byKey = new Map(tplList.map(t => [tplKey(t), t]));
  const groups = new Map();
  unlinked.forEach(d => {
    const k = tplKey(d.data());
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  let created = 0;
  for (const [key, docs] of groups) {
    docs.sort((a, b) => tplMillis(b.data().createdAt) - tplMillis(a.data().createdAt));
    let tpl = byKey.get(key);
    let tplItems;
    if (!tpl) {
      const src = docs[0];
      const sd = src.data();
      const tRef = templatesCol().doc();
      const [aSnap, structDoc, gradeDoc] = await Promise.all([
        src.ref.collection('assessments').orderBy('order', 'asc').get(),
        src.ref.collection('settings').doc('structure').get(),
        src.ref.collection('settings').doc('grading').get(),
      ]);
      const batch = db.batch();
      batch.set(tRef, {
        code: sd.code || '', name: sd.name || '', level: sd.level || '', credit: sd.credit || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), migratedFrom: src.id,
      });
      tplItems = aSnap.docs.map(a => {
        const r = tRef.collection('assessments').doc();
        batch.set(r, a.data());
        return { id: r.id, data: a.data() };
      });
      if (structDoc.exists) batch.set(tRef.collection('settings').doc('structure'), structDoc.data());
      batch.set(tRef.collection('settings').doc('grading'), { scale: gradeDoc.exists ? gradeDoc.data().scale : DEFAULT_GRADE_SCALE });
      await batch.commit();
      tpl = { id: tRef.id };
      byKey.set(key, tpl);
      created++;
    } else {
      const aSnap = await templatesCol().doc(tpl.id).collection('assessments').get();
      tplItems = aSnap.docs.map(a => ({ id: a.id, data: a.data() }));
    }

    for (const d of docs) {
      const aSnap = await d.ref.collection('assessments').get();
      const used = new Set();
      const batch = db.batch();
      batch.update(d.ref, { templateId: tpl.id });
      // จับคู่รายการคะแนนของวิชากับของแม่แบบด้วยชื่อ+ประเภท (รายการที่จับคู่ไม่ได้ถือเป็นรายการเฉพาะเทอมนั้น ไม่ถูกลบตอนอัปเดตตามแม่แบบ)
      aSnap.docs.forEach(a => {
        const ad = a.data();
        const m = tplItems.find(t => !used.has(t.id) && t.data.name === ad.name && t.data.category === ad.category);
        if (m) { used.add(m.id); batch.update(a.ref, { templateItemId: m.id }); }
      });
      await batch.commit();
    }
  }
  invalidateCourseData();
  return created;
}

// เรียกซ้ำกี่ครั้งก็ทำงานจริงครั้งเดียวต่อการเปิดแอป (เก็บ promise ไว้)
function ensureTemplatesMigrated() {
  const uid = AppState.user.uid;
  const st = AppState.tplMigration;
  if (st && st.uid === uid) return st.promise;
  const promise = migrateCoursesToTemplates().then(n => {
    if (n > 0) showToast(`จัดวิชาเดิมเป็นแม่แบบโครงสร้างแล้ว ${n} วิชา`);
    return n;
  }).catch(err => {
    console.error('แปลงวิชาเดิมเป็นแม่แบบไม่สำเร็จ', err);
    if (AppState.tplMigration && AppState.tplMigration.promise === promise) AppState.tplMigration = null; // ให้ลองใหม่ได้รอบหน้า
    showToast('จัดวิชาเดิมเป็นแม่แบบไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง');
    return 0;
  });
  AppState.tplMigration = { uid, promise };
  return promise;
}

// อัปเดตโครงสร้างคะแนนของรายวิชาหนึ่งให้ตรงแม่แบบ: รายการเดิมคง id (คะแนนไม่หลุด) · รายการใหม่เพิ่ม · รายการที่ถูกลบจากแม่แบบจะถูกลบ
async function syncTemplateToCourse(tplRef, courseRef) {
  const [tA, tS, cA] = await Promise.all([
    tplRef.collection('assessments').orderBy('order', 'asc').get(),
    tplRef.collection('settings').doc('structure').get(),
    courseRef.collection('assessments').get(),
  ]);
  const byItem = new Map();
  cA.docs.forEach(d => { const k = d.data().templateItemId; if (k) byItem.set(k, d); });
  const batch = db.batch();
  const keep = new Set();
  tA.docs.forEach(t => {
    const ex = byItem.get(t.id);
    const ref = ex ? ex.ref : courseRef.collection('assessments').doc();
    batch.set(ref, { ...t.data(), templateItemId: t.id });
    keep.add(ref.id);
  });
  cA.docs.forEach(d => { if (d.data().templateItemId && !keep.has(d.id)) batch.delete(d.ref); });
  batch.set(courseRef.collection('settings').doc('structure'), tS.exists ? tS.data() : { groups: [] });
  await batch.commit();
}

// หลังบันทึกแม่แบบ: ถามทุกครั้งว่าจะอัปเดตรายวิชาที่เปิดไปแล้ว (ที่ใช้แม่แบบนี้) ด้วยไหม
async function offerTemplateSync(template) {
  let linked;
  try {
    const snap = await coursesCol().where('templateId', '==', template.id).get();
    linked = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn('อ่านรายวิชาที่ใช้แม่แบบไม่สำเร็จ', err); return; }
  if (!linked.length) return;
  linked.sort((a, b) => (b.year || '').localeCompare(a.year || '') || (b.semester || '').localeCompare(a.semester || ''));

  openModal(`
    <h2>อัปเดตรายวิชาที่เปิดไปแล้วด้วยไหม?</h2>
    <div class="modal-sub">บันทึกแม่แบบ "${escapeHtml(tplLabel(template))}" แล้ว — เลือกเทอมที่ต้องการให้ใช้โครงสร้างคะแนนใหม่ตามแม่แบบ<br>
      คะแนนที่กรอกไว้ในรายการเดิมจะคงอยู่ แต่รายการที่ถูกลบออกจากแม่แบบจะถูกลบจากรายวิชาพร้อมคะแนนของรายการนั้น</div>
    <div class="field">
      ${linked.map(c => `
        <label class="u-flex u-items-center u-gap-8 u-mb-10">
          <input type="checkbox" class="sync-pick" data-course-id="${c.id}" ${c.archived ? '' : 'checked'}>
          <span>ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')} • ${c.roomCount || 0} ห้อง${c.archived ? ' • อยู่ในคลัง' : ''}</span>
        </label>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="sync-skip">ไม่อัปเดต</button>
      <button class="btn btn-primary" id="sync-go">อัปเดตที่เลือก</button>
    </div>
  `);
  document.getElementById('sync-skip').addEventListener('click', closeModal);
  document.getElementById('sync-go').addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('.sync-pick:checked')].map(x => x.dataset.courseId);
    if (!ids.length) { closeModal(); return; }
    const btn = document.getElementById('sync-go');
    btn.disabled = true; btn.textContent = 'กำลังอัปเดต...';
    try {
      const tplRef = templatesCol().doc(template.id);
      for (const id of ids) await syncTemplateToCourse(tplRef, coursesCol().doc(id));
      ids.forEach(id => invalidateCourseData(id));
      invalidateCourseData();
      closeModal();
      showToast(`อัปเดตโครงสร้างตามแม่แบบแล้ว ${ids.length} รายวิชา`);
    } catch (err) {
      console.error(err);
      btn.disabled = false; btn.textContent = 'อัปเดตที่เลือก';
      showToast('อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  });
}

// สร้าง/แก้ไขแม่แบบวิชา (ข้อมูลพื้นฐานที่ไม่ผูกกับเทอม) — tpl = null คือสร้างใหม่ · onDone(templateId)
function openTemplateInfoModal(tpl, onDone) {
  const t = tpl || {};
  openModal(`
    <h2>${tpl ? 'แก้ไขข้อมูลวิชา' : 'สร้างวิชาใหม่ (แม่แบบโครงสร้าง)'}</h2>
    <div class="modal-sub">${tpl
      ? 'แก้รหัส/ชื่อ/ระดับชั้น/หน่วยกิต — รายวิชาที่เปิดสอนไปแล้วจากวิชานี้จะเปลี่ยนตามด้วย (ห้อง นักเรียน และคะแนนไม่เปลี่ยน)'
      : 'วิชานี้ไม่ผูกกับเทอม ใช้เก็บโครงสร้างคะแนน — ภาคเรียน ปีการศึกษา และห้อง เลือกตอนกดสร้างที่หน้า "รายวิชาของฉัน"'}</div>
    <div class="field-row">
      <div class="field"><label>รหัสวิชา</label><input id="f-code" placeholder="เช่น ว33101" value="${escapeHtml(t.code || '')}"></div>
      <div class="field"><label>ชื่อวิชา</label><input id="f-name" placeholder="เช่น วิทยาการคำนวณ" value="${escapeHtml(t.name || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ระดับชั้น</label><select id="f-level">${levelSelectOptionsHtml(t.level || '')}</select></div>
      <div class="field"><label>หน่วยกิต</label><input id="f-credit" placeholder="1.0" value="${escapeHtml(t.credit || '')}"></div>
    </div>
    <div class="field-hint u-hint-up-6">สีประจำวิชาจะถูกกำหนดอัตโนมัติตามระดับชั้นที่เลือก</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="tpl-cancel">ยกเลิก</button>
      <button class="btn btn-primary" id="tpl-submit">${tpl ? 'บันทึก' : 'สร้างวิชา'}</button>
    </div>
  `);
  document.getElementById('tpl-cancel').addEventListener('click', closeModal);
  document.getElementById('tpl-submit').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { showToast('กรุณากรอกชื่อวิชา'); return; }
    const info = {
      code: document.getElementById('f-code').value.trim(),
      name,
      level: document.getElementById('f-level').value.trim(),
      credit: document.getElementById('f-credit').value.trim(),
    };
    const btn = document.getElementById('tpl-submit');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
      let id;
      if (tpl) {
        id = tpl.id;
        const batch = db.batch();
        batch.update(templatesCol().doc(id), info);
        const linked = await coursesCol().where('templateId', '==', id).get();
        linked.docs.forEach(d => batch.update(d.ref, info));
        await batch.commit();
      } else {
        const ref = templatesCol().doc();
        const batch = db.batch();
        batch.set(ref, { ...info, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.set(ref.collection('settings').doc('grading'), { scale: DEFAULT_GRADE_SCALE });
        await batch.commit();
        id = ref.id;
      }
      invalidateCourseData();
      closeModal();
      showToast(tpl ? 'บันทึกข้อมูลวิชาแล้ว' : 'สร้างวิชาแล้ว — ตั้งโครงสร้างคะแนนได้เลย');
      if (onDone) onDone(id);
    } catch (err) {
      console.error(err);
      btn.disabled = false; btn.textContent = tpl ? 'บันทึก' : 'สร้างวิชา';
      showToast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  });
}

// ลบแม่แบบ: รายวิชาที่เปิดสอนไปแล้ว (ห้อง/นักเรียน/คะแนน) อยู่ครบ — แค่ไม่มีแม่แบบให้เลือกสร้างเทอมใหม่อีก
function confirmDeleteTemplate(tpl, usedCount, onDone) {
  openConfirmModal({
    title: `ลบวิชา "${escapeHtml(tpl.name)}" ออกจากโครงสร้างวิชา?`,
    body: usedCount > 0
      ? `จะลบเฉพาะแม่แบบโครงสร้างคะแนน — รายวิชาที่เปิดสอนไปแล้ว ${usedCount} เทอม (ห้อง นักเรียน คะแนน) ยังอยู่ครบในหน้า "รายวิชาของฉัน" แต่จะสร้างเทอมใหม่จากวิชานี้ไม่ได้อีก`
      : 'ลบแม่แบบโครงสร้างคะแนนของวิชานี้ และกู้คืนไม่ได้',
    confirmLabel: 'ลบวิชา',
    danger: true,
    onConfirm: async () => {
      const ref = templatesCol().doc(tpl.id);
      await deleteCollectionDocs(ref.collection('assessments'));
      await deleteCollectionDocs(ref.collection('settings'));
      await ref.delete();
      invalidateCourseData();
      showToast('ลบวิชาออกจากโครงสร้างแล้ว');
      if (onDone) onDone();
    },
  });
}

// สร้างรายวิชาของเทอมจากแม่แบบ: คัดลอกโครงสร้างคะแนน/หมวดหมู่/เกณฑ์เกรดมาเป็นของรายวิชานั้น (เขียนรอบเดียว ไม่ค้างครึ่งทาง)
async function createCourseFromTemplate(tpl, { semester, year, rooms }) {
  const tRef = templatesCol().doc(tpl.id);
  const [aSnap, structDoc, gradeDoc] = await Promise.all([
    tRef.collection('assessments').orderBy('order', 'asc').get(),
    tRef.collection('settings').doc('structure').get(),
    tRef.collection('settings').doc('grading').get(),
  ]);
  const courseRef = coursesCol().doc();
  const ts = firebase.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(courseRef, {
    code: tpl.code || '', name: tpl.name || '', level: tpl.level || '', credit: tpl.credit || '',
    semester, year, templateId: tpl.id,
    roomCount: rooms.length, archived: false, createdAt: ts,
  });
  aSnap.docs.forEach(a => batch.set(courseRef.collection('assessments').doc(), { ...a.data(), templateItemId: a.id }));
  if (structDoc.exists) batch.set(courseRef.collection('settings').doc('structure'), structDoc.data());
  batch.set(courseRef.collection('settings').doc('grading'), { scale: gradeDoc.exists ? gradeDoc.data().scale : DEFAULT_GRADE_SCALE });
  rooms.forEach((room, idx) => batch.set(courseRef.collection('sections').doc(), { room, order: idx, createdAt: ts }));
  await batch.commit();
  invalidateCourseData();
  return courseRef.id;
}

// หน้า "รายวิชาของฉัน" → + สร้างรายวิชา: 3 ขั้นตอนในหน้าต่างเดียว
//   1) ภาคเรียน/ปีการศึกษา  2) เลือกวิชาจากโครงสร้างวิชาที่สร้างไว้  3) เลือกห้อง
// preset = { templateId, roomCount } ใช้ตอน "คัดลอกไปเทอมใหม่" จากคลังรายวิชา (เลือกวิชาและจำนวนห้องไว้ให้ก่อน)
async function openCreateCourseModal(onCreated, preset = null) {
  const p = preset || {};
  await ensureTemplatesMigrated();
  const [templates, allCourses] = await Promise.all([loadTemplates(), loadAllCoursesForStructure()]);

  if (templates.length === 0) {
    openModal(`
      <h2>สร้างรายวิชา</h2>
      <div class="modal-sub">ยังไม่มีวิชาในหน้า "ตั้งค่าโครงสร้างวิชา" — สร้างวิชาและตั้งโครงสร้างคะแนนไว้ก่อน แล้วกลับมาเลือกเปิดสอนในเทอมที่ต้องการ</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cc-close">ปิด</button>
        <button class="btn btn-primary" id="cc-go-structure">ไปหน้าตั้งค่าโครงสร้างวิชา</button>
      </div>
    `);
    document.getElementById('cc-close').addEventListener('click', closeModal);
    document.getElementById('cc-go-structure').addEventListener('click', () => { closeModal(); navigate('structure-page'); });
    return;
  }

  // ค่าเริ่มต้นของเทอม: ตามวิชาล่าสุดที่เคยสร้าง · ถ้ายังไม่มี ใช้ปฏิทินไทย (พ.ค.–ต.ค. = ภาค 1)
  const latest = allCourses.slice().sort((a, b) => tplMillis(b.createdAt) - tplMillis(a.createdAt))[0];
  const now = new Date();
  const defSemester = latest?.semester || (now.getMonth() >= 4 && now.getMonth() <= 9 ? '1' : '2');
  const defYear = latest?.year || String(now.getFullYear() + 543);
  const semOptions = ['1', '2', 'ฤดูร้อน'];

  const optionsHtml = (taken) => {
    const optLabel = (t) => escapeHtml(tplLabel(t)) + (taken.has(t.id) ? ' (เปิดแล้วในเทอมนี้)' : '');
    const opt = (t) => `<option value="${t.id}" ${taken.has(t.id) ? 'disabled' : ''} ${t.id === p.templateId && !taken.has(t.id) ? 'selected' : ''}>${optLabel(t)}</option>`;
    const levelGroups = LEVEL_OPTIONS.map(l => ({ l, items: templates.filter(t => t.level === l) })).filter(g => g.items.length);
    const noLevel = templates.filter(t => !LEVEL_OPTIONS.includes(t.level));
    return `<option value="">— เลือกวิชา —</option>` +
      levelGroups.map(g => `<optgroup label="${g.l}">${g.items.map(opt).join('')}</optgroup>`).join('') +
      (noLevel.length ? `<optgroup label="ไม่ระบุระดับชั้น">${noLevel.map(opt).join('')}</optgroup>` : '');
  };

  openModal(`
    <h2>สร้างรายวิชา</h2>
    <div class="modal-sub" id="cc-sub"></div>

    <div id="cc-step-1">
      <div class="field-row">
        <div class="field"><label>ภาคเรียน</label>
          <select id="f-semester">${semOptions.map(s => `<option value="${s}" ${s === defSemester ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>ปีการศึกษา</label><input id="f-year" type="number" inputmode="numeric" placeholder="2569" value="${escapeHtml(defYear)}"></div>
      </div>
    </div>

    <div id="cc-step-2" class="hidden">
      <div class="field"><label>วิชา (จากหน้าตั้งค่าโครงสร้างวิชา)</label><select id="f-template"></select></div>
      <div class="field-hint" id="cc-tpl-info"></div>
    </div>

    <div id="cc-step-3" class="hidden">
      <div class="field">
        <label>ห้องที่สอน (เลือกได้ 1-13)</label>
        <div class="room-mode-toggle">
          <button type="button" class="room-mode-btn active" data-mode="count">ระบุจำนวนห้อง</button>
          <button type="button" class="room-mode-btn" data-mode="list">เลือกเลขห้องเอง</button>
        </div>
        <div id="room-mode-count">
          <input id="f-room-count" type="number" min="1" max="13" value="${Math.min(p.roomCount || 1, 13)}" placeholder="เช่น 5">
          <div class="field-hint">ระบบจะสร้างห้อง 1, 2, 3 ... ให้อัตโนมัติตามจำนวนที่ใส่ (สูงสุด 13 ห้อง)</div>
        </div>
        <div id="room-mode-list" class="hidden">
          <div class="room-number-grid" id="f-room-pick-grid">
            ${ROOM_OPTIONS.map(n => `<button type="button" class="room-pick-btn" data-room="${n}">${n}</button>`).join('')}
          </div>
          <div class="field-hint">แตะเลขห้องที่ต้องการสอน เลือกได้หลายห้อง</div>
        </div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" id="cc-back">ยกเลิก</button>
      <button class="btn btn-primary" id="cc-next">ถัดไป</button>
    </div>
  `);

  const $ = (id) => document.getElementById(id);
  const SUBS = [
    'ขั้นที่ 1/3 — เลือกภาคเรียนและปีการศึกษาที่จะเปิดสอน',
    'ขั้นที่ 2/3 — เลือกวิชาจากโครงสร้างวิชาที่สร้างไว้ (ใช้โครงสร้างคะแนนของวิชานั้น)',
    'ขั้นที่ 3/3 — เลือกห้องที่สอนในเทอมนี้',
  ];
  let step = 1;
  let roomMode = 'count';
  const selectedRooms = new Set();
  let term = { semester: defSemester, year: defYear };

  const takenFor = (semester, year) => new Set(allCourses
    .filter(c => c.templateId && String(c.semester) === semester && String(c.year) === year)
    .map(c => c.templateId));
  const selectedTemplate = () => templates.find(t => t.id === $('f-template').value) || null;

  function show(n) {
    step = n;
    [1, 2, 3].forEach(i => $('cc-step-' + i).classList.toggle('hidden', i !== n));
    $('cc-sub').textContent = SUBS[n - 1];
    $('cc-back').textContent = n === 1 ? 'ยกเลิก' : 'ย้อนกลับ';
    $('cc-next').textContent = n === 3 ? 'สร้างรายวิชา' : 'ถัดไป';
  }
  function updateTplInfo() {
    const t = selectedTemplate();
    $('cc-tpl-info').textContent = t
      ? `${t.level || 'ไม่ระบุระดับชั้น'}${t.credit ? ' • ' + t.credit + ' หน่วยกิต' : ''} • เปิดสำหรับภาคเรียน ${term.semester}/${term.year}`
      : '';
  }
  show(1);

  $('f-template').addEventListener('change', updateTplInfo);
  $('cc-back').addEventListener('click', () => { if (step === 1) closeModal(); else show(step - 1); });

  const modeCountBtn = document.querySelector('.room-mode-btn[data-mode="count"]');
  const modeListBtn = document.querySelector('.room-mode-btn[data-mode="list"]');
  const setMode = (m) => {
    roomMode = m;
    modeCountBtn.classList.toggle('active', m === 'count');
    modeListBtn.classList.toggle('active', m === 'list');
    $('room-mode-count').classList.toggle('hidden', m !== 'count');
    $('room-mode-list').classList.toggle('hidden', m !== 'list');
  };
  modeCountBtn.addEventListener('click', () => setMode('count'));
  modeListBtn.addEventListener('click', () => setMode('list'));
  document.querySelectorAll('#f-room-pick-grid .room-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedRooms.has(btn.dataset.room)) { selectedRooms.delete(btn.dataset.room); btn.classList.remove('active'); }
      else { selectedRooms.add(btn.dataset.room); btn.classList.add('active'); }
    });
  });

  $('cc-next').addEventListener('click', async () => {
    if (step === 1) {
      const semester = $('f-semester').value;
      const year = $('f-year').value.trim();
      if (!/^\d{4}$/.test(year)) { showToast('กรุณากรอกปีการศึกษาเป็นเลข 4 หลัก เช่น 2569'); return; }
      term = { semester, year };
      $('f-template').innerHTML = optionsHtml(takenFor(semester, year));
      updateTplInfo();
      show(2);
      return;
    }
    if (step === 2) {
      if (!selectedTemplate()) { showToast('กรุณาเลือกวิชา'); return; }
      show(3);
      return;
    }

    const tpl = selectedTemplate();
    let rooms = [];
    if (roomMode === 'count') {
      const n = Math.min(13, Math.max(1, Number($('f-room-count').value) || 1));
      rooms = Array.from({ length: n }, (_, i) => String(i + 1));
    } else {
      rooms = ROOM_OPTIONS.filter(n => selectedRooms.has(n));
      if (rooms.length === 0) { showToast('กรุณาเลือกเลขห้องอย่างน้อย 1 ห้อง'); return; }
    }
    const btn = $('cc-next');
    btn.disabled = true;
    btn.textContent = 'กำลังสร้าง...';
    try {
      const courseId = await createCourseFromTemplate(tpl, { semester: term.semester, year: term.year, rooms });
      closeModal();
      showToast(`สร้างรายวิชาสำเร็จ (${rooms.length} ห้อง)`);
      if (onCreated) onCreated(courseId); else openCourse(courseId);
    } catch (err) {
      console.error(err);
      invalidateCourseData();
      btn.disabled = false;
      btn.textContent = 'สร้างรายวิชา';
      showToast('สร้างรายวิชาไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  });
}

// แก้ไขข้อมูลพื้นฐานของรายวิชาที่สร้างไว้แล้ว (รหัส/ชื่อ/ระดับชั้น/ภาคเรียน/ปีการศึกษา/หน่วยกิต)
// ไม่แตะห้อง นักเรียน หรือคะแนน — อัปเดตเฉพาะเอกสารรายวิชา แล้วเรียก onDone ให้หน้าเดิมวาดใหม่
function openEditCourseInfoModal(course, onDone) {
  openModal(`
    <h2>แก้ไขข้อมูลรายวิชา</h2>
    <div class="modal-sub">แก้ได้เฉพาะข้อมูลพื้นฐานของวิชา — ห้อง นักเรียน และคะแนนที่บันทึกไว้จะไม่เปลี่ยน</div>
    <div class="field-row">
      <div class="field"><label>รหัสวิชา</label><input id="f-code" placeholder="เช่น ว33101" value="${escapeHtml(course.code || '')}"></div>
      <div class="field"><label>ชื่อวิชา</label><input id="f-name" placeholder="เช่น วิทยาการคำนวณ" value="${escapeHtml(course.name || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ระดับชั้น</label>
        <select id="f-level">${levelSelectOptionsHtml(course.level || '')}</select>
      </div>
      <div class="field"><label>ภาคเรียน</label><input id="f-semester" placeholder="1" value="${escapeHtml(course.semester || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ปีการศึกษา</label><input id="f-year" placeholder="2569" value="${escapeHtml(course.year || '')}"></div>
      <div class="field"><label>หน่วยกิต</label><input id="f-credit" placeholder="1.0" value="${escapeHtml(course.credit || '')}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-edit-course">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-edit-course">บันทึก</button>
    </div>
  `);

  document.getElementById('cancel-edit-course').addEventListener('click', closeModal);
  document.getElementById('submit-edit-course').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { showToast('กรุณากรอกชื่อวิชา'); return; }

    const submitBtn = document.getElementById('submit-edit-course');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    const patch = {
      code: document.getElementById('f-code').value.trim(),
      name,
      level: document.getElementById('f-level').value.trim(),
      semester: document.getElementById('f-semester').value.trim(),
      year: document.getElementById('f-year').value.trim(),
      credit: document.getElementById('f-credit').value.trim(),
    };
    try {
      await db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id).update(patch);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'บันทึก';
      showToast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      return;
    }
    invalidateCourseData();
    closeModal();
    showToast('บันทึกข้อมูลวิชาแล้ว');
    if (onDone) onDone();
  });
}

// จัดกลุ่มรายวิชาตามระดับชั้นแบบเดียวกับหน้า "ตั้งค่าโครงสร้างวิชา" (สีอ่อนประจำระดับชั้น
// ช่วยแยกสายตาเมื่อมีหลายวิชา) แต่ในหน้านี้แต่ละแถวกดแล้วเปิดเข้ารายวิชาได้เลย ไม่มีปุ่มแก้ไข/ลบ
function courseListGroupsHtml(courses) {
  return groupsByLevelHtml(courses, {
    levelOf: c => c.level,
    listClass: 'course-list',
    rowFn: c => courseRowHtml(c),
  });
}

function courseRowHtml(c) {
  const col = getLevelColor(c.level);
  return `
    <div class="course-row" data-course-id="${c.id}" style="--w:${courseColor(c) || col.strong};">
      <div class="course-chip">${icon('book')}</div>
      <div class="info">
        <div class="name">${escapeHtml(c.code ? c.code + ' - ' : '')}${escapeHtml(c.name)}</div>
        <div class="meta">${c.roomCount || 0} ห้อง • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
      </div>
      <button class="btn btn-ghost btn-sm">เปิดรายวิชา</button>
    </div>
  `;
}

// หน้า "รายวิชาของฉัน": วาดจากแคชกลาง (cc.list ใน dashboard.js) ทันทีถ้ามี แล้วถามเซิร์ฟเวอร์เงียบๆ — ต่างจากที่วาดไว้ค่อยวาดทับ (คงตำแหน่งเลื่อน)
async function renderCoursesList() {
  const view = document.getElementById('view');
  const uid = AppState.user.uid;
  const cc = getCourseDataCache();
  const startVersion = cc.version;
  const toCourses = docs => docs.map(d => ({ id: d.id, ...d.data }));
  const pageHtml = courses => `
    <div class="page-header u-flex u-items-start u-between u-wrap u-gap-10">
      <h1>รายวิชาของฉัน</h1>
      <button class="btn btn-primary btn-sm" id="courses-new-btn">+ สร้างรายวิชา</button>
    </div>
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('book')}</div>
        <div>ยังไม่มีรายวิชา กด "+ สร้างรายวิชา" เพื่อเลือกวิชาจากโครงสร้างวิชาที่สร้างไว้ พร้อมเลือกห้อง ภาคเรียน และปีการศึกษา<br>(ถ้ายังไม่มีวิชา ไปสร้างที่หน้า "ตั้งค่าโครงสร้างวิชา" ก่อน)</div>
      </div></div>
    ` : courseListGroupsHtml(courses)}
  `;
  const draw = html => {
    view.innerHTML = html;
    document.getElementById('courses-new-btn').addEventListener('click', () => openCreateCourseModal());
    view.querySelectorAll('.course-row').forEach(row => {
      row.addEventListener('click', () => openCourse(row.dataset.courseId));
    });
  };
  // อ่านรายการวิชาที่เปิดใช้งาน (รูปแบบเดียวกับ cc.list) และอัปเดตแคชกลางถ้าไม่มีการเขียนข้อมูลระหว่างทาง
  const fetchFresh = async () => {
    const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
    const docs = snap.docs.filter(d => !d.data().archived).map(d => ({ id: d.id, data: d.data() }));
    if (cc.version === startVersion) { cc.list = docs; cc.listAt = Date.now(); }
    return docs;
  };

  if (cc.list) {
    const shown = pageHtml(toCourses(cc.list));
    draw(shown);
    fetchFresh().then(docs => {
      if (AppState.currentRoute !== 'courses' || !view.isConnected || AppState.user?.uid !== uid) return; // ผู้ใช้ไปหน้าอื่นแล้ว
      const fresh = pageHtml(toCourses(docs));
      if (fresh === shown) return;
      const y = window.scrollY;
      draw(fresh);
      window.scrollTo(0, y);
    }).catch(err => console.warn('รีเฟรชรายการวิชาเงียบๆ ไม่สำเร็จ (ใช้ของเดิมต่อ):', err));
    return;
  }

  showLoading('list');
  draw(pageHtml(toCourses(await fetchFresh())));
}

// restore = { sectionId, tab } เมื่อมาจากการย้อนกลับ (NavHistory) — กลับไปเห็นแท็บ/ห้องเดิม
function openCourse(courseId, restore) {
  AppState.currentRoute = 'course';
  AppState.currentCourseId = courseId;
  AppState.currentSectionId = restore?.sectionId || null;
  AppState.currentTab = restore?.tab || 'overview';
  NavHistory.record({ kind: 'course', courseId });
  setActiveNav(null);
  markViewPending();
  renderCourseShell();
}

async function loadSections(uid, courseId) {
  const snap = await db.collection('users').doc(uid).collection('courses').doc(courseId)
    .collection('sections').orderBy('order', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// หัวหน้าวิชา (เอกสารวิชา + รายชื่อห้อง) แคชไว้ใน cc.shell — เข้าซ้ำ/สลับแท็บ-ห้อง/ย้อนกลับ วาดทันทีโดยไม่รอ Firestore สองรอบ
//   ถ้าแคชเก่ากว่า COURSE_SHELL_RECHECK_MS จะถามเซิร์ฟเวอร์เงียบๆ ตามหลัง · ถ้าข้อมูลเปลี่ยนจริงจึงวาดทับ (ไม่วาดทับขณะผู้ใช้กำลังพิมพ์/เปิดป๊อปอัป)
const COURSE_SHELL_RECHECK_MS = 15 * 1000;
const shellSig = x => JSON.stringify([x.course, x.sections]);

function revalidateCourseShell(cc, uid, courseId, hit) {
  if (hit.checking || Date.now() - hit.at < COURSE_SHELL_RECHECK_MS) return;
  hit.checking = true;
  const v = cc.version;
  (async () => {
    const doc = await db.collection('users').doc(uid).collection('courses').doc(courseId).get();
    const fresh = doc.exists ? { course: { id: doc.id, ...doc.data() }, sections: await loadSections(uid, courseId) } : null;
    if (cc.version !== v) return; // มีการเขียนข้อมูลระหว่างทาง → แคชถูกล้าง/โหลดใหม่เองอยู่แล้ว
    if (fresh) cc.shell.set(courseId, { ...fresh, at: Date.now() }); else cc.shell.delete(courseId);
    if (fresh && shellSig(fresh) === shellSig(hit)) return;
    const a = document.activeElement;
    const typing = !!a && a !== document.body && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    const modalOpen = !!document.getElementById('modal-root')?.firstChild;
    if (AppState.currentRoute !== 'course' || AppState.currentCourseId !== courseId || typing || modalOpen) return; // แคชใหม่แล้ว รอบหน้าจะได้ของใหม่
    const y = window.scrollY;
    await renderCourseShell();
    window.scrollTo(0, y);
  })().catch(err => console.warn('รีเฟรชหัววิชาเงียบๆ ไม่สำเร็จ (ใช้ของเดิมต่อ):', err))
    .finally(() => { hit.checking = false; });
}

async function renderCourseShell() {
  try { await renderCourseShellInner(); }
  finally { NavHistory.applyScroll(); } // วาดเสร็จทั้งหัวและเนื้อแท็บแล้วค่อยเลื่อนกลับตำแหน่งเดิม (ไม่มีงานค้าง เช่นสลับแท็บ = ไม่ทำอะไร)
}

async function renderCourseShellInner() {
  const uid = AppState.user.uid;
  const courseId = AppState.currentCourseId;
  const cc = getCourseDataCache();
  let course, sections;
  const hit = cc.shell.get(courseId);
  if (hit) {
    // สำเนาตื้น — โค้ดแท็บต่างๆ แก้ AppState.currentCourse/sections ได้โดยไม่กระทบแคช
    course = { ...hit.course };
    sections = hit.sections.map(s => ({ ...s }));
    revalidateCourseShell(cc, uid, courseId, hit);
  } else {
    const v = cc.version;
    const courseDoc = await db.collection('users').doc(uid).collection('courses').doc(courseId).get();
    if (!courseDoc.exists) { navigate('courses'); return; }
    course = { id: courseDoc.id, ...courseDoc.data() };
    sections = await loadSections(uid, courseId);
    if (cc.version === v) cc.shell.set(courseId, { course: { ...course }, sections: sections.map(s => ({ ...s })), at: Date.now() });
  }
  AppState.currentCourse = course;
  AppState.sections = sections;
  if (!AppState.currentSectionId || !sections.some(s => s.id === AppState.currentSectionId)) {
    AppState.currentSectionId = sections[0]?.id || null;
  }
  const section = sections.find(s => s.id === AppState.currentSectionId) || null;

  const tabs = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'students', label: 'นักเรียน' },
    { id: 'structure', label: 'โครงสร้างคะแนน' },
    { id: 'scores', label: 'บันทึกคะแนน' },
    { id: 'report', label: 'รายงาน' },
  ];
  // แท็บที่ต้องผูกกับ "ห้อง" ที่เลือกอยู่ (นักเรียน/คะแนน/รายงานแยกตามห้อง)
  const sectionScopedTabs = new Set(['students', 'scores', 'report']);

  const view = document.getElementById('view');
  view.innerHTML = `
    ${courseHeaderHtml({
      crumbId: 'back-to-courses', crumbLabel: 'รายวิชาของฉัน', crumbCurrent: course.name,
      title: (course.code ? course.code + ' • ' : '') + course.name,
      badge: course.archived ? '<span class="badge badge-neutral u-badge-inline">อยู่ในคลัง</span>' : '',
      sub: `${course.level || ''} • ภาคเรียน ${course.semester || '-'}/${course.year || '-'} • ${sections.length} ห้อง`,
      actions: '<button class="btn btn-ghost btn-sm" id="edit-course-info-btn">แก้ไขข้อมูลวิชา</button> ' + (course.archived
        ? '<button class="btn btn-ghost btn-sm" id="unarchive-course-btn">นำกลับมาใช้งาน</button>'
        : '<button class="btn btn-ghost btn-sm" id="archive-course-btn">จบเทอมนี้แล้ว เก็บเข้าคลัง</button>'),
    })}

    ${sections.length > 0 ? `
      <div class="room-pills" id="room-pills">
        ${sections.map(s => `
          <button class="room-pill ${s.id === AppState.currentSectionId ? 'active' : ''} u-pad-7-14" data-section-id="${s.id}">ห้อง ${escapeHtml(s.room)}</button>
        `).join('')}
      </div>
    ` : `
      <div class="card card-pad u-mb-16">
        <div class="empty-state u-p-0 u-text-left">ยังไม่มีห้องเรียนในวิชานี้ — เพิ่มห้องได้ที่แท็บ "ภาพรวม"</div>
      </div>
    `}

    <div class="tabs">
      ${tabs.map(t => `<div class="tab ${AppState.currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
    </div>
    <div id="course-tab-body"></div>
  `;
  NavHistory.patch({ courseId, sectionId: AppState.currentSectionId, tab: AppState.currentTab }); // จำแท็บ/ห้องไว้ใน entry ของประวัติ
  if (AppState.enterNext) { AppState.enterNext = false; playViewEnter(); } // มาจากการเปิดรายวิชา (ไม่ใช่สลับแท็บ/ห้อง) → เฟดเข้า

  document.getElementById('back-to-courses').addEventListener('click', (e) => { e.preventDefault(); if (!NavHistory.backTo('courses')) navigate('courses'); });
  document.getElementById('edit-course-info-btn').addEventListener('click', () => {
    openEditCourseInfoModal(course, () => renderCourseShell());
  });
  document.getElementById('archive-course-btn')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'เก็บวิชานี้เข้าคลัง?',
      body: `"${escapeHtml(course.name)}" ทุกห้อง นักเรียน และคะแนน จะยังอยู่ครบเหมือนเดิม แค่จะไม่แสดงในหน้าแรก/รายวิชาของฉันอีกต่อไป — ดูย้อนหลังหรือกู้กลับมาได้ทุกเมื่อที่หน้า "คลังรายวิชา"`,
      confirmLabel: 'เก็บเข้าคลัง',
      onConfirm: async () => {
        await db.collection('users').doc(uid).collection('courses').doc(courseId).update({ archived: true, archivedAt: firebase.firestore.FieldValue.serverTimestamp() });
        invalidateCourseData();
        showToast('เก็บวิชาเข้าคลังแล้ว');
        navigate('courses');
      }
    });
  });
  document.getElementById('unarchive-course-btn')?.addEventListener('click', async () => {
    await db.collection('users').doc(uid).collection('courses').doc(courseId).update({ archived: false });
    invalidateCourseData();
    showToast('นำวิชากลับมาใช้งานแล้ว');
    renderCourseShell();
  });
  view.querySelectorAll('.room-pill[data-section-id]').forEach(p => {
    p.addEventListener('click', () => {
      AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์แล้วรีบสลับห้อง
      AppState.currentSectionId = p.dataset.sectionId;
      switchInPlace(p);
      pillSlideNext('course-rooms');
      renderCourseShell();
    });
  });
  // กดแท็บ/ห้อง: ขยับแถบทันที + หรี่เนื้อหาเดิม — renderCourseShell ต้องรอ Firestore สองรอบก่อนวาดใหม่ ถ้าไม่ตอบสนองก่อนจะรู้สึกค้าง
  const switchInPlace = (el) => {
    el.parentElement.querySelectorAll(':scope > .active').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    el.parentElement.__pillPlace?.(true);
    const b = document.getElementById('course-tab-body');
    if (b) { b.classList.add('is-switching'); setTimeout(() => b.classList.remove('is-switching'), 8000); }
    AppState.tabSwitch = true;
  };
  initNavPill(view.querySelector('#room-pills'), '.room-pill', 'seg-pill', { key: 'course-rooms' });
  initNavPill(view.querySelector('.tabs'), '.tab', 'seg-pill', { key: 'course-tabs' });
  view.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      AppState.flushScoreSaves?.(); // กันคะแนนหายถ้าเพิ่งพิมพ์แล้วรีบสลับแท็บ
      AppState.currentTab = t.dataset.tab;
      switchInPlace(t);
      pillSlideNext('course-tabs');
      renderCourseShell();
    });
  });

  const body = document.getElementById('course-tab-body');
  if (sectionScopedTabs.has(AppState.currentTab) && !section) {
    body.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">${icon('book')}</div>กรุณาเพิ่มห้องเรียนก่อน เพื่อเริ่มเพิ่มนักเรียนและบันทึกคะแนน</div></div>`;
    return;
  }

  const switching = AppState.tabSwitch; AppState.tabSwitch = false;
  const enterBody = () => { // สลับแท็บ/ห้อง: เนื้อหาจริงจางเข้าเมื่อวาดเสร็จ (ไม่เล่นตอนวาดซ้ำจากเหตุอื่น)
    if (!switching || !body.isConnected) return;
    body.classList.remove('tab-swap'); void body.offsetWidth; body.classList.add('tab-swap');
  };
  if (AppState.currentTab === 'overview') { await renderCourseOverview(body, course, sections); enterBody(); }
  else if (AppState.currentTab === 'students') { await renderStudentsTab(body, course, section); enterBody(); }
  else if (AppState.currentTab === 'structure') { await renderStructureTab(body, course); enterBody(); }
  else if (AppState.currentTab === 'scores') { await renderScoresTab(body, course, section); enterBody(); }
  else if (AppState.currentTab === 'report') {
    // report.js โหลดครั้งแรกที่เปิดแท็บนี้ — ถ้าผู้ใช้สลับแท็บ/ออกจากหน้าก่อนโหลดเสร็จ ไม่ต้องวาดทับ
    showLoading('cat-sm', body);
    try { await loadModule('report'); } catch (err) { body.innerHTML = `<div class="card"><div class="empty-state">${escapeHtml(err.message)}</div></div>`; return; }
    if (AppState.currentTab === 'report' && body.isConnected) { await renderReportTab(body, course, section); enterBody(); }
  }
}

async function renderArchivePage() {
  const view = document.getElementById('view');
  showLoading('list');
  const uid = AppState.user.uid;
  const snap = await db.collection('users').doc(uid).collection('courses').orderBy('createdAt', 'desc').get();
  const courses = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.archived);

  view.innerHTML = `
    ${pageHeaderHtml('คลังรายวิชา')}
    ${courses.length === 0 ? `
      <div class="card"><div class="empty-state">
        <div class="icon">${icon('archive')}</div>
        <div>ยังไม่มีวิชาในคลัง — จบเทอมแล้วกดปุ่ม "จบเทอมนี้แล้ว เก็บเข้าคลัง" ที่หน้ารายวิชานั้นได้เลย</div>
      </div></div>
    ` : `
      <div class="course-list">
        ${courses.map(c => `
          <div class="course-row u-cursor-default" data-course-id="${c.id}">
            <div class="course-dot" style="--c:${courseColor(c) || 'var(--primary)'}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">${escapeHtml(c.code || '')} • ${escapeHtml(c.level || '')} • ${c.roomCount || 0} ห้อง • ภาคเรียน ${escapeHtml(c.semester || '-')}/${escapeHtml(c.year || '-')}</div>
            </div>
            <button class="btn btn-ghost btn-sm view-archived-btn" data-course-id="${c.id}">ดูรายละเอียด</button>
            <button class="btn btn-primary btn-sm duplicate-course-btn" data-course-id="${c.id}">คัดลอกไปเทอมใหม่</button>
          </div>
        `).join('')}
      </div>
    `}
  `;

  view.querySelectorAll('.view-archived-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openCourse(btn.dataset.courseId); });
  });
  view.querySelectorAll('.duplicate-course-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const source = courses.find(c => c.id === btn.dataset.courseId);
      openCreateCourseModal(null, { templateId: source.templateId, roomCount: source.roomCount });
    });
  });
}

function openAddRoomModal(course, onDone) {
  const usedRooms = new Set((AppState.sections || []).map(s => String(s.room)));
  const availableRooms = ROOM_OPTIONS.filter(n => !usedRooms.has(n));

  if (availableRooms.length === 0) {
    openModal(`
      <h2>เพิ่มห้องเรียน</h2>
      <div class="modal-sub">วิชา ${escapeHtml(course.name)} ใช้ห้อง 1-13 ครบทุกห้องแล้ว</div>
      <div class="modal-actions"><button class="btn btn-primary" id="cancel-add-room">ปิด</button></div>
    `);
    document.getElementById('cancel-add-room').addEventListener('click', closeModal);
    return;
  }

  openModal(`
    <h2>เพิ่มห้องเรียน</h2>
    <div class="modal-sub">เพิ่มห้องใหม่ให้วิชา ${escapeHtml(course.name)} — ใช้โครงสร้างคะแนนเดียวกับห้องอื่น</div>
    <div class="field"><label>เลขห้อง</label>
      <select id="new-room-input">
        ${availableRooms.map(n => `<option value="${n}">ห้อง ${n}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-add-room">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-add-room">เพิ่มห้อง</button>
    </div>
  `);
  document.getElementById('cancel-add-room').addEventListener('click', closeModal);
  document.getElementById('submit-add-room').addEventListener('click', async () => {
    const room = document.getElementById('new-room-input').value.trim();
    if (!room) { showToast('กรุณาเลือกเลขห้อง'); return; }
    const uid = AppState.user.uid;
    const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
    await courseRef.collection('sections').add({
      room, order: AppState.sections.length, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(1) });
    invalidateCourseData(course.id);
    closeModal();
    showToast('เพิ่มห้องสำเร็จ');
    if (onDone) onDone();
    else renderCourseShell();
  });
}

function confirmDeleteSection(course, sectionId, roomLabel, onDone) {
  const isLast = AppState.sections.length <= 1;
  openConfirmModal({
    title: `ลบห้อง ${escapeHtml(roomLabel)}?`,
    body: isLast
      ? `ห้อง ${escapeHtml(roomLabel)} เป็นห้องเดียวที่เหลืออยู่ในวิชานี้ นักเรียนและคะแนนในห้องนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`
      : `นักเรียนและคะแนนทั้งหมดในห้องนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`,
    confirmLabel: 'ลบห้อง',
    danger: true,
    onConfirm: async () => {
      const uid = AppState.user.uid;
      const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
      const secRef = courseRef.collection('sections').doc(sectionId);

      showToast('กำลังลบห้อง...');
      let backup = null;
      try { backup = await snapshotSection(secRef); } catch (e) { console.warn('สำรองห้องก่อนลบไม่สำเร็จ', e); }
      await deleteCollectionDocs(secRef.collection('scores'));
      await deleteCollectionDocs(secRef.collection('students'));
      await secRef.delete();
      await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(-1) });
      invalidateCourseData(course.id);

      if (AppState.currentSectionId === sectionId) AppState.currentSectionId = null;
      const refresh = () => { if (onDone) onDone(); else renderCourseShell(); };
      refresh();
      if (backup && backup.data) {
        const where = [AppState.currentRoute, AppState.currentCourseId];
        islandUndo(`ลบห้อง ${roomLabel} แล้ว`, async () => {
          await restoreSection(courseRef.collection('sections'), backup);
          await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(1) });
          invalidateCourseData(course.id);
          // วาดหน้าใหม่เฉพาะเมื่อผู้ใช้ยังอยู่หน้าเดิม ไม่ดึงออกจากหน้าที่กำลังใช้อยู่
          if (AppState.currentRoute === where[0] && AppState.currentCourseId === where[1]) refresh();
        });
      } else {
        showToast('ลบห้องสำเร็จ');
      }
    }
  });
}

// ลบรายวิชาเป็นการกระทำที่ย้อนกลับไม่ได้และกระทบข้อมูลเยอะที่สุดในแอป จึงให้พิมพ์ชื่อวิชา
// ยืนยันในกล่องเดียว (แทนการเด้ง native confirm()/prompt() 2 ครั้ง ซึ่งเบราว์เซอร์อาจบล็อกเงียบๆ
// ถ้าผู้ใช้เคยกด "ป้องกันไม่ให้หน้านี้สร้างกล่องโต้ตอบเพิ่มเติม" มาก่อน)
function confirmDeleteCourse(course, onDone) {
  openModal(`
    <h2>ลบรายวิชา "${escapeHtml(course.name)}"?</h2>
    <div class="modal-sub">การลบจะรวมทุกห้อง นักเรียน คะแนน และโครงสร้างคะแนนของวิชานี้ทั้งหมด และกู้คืนไม่ได้<br><br>
      พิมพ์ชื่อวิชา <b>${escapeHtml(course.name)}</b> ให้ตรงกันเพื่อยืนยัน</div>
    <div class="field"><input id="del-course-confirm-input" placeholder="${escapeHtml(course.name)}" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="del-course-cancel-btn">ยกเลิก</button>
      <button class="btn btn-danger" id="del-course-confirm-btn" disabled>ลบรายวิชา</button>
    </div>
  `);

  const input = document.getElementById('del-course-confirm-input');
  const confirmBtn = document.getElementById('del-course-confirm-btn');
  input.focus();
  input.addEventListener('input', () => { confirmBtn.disabled = input.value !== course.name; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click(); });
  document.getElementById('del-course-cancel-btn').addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    if (input.value !== course.name) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'กำลังลบ...';
    try {
      const uid = AppState.user.uid;
      const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);

      showToast('กำลังลบรายวิชา...');
      let backup = null;
      try { backup = await snapshotCourse(courseRef); } catch (e) { console.warn('สำรองวิชาก่อนลบไม่สำเร็จ', e); }
      const sectionsSnap = await courseRef.collection('sections').get();
      for (const secDoc of sectionsSnap.docs) {
        const secRef = secDoc.ref;
        await deleteCollectionDocs(secRef.collection('scores'));
        await deleteCollectionDocs(secRef.collection('students'));
        await secRef.delete();
      }
      await deleteCollectionDocs(courseRef.collection('assessments'));
      await deleteCollectionDocs(courseRef.collection('settings'));
      await courseRef.delete();
      invalidateCourseData();

      closeModal();
      const refresh = () => { if (onDone) onDone(); else navigate('courses'); };
      refresh();
      if (backup && backup.data) {
        const where = [AppState.currentRoute, AppState.currentCourseId];
        islandUndo('ลบรายวิชาแล้ว', async () => {
          await restoreCourse(courseRef, backup);
          invalidateCourseData();
          if (AppState.currentRoute === where[0] && AppState.currentCourseId === where[1]) refresh();
        });
      } else {
        showToast('ลบรายวิชาสำเร็จ');
      }
    } catch (err) {
      invalidateCourseData(); // อาจลบไปแล้วบางส่วน
      console.error(err);
      showToast('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'ลบรายวิชา';
    }
  });
}

async function renderCourseOverview(container, course, sections) {
  showLoading('cat-sm', container);
  const uid = AppState.user.uid;
  const base = db.collection('users').doc(uid).collection('courses').doc(course.id);

  const [assessSnap, perSection] = await Promise.all([
    base.collection('assessments').get(),
    Promise.all(sections.map(async (s) => {
      const secBase = base.collection('sections').doc(s.id);
      const [studentsSnap, scoresSnap] = await Promise.all([
        secBase.collection('students').get(),
        secBase.collection('scores').get(),
      ]);
      return { studentsSnap, scoresSnap, s };
    })),
  ]);

  const assessmentIds = assessSnap.docs.map(d => d.id);
  const perSectionWithProgress = perSection.map(({ studentsSnap, scoresSnap, s }) => ({
    ...s,
    studentCount: studentsSnap.size,
    progress: calcSectionProgress(studentsSnap, scoresSnap, assessmentIds),
  }));

  const totalStudents = perSectionWithProgress.reduce((s, x) => s + x.studentCount, 0);
  const avgProgress = perSectionWithProgress.length ? Math.round(perSectionWithProgress.reduce((s, x) => s + x.progress, 0) / perSectionWithProgress.length) : 0;

  container.innerHTML = `
    <div class="card card-pad u-mb-16">
      <div class="u-flex u-items-center u-between u-mb-10 u-wrap u-gap-8">
        <div class="u-semibold u-fs-135">ห้องเรียนของวิชานี้</div>
        <button class="btn btn-ghost btn-sm" id="ov-import-all-btn">นำเข้ารายชื่อ (แยกห้องอัตโนมัติ)</button>
      </div>
      <div class="room-pills u-mb-0" id="ov-room-pills">
        ${sections.map(s => `
          <div class="room-pill-wrap">
            <span class="room-pill u-cursor-default">ห้อง ${escapeHtml(s.room)}</span>
            <button class="room-pill-del" data-section-id="${s.id}" data-room-label="${escapeHtml(s.room)}" title="ลบห้องนี้">×</button>
          </div>
        `).join('')}
        <button class="room-pill room-pill-add" id="ov-add-room-btn">+ เพิ่มห้อง</button>
      </div>
      ${sections.length === 0 ? `<div class="empty-state u-pt-10">ยังไม่มีห้องเรียนในวิชานี้ กด "+ เพิ่มห้อง" เพื่อเริ่มต้น</div>` : ''}
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="label">จำนวนห้อง</div><div class="value">${sections.length}</div></div>
      <div class="stat-card"><div class="label">นักเรียนทั้งหมด</div><div class="value">${totalStudents}</div></div>
      <div class="stat-card"><div class="label">รายการคะแนนที่กำหนด</div><div class="value">${assessSnap.size}</div></div>
    </div>
    ${sections.length > 0 ? `
      <div class="card u-mb-16">
        <div class="struct-panel-header">ความคืบหน้ารายห้อง</div>
        <div class="card-pad u-flex u-col u-gap-10">
          ${perSectionWithProgress.map(s => `
            <div class="u-flex u-items-center u-gap-12">
              <div class="u-w-70 u-semibold u-fs-135">ห้อง ${escapeHtml(s.room)}</div>
              <div class="u-w-80 u-note-sm">${s.studentCount} คน</div>
              <div class="progress-bar u-grow"><div class="fill" style="--p:${s.progress}%"></div></div>
              <div class="progress-pct">${s.progress}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    <div class="card card-pad">
      <h2 class="card-title u-mb-10">ขั้นตอนถัดไป</h2>
      <div class="u-flex u-col u-gap-8 u-fs-135 u-soft">
        <div>1. เพิ่มห้องเรียน ${sections.length > 0 ? '✓' : '— ยังไม่มีห้อง'}</div>
        <div>2. เพิ่มรายชื่อนักเรียนแต่ละห้อง ${totalStudents > 0 ? '✓' : '— ยังไม่มีนักเรียน'}</div>
        <div>3. กำหนดโครงสร้างคะแนน (ใช้ร่วมกันทุกห้อง) ${assessSnap.size > 0 ? '✓' : '— ยังไม่ได้กำหนด'}</div>
        <div>4. บันทึกคะแนน ${avgProgress > 0 ? `— บันทึกแล้วเฉลี่ย ${avgProgress}%` : '— ยังไม่เริ่มบันทึก'}</div>
      </div>
    </div>
  `;

  // จัดการห้องของรายวิชาเทอมนี้ (เดิมอยู่ในหน้าตั้งค่าโครงสร้างวิชา — ย้ายมาที่นี่เพราะห้องผูกกับเทอม ไม่ใช่แม่แบบ)
  const refresh = () => renderCourseShell();
  document.getElementById('ov-add-room-btn').addEventListener('click', () => openAddRoomModal(course, refresh));
  document.getElementById('ov-import-all-btn').addEventListener('click', () => openImportAllRoomsModal(course, sections, refresh));
  container.querySelectorAll('#ov-room-pills .room-pill-del').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteSection(course, btn.dataset.sectionId, btn.dataset.roomLabel, refresh));
  });
}
