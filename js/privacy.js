// ==========================================================================
// ความเป็นส่วนตัว: ส่งออกข้อมูลทั้งหมดของครู / ลบบัญชีและข้อมูลทั้งหมด
// โครงสร้าง: users/{uid}/records/{id} (อบรม/เกียรติบัตร/รางวัล · ต้นฉบับไฟล์อยู่ใน Storage users/{uid}/records/...)
//            users/{uid}/timetable/{ปี}-{ภาค} (ตารางสอนแยกภาคเรียน เช่น 2569-1 · main = แบบเดิม)
//            users/{uid}/courses/{id}/{assessments,settings,sections}
//            และ sections/{id}/{students,scores}
//            users/{uid}/{ชื่อ collection ของทุกระบบเอกสาร} เช่น pa_agreements · pa_reports — ชื่ออ่านจาก config.collections ผ่าน docSystem() ไม่เขียนตรงในไฟล์นี้
// ==========================================================================

// collection ของทุกระบบเอกสารใต้ users/{uid}/ → [{ name, ref }] · โหลดเฉพาะ config (LAZY_BUNDLES.docConfigs) · โหลดไม่ได้ = throw (ผู้เรียกต้องหยุดก่อนแตะข้อมูล)
async function _docCollections(uid) {
  await loadModules(LAZY_BUNDLES.docConfigs);
  const list = [];
  docSystemIds().forEach(id => {
    const sys = docSystem(id);
    Object.keys(sys.config.collections).forEach(kind => list.push({ name: sys.config.collections[kind], ref: sys.col(kind, uid) }));
  });
  return list;
}

async function _collectAll(uid, onProgress) {
  const userRef = db.collection('users').doc(uid);
  const plain = async (ref) => (await ref.get()).docs.map(d => ({ id: d.id, ...d.data() }));

  // อ่านอย่างเดียว จึงขนานได้ปลอดภัย — วิชา/ห้องโหลดพร้อมกันแบบจำกัดจำนวน (mapLimit ใน dashboard.js) ผลเรียงตามลำดับเดิม
  const docCols = await _docCollections(uid);
  const [profileSnap, courseSnap, timetable, records, docData] = await Promise.all([userRef.get(), userRef.collection('courses').get(), plain(userRef.collection('timetable')), plain(userRef.collection('records')), Promise.all(docCols.map(c => plain(c.ref)))]);
  // records มีรูปย่อ + ข้อมูลไฟล์ (path/ชื่อ) — ไฟล์ต้นฉบับใน Storage ไม่ได้รวมในไฟล์ส่งออก (เปิดดู/ดาวน์โหลดได้จากแท็บอบรม/เกียรติบัตร)
  const out = { exportedAt: new Date().toISOString(), profile: profileSnap.exists ? profileSnap.data() : null, timetable, records, courses: [] };
  docCols.forEach((c, i) => { out[c.name] = docData[i]; }); // เอกสารของทุกระบบ (PA ฯลฯ) ใต้ชื่อ collection เดิม

  let coursesDone = 0;
  out.courses = await mapLimit(courseSnap.docs, COURSE_LOAD_CONCURRENCY, async (c) => {
    const cRef = c.ref;
    const [assessments, settings, secSnap] = await Promise.all([
      plain(cRef.collection('assessments')),
      plain(cRef.collection('settings')),
      cRef.collection('sections').get(),
    ]);
    const sections = await mapLimit(secSnap.docs, SECTION_LOAD_CONCURRENCY, async (s) => {
      const [students, scores, attendance, attendanceMeta] = await Promise.all([plain(s.ref.collection('students')), plain(s.ref.collection('scores')), plain(s.ref.collection('attendance')), plain(s.ref.collection('attendanceMeta'))]);
      return { id: s.id, ...s.data(), students, scores, attendance, attendanceMeta };
    });
    if (onProgress) onProgress(++coursesDone, courseSnap.docs.length);
    return { id: c.id, ...c.data(), assessments, settings, sections };
  });
  return out;
}

// ---------- สำรอง/กู้คืนทั้งบัญชี ----------
// ไฟล์สำรอง = JSON จาก _collectAll + หัวไฟล์ (format/version) · Timestamp ของ Firestore เก็บเป็น { __ts: ISO } เพื่อแยกจากข้อความธรรมดา
// (ไฟล์ส่งออกรุ่นเก่าที่ไม่มีหัวไฟล์ก็กู้คืนได้ แต่ฟิลด์เวลาจะเป็นข้อความตามที่ส่งออกไว้)
const BACKUP_FORMAT = 'myscore-backup';
const BACKUP_VERSION = 2;
const BACKUP_LAST_KEY = 'myscore_last_backup';
const BACKUP_MAX_BYTES = 50 * 1024 * 1024;

function _tagTimestamps(v) {
  if (Array.isArray(v)) return v.map(_tagTimestamps);
  if (v && typeof v === 'object') {
    if (typeof v.toDate === 'function') return { __ts: v.toDate().toISOString() };
    if (v instanceof Date) return { __ts: v.toISOString() };
    const o = {};
    Object.keys(v).forEach(k => { o[k] = _tagTimestamps(v[k]); });
    return o;
  }
  return v;
}
function _reviveTimestamps(v) {
  if (Array.isArray(v)) return v.map(_reviveTimestamps);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__ts' && typeof v.__ts === 'string') {
      const d = new Date(v.__ts);
      if (!isNaN(d.getTime())) return firebase.firestore.Timestamp.fromDate(d);
    }
    const o = {};
    keys.forEach(k => { o[k] = _reviveTimestamps(v[k]); });
    return o;
  }
  return v;
}

async function exportMyData() {
  let prog = islandProgress({ label: 'กำลังรวบรวมข้อมูล...' }); // แถบวิ่งก่อน แล้วเปลี่ยนเป็นนับจริงเมื่อรู้จำนวนวิชา
  try {
    const data = await _collectAll(AppState.user.uid, (done, total) => {
      prog = islandProgress({ label: 'รวบรวมข้อมูล', total, unit: 'วิชา' });
      prog.update(done);
    });
    const file = Object.assign({ format: BACKUP_FORMAT, version: BACKUP_VERSION }, _tagTimestamps(data));
    const json = JSON.stringify(file, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ข้อมูลของฉัน-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    try { localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString()); } catch (e) {}
    if (typeof refreshBackupNote === 'function') refreshBackupNote();
    prog.finish('ส่งออกข้อมูลสำเร็จ');
  } catch (err) {
    console.error(err);
    prog.fail('ส่งออกข้อมูลไม่สำเร็จ: ' + (err.message || err));
  }
}

// แถว { id, ...ฟิลด์ } จากไฟล์สำรอง → { id, data } ที่ restoreDocs เขียนกลับได้
function _rowsToDocs(rows) {
  return (Array.isArray(rows) ? rows : []).filter(r => r && r.id != null).map(r => {
    const { id, ...data } = r;
    return { id: String(id), data: _reviveTimestamps(data) };
  });
}

// ตรวจไฟล์ก่อนแตะข้อมูลจริง · คืนสรุปจำนวนไว้ให้ผู้ใช้เห็นก่อนยืนยัน
function _validateBackup(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป' };
  if (d.format && d.format !== BACKUP_FORMAT) return { ok: false, error: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป' };
  if (d.version && d.version > BACKUP_VERSION) return { ok: false, error: 'ไฟล์สำรองนี้ใหม่กว่าแอปเวอร์ชันนี้ กรุณารีเฟรชแอปก่อน' };
  if (!Array.isArray(d.courses) || !d.exportedAt) return { ok: false, error: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป' };
  let sections = 0, students = 0;
  d.courses.forEach(c => (Array.isArray(c && c.sections) ? c.sections : []).forEach(s => { sections++; students += Array.isArray(s && s.students) ? s.students.length : 0; }));
  return { ok: true, summary: { courses: d.courses.length, sections, students, exportedAt: d.exportedAt } };
}

// เขียนกลับด้วยรหัสเดิม: เอกสารที่รหัสตรงกันถูกเขียนทับ · เอกสารอื่นที่มีอยู่ไม่ถูกลบ · ไม่แตะโปรไฟล์/หน้าตาของบัญชีปัจจุบัน
// วิชาที่เขียนไม่สำเร็จไม่หยุดทั้งงาน — เก็บชื่อไว้รายงานท้ายงาน
async function _restoreBackup(uid, data, onProgress) {
  const userRef = db.collection('users').doc(uid);
  const docCols = await _docCollections(uid); // โหลดไม่ได้ = หยุดก่อนเขียนอะไร
  const res = { courses: 0, sections: 0, students: 0, others: 0, failed: [] };
  const courses = Array.isArray(data.courses) ? data.courses : [];
  const steps = courses.length + 1;
  let done = 0;
  const tick = () => { if (onProgress) onProgress(++done, steps); };

  for (const c of courses) {
    const label = (c && (c.name || c.code || c.id)) || '(ไม่มีชื่อ)';
    try {
      if (!c || c.id == null) throw new Error('ไม่มีรหัสวิชา');
      const { id, assessments, settings, sections, ...cdata } = c;
      const secs = (Array.isArray(sections) ? sections : []).filter(s => s && s.id != null).map(s => {
        const { id: sid, students, scores, attendance, attendanceMeta, ...sdata } = s;
        return { id: String(sid), data: _reviveTimestamps(sdata), students: _rowsToDocs(students), scores: _rowsToDocs(scores), attendance: _rowsToDocs(attendance), attendanceMeta: _rowsToDocs(attendanceMeta) };
      });
      await restoreCourse(userRef.collection('courses').doc(String(id)), {
        data: _reviveTimestamps(cdata), assessments: _rowsToDocs(assessments), settings: _rowsToDocs(settings), sections: secs,
      });
      res.courses++;
      res.sections += secs.length;
      secs.forEach(s => { res.students += s.students.length; });
    } catch (err) {
      console.error('กู้คืนวิชาไม่สำเร็จ', label, err);
      res.failed.push(String(label));
    }
    tick();
  }

  const groups = [{ name: 'ตารางสอน', ref: userRef.collection('timetable'), rows: data.timetable }, { name: 'อบรม/เกียรติบัตร', ref: userRef.collection('records'), rows: data.records }]
    .concat(docCols.map(c => ({ name: c.name, ref: c.ref, rows: data[c.name] })));
  for (const g of groups) {
    const docs = _rowsToDocs(g.rows);
    if (!docs.length) continue;
    try { await restoreDocs(g.ref, docs); res.others += docs.length; } catch (err) { console.error('กู้คืนไม่สำเร็จ', g.name, err); res.failed.push(g.name); }
  }
  tick();
  return res;
}

function importMyData() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { showToast('ต้องเชื่อมต่ออินเทอร์เน็ตก่อนจึงจะกู้คืนข้อมูลได้'); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    if (f.size > BACKUP_MAX_BYTES) { showToast('ไฟล์ใหญ่เกินไป (เกิน 50 MB)'); return; }
    let data;
    try { data = JSON.parse(await f.text()); } catch (err) { showToast('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .json ที่ส่งออกจากแอปนี้'); return; }
    const check = _validateBackup(data);
    if (!check.ok) { showToast(check.error); return; }
    const sm = check.summary;
    const when = new Date(sm.exportedAt);
    const whenText = isNaN(when.getTime()) ? '' : when.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
    openConfirmModal({
      title: 'กู้คืนข้อมูลจากไฟล์สำรอง?',
      body: `ไฟล์ <b>${escapeHtml(f.name)}</b>${whenText ? ' (สำรองเมื่อ ' + escapeHtml(whenText) + ')' : ''} มี ${sm.courses} วิชา · ${sm.sections} ห้อง · ${sm.students} นักเรียน<br><br>`
        + 'ข้อมูลที่มีรหัสเดียวกันในบัญชีนี้จะถูก<b>เขียนทับ</b>ด้วยค่าในไฟล์ ส่วนข้อมูลอื่นที่มีอยู่จะไม่ถูกลบ · ไม่รวมไฟล์ต้นฉบับในแท็บอบรม/เกียรติบัตร และไม่รวมโปรไฟล์/ธีม (ใช้ของบัญชีปัจจุบัน) · แนะนำให้กด "ส่งออกข้อมูลของฉัน" เก็บสถานะปัจจุบันไว้ก่อน',
      confirmLabel: 'กู้คืน',
      onConfirm: async () => {
        let prog = islandProgress({ label: 'กำลังกู้คืนข้อมูล...' });
        try {
          const r = await _restoreBackup(AppState.user.uid, data, (n, total) => {
            prog = islandProgress({ label: 'กู้คืนข้อมูล', total, unit: 'ขั้นตอน' });
            prog.update(n);
          });
          if (r.failed.length) prog.fail(`กู้คืนได้ ${r.courses} วิชา แต่ไม่สำเร็จ: ${r.failed.slice(0, 3).join(', ')}${r.failed.length > 3 ? ' และอีก ' + (r.failed.length - 3) : ''}`);
          else prog.finish(`กู้คืนสำเร็จ ${r.courses} วิชา ${r.students} นักเรียน`);
          if (typeof invalidateCourseData === 'function') data.courses.forEach(c => { if (c && c.id != null) invalidateCourseData(String(c.id)); });
          if (r.courses || r.others) setTimeout(() => { try { location.reload(); } catch (e) {} }, 2500); // โหลดใหม่เพื่อให้ทุกหน้าอ่านข้อมูลที่เพิ่งกู้คืน
        } catch (err) {
          console.error(err);
          prog.fail('กู้คืนไม่สำเร็จ: ' + (err.message || err));
        }
      },
    });
  });
  document.body.appendChild(input);
  input.click();
}

function deleteMyAccount() {
  openConfirmModal({
    title: 'ลบบัญชีและข้อมูลทั้งหมด?',
    body: 'รายวิชา ห้อง นักเรียน คะแนน ตารางสอน อบรม/เกียรติบัตร และเอกสารทั้งหมด (เช่น PA) ของคุณจะถูกลบถาวร และกู้คืนไม่ได้ แนะนำให้กด "ส่งออกข้อมูลของฉัน" เก็บไว้ก่อน',
    confirmLabel: 'ลบทั้งหมด',
    danger: true,
    onConfirm: async () => {
      const user = auth.currentUser;
      const userRef = db.collection('users').doc(user.uid);
      try {
        const docCols = await _docCollections(user.uid); // โหลดก่อนลบอะไรทั้งนั้น — โหลดไม่ได้ = หยุด ไม่ลบบางส่วน
        showToast('กำลังลบข้อมูล...');
        const courseSnap = await userRef.collection('courses').get();
        for (const c of courseSnap.docs) {
          const secSnap = await c.ref.collection('sections').get();
          for (const s of secSnap.docs) {
            await deleteCollectionDocs(s.ref.collection('scores'));
            await deleteCollectionDocs(s.ref.collection('attendance'));
            await deleteCollectionDocs(s.ref.collection('attendanceMeta'));
            await deleteCollectionDocs(s.ref.collection('students'));
          }
          await deleteCollectionDocs(c.ref.collection('sections'));
          await deleteCollectionDocs(c.ref.collection('assessments'));
          await deleteCollectionDocs(c.ref.collection('settings'));
        }
        await deleteCollectionDocs(userRef.collection('courses'));
        await deleteCollectionDocs(userRef.collection('timetable'));
        for (const c of docCols) await deleteCollectionDocs(c.ref);
        await loadModule('records');
        await recDeleteAllFiles(user.uid); // ไฟล์ต้นฉบับใน Storage — พลาดแล้วหยุดทั้งหมด (ไม่ลบบัญชีทิ้งไฟล์ค้าง)
        await deleteCollectionDocs(userRef.collection('records'));
        await userRef.delete();
        try {
          await user.delete();
        } catch (err) {
          if (err.code !== 'auth/requires-recent-login') throw err;
          await user.reauthenticateWithPopup(googleProvider); // ต้องยืนยันตัวตนอีกครั้งก่อนลบบัญชี
          await user.delete();
        }
        try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
        showToast('ลบบัญชีและข้อมูลเรียบร้อยแล้ว');
      } catch (err) {
        console.error(err);
        showToast('ลบไม่สำเร็จ: ' + (err.message || err));
      }
    }
  });
}
