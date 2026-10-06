// ==========================================================================
// Report: summary stats, grade distribution, export — scoped to one ห้อง
// ==========================================================================

// โหลดข้อมูลที่รายงานของ "ห้องเดียว" ต้องใช้ (นักเรียน / รายการคะแนน / คะแนน / เกณฑ์เกรด)
// ใช้ร่วมกันระหว่างแท็บรายงานในวิชา (renderReportTab) และหน้ารายงานจากเมนูด้านข้าง (report-page.js)
// ไม่ cache โดยตั้งใจ — คะแนนอาจถูกแก้ระหว่างนั้น ต้องอ่านค่าล่าสุดทุกครั้งที่ส่งออก
async function loadRoomReportData(course, section) {
  const uid = AppState.user.uid;
  const courseBase = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const secBase = sectionRef(uid, course.id, section.id);
  const [studentsSnap, assessSnap, scoresSnap, gradingDoc] = await Promise.all([
    secBase.collection('students').orderBy('no', 'asc').get(),
    courseBase.collection('assessments').orderBy('order', 'asc').get(),
    secBase.collection('scores').get(),
    courseBase.collection('settings').doc('grading').get(),
  ]);
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  students.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const scores = {};
  scoresSnap.docs.forEach(d => { scores[d.id] = d.data(); });
  const gradeScale = gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE;
  return { students, assessments, scores, gradeScale };
}

// ส่งออกคะแนนจริงของห้องเป็นไฟล์ CSV (ใช้ร่วมกันทั้งแท็บรายงานและหน้ารายงาน)
function exportRoomCsv(course, section, { students, assessments, scores, gradeScale }) {
  const header = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...assessments.map(a => a.name), 'รวม', 'เกรด'];
  const rows = students.map(s => {
    const sc = scores[s.id] || {};
    const total = roundScore(assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0));
    return [s.no, s.code, s.firstName, s.lastName, ...assessments.map(a => sc[a.id] ?? ''), total, calcGrade(total, gradeScale)];
  });
  downloadCsv(`คะแนน-${course.name}-ห้อง${section.room}.csv`, [header, ...rows]);
  showToast('ส่งออกไฟล์ CSV สำเร็จ');
}

async function renderReportTab(container, course, section) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const { students, assessments, scores, gradeScale } = await loadRoomReportData(course, section);
  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0) || 100;

  const totals = students.map(s => {
    const sc = scores[s.id] || {};
    return roundScore(assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0));
  });

  const avg = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const max = totals.length ? Math.max(...totals) : 0;
  const min = totals.length ? Math.min(...totals) : 0;

  const gradeCounts = {};
  gradeScale.forEach(g => { gradeCounts[g.grade] = 0; });
  totals.forEach(t => {
    const g = calcGrade(t, gradeScale);
    gradeCounts[g] = (gradeCounts[g] || 0) + 1;
  });
  const maxCount = Math.max(1, ...Object.values(gradeCounts));

  container.innerHTML = `
    <div style="font-size:13px; color:var(--ink-soft); font-weight:600; margin-bottom:10px;">ห้อง ${escapeHtml(section.room)}</div>
    <div class="stat-row">
      <div class="stat-card"><div class="label">คะแนนเฉลี่ย</div><div class="value">${avg.toFixed(1)}</div></div>
      <div class="stat-card"><div class="label">คะแนนสูงสุด</div><div class="value">${max}</div></div>
      <div class="stat-card"><div class="label">คะแนนต่ำสุด</div><div class="value">${min}</div></div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <h2 style="font-size:14.5px;">การกระจายเกรด</h2>
        <button class="btn btn-ghost btn-sm" id="edit-grade-scale">ตั้งเกณฑ์เกรด</button>
      </div>
      ${gradeScale.map(g => `
        <div class="dist-row">
          <span class="g-label">${g.grade}</span>
          <div class="g-bar-track"><div class="g-bar-fill" style="width:${((gradeCounts[g.grade] || 0) / maxCount) * 100}%"></div></div>
          <span class="g-count">${gradeCounts[g.grade] || 0}</span>
        </div>
      `).join('')}
    </div>

    <div class="card card-pad">
      <h2 style="font-size:14.5px; margin-bottom:12px;">ส่งออกข้อมูล</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" id="export-csv-btn">Export CSV</button>
        <button class="btn btn-ghost btn-sm" id="export-pp5-btn">Export เข้าฟอร์ม ปพ.5</button>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <h2 style="font-size:14.5px; margin-bottom:4px;">แปลงคะแนน SGS</h2>
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:12px;">ส่งออกคะแนนเป็น เก็บก่อนกลางภาค 30 · กลางภาค 20 · เก็บหลังกลางภาค 30 · ปลายภาค 20 — คะแนนจริงและเกรดในระบบไม่เปลี่ยน · ปุ่ม "แปลงคะแนน Next School" นำคะแนนนี้ไปใส่ในไฟล์ฟอร์มที่โรงเรียนส่งให้</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="export-nextschool-btn">แปลงคะแนน SGS</button>
        <button class="btn btn-primary btn-sm" id="export-nsform-btn">แปลงคะแนน Next School</button>
      </div>
    </div>
  `;

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    exportRoomCsv(course, section, { students, assessments, scores, gradeScale });
  });

  document.getElementById('export-pp5-btn').addEventListener('click', () => {
    openPp5ExportModal(course, section, students, assessments, scores);
  });

  document.getElementById('export-nextschool-btn').addEventListener('click', () => {
    openNextSchoolModal(course, section, students, assessments, scores, gradeScale);
  });

  document.getElementById('export-nsform-btn').addEventListener('click', () => {
    openNextSchoolFormModal(course, section, students, assessments, scores, gradeScale);
  });

  document.getElementById('edit-grade-scale').addEventListener('click', () => openGradeScaleModal(course, section, gradeScale));
}

// ==========================================================================
// Export เข้าฟอร์ม ปพ.5 — อัปโหลดไฟล์แบบฟอร์มที่โรงเรียนออก ID คอลัมน์คะแนนมาให้
// (คอลัมน์ A-E = ลำดับ/ID/รหัส/ชื่อ/ห้อง ตายตัว, คอลัมน์คะแนนเริ่ม F เป็นต้นไป
//  จำนวน/ป้ายกำกับของคอลัมน์คะแนนอ่านจากแถวหัวตารางของไฟล์ ไม่ตายตัว)
// ไม่แก้โครงสร้างคะแนน/หน้ากรอกคะแนนเดิม — แค่ "แปลง" ตอนส่งออกเท่านั้น
// ==========================================================================

const PP5_SCORE_COL_START = 5; // คอลัมน์ F (0-indexed)
const PP5_CODE_COL = 2;        // คอลัมน์ C (รหัส)
const PP5_HEADER_ROWS = 4;     // แถวหัวตาราง 4 แถวแรก, ข้อมูลนักเรียนเริ่มแถวที่ 5 (index 4)

// อ่านโครงคอลัมน์คะแนนจากแถวหัวตาราง 4 แถวของไฟล์ฟอร์ม (ใช้ร่วมกันทั้ง ปพ.5 และ Next School)
//   แถว 0 = ชื่อหมวด (merge cell: ช่องว่างหมายถึงหมวดเดิม)  แถว 1 = ID รายการ  แถว 2 = ลำดับ  แถว 3 = คะแนนเต็ม
//   classify(groupLabel) → bucket ของคอลัมน์นั้น
//   readIdRow → true จะอ่าน ID รายการใส่ itemId (ปพ.5 ใช้, Next School ไม่ใช้)
function parseFormColumns(aoa, { classify, readIdRow = false }) {
  const groupRow = aoa[0] || [];
  const idRow = readIdRow ? (aoa[1] || []) : [];
  const orderRow = aoa[2] || [];
  const maxRow = aoa[3] || [];
  const cols = [];
  let lastGroup = '';
  const width = Math.max(groupRow.length, idRow.length, orderRow.length, maxRow.length);
  for (let c = PP5_SCORE_COL_START; c < width; c++) {
    if (groupRow[c] !== undefined && groupRow[c] !== '') lastGroup = groupRow[c];
    const max = maxRow[c];
    if (max === undefined || max === '') break; // จบชุดคอลัมน์คะแนนเมื่อไม่มีค่าคะแนนเต็มแล้ว
    const col = {
      colIndex: c,
      group: String(lastGroup),
      bucket: classify(lastGroup),
      order: orderRow[c] !== undefined ? orderRow[c] : '',
      max: Number(max) || 0,
    };
    if (readIdRow) col.itemId = idRow[c] !== undefined ? idRow[c] : '';
    cols.push(col);
  }
  return cols;
}

function parsePp5TemplateColumns(aoa) {
  return parseFormColumns(aoa, { classify: classifyPp5Bucket, readIdRow: true });
}

// จัดกลุ่มคอลัมน์ของฟอร์มเข้ากับ 3 หมวดคะแนนที่ระบบมีอยู่จริง (collect/midterm/final)
// โดยดูจากคำในชื่อหมวดของฟอร์ม (มาตรฐาน สพฐ.: ก่อนกลางภาค/กลางภาค/หลังกลางภาค/ปลายภาค)
function classifyPp5Bucket(groupLabel) {
  const s = String(groupLabel || '');
  if (s.includes('ปลาย')) return 'final';
  if (s.includes('กลางภาค') && !s.includes('ก่อน') && !s.includes('หลัง')) return 'midterm';
  return 'collect'; // ก่อนกลางภาค, หลังกลางภาค, เก็บคะแนน ฯลฯ ล้วนมาจากคะแนนเก็บ (collect) ของครู
}

// คำนวณสัดส่วนที่ทำได้จริงของแต่ละหมวด (0-1) จากคะแนนที่มีอยู่แล้วในระบบ
function computeStudentBucketRatios(sc, assessments) {
  const byCat = { collect: { score: 0, max: 0 }, midterm: { score: 0, max: 0 }, final: { score: 0, max: 0 } };
  assessments.forEach(a => {
    const cat = byCat[a.category] ? a.category : 'collect';
    byCat[cat].max += Number(a.max) || 0;
    byCat[cat].score += Number(sc[a.id]) || 0;
  });
  const ratio = {};
  Object.keys(byCat).forEach(cat => {
    ratio[cat] = byCat[cat].max > 0 ? (byCat[cat].score / byCat[cat].max) : 0;
  });
  return { ratio, byCat };
}

function openPp5ExportModal(course, section, students, assessments, scores) {
  openModal(`
    <h2>ส่งออกเข้าฟอร์ม ปพ.5</h2>
    <div class="modal-sub">ห้อง ${escapeHtml(section.room)} — อัปโหลดไฟล์แบบฟอร์ม ปพ.5 ที่โรงเรียนออกให้ ระบบจะ<b>แปลงคะแนนที่มีอยู่แล้วในระบบให้อัตโนมัติ</b> ตามสัดส่วนของแต่ละหมวด (เก็บ/กลางภาค/ปลายภาค) โดยไม่ต้องเลือก mapping เอง และคำนวณให้เกรดรวม (%) เท่าเดิม</div>
    <div class="field">
      <input type="file" id="pp5-file" accept=".xlsx,.xls">
      <div class="field-hint">ต้องเป็นไฟล์ต้นฉบับที่มีคอลัมน์ ID ของโรงเรียนอยู่แล้ว (คอลัมน์ A-E: ลำดับ/ID/รหัส/ชื่อ/ห้อง) — ระบบจะเติมเฉพาะคะแนน ไม่แก้คอลัมน์อื่น</div>
    </div>
    <div id="pp5-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="pp5-cancel">ยกเลิก</button>
      <button class="btn btn-primary hidden" id="pp5-confirm">ส่งออกไฟล์</button>
    </div>
  `);
  document.getElementById('pp5-cancel').addEventListener('click', closeModal);

  let wb = null, ws = null, aoa = null, targetCols = [];

  document.getElementById('pp5-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const bodyEl = document.getElementById('pp5-body');
    const confirmBtn = document.getElementById('pp5-confirm');
    confirmBtn.classList.add('hidden');
    if (!file) return;
    bodyEl.innerHTML = `<div class="empty-state">กำลังอ่านไฟล์...</div>`;
    try {
      await loadXLSX();
      const data = await file.arrayBuffer();
      wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      ws = wb.Sheets[sheetName];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      targetCols = parsePp5TemplateColumns(aoa);

      if (targetCols.length === 0) {
        bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านโครงสร้างคอลัมน์คะแนนจากไฟล์นี้ไม่ได้ ตรวจสอบว่าเป็นไฟล์ต้นฉบับที่โรงเรียนออกให้จริงหรือไม่</div></div>`;
        return;
      }

      // ตรวจสอบว่าคะแนนเต็มรวมของแต่ละหมวดใน "ระบบ" ตรงกับ "ฟอร์ม" หรือไม่
      // (ถ้าตรง → เกรดรวมจะเท่าเดิมเป๊ะ ถ้าไม่ตรง → คลาดเคลื่อนได้ตามสัดส่วน)
      const appMax = { collect: 0, midterm: 0, final: 0 };
      assessments.forEach(a => { appMax[appMax[a.category] !== undefined ? a.category : 'collect'] += Number(a.max) || 0; });
      const formMax = { collect: 0, midterm: 0, final: 0 };
      targetCols.forEach(c => { formMax[c.bucket] += c.max; });

      const mismatches = ['collect', 'midterm', 'final'].filter(cat => appMax[cat] !== formMax[cat]);
      const bucketLabel = { collect: 'คะแนนเก็บ (ก่อน+หลังกลางภาค)', midterm: 'กลางภาค', final: 'ปลายภาค' };

      bodyEl.innerHTML = `
        <div class="card card-pad" style="margin-bottom:12px;">
          <div class="check-row ok">✓ พบคอลัมน์คะแนนในฟอร์ม ${targetCols.length} คอลัมน์ — จะแปลงคะแนนอัตโนมัติตามสัดส่วน ไม่ต้องเลือกเอง</div>
          ${mismatches.length === 0 ? `
            <div class="check-row ok" style="margin-top:6px;">✓ คะแนนเต็มแต่ละหมวดตรงกับฟอร์มพอดี (เก็บ ${appMax.collect}, กลางภาค ${appMax.midterm}, ปลายภาค ${appMax.final}) — เกรดรวม (%) จะเท่าเดิมแน่นอน</div>
          ` : `
            <div class="check-row warn" style="margin-top:6px;">
              ✕ คะแนนเต็มบางหมวดในระบบไม่ตรงกับฟอร์ม: ${mismatches.map(cat => `${bucketLabel[cat]} (ระบบ ${appMax[cat]} / ฟอร์ม ${formMax[cat]})`).join(', ')}
              — ระบบจะยังคำนวณสัดส่วน (%) ให้เท่าเดิมในแต่ละหมวด แต่ผลรวม 100 คะแนนสุดท้ายอาจ<b>คลาดเคลื่อนเล็กน้อย</b>จากเกรดจริงในระบบ เพราะน้ำหนักหมวดคะแนนของวิชานี้ไม่เท่ากับที่ฟอร์มกำหนดไว้ — แนะนำให้เช็กเกรดหลัง export อีกครั้ง
            </div>
          `}
        </div>
        <div id="pp5-mismatch-preview"></div>
      `;
      confirmBtn.classList.remove('hidden');
      updateMismatchPreview();
    } catch (err) {
      bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านไฟล์ไม่สำเร็จ: ${escapeHtml(err.message || String(err))}</div></div>`;
    }
  });

  function updateMismatchPreview() {
    if (!aoa) return;
    const dataRows = aoa.slice(PP5_HEADER_ROWS);
    const fileCodes = new Set(dataRows.map(r => String(r[PP5_CODE_COL] ?? '').trim()).filter(Boolean));
    const missingInFile = students.filter(s => !fileCodes.has(String(s.code ?? '').trim()));
    const matchedCount = students.length - missingInFile.length;
    const el = document.getElementById('pp5-mismatch-preview');
    if (!el) return;
    el.innerHTML = `
      <div class="card card-pad">
        <div class="check-row ${missingInFile.length === 0 ? 'ok' : 'warn'}">
          ${missingInFile.length === 0 ? '✓' : '✕'} จับคู่รหัสนักเรียนได้ ${matchedCount}/${students.length} คน
        </div>
        ${missingInFile.length > 0 ? `
          <div style="font-size:12.5px; color:var(--ink-soft); margin-top:6px;">
            ไม่พบรหัสในไฟล์ต้นแบบ (จะไม่ถูกส่งออก): ${missingInFile.map(s => escapeHtml(`${s.firstName} ${s.lastName} (รหัส ${s.code || '-'})`)).join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }

  document.getElementById('pp5-confirm').addEventListener('click', async () => {
    try { await loadXLSX(); } catch (err) { showToast(err.message); return; }
    if (!wb || !ws || !aoa || targetCols.length === 0) { showToast('กรุณาอัปโหลดไฟล์ก่อน'); return; }

    const dataRows = aoa.slice(PP5_HEADER_ROWS);
    const rowByCode = new Map();
    dataRows.forEach((r, i) => {
      const code = String(r[PP5_CODE_COL] ?? '').trim();
      if (code) rowByCode.set(code, PP5_HEADER_ROWS + i);
    });

    let matchedCount = 0;
    const missing = [];
    students.forEach(s => {
      const code = String(s.code ?? '').trim();
      const rowIdx = rowByCode.get(code);
      if (rowIdx === undefined) { missing.push(`${s.firstName} ${s.lastName} (รหัส ${s.code || '-'})`); return; }
      matchedCount++;
      const sc = scores[s.id] || {};
      const { ratio } = computeStudentBucketRatios(sc, assessments);
      targetCols.forEach(col => {
        const value = Math.round((ratio[col.bucket] || 0) * col.max); // ปัดเป็นจำนวนเต็ม
        const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: col.colIndex });
        ws[cellRef] = { ...(ws[cellRef] || {}), t: 'n', v: value };
      });
    });

    if (matchedCount === 0) {
      showToast('ไม่พบนักเรียนที่จับคู่รหัสได้เลย ตรวจสอบไฟล์อีกครั้ง');
      return;
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    range.e.r = Math.max(range.e.r, PP5_HEADER_ROWS + dataRows.length - 1);
    ws['!ref'] = XLSX.utils.encode_range(range);

    XLSX.writeFile(wb, `ปพ5-${course.code || course.name}-ห้อง${section.room}.xlsx`);
    closeModal();
    showToast(`ส่งออกสำเร็จ ${matchedCount}/${students.length} คน${missing.length ? ` (ตกหล่น ${missing.length} คน)` : ''}`);
  });
}

// ==========================================================================
// แปลงคะแนน NextSchool — ส่งออกคะแนนเป็น 4 ช่วง:
//   เก็บก่อนกลางภาค 30 / กลางภาค 20 / เก็บหลังกลางภาค 30 / ปลายภาค 20 (รวม 100)
// แปลงเฉพาะไฟล์ที่ส่งออก ไม่แก้คะแนนจริงในระบบ และบังคับให้ "เกรด" หลังแปลง
// ตรงกับเกรดจริงของนักเรียนทุกคน (ถ้าปัดเศษแล้วเกรดเปลี่ยน จะปรับผลรวมให้เกรดคงเดิม)
// ==========================================================================

const NS_PARTS = [
  { key: 'before', label: 'เก็บก่อนกลางภาค', max: 30 },
  { key: 'mid',    label: 'กลางภาค',         max: 20 },
  { key: 'after',  label: 'เก็บหลังกลางภาค', max: 30 },
  { key: 'final',  label: 'ปลายภาค',         max: 20 },
];

// แบ่งผลรวม `total` (หน่วยเป็นจำนวนเต็ม) ให้ 4 ช่วง ตามสัดส่วน `ideal` โดยไม่เกินคะแนนเต็ม `caps`
// และรวมกันได้เท่ากับ total เป๊ะ (ปัดเศษแบบ largest remainder)
function nsAllocate(total, ideal, caps) {
  if (total <= 0) return ideal.map(() => 0);
  let base = ideal;
  let sumBase = base.reduce((a, b) => a + b, 0);
  if (sumBase <= 0) { base = caps; sumBase = caps.reduce((a, b) => a + b, 0); }
  let y = base.map(v => v * total / sumBase);
  for (let iter = 0; iter < 6; iter++) {
    let over = 0;
    y = y.map((v, i) => { if (v > caps[i]) { over += v - caps[i]; return caps[i]; } return v; });
    if (over < 1e-9) break;
    const room = y.reduce((s, v, i) => s + (caps[i] - v), 0);
    if (room <= 0) break;
    y = y.map((v, i) => v + over * (caps[i] - v) / room);
  }
  const f = y.map((v, i) => Math.min(caps[i], Math.floor(v + 1e-9)));
  let rem = total - f.reduce((a, b) => a + b, 0);
  const byFrac = y.map((v, i) => ({ i, frac: v - Math.floor(v + 1e-9) })).sort((a, b) => b.frac - a.frac);
  while (rem > 0) {
    let moved = false;
    for (const { i } of byFrac) {
      if (rem <= 0) break;
      if (f[i] < caps[i]) { f[i]++; rem--; moved = true; }
    }
    if (!moved) break;
  }
  while (rem < 0) { f[f.indexOf(Math.max(...f))]--; rem++; }
  return f;
}

// opts: { mode: 'order' | 'equal', splitN: จำนวนรายการคะแนนเก็บแรกที่นับเป็น "ก่อนกลางภาค", decimals: bool }
function computeNextSchoolRows(students, scores, assessments, gradeScale, opts) {
  const k = opts.decimals ? 10 : 1; // ทำงานเป็น "หน่วย" จำนวนเต็ม (1 หรือ 0.1 คะแนน) เพื่อกันเลขทศนิยมเพี้ยน
  const isMid = a => a.category === 'midterm';
  const isFinal = a => a.category === 'final';
  const collectItems = assessments.filter(a => !isMid(a) && !isFinal(a));
  const midItems = assessments.filter(isMid);
  const finalItems = assessments.filter(isFinal);
  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0) || 100;

  const useSplit = opts.mode === 'order' && collectItems.length >= 2;
  const n = Math.min(Math.max(1, Number(opts.splitN) || 1), Math.max(1, collectItems.length - 1));
  const beforeItems = useSplit ? collectItems.slice(0, n) : collectItems;
  const afterItems = useSplit ? collectItems.slice(n) : collectItems;

  const ratioOf = (items, sc) => {
    const mx = items.reduce((s, a) => s + (Number(a.max) || 0), 0);
    const got = items.reduce((s, a) => s + (Number(sc[a.id]) || 0), 0);
    return mx > 0 ? got / mx : 0;
  };
  const caps = NS_PARTS.map(p => p.max * k);

  return students.map(s => {
    const sc = scores[s.id] || {};
    const realTotal = assessments.reduce((sum, a) => sum + (Number(sc[a.id]) || 0), 0);
    const realGrade = calcGrade(realTotal, gradeScale);

    // เลือกผลรวมใหม่ (เต็ม 100) ที่ใกล้คะแนนจริงที่สุด โดยเกรดต้องเท่าเดิม: ลองปัดปกติ → ปัดลง → ปัดขึ้น → ลดลงอีก 1 หน่วย (กรณีเลขทศนิยมลอยติดขอบเกรด)
    const t = Number((realTotal * 100 / maxTotal * k).toFixed(6));
    let units = null;
    for (const c of [Math.round(t), Math.floor(t), Math.ceil(t), Math.floor(t) - 1]) {
      const cc = Math.max(0, Math.min(100 * k, c));
      if (calcGrade(cc / k, gradeScale) === realGrade) { units = cc; break; }
    }
    if (units === null) units = Math.max(0, Math.min(100 * k, Math.round(t)));

    const ideal = [
      ratioOf(beforeItems, sc) * 30,
      ratioOf(midItems, sc) * 20,
      ratioOf(afterItems, sc) * 30,
      ratioOf(finalItems, sc) * 20,
    ].map(v => v * k);
    const parts = nsAllocate(units, ideal, caps).map(v => v / k);
    const total = units / k;
    const grade = calcGrade(total, gradeScale);
    return { student: s, parts, total, grade, realTotal, realGrade, ok: grade === realGrade };
  });
}

function openNextSchoolModal(course, section, students, assessments, scores, gradeScale) {
  const collectItems = assessments.filter(a => a.category !== 'midterm' && a.category !== 'final');
  const canSplit = collectItems.length >= 2;
  const opts = { mode: canSplit ? 'order' : 'equal', splitN: Math.max(1, Math.ceil(collectItems.length / 2)), decimals: false };
  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0) || 100;

  openModal(`
    <h2>แปลงคะแนน SGS</h2>
    <div class="modal-sub">ห้อง ${escapeHtml(section.room)} — แปลงคะแนนเป็น <b>เก็บก่อนกลางภาค 30 · กลางภาค 20 · เก็บหลังกลางภาค 30 · ปลายภาค 20</b> (รวม 100) เฉพาะไฟล์ที่ส่งออก <b>คะแนนจริงในระบบไม่ถูกแก้</b> และเกรดหลังแปลงจะตรงกับเกรดจริงของทุกคน</div>
    <div class="field-row">
      <div class="field">
        <label>แบ่งคะแนนเก็บเป็นก่อน/หลังกลางภาค</label>
        <select id="ns-mode">
          <option value="order" ${canSplit ? '' : 'disabled'}>ตามลำดับรายการคะแนนเก็บ</option>
          <option value="equal">ใช้ % คะแนนเก็บเท่ากันทั้งสองช่วง</option>
        </select>
      </div>
      <div class="field" id="ns-n-field">
        <label>รายการที่ 1 ถึง N เป็น "ก่อนกลางภาค"</label>
        <input type="number" id="ns-n" min="1" max="${Math.max(1, collectItems.length - 1)}" value="${opts.splitN}">
      </div>
    </div>
    <div class="field">
      <label>รูปแบบตัวเลข</label>
      <select id="ns-dec">
        <option value="0">จำนวนเต็ม</option>
        <option value="1">ทศนิยม 1 ตำแหน่ง</option>
      </select>
      <div class="field-hint" id="ns-split-hint"></div>
    </div>
    <div id="ns-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="ns-cancel">ยกเลิก</button>
      <button class="btn btn-ghost" id="ns-csv">ส่งออก CSV</button>
      <button class="btn btn-primary" id="ns-xlsx">ส่งออก Excel</button>
    </div>
  `);
  document.querySelector('#modal-root .modal').classList.add('modal-wide');
  document.getElementById('ns-mode').value = opts.mode;

  let rows = [];

  function redrawSgsPreview() {
    document.getElementById('ns-n-field').classList.toggle('hidden', opts.mode !== 'order');
    const n = Math.min(Math.max(1, opts.splitN), Math.max(1, collectItems.length - 1));
    document.getElementById('ns-split-hint').textContent = opts.mode === 'order'
      ? `ก่อนกลางภาค: ${collectItems.slice(0, n).map(a => a.name).join(', ') || '-'}  |  หลังกลางภาค: ${collectItems.slice(n).map(a => a.name).join(', ') || '-'}`
      : 'คะแนนเก็บทั้งหมดถูกคิดเป็น % แล้วนำไปคูณ 30 ทั้งช่วงก่อนและหลังกลางภาค';

    rows = computeNextSchoolRows(students, scores, assessments, gradeScale, opts);
    const okCount = rows.filter(r => r.ok).length;
    const bodyEl = document.getElementById('ns-body');
    if (rows.length === 0) {
      bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ ห้องนี้ยังไม่มีนักเรียน</div></div>`;
      return;
    }
    bodyEl.innerHTML = `
      <div class="check-row ${okCount === rows.length ? 'ok' : 'warn'}">
        ${okCount === rows.length ? '✓' : '✕'} เกรดหลังแปลงตรงกับเกรดจริง ${okCount}/${rows.length} คน
      </div>
      ${maxTotal !== 100 ? `<div class="check-row warn">✕ คะแนนเต็มรวมของวิชานี้คือ ${maxTotal} (ไม่ใช่ 100) — ระบบปรับสัดส่วนเป็นเต็ม 100 ให้ แต่ควรตรวจเกรดก่อนอัปโหลด</div>` : ''}
      <div class="ns-table-wrap">
        <table class="ns-table">
          <thead><tr>
            <th>เลขที่</th><th class="ns-left">ชื่อ-นามสกุล</th>
            ${NS_PARTS.map(p => `<th>${p.label}<span>/${p.max}</span></th>`).join('')}
            <th>รวม<span>/100</span></th><th>เกรด</th><th>จริง (เกรดจริง)</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr class="${r.ok ? '' : 'ns-bad'}">
                <td>${escapeHtml(String(r.student.no ?? ''))}</td>
                <td class="ns-left">${escapeHtml(`${r.student.firstName || ''} ${r.student.lastName || ''}`.trim())}</td>
                ${r.parts.map(v => `<td>${fmt(v)}</td>`).join('')}
                <td><b>${fmt(r.total)}</b></td><td>${escapeHtml(String(r.grade))}</td>
                <td>${fmt(Number(r.realTotal.toFixed(2)))} (${escapeHtml(String(r.realGrade))})</td>
                <td>${r.ok ? '✓' : '✕'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function buildTable() {
    const header = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...NS_PARTS.map(p => `${p.label} (${p.max})`), 'รวม (100)', 'เกรด'];
    const body = rows.map(r => [r.student.no, r.student.code, r.student.firstName, r.student.lastName, ...r.parts, r.total, r.grade]);
    return [header, ...body];
  }
  function checkBeforeExport() {
    if (rows.length === 0) { showToast('ห้องนี้ยังไม่มีนักเรียน'); return false; }
    const bad = rows.filter(r => !r.ok).length;
    if (bad > 0) showToast(`คำเตือน: ${bad} คนเกรดหลังแปลงไม่ตรงกับเกรดจริง ตรวจสอบก่อนอัปโหลด`);
    return true;
  }

  document.getElementById('ns-mode').addEventListener('change', (e) => { opts.mode = e.target.value; redrawSgsPreview(); });
  document.getElementById('ns-n').addEventListener('input', (e) => { opts.splitN = Number(e.target.value) || 1; redrawSgsPreview(); });
  document.getElementById('ns-dec').addEventListener('change', (e) => { opts.decimals = e.target.value === '1'; redrawSgsPreview(); });
  document.getElementById('ns-cancel').addEventListener('click', closeModal);

  document.getElementById('ns-csv').addEventListener('click', () => {
    if (!checkBeforeExport()) return;
    downloadCsv(`SGS-${course.code || course.name}-ห้อง${section.room}.csv`, buildTable());
    showToast('ส่งออกไฟล์ CSV สำเร็จ');
  });
  document.getElementById('ns-xlsx').addEventListener('click', async () => {
    if (!checkBeforeExport()) return;
    try { await loadXLSX(); } catch (err) { showToast(err.message); return; }
    const ws = XLSX.utils.aoa_to_sheet(buildTable());
    ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 11 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SGS');
    XLSX.writeFile(wb, `SGS-${course.code || course.name}-ห้อง${section.room}.xlsx`);
    showToast('ส่งออกไฟล์ Excel สำเร็จ');
  });

  redrawSgsPreview();
}

// ==========================================================================
// แปลงคะแนน Next School — เอาคะแนนจาก "แปลงคะแนน SGS" (ก่อนกลางภาค 30 / กลางภาค 20 /
// หลังกลางภาค 30 / ปลายภาค 20) ไปใส่ในฟอร์ม Next School ที่โรงเรียนส่งมา
//   - กลางภาค/ปลายภาค ใช้ค่าจาก SGS ตรงๆ ไม่แก้
//   - คะแนนเก็บก่อน/หลังกลางภาค ที่ SGS รวมเป็นช่องเดียว จะถูกแบ่งลงหลายช่องตามฟอร์ม
//     (สัดส่วนตามคะแนนเต็มของแต่ละช่อง, ผลรวมเท่าเดิมเป๊ะ จึงไม่กระทบเกรด)
// ==========================================================================

function classifyNsFormBucket(label) {
  const s = String(label || '').replace(/\s+/g, '');
  if (s.includes('ปลาย')) return 'final';
  if (s.includes('ก่อน')) return 'before';
  if (s.includes('หลัง')) return 'after';
  if (s.includes('กลางภาค')) return 'mid';
  return null;
}

function parseNsFormColumns(aoa) {
  return parseFormColumns(aoa, { classify: classifyNsFormBucket });
}

// แบ่งคะแนนแต่ละช่วงของ SGS (parts เรียงตาม NS_PARTS) ลงคอลัมน์ของฟอร์ม → Map(colIndex → คะแนน)
function fillNsFormValues(parts, cols, k) {
  const out = new Map();
  NS_PARTS.forEach((p, i) => {
    const bcols = cols.filter(c => c.bucket === p.key);
    if (!bcols.length) return;
    const caps = bcols.map(c => c.max * k);
    const capSum = caps.reduce((a, b) => a + b, 0);
    // ถ้าคะแนนเต็มรวมของฟอร์มตรงกับ SGS (30/20/30/20) ค่าจะเท่าเดิมเป๊ะ ถ้าไม่ตรงจะปรับตามสัดส่วน
    const total = Math.min(capSum, Math.round(parts[i] / p.max * capSum));
    const ideal = caps.map(c => (capSum > 0 ? c * total / capSum : 0));
    const alloc = nsAllocate(total, ideal, caps);
    bcols.forEach((c, j) => out.set(c.colIndex, alloc[j] / k));
  });
  return out;
}

function openNextSchoolFormModal(course, section, students, assessments, scores, gradeScale) {
  const collectItems = assessments.filter(a => a.category !== 'midterm' && a.category !== 'final');
  const canSplit = collectItems.length >= 2;
  const opts = { mode: canSplit ? 'order' : 'equal', splitN: Math.max(1, Math.ceil(collectItems.length / 2)), decimals: false };

  openModal(`
    <h2>แปลงคะแนน Next School</h2>
    <div class="modal-sub">ห้อง ${escapeHtml(section.room)} — อัปโหลดไฟล์ฟอร์ม Next School ระบบจะนำคะแนนจาก <b>แปลงคะแนน SGS</b> (ก่อนกลางภาค 30 · กลางภาค 20 · หลังกลางภาค 30 · ปลายภาค 20) มาใส่ให้ โดย <b>กลางภาค/ปลายภาคไม่เปลี่ยน</b> ส่วนคะแนนเก็บจะถูกแบ่งลงแต่ละช่องตามฟอร์ม</div>
    <div class="field">
      <input type="file" id="nsf-file" accept=".xlsx,.xls">
      <div class="field-hint">ต้องเป็นไฟล์ต้นฉบับที่มีคอลัมน์ ID/รหัสนักเรียนอยู่แล้ว (A-E: ลำดับ/ID/รหัส/ชื่อ/ห้อง) ระบบเติมเฉพาะคอลัมน์คะแนน และจับคู่นักเรียนด้วยรหัส</div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>แบ่งคะแนนเก็บเป็นก่อน/หลังกลางภาค</label>
        <select id="nsf-mode">
          <option value="order" ${canSplit ? '' : 'disabled'}>ตามลำดับรายการคะแนนเก็บ</option>
          <option value="equal">ใช้ % คะแนนเก็บเท่ากันทั้งสองช่วง</option>
        </select>
      </div>
      <div class="field" id="nsf-n-field">
        <label>รายการที่ 1 ถึง N เป็น "ก่อนกลางภาค"</label>
        <input type="number" id="nsf-n" min="1" max="${Math.max(1, collectItems.length - 1)}" value="${opts.splitN}">
      </div>
    </div>
    <div class="field">
      <label>รูปแบบตัวเลข</label>
      <select id="nsf-dec">
        <option value="0">จำนวนเต็ม</option>
        <option value="1">ทศนิยม 1 ตำแหน่ง</option>
      </select>
    </div>
    <div id="nsf-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="nsf-cancel">ยกเลิก</button>
      <button class="btn btn-primary hidden" id="nsf-confirm">ส่งออกไฟล์</button>
    </div>
  `);
  document.querySelector('#modal-root .modal').classList.add('modal-wide');
  document.getElementById('nsf-mode').value = opts.mode;
  document.getElementById('nsf-cancel').addEventListener('click', closeModal);

  let wb = null, ws = null, aoa = null, cols = [], rows = [];

  function rowIndexByCode() {
    const map = new Map();
    aoa.slice(PP5_HEADER_ROWS).forEach((r, i) => {
      const code = String(r[PP5_CODE_COL] ?? '').trim();
      if (code) map.set(code, PP5_HEADER_ROWS + i);
    });
    return map;
  }

  function redrawFormPreview() {
    document.getElementById('nsf-n-field').classList.toggle('hidden', opts.mode !== 'order');
    const bodyEl = document.getElementById('nsf-body');
    const confirmBtn = document.getElementById('nsf-confirm');
    if (!aoa) return;

    const usable = cols.filter(c => c.bucket);
    const unknown = cols.filter(c => !c.bucket);
    if (usable.length === 0) {
      confirmBtn.classList.add('hidden');
      bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านโครงสร้างคอลัมน์คะแนนจากไฟล์นี้ไม่ได้ (แถวที่ 1 ต้องมีชื่อกลุ่ม เช่น ก่อนกลางภาค / กลางภาค / หลังกลางภาค / ปลายภาค และแถวที่ 4 ต้องมีคะแนนเต็ม)</div></div>`;
      return;
    }
    if (students.length === 0) {
      confirmBtn.classList.add('hidden');
      bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ ห้องนี้ยังไม่มีนักเรียน</div></div>`;
      return;
    }

    rows = computeNextSchoolRows(students, scores, assessments, gradeScale, opts);
    const k = opts.decimals ? 10 : 1;
    const byCode = rowIndexByCode();
    const matched = rows.filter(r => byCode.has(String(r.student.code ?? '').trim()));
    const missing = rows.filter(r => !byCode.has(String(r.student.code ?? '').trim()));

    // ตรวจคะแนนเต็มรวมของแต่ละช่วงในฟอร์มเทียบกับ SGS
    const mism = NS_PARTS.map(p => {
      const bc = usable.filter(c => c.bucket === p.key);
      const sum = bc.reduce((s, c) => s + c.max, 0);
      return { p, sum, has: bc.length > 0 };
    }).filter(x => x.sum !== x.p.max);

    const filled = rows.map(r => ({ r, vals: fillNsFormValues(r.parts, usable, k) }));
    const gradeOk = rows.filter(r => r.ok).length;

    bodyEl.innerHTML = `
      <div class="card card-pad" style="margin:12px 0;">
        <div class="check-row ok">✓ พบคอลัมน์คะแนนในฟอร์ม ${usable.length} คอลัมน์</div>
        ${mism.length === 0
          ? `<div class="check-row ok" style="margin-top:6px;">✓ คะแนนเต็มแต่ละช่วงในฟอร์มตรงกับ SGS (30/20/30/20) — ผลรวมของแต่ละช่วงเท่ากับที่ SGS แปลงไว้</div>`
          : `<div class="check-row warn" style="margin-top:6px;">✕ คะแนนเต็มในฟอร์มไม่ตรงกับ SGS: ${mism.map(x => `${x.p.label} (ฟอร์ม ${x.has ? x.sum : 'ไม่มีคอลัมน์'} / SGS ${x.p.max})`).join(', ')} — ระบบปรับตามสัดส่วนให้ แต่ควรตรวจเกรดก่อนอัปโหลด</div>`}
        ${unknown.length ? `<div class="check-row warn" style="margin-top:6px;">✕ ข้ามคอลัมน์ที่ระบุช่วงไม่ได้: ${unknown.map(c => escapeHtml(`${c.group || '(ไม่มีชื่อกลุ่ม)'} ${c.order}`)).join(', ')}</div>` : ''}
        <div class="check-row ${matched.length === rows.length ? 'ok' : 'warn'}" style="margin-top:6px;">${matched.length === rows.length ? '✓' : '✕'} จับคู่รหัสนักเรียนได้ ${matched.length}/${rows.length} คน</div>
        ${missing.length ? `<div style="font-size:12.5px; color:var(--ink-soft); margin-top:6px;">ไม่พบรหัสในฟอร์ม (จะไม่ถูกส่งออก): ${missing.map(r => escapeHtml(`${r.student.firstName} ${r.student.lastName} (รหัส ${r.student.code || '-'})`)).join(', ')}</div>` : ''}
        <div class="check-row ${gradeOk === rows.length ? 'ok' : 'warn'}" style="margin-top:6px;">${gradeOk === rows.length ? '✓' : '✕'} เกรดหลังแปลงตรงกับเกรดจริง ${gradeOk}/${rows.length} คน</div>
      </div>
      <div class="ns-table-wrap">
        <table class="ns-table">
          <thead><tr>
            <th>เลขที่</th><th class="ns-left">ชื่อ-นามสกุล</th>
            ${usable.map(c => `<th>${escapeHtml(c.group)} ${escapeHtml(String(c.order))}<span>/${fmt(c.max)}</span></th>`).join('')}
            <th>รวม<span>/100</span></th><th>เกรด</th><th></th>
          </tr></thead>
          <tbody>
            ${filled.map(({ r, vals }) => `
              <tr class="${r.ok ? '' : 'ns-bad'}">
                <td>${escapeHtml(String(r.student.no ?? ''))}</td>
                <td class="ns-left">${escapeHtml(`${r.student.firstName || ''} ${r.student.lastName || ''}`.trim())}</td>
                ${usable.map(c => `<td>${fmt(vals.get(c.colIndex) ?? 0)}</td>`).join('')}
                <td><b>${fmt(r.total)}</b></td><td>${escapeHtml(String(r.grade))}</td><td>${r.ok ? '✓' : '✕'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    confirmBtn.classList.toggle('hidden', matched.length === 0);
  }

  document.getElementById('nsf-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const bodyEl = document.getElementById('nsf-body');
    document.getElementById('nsf-confirm').classList.add('hidden');
    wb = ws = aoa = null; cols = [];
    if (!file) { bodyEl.innerHTML = ''; return; }
    bodyEl.innerHTML = `<div class="empty-state">กำลังอ่านไฟล์...</div>`;
    try {
      await loadXLSX();
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      ws = wb.Sheets[wb.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      cols = parseNsFormColumns(aoa);
      redrawFormPreview();
    } catch (err) {
      wb = ws = aoa = null;
      bodyEl.innerHTML = `<div class="card card-pad"><div class="check-row warn">✕ อ่านไฟล์ไม่สำเร็จ: ${escapeHtml(err.message || String(err))}</div></div>`;
    }
  });
  document.getElementById('nsf-mode').addEventListener('change', (e) => { opts.mode = e.target.value; redrawFormPreview(); });
  document.getElementById('nsf-n').addEventListener('input', (e) => { opts.splitN = Number(e.target.value) || 1; redrawFormPreview(); });
  document.getElementById('nsf-dec').addEventListener('change', (e) => { opts.decimals = e.target.value === '1'; redrawFormPreview(); });

  document.getElementById('nsf-confirm').addEventListener('click', () => {
    if (!wb || !ws || !aoa) { showToast('กรุณาอัปโหลดไฟล์ก่อน'); return; } // XLSX โหลดแล้วตอนอ่านไฟล์
    const usable = cols.filter(c => c.bucket);
    const k = opts.decimals ? 10 : 1;
    const byCode = rowIndexByCode();
    let matchedCount = 0;
    rows.forEach(r => {
      const rowIdx = byCode.get(String(r.student.code ?? '').trim());
      if (rowIdx === undefined) return;
      matchedCount++;
      fillNsFormValues(r.parts, usable, k).forEach((v, colIndex) => {
        const ref = XLSX.utils.encode_cell({ r: rowIdx, c: colIndex });
        const cell = { t: 'n', v };
        if (ws[ref] && ws[ref].s) cell.s = ws[ref].s;
        ws[ref] = cell;
      });
    });
    if (matchedCount === 0) { showToast('ไม่พบนักเรียนที่จับคู่รหัสได้เลย ตรวจสอบไฟล์อีกครั้ง'); return; }
    const bad = rows.filter(r => !r.ok).length;
    XLSX.writeFile(wb, `NextSchool-${course.code || course.name}-ห้อง${section.room}.xlsx`);
    closeModal();
    showToast(`ส่งออกสำเร็จ ${matchedCount}/${rows.length} คน${rows.length - matchedCount ? ` (ตกหล่น ${rows.length - matchedCount} คน)` : ''}${bad ? ` — เกรดไม่ตรง ${bad} คน` : ''}`);
  });
}

function openGradeScaleModal(course, section, scale) {
  let rows = scale.map(r => ({ ...r }));
  function draw() {
    openModal(`
      <h2>ตั้งเกณฑ์เกรด</h2>
      <div class="modal-sub">กำหนดเกรดและคะแนนขั้นต่ำของแต่ละเกรด — ใช้ร่วมกันทุกห้องในวิชานี้</div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;" id="scale-rows">
        ${rows.map((r, idx) => `
          <div style="display:flex; gap:8px; align-items:center;">
            <input class="scale-grade" data-idx="${idx}" value="${escapeHtml(r.grade)}" style="width:70px; padding:7px; border:1px solid var(--border); border-radius:6px;">
            <span style="font-size:13px; color:var(--ink-soft);">คะแนนขั้นต่ำ</span>
            <input class="scale-min" type="number" data-idx="${idx}" value="${r.min}" style="width:80px; padding:7px; border:1px solid var(--border); border-radius:6px;">
            <button class="btn btn-danger-ghost btn-sm del-scale-row" data-idx="${idx}">ลบ</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="add-scale-row">+ เพิ่มระดับเกรด</button>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancel-scale">ยกเลิก</button>
        <button class="btn btn-primary" id="save-scale">บันทึกเกณฑ์เกรด</button>
      </div>
    `);
    document.querySelectorAll('.scale-grade').forEach(i => i.addEventListener('input', () => { rows[i.dataset.idx].grade = i.value; }));
    document.querySelectorAll('.scale-min').forEach(i => i.addEventListener('input', () => { rows[i.dataset.idx].min = Number(i.value); }));
    document.querySelectorAll('.del-scale-row').forEach(b => b.addEventListener('click', () => { rows.splice(b.dataset.idx, 1); draw(); }));
    document.getElementById('add-scale-row').addEventListener('click', () => { rows.push({ grade: '', min: 0 }); draw(); });
    document.getElementById('cancel-scale').addEventListener('click', closeModal);
    document.getElementById('save-scale').addEventListener('click', async () => {
      await db.collection('users').doc(AppState.user.uid).collection('courses').doc(course.id)
        .collection('settings').doc('grading').set({ scale: rows });
      invalidateCourseData(course.id);
      closeModal();
      showToast('บันทึกเกณฑ์เกรดสำเร็จ');
      renderReportTab(document.getElementById('course-tab-body'), course, section);
    });
  }
  draw();
}
