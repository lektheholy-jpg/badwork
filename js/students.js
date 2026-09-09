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
