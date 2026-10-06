// ==========================================================================
// Score entry: spreadsheet-style grid, grouped columns, autosave
// โครงสร้างคะแนน (assessments) ใช้ร่วมกันทุกห้องของวิชานี้
// นักเรียน/คะแนนจริง แยกตามห้อง (section)
// ==========================================================================

async function renderScoresTab(container, course, section) {
  container.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  const uid = AppState.user.uid;
  const courseBase = db.collection('users').doc(uid).collection('courses').doc(course.id);
  const secBase = sectionRef(uid, course.id, section.id);

  const [studentsSnap, assessSnap, scoresSnap, gradingDoc, structDoc] = await Promise.all([
    secBase.collection('students').orderBy('no', 'asc').get(),
    courseBase.collection('assessments').orderBy('order', 'asc').get(),
    secBase.collection('scores').get(),
    courseBase.collection('settings').doc('grading').get(),
    courseBase.collection('settings').doc('structure').get(),
  ]);

  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  students.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  const assessments = assessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const scores = {};
  scoresSnap.docs.forEach(d => { scores[d.id] = d.data(); });
  const gradeScale = gradingDoc.exists ? gradingDoc.data().scale : DEFAULT_GRADE_SCALE;

  // หมวดหมู่หลักของคะแนนเก็บ (ตั้งไว้ที่หน้าโครงสร้างคะแนน) — ใช้จัดกลุ่มคอลัมน์ให้ดูคะแนนง่ายขึ้น
  const groups = structDoc.exists ? (structDoc.data().groups || []) : [];
  const groupIndex = (gid) => groups.findIndex(g => g.id === gid); // -1 = ยังไม่จัดหมวด
  const collectItems = assessments.filter(a => a.category === 'collect')
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (groupIndex(x.a.groupId) - groupIndex(y.a.groupId)) || (x.i - y.i))
    .map(x => x.a);
  const hasGroups = groups.length > 0 && collectItems.length > 0;
  const collectRuns = [];
  if (hasGroups) {
    const loose = collectItems.filter(a => groupIndex(a.groupId) < 0);
    if (loose.length) collectRuns.push({ gid: '', name: 'ยังไม่จัดหมวด', items: loose });
    groups.forEach(g => {
      const items = collectItems.filter(a => a.groupId === g.id);
      if (items.length) collectRuns.push({ gid: g.id, name: g.name, items });
    });
  }
  const runMax = (r) => r.items.reduce((s, a) => s + (Number(a.max) || 0), 0);
  const midItems = assessments.filter(a => a.category === 'midterm');
  const finalItems = assessments.filter(a => a.category === 'final');
  const collectMax = collectItems.reduce((s, a) => s + (Number(a.max) || 0), 0);
  const maxTotal = assessments.reduce((s, a) => s + (Number(a.max) || 0), 0);

  if (assessments.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">${icon('sliders')}</div>กรุณากำหนดโครงสร้างคะแนนของวิชานี้ก่อนเริ่มบันทึกคะแนน</div></div>`;
    return;
  }
  if (students.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">${icon('user')}</div>กรุณาเพิ่มรายชื่อนักเรียนในห้อง ${escapeHtml(section.room)} ก่อนเริ่มบันทึกคะแนน</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="badge badge-neutral u-fs-13 u-pad-6-12">ห้อง ${escapeHtml(section.room)}</span>
        <div class="search-box"><input id="student-search" placeholder="ค้นหานักเรียน..."></div>
      </div>
      <div class="save-status" id="save-status"><span class="dot"></span> บันทึกอัตโนมัติแล้ว</div>
    </div>

    <div class="sheet-legend">
      ${collectItems.length ? `<span class="lg-item"><span class="lg-dot collect"></span>คะแนนเก็บ</span>` : ''}
      ${midItems.length ? `<span class="lg-item"><span class="lg-dot mid"></span>กลางภาค</span>` : ''}
      ${finalItems.length ? `<span class="lg-item"><span class="lg-dot final"></span>ปลายภาค</span>` : ''}
    </div>
    <div class="sheet-scroll-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>
      เลื่อนซ้าย-ขวาเพื่อดูคะแนนทั้งหมด — ชื่อนักเรียนและคะแนนรวมจะติดหน้าจอไว้เสมอ
    </div>

    <div class="sheet-wrap">
      <table class="sheet" id="score-sheet">
        <thead>
          ${hasGroups ? `
          <tr>
            <th rowspan="3" class="sticky-col-1">เลขที่</th>
            <th rowspan="3" class="sticky-col-2">รหัส</th>
            <th rowspan="3" class="sticky-col-3 u-text-left">นักเรียน</th>
            <th class="grp-label grp-collect" colspan="${collectItems.length + collectRuns.length + 1}">คะแนนเก็บ</th>
            ${midItems.length ? `<th class="grp-label grp-mid" rowspan="2" colspan="${midItems.length}">กลางภาค</th>` : ''}
            ${finalItems.length ? `<th class="grp-label grp-final" rowspan="2" colspan="${finalItems.length}">ปลายภาค</th>` : ''}
            <th rowspan="3" class="sticky-right-1">รวม<span class="max">/${maxTotal}</span></th>
            <th rowspan="3" class="sticky-right-2">เกรด</th>
          </tr>
          <tr>
            ${collectRuns.map(r => `<th class="grp-sub" colspan="${r.items.length + 1}">${escapeHtml(r.name)}</th>`).join('')}
            <th rowspan="2" class="grp-collect-total">รวมเก็บ<span class="max">/${collectMax}</span></th>
          </tr>
          <tr>
            ${collectRuns.map(r => r.items.map(a => `<th class="grp-collect">${escapeHtml(a.name)}<span class="max">/${a.max}</span></th>`).join('')
              + `<th class="grp-sub-total">รวม<span class="max">/${runMax(r)}</span></th>`).join('')}
            ${midItems.map(a => `<th class="grp-mid">${escapeHtml(a.name)}<span class="max">/${a.max}</span></th>`).join('')}
            ${finalItems.map(a => `<th class="grp-final">${escapeHtml(a.name)}<span class="max">/${a.max}</span></th>`).join('')}
          </tr>
          ` : `
          <tr>
            <th rowspan="2" class="sticky-col-1">เลขที่</th>
            <th rowspan="2" class="sticky-col-2">รหัส</th>
            <th rowspan="2" class="sticky-col-3 u-text-left">นักเรียน</th>
            ${collectItems.length ? `<th class="grp-label grp-collect" colspan="${collectItems.length + 1}">คะแนนเก็บ</th>` : ''}
            ${midItems.length ? `<th class="grp-label grp-mid" colspan="${midItems.length}">กลางภาค</th>` : ''}
            ${finalItems.length ? `<th class="grp-label grp-final" colspan="${finalItems.length}">ปลายภาค</th>` : ''}
            <th rowspan="2" class="sticky-right-1">รวม<span class="max">/${maxTotal}</span></th>
            <th rowspan="2" class="sticky-right-2">เกรด</th>
          </tr>
          <tr>
            ${collectItems.map(a => `<th class="grp-collect">${escapeHtml(a.name)}<span class="max">/${a.max}</span></th>`).join('')}
            ${collectItems.length ? `<th class="grp-collect-total">รวมเก็บ<span class="max">/${collectMax}</span></th>` : ''}
            ${midItems.map(a => `<th class="grp-mid">${escapeHtml(a.name)}<span class="max">/${a.max}</span></th>`).join('')}
            ${finalItems.map(a => `<th class="grp-final">${escapeHtml(a.name)}<span class="max">/${a.max}</span></th>`).join('')}
          </tr>
          `}
        </thead>
        <tbody id="score-tbody">
          ${students.map(s => renderScoreRow(s, collectItems, midItems, finalItems, scores[s.id] || {}, collectMax, maxTotal, gradeScale, hasGroups ? collectRuns : null)).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('student-search').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#score-tbody tr').forEach(row => {
      const text = row.dataset.searchtext || '';
      row.classList.toggle('hidden', !text.includes(q));
    });
  }, 150));

  wireScoreInputs(container, course, section, students, collectItems, midItems, finalItems, scores, collectMax, maxTotal, gradeScale, groups);
}

function gradeBadgeClass(grade) {
  const val = parseFloat(grade);
  if (isNaN(val)) return 'badge-neutral';
  if (val >= 3) return 'badge-grade-good';
  if (val >= 2) return 'badge-grade-mid';
  return 'badge-grade-low';
}

function renderScoreRow(student, collectItems, midItems, finalItems, studentScores, collectMax, maxTotal, gradeScale, collectRuns) {
  const collectSum = roundScore(collectItems.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0));
  const midSum = roundScore(midItems.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0));
  const finalSum = roundScore(finalItems.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0));
  const total = roundScore(collectSum + midSum + finalSum);
  const grade = calcGrade(total, gradeScale);
  const searchText = `${student.no} ${student.code} ${student.firstName} ${student.lastName}`.toLowerCase();

  const cellFor = (a) => `
    <td class="grp-${a.category === 'collect' ? 'collect' : a.category === 'midterm' ? 'mid' : 'final'}" data-assessment-id="${a.id}">
      <input class="score-input" type="text" inputmode="decimal" autocomplete="off" placeholder="–"
             value="${studentScores[a.id] ?? ''}"
             data-student-id="${student.id}" data-assessment-id="${a.id}" data-max="${a.max}">
    </td>`;

  return `
    <tr data-student-id="${student.id}" data-searchtext="${escapeHtml(searchText)}">
      <td class="name-cell no-cell sticky-col-1">${escapeHtml(student.no)}</td>
      <td class="name-cell code-cell sticky-col-2">${escapeHtml(student.code || '–')}</td>
      <td class="name-cell sticky-col-3" title="${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</td>
      ${collectRuns
        ? collectRuns.map(r => r.items.map(cellFor).join('')
            + `<td class="total-cell grp-sub-total" data-group-sum="${r.gid}" data-student-id="${student.id}">${roundScore(r.items.reduce((s, a) => s + (Number(studentScores[a.id]) || 0), 0))}</td>`).join('')
        : collectItems.map(cellFor).join('')}
      <td class="total-cell grp-collect-total" data-collect-for="${student.id}">${collectSum}</td>
      ${midItems.map(cellFor).join('')}
      ${finalItems.map(cellFor).join('')}
      <td class="total-cell sticky-right-1" data-total-for="${student.id}">${total}</td>
      <td class="total-cell sticky-right-2" data-grade-for="${student.id}"><span class="badge ${gradeBadgeClass(grade)}">${grade}</span></td>
    </tr>
  `;
}

// แปลงข้อความในช่องคะแนนเป็นตัวเลข — คืน null เมื่อว่าง/ยังพิมพ์ไม่เสร็จ (เช่น ".") หรือไม่ใช่ตัวเลขปกติ
// null = "ยังไม่กรอก" (ลบฟิลด์ออกจากฐานข้อมูล) ต่างจาก 0 = "ได้ศูนย์คะแนน"
function parseScore(raw) {
  const t = String(raw ?? '').trim();
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function wireScoreInputs(container, course, section, students, collectItems, midItems, finalItems, scores, collectMax, maxTotal, gradeScale, groups) {
  const uid = AppState.user.uid;
  const base = sectionRef(uid, course.id, section.id);
  const statusEl = document.getElementById('save-status');
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');

  // debounce แยกอิสระ "ต่อช่อง" (คีย์ = นักเรียน+รายการคะแนน) ไม่ให้ช่องอื่นมาตัดหน้ากัน
  const pendingSaves = new Map(); // key -> { timer, item }  รอครบ 500ms
  const latestSeq = new Map();    // key -> ลำดับการแก้ล่าสุด กันค่าเก่าทับค่าใหม่ตอน retry
  const failed = new Map();       // key -> item ที่บันทึกไม่สำเร็จหลัง retry ครบ
  let pendingCount = 0;           // จำนวนช่องที่ยังรอ/กำลังบันทึก/กำลัง retry
  let seqCounter = 0;
  const MAX_RETRY = 4;            // ลองซ้ำ 4 ครั้ง หน่วง 1.5s, 3s, 6s, 12s

  let islandState = 'saved'; // สถานะล่าสุดที่ส่งให้ Dynamic Island (ส่งเฉพาะตอนเปลี่ยน ไม่รัวทุกตัวอักษร)
  function syncIsland() {
    let st = failed.size > 0 ? 'error' : (pendingCount > 0 ? 'saving' : 'saved');
    if (st === 'saving' && navigator.onLine === false) { islandState = 'saving'; return; } // ออฟไลน์: แคปซูลแสดงสถานะออฟไลน์อยู่แล้ว
    if (st === islandState) return;
    islandState = st;
    islandSave(st, { count: failed.size, retry: retryFailed });
  }

  function renderStatus() {
    syncIsland();
    statusEl.classList.toggle('saving', failed.size === 0 && pendingCount > 0);
    statusEl.classList.toggle('is-clickable', failed.size > 0);
    if (failed.size > 0) {
      statusEl.innerHTML = `<span class="dot dot-danger"></span> บันทึกไม่สำเร็จ ${failed.size} ช่อง — แตะเพื่อลองใหม่`;
    } else if (pendingCount > 0) {
      statusEl.innerHTML = navigator.onLine === false
        ? `<span class="dot dot-danger"></span> ออฟไลน์ — ยังไม่ได้บันทึก (อย่าปิดหน้านี้)`
        : `<span class="dot"></span> กำลังบันทึก...`;
    } else {
      statusEl.innerHTML = `<span class="dot"></span> บันทึกแล้ว`;
    }
  }

  async function runSave(item, attempt = 0) {
    const done = () => { pendingCount = Math.max(0, pendingCount - 1); renderStatus(); };
    // มีการแก้ช่องเดิมซ้ำหลังจากนี้แล้ว: ไม่ต้องเขียนค่าเก่า
    if (attempt > 0 && latestSeq.get(item.key) !== item.seq) return done();
    const payload = item.value === null ? firebase.firestore.FieldValue.delete() : item.value;
    try {
      await base.collection('scores').doc(item.studentId).set({ [item.assessmentId]: payload }, { merge: true });
      invalidateCourseData(course.id); // หน้าแรก/รายงานต้องโหลดวิชานี้ใหม่
    } catch (err) {
      console.error(err);
      if (latestSeq.get(item.key) !== item.seq) return done();
      if (attempt < MAX_RETRY) {
        renderStatus();
        setTimeout(() => runSave(item, attempt + 1), 1500 * 2 ** attempt);
        return;
      }
      pendingCount = Math.max(0, pendingCount - 1);
      failed.set(item.key, item);
      renderStatus();
      return;
    }
    done();
  }

  function retryFailed() {
    const items = [...failed.values()];
    failed.clear();
    items.forEach(it => { pendingCount++; runSave(it); });
    renderStatus();
  }
  statusEl.addEventListener('click', () => { if (failed.size > 0) retryFailed(); });

  // value: ตัวเลข หรือ null (= ล้างช่อง)
  function saveCell(studentId, assessmentId, value) {
    const key = `${studentId}:${assessmentId}`;
    const item = { key, studentId, assessmentId, value, seq: ++seqCounter };
    latestSeq.set(key, item.seq);
    failed.delete(key);
    const existing = pendingSaves.get(key);
    if (existing) clearTimeout(existing.timer); else pendingCount++;
    const timer = setTimeout(() => {
      pendingSaves.delete(key);
      runSave(item);
    }, 500);
    pendingSaves.set(key, { timer, item });
    renderStatus();
  }

  // บันทึกทันทีทุกช่องที่ยังค้างอยู่ (ไม่รอ debounce) — เรียกก่อนสลับแท็บ/ออกจากหน้านี้
  // ใช้ค่าที่เก็บไว้ในคิว ไม่อ่านจาก DOM จึงไม่หลุดแม้หน้าถูกวาดใหม่ไปแล้ว
  function flushPendingSaves() {
    const items = [...pendingSaves.values()].map(p => { clearTimeout(p.timer); return p.item; });
    pendingSaves.clear();
    items.forEach(item => runSave(item));
  }
  AppState.flushScoreSaves = flushPendingSaves;

  // ผูก listener ระดับ window ครั้งเดียวต่อการเปิดหน้านี้ (ถอดของเดิมออกก่อน กันซ้อนทุกครั้งที่วาดหน้าใหม่)
  if (AppState._scoreBeforeUnload) window.removeEventListener('beforeunload', AppState._scoreBeforeUnload);
  if (AppState._scoreNetChange) { window.removeEventListener('online', AppState._scoreNetChange); window.removeEventListener('offline', AppState._scoreNetChange); }
  AppState._scoreBeforeUnload = (e) => {
    flushPendingSaves();
    // เตือนก่อนปิดหน้าเมื่อมีคะแนนที่ยังไม่ถึงเซิร์ฟเวอร์จริง ๆ (บันทึกพลาด หรือออฟไลน์อยู่)
    if (failed.size > 0 || (pendingCount > 0 && navigator.onLine === false)) { e.preventDefault(); e.returnValue = ''; }
  };
  AppState._scoreNetChange = () => { if (navigator.onLine !== false && failed.size > 0) retryFailed(); else renderStatus(); };
  window.addEventListener('beforeunload', AppState._scoreBeforeUnload);
  window.addEventListener('online', AppState._scoreNetChange);
  window.addEventListener('offline', AppState._scoreNetChange);

  // รหัสรายการคะแนนเก็บ -> รหัสหมวดหมู่ ('' = ยังไม่จัดหมวด) ใช้รวมคะแนนรายหมวด
  const groupIdSet = new Set(groups.map(g => g.id));
  const collectGroupOf = new Map(collectItems.map(a => [a.id, groupIdSet.has(a.groupId) ? a.groupId : '']));

  function recalcRow(studentId) {
    const row = container.querySelector(`tr[data-student-id="${studentId}"]`);
    let collectSum = 0, total = 0;
    const groupSums = {};
    row.querySelectorAll('.score-input').forEach(inp => {
      const val = parseScore(inp.value) || 0;
      total += val;
      if (collectGroupOf.has(inp.dataset.assessmentId)) {
        collectSum += val;
        const gid = collectGroupOf.get(inp.dataset.assessmentId);
        groupSums[gid] = (groupSums[gid] || 0) + val;
      }
    });
    row.querySelectorAll('[data-group-sum]').forEach(td => { td.textContent = roundScore(groupSums[td.dataset.groupSum] || 0); });
    row.querySelector(`[data-collect-for="${studentId}"]`).textContent = roundScore(collectSum);
    total = roundScore(total);
    row.querySelector(`[data-total-for="${studentId}"]`).textContent = total;
    const grade = calcGrade(total, gradeScale);
    row.querySelector(`[data-grade-for="${studentId}"]`).innerHTML = `<span class="badge ${gradeBadgeClass(grade)}">${grade}</span>`;
  }

  const inputs = [...container.querySelectorAll('.score-input')];

  inputs.forEach((inp) => {
    inp.addEventListener('input', () => {
      // กรองให้พิมพ์ได้เฉพาะตัวเลข (และจุดทศนิยม 1 จุด)
      const cleaned = inp.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      if (cleaned !== inp.value) inp.value = cleaned;

      // คะแนนเกินคะแนนเต็มไม่ถูกบันทึก: ปรับเป็นคะแนนเต็มและแจ้งเตือน (ถ้าตั้งใจให้โบนัส ให้เพิ่มคะแนนเต็มที่หน้าโครงสร้างวิชา)
      const max = Number(inp.dataset.max);
      let val = parseScore(inp.value);
      if (val !== null && max > 0 && val > max) {
        val = max;
        inp.value = String(max);
        showToast(`คะแนนเกินคะแนนเต็ม (${max}) ปรับเป็น ${max} ให้แล้ว`);
      }
      inp.closest('td').classList.remove('over-max');
      recalcRow(inp.dataset.studentId);
      if (inp.value === '.') return; // กำลังพิมพ์ทศนิยม ยังไม่บันทึก รอตัวเลขถัดไป
      saveCell(inp.dataset.studentId, inp.dataset.assessmentId, val);
    });

    inp.addEventListener('keydown', (e) => {
      const row = inp.closest('tr');
      const cellsInRow = [...row.querySelectorAll('.score-input')];
      const colIndex = cellsInRow.indexOf(inp);
      const rows = () => [...container.querySelectorAll('#score-tbody tr')].filter(r => !r.classList.contains('hidden'));

      if (e.key === 'Enter') {
        e.preventDefault();
        const rs = rows(); const rowIndex = rs.indexOf(row);
        rs[rowIndex + 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
        cellsInRow[colIndex + 1]?.focus();
      } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
        cellsInRow[colIndex - 1]?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const rs = rows(); const rowIndex = rs.indexOf(row);
        rs[rowIndex + 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const rs = rows(); const rowIndex = rs.indexOf(row);
        rs[rowIndex - 1]?.querySelectorAll('.score-input')[colIndex]?.focus();
      }
    });

    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text.includes('\t') && !text.includes('\n')) return;
      e.preventDefault();
      // keepBlank: แถวว่าง/ช่องว่างต้องคงตำแหน่งไว้ ไม่งั้นคะแนนเลื่อนไปผิดคน
      const grid = parseDelimitedText(text, { keepBlank: true });
      const row = inp.closest('tr');
      const startColIdx = [...row.querySelectorAll('.score-input')].indexOf(inp);
      const rows = [...container.querySelectorAll('#score-tbody tr')].filter(r => !r.classList.contains('hidden'));
      const startRowIdx = rows.indexOf(row);
      let clamped = 0;

      grid.forEach((rowVals, rOff) => {
        const targetRow = rows[startRowIdx + rOff];
        if (!targetRow) return;
        const targetInputs = [...targetRow.querySelectorAll('.score-input')];
        rowVals.forEach((cell, cOff) => {
          const targetInp = targetInputs[startColIdx + cOff];
          if (!targetInp) return;
          const raw = String(cell).trim();
          // ช่องว่าง = ล้างช่อง (เหมือนวางใน Excel) · ข้อความที่ไม่ใช่ตัวเลข (เช่น หัวตาราง) = ข้าม ไม่แตะช่องนั้น
          let val = raw === '' ? null : Number(raw);
          if (val !== null && !(Number.isFinite(val) && val >= 0)) return;
          const max = Number(targetInp.dataset.max);
          if (val !== null && max > 0 && val > max) { val = max; clamped++; }
          targetInp.value = val === null ? '' : String(val);
          targetInp.closest('td').classList.remove('over-max');
          recalcRow(targetInp.dataset.studentId);
          saveCell(targetInp.dataset.studentId, targetInp.dataset.assessmentId, val);
        });
      });
      if (clamped) showToast(`มี ${clamped} ช่องที่คะแนนเกินคะแนนเต็ม ปรับเป็นคะแนนเต็มให้แล้ว`);
    });
  });
}
