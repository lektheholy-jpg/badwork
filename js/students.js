// ==========================================================================
// Students: list, manual add, CSV / paste import — scoped to one ห้อง (section)
// ==========================================================================

function sectionRef(uid, courseId, sectionId) {
  return db.collection('users').doc(uid).collection('courses').doc(courseId)
    .collection('sections').doc(sectionId);
}

async function renderStudentsTab(container, course, section) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const snap = await sectionRef(uid, course.id, section.id).collection('students').orderBy('no', 'asc').get();
  const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  students.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));

  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span style="font-size:13px; color:var(--ink-soft);">ห้อง ${escapeHtml(section.room)} • นักเรียนทั้งหมด ${students.length} คน</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="add-one-btn">+ เพิ่มทีละคน</button>
        <button class="btn btn-primary btn-sm" id="import-btn">นำเข้ารายชื่อ</button>
      </div>
    </div>
    ${students.length === 0 ? `<div class="card"><div class="empty-state"><div class="icon">👨‍🎓</div>ยังไม่มีนักเรียนในห้องนี้</div></div>` : `
      <div class="sheet-wrap">
        <table class="sheet">
          <thead><tr><th>เลขที่</th><th>รหัสนักเรียน</th><th>ชื่อ</th><th>นามสกุล</th><th></th></tr></thead>
          <tbody>
            ${students.map(s => `
              <tr data-id="${s.id}">
                <td class="name-cell">${escapeHtml(s.no)}</td>
                <td class="name-cell">${escapeHtml(s.code)}</td>
                <td class="name-cell">${escapeHtml(s.firstName)}</td>
                <td class="name-cell">${escapeHtml(s.lastName)}</td>
                <td class="name-cell"><button class="btn btn-danger-ghost btn-sm del-student">ลบ</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('add-one-btn').addEventListener('click', () => openAddOneStudentModal(course, section));
  document.getElementById('import-btn').addEventListener('click', () => openImportStudentsModal(course, section));
  container.querySelectorAll('.del-student').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      if (!confirm('ลบนักเรียนคนนี้ออกจากห้อง? คะแนนของนักเรียนคนนี้จะถูกลบไปด้วย')) return;
      const secBase = sectionRef(uid, course.id, section.id);
      await secBase.collection('students').doc(row.dataset.id).delete();
      await secBase.collection('scores').doc(row.dataset.id).delete().catch(() => {}); // อาจไม่มีคะแนนอยู่แล้ว
      renderStudentsTab(container, course, section);
    });
  });
}

function openAddOneStudentModal(course, section) {
  openModal(`
    <h2>เพิ่มนักเรียน</h2>
    <div class="modal-sub">เพิ่มนักเรียนทีละคน — ห้อง ${escapeHtml(section.room)}</div>
    <div class="field-row">
      <div class="field"><label>เลขที่</label><input id="s-no" placeholder="1"></div>
      <div class="field"><label>รหัสนักเรียน</label><input id="s-code" placeholder="16001"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>ชื่อ</label><input id="s-first" placeholder="สมชาย"></div>
      <div class="field"><label>นามสกุล</label><input id="s-last" placeholder="ใจดี"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-add-student">ยกเลิก</button>
      <button class="btn btn-primary" id="submit-add-student">เพิ่มนักเรียน</button>
    </div>
  `);
  document.getElementById('cancel-add-student').addEventListener('click', closeModal);
  document.getElementById('submit-add-student').addEventListener('click', async () => {
    const first = document.getElementById('s-first').value.trim();
    if (!first) { showToast('กรุณากรอกชื่อ'); return; }
    const uid = AppState.user.uid;
    await sectionRef(uid, course.id, section.id).collection('students').add({
      no: document.getElementById('s-no').value.trim(),
      code: document.getElementById('s-code').value.trim(),
      firstName: first,
      lastName: document.getElementById('s-last').value.trim(),
    });
    closeModal();
    showToast('เพิ่มนักเรียนสำเร็จ');
    renderStudentsTab(document.getElementById('course-tab-body'), course, section);
  });
}

// ==========================================================================
// นำเข้ารายชื่อทั้งวิชา — แยกห้องอัตโนมัติจากไฟล์เดียว (คอลัมน์ห้อง/ชั้น-ห้อง
// เช่น "มัธยมศึกษาปีที่ 2/1") ห้องที่ยังไม่มีในวิชาจะถูกสร้างให้อัตโนมัติ (1-13)
// ==========================================================================
function openImportAllRoomsModal(course, existingSections, onDone) {
  openModal(`
    <h2>นำเข้ารายชื่อ — แยกห้องอัตโนมัติ</h2>
    <div class="modal-sub">อัปโหลดไฟล์รายชื่อนักเรียนหลายห้องของวิชา "${escapeHtml(course.name)}" ในไฟล์เดียว ระบบจะอ่านคอลัมน์ห้อง/ชั้น-ห้อง แล้วแยกนักเรียนลงห้องที่ตรงกันให้อัตโนมัติ ห้องที่ยังไม่มีในวิชานี้จะถูกสร้างใหม่ให้ (รองรับห้อง 1-13)</div>
    <div class="field">
      <input type="file" id="import-all-file" accept=".xlsx,.xls,.csv">
      <div class="field-hint">ต้องมีคอลัมน์ห้อง เช่น "ห้อง" หรือ "ชั้น/ห้อง" (เช่น มัธยมศึกษาปีที่ 2/1) — ระบบจะดึงเลขห้องท้ายสุดออกมาให้เอง</div>
    </div>
    <div id="import-all-preview"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-import-all">ยกเลิก</button>
      <button class="btn btn-primary hidden" id="confirm-import-all-btn">นำเข้า</button>
    </div>
  `);
  document.getElementById('cancel-import-all').addEventListener('click', closeModal);

  const existingByRoom = new Map(existingSections.map(s => [String(s.room), s]));
  let groups = null;

  document.getElementById('import-all-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const previewEl = document.getElementById('import-all-preview');
    const confirmBtn = document.getElementById('confirm-import-all-btn');
    confirmBtn.classList.add('hidden');
    groups = null;
    if (!file) return;

    try {
      const aoa = await readFileAsRows(file);
      const result = parseImportSheetMultiRoom(aoa);

      if (!result.roomColumnFound) {
        previewEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ ไม่พบคอลัมน์ห้อง/ชั้น-ห้องในไฟล์นี้ — ใช้เมนู "นำเข้ารายชื่อ" ในแต่ละห้องแทนได้</div></div>`;
        return;
      }
      if (result.rows.length === 0) {
        previewEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ ไม่พบข้อมูลนักเรียนในไฟล์นี้</div></div>`;
        return;
      }

      const validRows = result.rows.filter(r => ROOM_OPTIONS.includes(r.room));
      const invalidRows = result.rows.filter(r => !ROOM_OPTIONS.includes(r.room));
      const grouped = {};
      validRows.forEach(r => { (grouped[r.room] = grouped[r.room] || []).push(r); });
      groups = grouped;

      const codes = validRows.map(r => r.code).filter(Boolean);
      const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
      const emptyNames = validRows.filter(r => !r.firstName.trim()).length;
      const roomList = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
      const newRooms = roomList.filter(r => !existingByRoom.has(r));

      const checks = [
        { ok: true, text: `พบนักเรียน ${validRows.length} คน ใน ${roomList.length} ห้อง (${roomList.map(r => 'ห้อง ' + r).join(', ')})` },
        { ok: dupCodes.length === 0, text: dupCodes.length === 0 ? 'ไม่มีรหัสซ้ำ' : `พบรหัสซ้ำ ${dupCodes.length} รายการ` },
        { ok: emptyNames === 0, text: emptyNames === 0 ? 'ไม่มีชื่อว่าง' : `พบชื่อว่าง ${emptyNames} รายการ` },
      ];
      if (newRooms.length > 0) checks.push({ ok: true, text: `จะสร้างห้องใหม่ ${newRooms.length} ห้อง: ${newRooms.map(r => 'ห้อง ' + r).join(', ')}` });
      if (invalidRows.length > 0) checks.push({ ok: false, text: `ข้าม ${invalidRows.length} แถวที่ระบุเลขห้อง (1-13) ไม่ได้` });

      previewEl.innerHTML = `<div class="card card-pad" style="margin-bottom:10px;">${checks.map(c => `<div class="check-row ${c.ok ? 'ok' : 'warn'}">${c.ok ? '✓' : '✕'} ${c.text}</div>`).join('')}</div>`;

      const canImport = validRows.length > 0 && dupCodes.length === 0 && emptyNames === 0;
      confirmBtn.classList.toggle('hidden', !canImport);
      confirmBtn.textContent = `นำเข้า ${validRows.length} คน (${roomList.length} ห้อง)`;
    } catch (err) {
      previewEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านไฟล์ไม่สำเร็จ: ${escapeHtml(err.message || String(err))}</div></div>`;
    }
  });

  document.getElementById('confirm-import-all-btn').addEventListener('click', async (e) => {
    if (!groups) return;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'กำลังนำเข้า...';
    const roomCount = Object.keys(groups).length;
    const studentCount = Object.values(groups).reduce((s, arr) => s + arr.length, 0);
    try {
      await performMultiRoomImport(course, existingSections, groups);
      closeModal();
      showToast(`นำเข้านักเรียน ${studentCount} คน ใน ${roomCount} ห้องสำเร็จ`);
      if (onDone) onDone();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `นำเข้า ${studentCount} คน (${roomCount} ห้อง)`;
      showToast('นำเข้าไม่สำเร็จ: ' + (err.message || String(err)));
    }
  });
}

async function performMultiRoomImport(course, existingSections, groups) {
  const uid = AppState.user.uid;
  const courseRef = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const existingByRoom = new Map(existingSections.map(s => [String(s.room), s]));
  const roomNumbers = Object.keys(groups);

  // 1) สร้างห้องที่ยังไม่มีในวิชานี้ก่อน (เรียงเลขห้องน้อยไปมาก ต่อจากลำดับห้องเดิม)
  const toCreate = roomNumbers.filter(r => !existingByRoom.has(r)).sort((a, b) => Number(a) - Number(b));
  let nextOrder = existingSections.length;
  const createdRefs = {};
  if (toCreate.length > 0) {
    const sectionBatch = db.batch();
    toCreate.forEach(room => {
      const ref = courseRef.collection('sections').doc();
      sectionBatch.set(ref, { room, order: nextOrder++, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      createdRefs[room] = ref;
    });
    await sectionBatch.commit();
    await courseRef.update({ roomCount: firebase.firestore.FieldValue.increment(toCreate.length) });
  }

  // 2) เพิ่มนักเรียนเข้าห้องที่ถูกต้อง แบ่ง batch ก้อนละไม่เกิน 400 รายการ (ลิมิต Firestore 500 ops/batch)
  const ops = [];
  roomNumbers.forEach(room => {
    const secRef = createdRefs[room] || courseRef.collection('sections').doc(existingByRoom.get(room).id);
    groups[room].forEach(stu => ops.push({ secRef, stu }));
  });
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach(({ secRef, stu }) => {
      batch.set(secRef.collection('students').doc(), {
        no: stu.no, code: stu.code, firstName: stu.firstName, lastName: stu.lastName,
      });
    });
    await batch.commit();
  }
}

function openImportStudentsModal(course, section) {
  openModal(`
    <h2>นำเข้ารายชื่อนักเรียน</h2>
    <div class="modal-sub">ห้อง ${escapeHtml(section.room)}</div>

    <div class="room-mode-toggle">
      <button type="button" class="room-mode-btn active" data-mode="file">อัปโหลดไฟล์ Excel/CSV</button>
      <button type="button" class="room-mode-btn" data-mode="paste">วางข้อความ</button>
    </div>

    <div id="import-mode-file">
      <div class="field">
        <input type="file" id="import-file" accept=".xlsx,.xls,.csv">
        <div class="field-hint">รองรับไฟล์ที่มีคอลัมน์ เลขที่/ลำดับ, รหัสนักเรียน, ชื่อ (หรือ ชื่อ-สกุล), นามสกุล, ห้อง — ระบบจะพยายามจับคู่คอลัมน์ให้อัตโนมัติ ไม่จำเป็นต้องเรียงตำแหน่งเป๊ะ</div>
      </div>
    </div>
    <div id="import-mode-paste" class="hidden">
      <div class="field">
        <textarea id="import-text" rows="8" placeholder="1,16001,สมชาย,ใจดี&#10;2,16002,สมหญิง,รักเรียน"></textarea>
      </div>
      <div class="field-hint" style="margin:-8px 0 12px;">รูปแบบ: เลขที่, รหัสนักเรียน, ชื่อ, นามสกุล (คั่นด้วย comma หรือ tab)</div>
      <button class="btn btn-ghost btn-sm" id="preview-paste-btn">ตรวจสอบข้อมูล</button>
    </div>

    <div id="preview-area"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel-import">ยกเลิก</button>
      <button class="btn btn-primary hidden" id="confirm-import-btn">นำเข้า</button>
    </div>
  `);
  document.getElementById('cancel-import').addEventListener('click', closeModal);

  const modeFileBtn = document.querySelector('.room-mode-btn[data-mode="file"]');
  const modePasteBtn = document.querySelector('.room-mode-btn[data-mode="paste"]');
  modeFileBtn.addEventListener('click', () => {
    modeFileBtn.classList.add('active'); modePasteBtn.classList.remove('active');
    document.getElementById('import-mode-file').classList.remove('hidden');
    document.getElementById('import-mode-paste').classList.add('hidden');
    resetPreview();
  });
  modePasteBtn.addEventListener('click', () => {
    modePasteBtn.classList.add('active'); modeFileBtn.classList.remove('active');
    document.getElementById('import-mode-paste').classList.remove('hidden');
    document.getElementById('import-mode-file').classList.add('hidden');
    resetPreview();
  });

  let parsedRows = [];

  function resetPreview() {
    parsedRows = [];
    document.getElementById('preview-area').innerHTML = '';
    document.getElementById('confirm-import-btn').classList.add('hidden');
  }

  function showPreview(rows, meta) {
    parsedRows = rows;
    const codes = rows.map(r => r.code).filter(Boolean);
    const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
    const emptyNames = rows.filter(r => !r.firstName.trim()).length;

    const checks = [
      { ok: rows.length > 0, text: `พบข้อมูล ${rows.length} คน` },
      { ok: dupCodes.length === 0, text: dupCodes.length === 0 ? 'ไม่มีรหัสซ้ำ' : `พบรหัสซ้ำ ${dupCodes.length} รายการ` },
      { ok: emptyNames === 0, text: emptyNames === 0 ? 'ไม่มีชื่อว่าง' : `พบชื่อว่าง ${emptyNames} รายการ` },
    ];
    if (meta && meta.roomColumnFound) {
      if (meta.matchedRoomCount > 0) {
        checks.push({ ok: true, text: `กรองเฉพาะห้อง ${escapeHtml(section.room)} จากทั้งหมด ${meta.totalParsed} แถวในไฟล์` });
      } else {
        checks.push({ ok: false, text: `ไม่พบแถวที่ตรงกับห้อง ${escapeHtml(section.room)} ในคอลัมน์ห้อง — นำเข้าทั้งหมด ${meta.totalParsed} แถวแทน` });
      }
    }

    document.getElementById('preview-area').innerHTML = `
      <div class="card card-pad" style="margin-bottom:10px;">
        ${checks.map(c => `<div class="check-row ${c.ok ? 'ok' : 'warn'}">${c.ok ? '✓' : '✕'} ${c.text}</div>`).join('')}
      </div>
    `;
    const canImport = rows.length > 0 && dupCodes.length === 0 && emptyNames === 0;
    const confirmBtn = document.getElementById('confirm-import-btn');
    confirmBtn.classList.toggle('hidden', !canImport);
    confirmBtn.textContent = `นำเข้า ${rows.length} คน`;
  }

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const aoa = await readFileAsRows(file);
      const result = parseImportSheet(aoa, section.room);
      if (result.rows.length === 0) {
        document.getElementById('preview-area').innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ ไม่พบข้อมูลนักเรียนในไฟล์นี้ ลองตรวจสอบว่าไฟล์มีคอลัมน์ชื่อ/นามสกุลหรือไม่</div></div>`;
        document.getElementById('confirm-import-btn').classList.add('hidden');
        return;
      }
      showPreview(result.rows, result);
    } catch (err) {
      document.getElementById('preview-area').innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านไฟล์ไม่สำเร็จ: ${escapeHtml(err.message || String(err))}</div></div>`;
      document.getElementById('confirm-import-btn').classList.add('hidden');
    }
  });

  document.getElementById('preview-paste-btn').addEventListener('click', () => {
    const text = document.getElementById('import-text').value;
    const aoa = parseDelimitedText(text);
    const rows = aoa.map(r => ({ no: r[0] || '', code: r[1] || '', firstName: r[2] || '', lastName: r[3] || '' }));
    showPreview(rows, null);
  });

  document.getElementById('confirm-import-btn').addEventListener('click', async () => {
    const uid = AppState.user.uid;
    const batch = db.batch();
    const colRef = sectionRef(uid, course.id, section.id).collection('students');
    parsedRows.forEach(r => {
      const ref = colRef.doc();
      batch.set(ref, { no: r.no, code: r.code, firstName: r.firstName, lastName: r.lastName });
    });
    await batch.commit();
    closeModal();
    showToast(`นำเข้านักเรียน ${parsedRows.length} คนสำเร็จ`);
    renderStudentsTab(document.getElementById('course-tab-body'), course, section);
  });
}
