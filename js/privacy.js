// ==========================================================================
// ความเป็นส่วนตัว: ส่งออกข้อมูลทั้งหมดของครู / ลบบัญชีและข้อมูลทั้งหมด
// โครงสร้าง: users/{uid}/records/{id} (อบรม/เกียรติบัตร/รางวัล · ต้นฉบับไฟล์อยู่ใน Storage users/{uid}/records/...)
//            users/{uid}/timetable/{ปี}-{ภาค} (ตารางสอนแยกภาคเรียน เช่น 2569-1 · main = แบบเดิม)
//            users/{uid}/courses/{id}/{assessments,settings,sections}
//            และ sections/{id}/{students,scores}
// ==========================================================================

async function _collectAll(uid, onProgress) {
  const userRef = db.collection('users').doc(uid);
  const plain = async (ref) => (await ref.get()).docs.map(d => ({ id: d.id, ...d.data() }));

  // อ่านอย่างเดียว จึงขนานได้ปลอดภัย — วิชา/ห้องโหลดพร้อมกันแบบจำกัดจำนวน (mapLimit ใน dashboard.js) ผลเรียงตามลำดับเดิม
  const [profileSnap, courseSnap, timetable, records] = await Promise.all([userRef.get(), userRef.collection('courses').get(), plain(userRef.collection('timetable')), plain(userRef.collection('records'))]);
  // records มีรูปย่อ + ข้อมูลไฟล์ (path/ชื่อ) — ไฟล์ต้นฉบับใน Storage ไม่ได้รวมในไฟล์ส่งออก (เปิดดู/ดาวน์โหลดได้จากแท็บอบรม/เกียรติบัตร)
  const out = { exportedAt: new Date().toISOString(), profile: profileSnap.exists ? profileSnap.data() : null, timetable, records, courses: [] };

  let coursesDone = 0;
  out.courses = await mapLimit(courseSnap.docs, COURSE_LOAD_CONCURRENCY, async (c) => {
    const cRef = c.ref;
    const [assessments, settings, secSnap] = await Promise.all([
      plain(cRef.collection('assessments')),
      plain(cRef.collection('settings')),
      cRef.collection('sections').get(),
    ]);
    const sections = await mapLimit(secSnap.docs, SECTION_LOAD_CONCURRENCY, async (s) => {
      const [students, scores] = await Promise.all([plain(s.ref.collection('students')), plain(s.ref.collection('scores'))]);
      return { id: s.id, ...s.data(), students, scores };
    });
    if (onProgress) onProgress(++coursesDone, courseSnap.docs.length);
    return { id: c.id, ...c.data(), assessments, settings, sections };
  });
  return out;
}

async function exportMyData() {
  let prog = islandProgress({ label: 'กำลังรวบรวมข้อมูล...' }); // แถบวิ่งก่อน แล้วเปลี่ยนเป็นนับจริงเมื่อรู้จำนวนวิชา
  try {
    const data = await _collectAll(AppState.user.uid, (done, total) => {
      prog = islandProgress({ label: 'รวบรวมข้อมูล', total, unit: 'วิชา' });
      prog.update(done);
    });
    const json = JSON.stringify(data, (k, v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v), 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ข้อมูลของฉัน-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    prog.finish('ส่งออกข้อมูลสำเร็จ');
  } catch (err) {
    console.error(err);
    prog.fail('ส่งออกข้อมูลไม่สำเร็จ: ' + (err.message || err));
  }
}

function deleteMyAccount() {
  openConfirmModal({
    title: 'ลบบัญชีและข้อมูลทั้งหมด?',
    body: 'รายวิชา ห้อง นักเรียน และคะแนนทั้งหมดของคุณจะถูกลบถาวร และกู้คืนไม่ได้ แนะนำให้กด "ส่งออกข้อมูลของฉัน" เก็บไว้ก่อน',
    confirmLabel: 'ลบทั้งหมด',
    danger: true,
    onConfirm: async () => {
      const user = auth.currentUser;
      const userRef = db.collection('users').doc(user.uid);
      try {
        showToast('กำลังลบข้อมูล...');
        const courseSnap = await userRef.collection('courses').get();
        for (const c of courseSnap.docs) {
          const secSnap = await c.ref.collection('sections').get();
          for (const s of secSnap.docs) {
            await deleteCollectionDocs(s.ref.collection('scores'));
            await deleteCollectionDocs(s.ref.collection('students'));
          }
          await deleteCollectionDocs(c.ref.collection('sections'));
          await deleteCollectionDocs(c.ref.collection('assessments'));
          await deleteCollectionDocs(c.ref.collection('settings'));
        }
        await deleteCollectionDocs(userRef.collection('courses'));
        await deleteCollectionDocs(userRef.collection('timetable'));
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
