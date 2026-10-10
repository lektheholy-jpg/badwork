// ==========================================================================
// Utils: toast, modal, csv parsing, debounce, grade calculation, mobile nav
// ==========================================================================

// ป้องกันค่าตัวเลข (คะแนน/คะแนนเต็ม/เกณฑ์เกรด ฯลฯ) เปลี่ยนโดยไม่ตั้งใจจากการเลื่อนเมาส์ (scroll wheel)
// ขณะเคอร์เซอร์อยู่ในช่อง input type="number" — ใช้ event delegation ครอบคลุมทุกหน้าในระบบ
document.addEventListener('wheel', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number' && document.activeElement === e.target) {
    e.preventDefault();
  }
}, { passive: false });

// แจ้งเตือน/สถานะแบบ Dynamic Island (showToast, islandSave, islandUndo, islandProgress) อยู่ที่ js/island.js

// ป๊อปอัปเป็น "ชั้น" ในประวัติ (js/nav-history.js): กดย้อนกลับของระบบ = ปิดป๊อปอัป ไม่ใช่ออกจากหน้า
//   ปิดแบบย่อ+จางออก ~0.15 วินาทีแล้วค่อยลบ DOM (class .closing ใน css/style.css) — ไม่กระทบชั้นใน NavHistory เพราะปล่อยชั้นทันทีตอนสั่งปิด
//   ผู้ใช้ตั้ง reduced-motion (หรือไม่มี matchMedia) = ลบทันทีเหมือนเดิม
let _modalLayer = null;
const MODAL_CLOSE_MS = 150; // ให้ตรงกับ .modal-backdrop.closing ใน css/style.css
function _dismissModal() {
  const root = document.getElementById('modal-root');
  const bd = document.getElementById('modal-backdrop');
  if (!bd) { root.innerHTML = ''; return; }
  const still = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!still) { root.innerHTML = ''; return; }
  if (bd.classList.contains('closing')) return; // กำลังปิดอยู่แล้ว (กดซ้ำ/ย้อนกลับซ้อน)
  bd.classList.add('closing');
  // ถ้าระหว่างนั้นมี openModal ใหม่วาดทับ bd ตัวเก่าจะหลุดจาก root แล้ว → ไม่ลบของใหม่ทิ้ง
  setTimeout(() => { if (bd.parentNode === root) root.innerHTML = ''; }, MODAL_CLOSE_MS + 30);
}
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${html}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  if (!_modalLayer || !_modalLayer.active) _modalLayer = NavHistory.layer(_dismissModal);
}
function closeModal() {
  _dismissModal();
  if (_modalLayer) { _modalLayer.release(); _modalLayer = null; }
}

// --------------------------------------------------------------------------
// helper ทั่วไป
// --------------------------------------------------------------------------

// แสดงคะแนน: จำนวนเต็มแสดงตามเดิม ส่วนทศนิยมแสดง 1 ตำแหน่ง
const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// คืนค่าที่ซ้ำ (ทุกครั้งที่ปรากฏซ้ำหลังครั้งแรก) เช่น ['a','b','a','a'] → ['a','a']
function findDuplicates(arr) {
  return arr.filter((c, i) => arr.indexOf(c) !== i);
}

// ตัดข้อความให้ไม่เกิน n ตัวอักษร แล้วต่อด้วย …
function truncateLabel(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function openConfirmModal({ title, body, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false, onConfirm }) {
  openModal(`
    <h2>${title}</h2>
    <div class="modal-sub">${body}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="confirm-cancel-btn">${cancelLabel}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok-btn">${confirmLabel}</button>
    </div>
  `);
  document.getElementById('confirm-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('confirm-ok-btn').addEventListener('click', async () => {
    const btn = document.getElementById('confirm-ok-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังดำเนินการ...';
    try {
      await onConfirm();
      closeModal();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      btn.disabled = false;
      btn.textContent = confirmLabel;
    }
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// แยกข้อความ CSV หรือข้อความที่ copy มาจาก Excel (คั่นด้วย comma หรือ tab)
// - รองรับช่องที่ครอบด้วย "..." (มี comma/ขึ้นบรรทัดใหม่ในช่องได้ และ "" แทน ")
// - ค่าเริ่มต้น: ตัดแถวว่างทิ้ง (เหมาะกับการนำเข้ารายชื่อ)
// - keepBlank: true = คงแถวว่างและช่องว่างหน้าสุดไว้ตามตำแหน่งเดิม (ใช้ตอนวางคะแนนลงตาราง
//   เพื่อไม่ให้คะแนนเลื่อนไปผิดคนเมื่อมีนักเรียนที่ช่องว่าง)
function parseDelimitedText(text, { keepBlank = false } = {}) {
  let s = String(text ?? '').replace(/^\uFEFF/, '');
  if (keepBlank) s = s.replace(/\r?\n$/, ''); // Excel เติมขึ้นบรรทัดใหม่ท้ายข้อความเสมอ ตัดออกแค่ 1 ตัว
  const firstLine = s.split(/\r?\n/).find(l => l.trim() !== '') ?? '';
  const delim = firstLine.includes('\t') ? '\t' : ',';

  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  row.push(field); rows.push(row);

  const trimmed = rows.map(r => r.map(c => c.trim()));
  return keepBlank ? trimmed : trimmed.filter(r => r.some(c => c !== ''));
}

// เกณฑ์เกรดเริ่มต้น (ครูปรับเองได้ในหน้าตั้งค่ารายวิชา)
const DEFAULT_GRADE_SCALE = [
  { grade: '4.0', min: 80 },
  { grade: '3.5', min: 75 },
  { grade: '3.0', min: 70 },
  { grade: '2.5', min: 65 },
  { grade: '2.0', min: 60 },
  { grade: '1.5', min: 55 },
  { grade: '1.0', min: 50 },
  { grade: '0', min: 0 },
];

// ตัดเศษทศนิยมลอยตัวของคะแนน (เช่น 49.99999999999999 -> 50, 0.1+0.2 -> 0.3)
// ใช้กับผลรวมคะแนนทุกที่ที่นำไปแสดงหรือตัดเกรด เพื่อให้คะแนนที่ขอบเกณฑ์ไม่ตกเกรดผิด
// ค่าที่ไม่ใช่ตัวเลข (NaN/ว่าง) นับเป็น 0
function roundScore(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(6)) : 0;
}

function calcGrade(total, scale) {
  const t = roundScore(total);
  const s = (scale && scale.length ? scale : DEFAULT_GRADE_SCALE)
    .slice()
    .sort((a, b) => b.min - a.min);
  for (const row of s) {
    if (t >= row.min) return row.grade;
  }
  return s.length ? s[s.length - 1].grade : '0';
}

// กัน CSV/formula injection: ข้อความที่ขึ้นต้นด้วย = + - @ (หรือ tab/CR) จะถูก Excel ตีความเป็นสูตร
// จึงนำหน้าด้วย ' ให้เป็นข้อความธรรมดา (ยกเว้นตัวเลขจริง เช่น -5 หรือ 12.5)
function csvSafeCell(cell) {
  if (typeof cell === 'number') return String(cell);
  const v = String(cell ?? '');
  if (/^[=+\-@\t\r]/.test(v) && !/^[-+]?\d+(\.\d+)?$/.test(v)) return "'" + v;
  return v;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const v = csvSafeCell(cell);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function uid4() {
  return Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-4);
}

// ==========================================================================
// ระดับชั้น (ม.1-ม.6) และห้อง (1-13) — ตัวเลือกมาตรฐานที่ใช้ทั้งแอป
// สีของแต่ละระดับชั้นอ้างตัวแปร --viz-* ใน css/style.css (โหมดมืดสลับเองผ่านตัวแปร ไม่ต้องมีชุดสีแยกใน JS)
// ==========================================================================
const LEVEL_OPTIONS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
const ROOM_OPTIONS = Array.from({ length: 13 }, (_, i) => String(i + 1));
const LEVEL_COLORS = {
  'ม.1': { strong: 'var(--viz-blue)' },    // ฟ้า
  'ม.2': { strong: 'var(--viz-green)' },   // เขียว
  'ม.3': { strong: 'var(--viz-purple)' },  // ม่วง
  'ม.4': { strong: 'var(--viz-sky)' },     // ฟ้าอมเขียว
  'ม.5': { strong: 'var(--viz-mint)' },    // เขียวสด
  'ม.6': { strong: 'var(--viz-orchid)' },  // ม่วงกล้วยไม้
};
const LEVEL_COLOR_FALLBACK = { strong: 'var(--ink-soft)' };
function getLevelColor(level) {
  return LEVEL_COLORS[level] || LEVEL_COLOR_FALLBACK;
}
// ไอคอนทึบสองชั้น สไตล์ One UI (แทนอีโมจิ; sun/moon/contrast ยังเป็นเส้น) — ใช้เป็น ${icon('book')} ใน template
const ICONS = {
  book: '<g fill="currentColor" stroke="none"><path d="M11 6.2C9.4 5 7.4 4.4 5.2 4.4c-.9 0-1.7.7-1.7 1.6v11.3c0 .9.8 1.6 1.7 1.6 2 0 3.9.5 5.8 1.7Z"/><path opacity=".55" d="M13 6.2c1.6-1.2 3.6-1.8 5.8-1.8.9 0 1.7.7 1.7 1.6v11.3c0 .9-.8 1.6-1.7 1.6-2 0-3.9.5-5.8 1.7Z"/></g>',
  archive: '<g fill="currentColor" stroke="none"><rect x="2.5" y="3.5" width="19" height="5.5" rx="2"/><path opacity=".55" d="M4 10h16v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18Z"/><rect x="9.5" y="12.5" width="5" height="2.2" rx="1.1"/></g>',
  user: '<g fill="currentColor" stroke="none"><circle cx="12" cy="7.8" r="4"/><path opacity=".55" d="M4 20.2c0-3.6 3.6-6 8-6s8 2.4 8 6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/></g>',
  sliders: '<g fill="currentColor" stroke="none"><rect opacity=".55" x="3" y="6.5" width="18" height="3" rx="1.5"/><rect opacity=".55" x="3" y="14.5" width="18" height="3" rx="1.5"/><circle cx="9" cy="8" r="3.2"/><circle cx="15.5" cy="16" r="3.2"/></g>',
  edit: '<g fill="currentColor" stroke="none"><path d="M16.2 3.6a2.4 2.4 0 0 1 3.4 0l.8.8a2.4 2.4 0 0 1 0 3.4L9.5 18.7a2 2 0 0 1-.9.5l-4.3 1.1a.8.8 0 0 1-1-1l1.1-4.3c.1-.3.3-.6.5-.9Z"/><rect opacity=".55" x="12" y="19.6" width="9" height="2" rx="1"/></g>',
  report: '<g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="12.5" width="2" height="5" rx="1"/><rect x="11" y="10" width="2" height="7.5" rx="1"/><rect x="14" y="13.5" width="2" height="4" rx="1"/></g>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>',
  folder: '<g fill="currentColor" stroke="none"><path opacity=".55" d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18Z"/><path d="M3 11.5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18Z"/></g>',
};
function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// หัวหน้ามาตรฐานของทุกหน้าหลัก (One UI: หัวเรื่องใหญ่ชิดซ้าย) — ใช้ชื่อเดียวกับเมนูข้าง
function pageHeaderHtml(title) {
  return `<div class="page-header"><h1>${escapeHtml(title)}</h1></div>`;
}
// หัวหน้าระดับวิชา (crumb + ชื่อ + ป้าย + บรรทัดรอง + ปุ่มด้านขวา) — ใช้ร่วมกันทุกหน้าที่เปิดเข้าไปในวิชา
//   crumbId/crumbLabel = ลิงก์ย้อนกลับ · crumbCurrent/title/sub = ข้อความล้วน (ฟังก์ชันนี้ escape ให้เอง)
//   badge/actions = HTML ที่ประกอบเองในแอป (ไม่ใส่ข้อมูลผู้ใช้ที่ยังไม่ escape)
function courseHeaderHtml({ crumbId, crumbLabel, crumbCurrent, title, badge = '', sub = '', actions = '' }) {
  return `
    <div class="crumb"><a href="#" id="${crumbId}" class="u-link-plain">${escapeHtml(crumbLabel)}</a> / <b>${escapeHtml(crumbCurrent)}</b></div>
    <div class="page-header u-flex u-items-start u-between u-wrap u-gap-16">
      <div>
        <h1>${escapeHtml(title)} ${badge}</h1>
        <div class="sub">${escapeHtml(sub)}</div>
      </div>
      ${actions ? `<div>${actions}</div>` : ''}
    </div>`;
}
function levelSelectOptionsHtml(selected) {
  return `<option value="">— เลือกระดับชั้น —</option>` +
    LEVEL_OPTIONS.map(l => `<option value="${l}" ${l === selected ? 'selected' : ''}>${l}</option>`).join('');
}

// ช่องคะแนนถือว่า "กรอกแล้ว" เมื่อไม่ใช่ undefined / null / สตริงว่าง (เลข 0 นับว่ากรอกแล้ว)
function hasScoreValue(v) { return v !== undefined && v !== null && v !== ''; }

// ความคืบหน้า (%) = สัดส่วน "ช่องคะแนน" ที่กรอกแล้วจากทุกช่องในห้องนั้น (นักเรียน x รายการคะแนนทั้งหมด)
// ไม่ใช่แค่จำนวนนักเรียนที่เริ่มกรอก เพื่อให้เห็นความคืบหน้าที่แท้จริงระหว่างกรอกอยู่
// studentsSnap / scoresSnap = Firestore QuerySnapshot ของ students และ scores ในห้อง
function calcSectionProgress(studentsSnap, scoresSnap, assessmentIds) {
  const totalCells = studentsSnap.size * assessmentIds.length;
  if (totalCells === 0) return 0;
  let filledCells = 0;
  scoresSnap.docs.forEach(d => {
    const data = d.data();
    assessmentIds.forEach(aid => { if (hasScoreValue(data[aid])) filledCells++; });
  });
  return Math.round((filledCells / totalCells) * 100);
}

// จัดกลุ่มรายการตามระดับชั้น (ม.1-ม.6 ตามลำดับ แล้วตามด้วยรายการที่ไม่ระบุระดับชั้น)
// แต่ละกลุ่มมีหัวกลุ่มสีอ่อนประจำระดับชั้นของตัวเอง
//   levelOf(item)      คืนค่าระดับชั้นของรายการ
//   listClass          class ของกล่องรายการในแต่ละกลุ่ม (เช่น 'course-list')
//   rowFn(item, color) สร้าง HTML ของแต่ละรายการ  (color = getLevelColor ของกลุ่มนั้น)
function groupsByLevelHtml(items, { levelOf, listClass, rowFn }) {
  const groups = LEVEL_OPTIONS.map(level => ({ level, items: items.filter(it => levelOf(it) === level) }))
    .filter(g => g.items.length > 0);
  const noLevel = items.filter(it => !LEVEL_OPTIONS.includes(levelOf(it)));
  if (noLevel.length > 0) groups.push({ level: null, items: noLevel });

  return `
    <div class="struct-groups">
      ${groups.map(g => {
        const col = getLevelColor(g.level);
        return `
          <div class="struct-group">
            <div class="struct-group-header" style="--c:${col.strong}">
              <span class="struct-group-title">${g.level ? g.level : 'ไม่ระบุระดับชั้น'}</span>
              <span class="struct-group-count">${g.items.length} วิชา</span>
            </div>
            <div class="${listClass}">
              ${g.items.map(it => rowFn(it, col)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ดึงเลขห้องจากป้ายชั้น/ห้องแบบเต็ม เช่น "มัธยมศึกษาปีที่ 2/1" หรือ "ม.2/10" -> "1", "10"
// เอาตัวเลขหลัง "/" ตัวสุดท้าย ถ้าไม่มี "/" เลยก็ลองหาเลขตัวสุดท้ายในข้อความแทน
function extractRoomFromClassLabel(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const slashIdx = s.lastIndexOf('/');
  if (slashIdx !== -1) {
    const after = s.slice(slashIdx + 1);
    const m = after.match(/\d+/);
    if (m) return m[0];
  }
  const all = s.match(/\d+/g);
  return all && all.length ? all[all.length - 1] : s;
}

// ลบทุก doc ใน collection แบบ batch (Firestore client ไม่มี recursive delete ในตัว)
// ใช้ตอนลบห้อง/ลบวิชา ที่ต้องเคลียร์ subcollection ก่อนลบ doc แม่
async function deleteCollectionDocs(colRef) {
  const snap = await colRef.get();
  if (snap.empty) return;
  const docs = snap.docs;
  const CHUNK = 400; // เผื่อ margin จากลิมิต batch 500 ops ของ Firestore
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// ---------- สำรองข้อมูลก่อนลบ → ใช้ทำปุ่ม "เลิกทำ" (อ่านเก็บในหน่วยความจำ แล้วเขียนกลับด้วย id เดิม) ----------
async function snapshotCollection(colRef) {
  const snap = await colRef.get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}
async function restoreDocs(colRef, docs) {
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    docs.slice(i, i + CHUNK).forEach(d => batch.set(colRef.doc(d.id), d.data));
    await batch.commit();
  }
}
// ห้องเรียนทั้งห้อง (เอกสารห้อง + นักเรียน + คะแนน)
async function snapshotSection(secRef) {
  const secSnap = await secRef.get();
  return {
    id: secRef.id, data: secSnap.data(),
    students: await snapshotCollection(secRef.collection('students')),
    scores: await snapshotCollection(secRef.collection('scores')),
  };
}
async function restoreSection(sectionsColRef, snap) {
  const secRef = sectionsColRef.doc(snap.id);
  await secRef.set(snap.data);
  await restoreDocs(secRef.collection('students'), snap.students);
  await restoreDocs(secRef.collection('scores'), snap.scores);
}
// วิชาทั้งวิชา (ทุกห้อง + โครงสร้างคะแนน + เกณฑ์เกรด)
async function snapshotCourse(courseRef) {
  const courseSnap = await courseRef.get();
  const sections = [];
  for (const s of (await courseRef.collection('sections').get()).docs) sections.push(await snapshotSection(s.ref));
  return {
    data: courseSnap.data(), sections,
    assessments: await snapshotCollection(courseRef.collection('assessments')),
    settings: await snapshotCollection(courseRef.collection('settings')),
  };
}
async function restoreCourse(courseRef, snap) {
  await courseRef.set(snap.data);
  await restoreDocs(courseRef.collection('assessments'), snap.assessments);
  await restoreDocs(courseRef.collection('settings'), snap.settings);
  for (const s of snap.sections) await restoreSection(courseRef.collection('sections'), s);
}

// ---------- Smart import parser (Excel/CSV) for student rosters ----------
// รองรับไฟล์ที่หัวตารางไม่ตรงตำแหน่งเป๊ะ (มีแถวว่าง/merge cell ด้านบน) และคอลัมน์ภาษาไทย/อังกฤษหลายแบบ
const IMPORT_HEADER_ALIASES = {
  no: ['ลำดับ', 'ลําดับ', 'เลขที่', 'no', 'no.', 'number'],
  code: ['รหัสนักเรียน', 'รหัสประจำตัว', 'รหัส', 'code', 'studentcode', 'student id'],
  studentId: ['id', 'เลขประจำตัวประชาชน'],
  fullName: ['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ-นามสกุล', 'ชื่อนามสกุล', 'ชื่อเต็ม', 'fullname', 'full name'],
  firstName: ['ชื่อ', 'ชื่อจริง', 'firstname', 'first name'],
  lastName: ['นามสกุล', 'สกุล', 'lastname', 'last name'],
  room: ['ห้อง', 'ห้องเรียน', 'room', 'section'],
};
// ลำดับนี้มีผลต่อการตัดสินใจของ matchImportHeaderField: ถ้าหัวคอลัมน์จับคู่ได้หลาย field
// field ที่อยู่ก่อนจะชนะ จึงต้องให้ 'fullName' มาก่อน 'firstName'
// (เช่น "ชื่อ-สกุล" มีคำว่า "ชื่อ" อยู่ข้างใน ถ้า firstName มาก่อนจะถูกจับเป็น firstName ผิดคอลัมน์)
// ห้ามเรียงลำดับใหม่โดยไม่ทดสอบ — ถ้าผิดจะไม่มี error แต่นำเข้าข้อมูลผิดช่อง
const IMPORT_FIELD_ORDER = ['fullName', 'no', 'code', 'studentId', 'firstName', 'lastName', 'room'];

function normalizeHeaderCell(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');
}
function matchImportHeaderField(cell) {
  const v = normalizeHeaderCell(cell);
  if (!v) return null;
  for (const field of IMPORT_FIELD_ORDER) {
    if (IMPORT_HEADER_ALIASES[field].some(a => v === normalizeHeaderCell(a))) return field;
  }
  for (const field of IMPORT_FIELD_ORDER) {
    if (IMPORT_HEADER_ALIASES[field].some(a => v.includes(normalizeHeaderCell(a)))) return field;
  }
  return null;
}

const isImportRowBlank = (row) => !row || row.every(c => String(c ?? '').trim() === '');

// หาแถวหัวตาราง: สแกน 12 แถวแรก เลือกแถวที่จับคู่ field ได้มากที่สุด (อย่างน้อย 2 คอลัมน์)
// คืนค่า { headerRowIdx, map } หรือ null ถ้าเดาไม่ได้
function detectImportHeader(aoa) {
  let headerRowIdx = -1, bestScore = 0, bestMap = null;
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const row = aoa[i];
    if (isImportRowBlank(row)) continue;
    const map = {};
    row.forEach((cell, ci) => {
      const field = matchImportHeaderField(cell);
      if (field && !(field in map)) map[field] = ci;
    });
    const score = Object.keys(map).length;
    if (score > bestScore) { bestScore = score; headerRowIdx = i; bestMap = map; }
  }
  if (headerRowIdx === -1 || bestScore < 2) return null;
  return { headerRowIdx, map: bestMap };
}

// แปลง 1 แถวข้อมูลเป็น { no, studentId, code, firstName, lastName, room } — ถ้าไม่มีช่องนามสกุล จะแยกคำสุดท้ายของชื่อเต็มออกมาเป็นนามสกุล
function buildImportRow(r, map) {
  const get = (field) => (field in map) ? String(r[map[field]] ?? '').trim() : '';
  let firstName = get('firstName') || get('fullName');
  let lastName = get('lastName');
  if (!lastName) {
    const parts = firstName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      lastName = parts.pop();
      firstName = parts.join(' ');
    }
  }
  return { no: get('no'), studentId: get('studentId'), code: get('code'), firstName, lastName, room: get('room') };
}

// ตัวอ่านรายชื่อจากไฟล์ Excel/CSV ตัวเดียว (ใช้ร่วมกันทั้งโหมดห้องเดียวและหลายห้อง)
// aoa = array-of-arrays (แถวแรกอาจไม่ใช่หัวตาราง เผื่อไฟล์มีแถวว่าง/merge cell ด้านบน)
//   multiRoom = false (ค่าเริ่มต้น): กรองเฉพาะ targetRoom
//     คืนค่า { rows: [{no, code, firstName, lastName}], roomColumnFound, matchedRoomCount, totalParsed }
//   multiRoom = true: ไม่กรอง คืนเลขห้อง (normalize ผ่าน extractRoomFromClassLabel แล้ว) ติดมากับทุกแถว
//     คืนค่า { rows: [{no, code, firstName, lastName, room}], roomColumnFound, totalParsed }
function parseImportSheetCore(aoa, { multiRoom = false, targetRoom = '' } = {}) {
  const header = detectImportHeader(aoa);

  if (!header) {
    if (multiRoom) return { rows: [], roomColumnFound: false, totalParsed: 0 };
    // เดาไม่ได้ว่าหัวตารางอยู่แถวไหน — สมมติว่าไม่มีหัวตาราง ใช้ลำดับคอลัมน์เริ่มต้น: เลขที่, รหัส, ชื่อ, นามสกุล
    const rows = aoa.filter(r => !isImportRowBlank(r)).map(r => ({
      no: String(r[0] ?? '').trim(),
      code: String(r[1] ?? '').trim(),
      firstName: String(r[2] ?? '').trim(),
      lastName: String(r[3] ?? '').trim(),
    })).filter(r => r.firstName);
    return { rows, roomColumnFound: false, matchedRoomCount: 0, totalParsed: rows.length };
  }

  const { headerRowIdx, map } = header;
  const roomColumnFound = 'room' in map;
  const allRows = aoa.slice(headerRowIdx + 1)
    .filter(r => !isImportRowBlank(r))
    .map(r => buildImportRow(r, map))
    .filter(r => r.firstName);

  if (multiRoom) {
    const rows = allRows.map(r => ({ ...r, room: roomColumnFound ? extractRoomFromClassLabel(r.room) : '' }));
    return { rows, roomColumnFound, totalParsed: rows.length };
  }

  const targetRoomNorm = String(targetRoom ?? '').trim();
  const matchedRoomCount = roomColumnFound
    ? allRows.filter(r => r.room.trim() === targetRoomNorm).length
    : allRows.length;

  // ถ้ามีคอลัมน์ห้องและมีบางแถวตรงกับห้องปัจจุบัน ให้กรองเฉพาะแถวที่ตรง
  // ถ้าไม่มีเลยสักแถว (เช่น รูปแบบชื่อห้องไม่ตรงกัน) ให้นำเข้าทั้งหมดแทนการบล็อกผู้ใช้
  let rows = allRows;
  if (roomColumnFound && matchedRoomCount > 0) {
    rows = allRows.filter(r => r.room.trim() === targetRoomNorm);
  }
  rows = rows.map(({ room, ...rest }) => rest);

  return { rows, roomColumnFound, matchedRoomCount, totalParsed: allRows.length };
}

// นำเข้าเฉพาะห้องเดียว (ใช้ที่หน้ารายชื่อนักเรียนของห้อง)
function parseImportSheet(aoa, targetRoom) {
  return parseImportSheetCore(aoa, { targetRoom });
}

// นำเข้าหลายห้องในไฟล์เดียว แล้วแยกกลุ่มตามห้องภายนอกฟังก์ชัน
// ใช้กับฟีเจอร์ "นำเข้ารายชื่อ แยกห้องอัตโนมัติ" ที่ระดับวิชา
function parseImportSheetMultiRoom(aoa) {
  return parseImportSheetCore(aoa, { multiRoom: true });
}

// โหลด SheetJS (~270 KB) เฉพาะตอนที่ต้องนำเข้า/ส่งออก Excel จริง ๆ ไม่โหลดตอนเปิดแอป
let _xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!_xlsxPromise) {
    _xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const prog = islandProgress({ label: 'กำลังเตรียมตัวอ่านไฟล์ Excel...' }); // แถบวิ่ง (ครั้งแรกที่ต้องโหลดไลบรารี)
      s.src = 'js/vendor/xlsx.mini.min.js?v=0.20.3';
      s.onload = () => { prog.clear(); resolve(window.XLSX); };
      s.onerror = () => { prog.clear(); _xlsxPromise = null; reject(new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง')); };
      document.head.appendChild(s);
    });
  }
  return _xlsxPromise;
}

// โหลดสคริปต์ของแต่ละหน้าแบบ lazy (route-based) — ไม่โหลดตอนเปิดแอป โหลดครั้งแรกที่เข้าหน้านั้น
// ใช้ <script> ธรรมดา (ไม่ใช่ module) จึงใช้ฟังก์ชัน/ค่าคงที่ global ร่วมกับไฟล์อื่นได้เหมือนเดิม
// เพิ่มโมดูลใหม่: ใส่ชื่อ → path ในตารางนี้ แล้วเรียก `await loadModule('ชื่อ')` ก่อนใช้ฟังก์ชันในไฟล์นั้น
const LAZY_MODULES = {
  report: 'js/report.js',   // แท็บรายงานในวิชา + ส่งออก ปพ.5 / SGS / Next School
  privacy: 'js/privacy.js', // ส่งออก/ลบข้อมูลของฉัน
  tools: 'js/tools.js',     // เครื่องมือในห้องเรียน
  profile: 'js/profile.js', // หน้าข้อมูลส่วนตัวของครู (ตำแหน่ง/สังกัด/ผู้ลงนามในเอกสาร)
  timetable: 'js/timetable.js', // แท็บตารางสอนในหน้าข้อมูลส่วนตัว
  records: 'js/records.js', // แท็บอบรม/เกียรติบัตร/รางวัล (รูปย่อใน Firestore + ต้นฉบับใน Storage)
  // กลุ่ม Personal Agreement — ต้องโหลดตามลำดับนี้ (doc-system.js → pa-config.js → pa.js …) ใช้ loadModules(LAZY_BUNDLES.pa)
  'doc-system': 'js/doc-system.js', // บริบทของระบบเอกสาร: config + state + collection ต่อระบบ (ใช้ร่วมกับระบบเอกสารอื่นในอนาคต)
  'doc-shell': 'js/doc-shell.js', // โครงหน้า/แท็บ/ตัวช่วยร่วมของทุกระบบเอกสาร — โหลดหลัง doc-system ก่อนไฟล์ของแต่ละระบบ
  'pa-config': 'js/pa-config.js',
  pa: 'js/pa.js',
  'badwork-ai-config': 'js/badwork-ai-config.js', // ตั้งค่าผู้ช่วย AI ที่ใช้ร่วมทุกระบบ (คีย์/พร็อกซี/รุ่น/ความยินยอม)
  'badwork-ai': 'js/badwork-ai.js', // แกนผู้ช่วย AI (ไม่รู้จักชื่อระบบ)
  'pa-ai': 'js/pa-ai.js', // ตัวต่อผู้ช่วย AI ของ PA (registerDocAi)
  'pa-report': 'js/pa-report.js',
  'pa-rpt': 'js/pa-rpt.js',
  // กลุ่ม ID-Plan (แผนพัฒนาตนเอง) — ใช้ doc-system/doc-shell ร่วมกับ PA · ใช้ loadModules(LAZY_BUNDLES.idp)
  'idp-config': 'js/idp-config.js',
  idp: 'js/idp.js',
  'idp-ai': 'js/idp-ai.js', // ตัวต่อผู้ช่วย AI ของ ID-Plan (registerDocAi) — แกน AI ใช้ร่วมกับ PA
  // กลุ่ม แผนการอบรม (tra) — สร้างโดย tools/new-doc-system.js · ใช้ doc-system/doc-shell ร่วมกับ PA · ใช้ loadModules(LAZY_BUNDLES.tra)
  'tra-config': 'js/tra-config.js',
  tra: 'js/tra.js',
  'tra-ai': 'js/tra-ai.js', // ตัวต่อผู้ช่วย AI ของ แผนการอบรม (registerDocAi) — แกน AI ใช้ร่วมกับระบบอื่น
};
const LAZY_BUNDLES = {
  pa: ['doc-system', 'doc-shell', 'pa-config', 'pa', 'badwork-ai-config', 'badwork-ai', 'pa-ai', 'pa-report', 'pa-rpt'],
  idp: ['doc-system', 'doc-shell', 'idp-config', 'idp', 'badwork-ai-config', 'badwork-ai', 'idp-ai'],
  tra: ['doc-system', 'doc-shell', 'tra-config', 'tra', 'badwork-ai-config', 'badwork-ai', 'tra-ai'],
  // เฉพาะ config ของทุกระบบเอกสาร (เบา · ไม่มี UI) — privacy.js ใช้รู้ชื่อ collection · ระบบเอกสารใหม่ต้องเพิ่มไฟล์ config ของตัวเองที่นี่
  docConfigs: ['doc-system', 'pa-config', 'idp-config', 'tra-config'],
};
// โหลดหลายโมดูลทีละไฟล์ตามลำดับ (สคริปต์ที่แทรกด้วย JS ไม่รับประกันลำดับถ้าโหลดพร้อมกัน)
async function loadModules(names) { for (const n of [].concat(names)) await loadModule(n); }
const _modulePromises = {};
function loadModule(name) {
  const src = LAZY_MODULES[name];
  if (!src) return Promise.reject(new Error('ไม่รู้จักโมดูล: ' + name));
  if (!_modulePromises[name]) {
    _modulePromises[name] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        s.remove();
        delete _modulePromises[name]; // ให้กดลองใหม่ได้
        reject(new Error('โหลดหน้านี้ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'));
      };
      document.head.appendChild(s);
    });
  }
  return _modulePromises[name];
}

// URL รูปโปรไฟล์ที่ปลอดภัย (เฉพาะ https) ไม่งั้นใช้รูปตัวอักษรย่อที่สร้างในเครื่อง ไม่ส่งชื่อไปเว็บภายนอก
function initialsAvatar(name) {
  const ch = (String(name || 'T').trim()[0] || 'T').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#5B7CFA"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="#fff" font-family="sans-serif">${escapeHtml(ch)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function safePhotoUrl(url, name) {
  try { if (new URL(url).protocol === 'https:') return url; } catch (e) {}
  return initialsAvatar(name);
}

function readFileAsRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    if (/\.csv$/i.test(file.name)) {
      reader.onload = () => resolve(parseDelimitedText(String(reader.result)));
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.onload = async () => {
        try {
          await loadXLSX();
          const data = new Uint8Array(reader.result);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          resolve(aoa);
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}

// ---------- Mobile nav (hamburger drawer) ----------
function closeMobileNav() {
  document.getElementById('app')?.classList.remove('nav-open');
}
function toggleMobileNav() {
  document.getElementById('app')?.classList.toggle('nav-open');
}

// ---------- Sidebar collapse/expand (desktop) ----------
const SIDEBAR_COLLAPSE_KEY = 'myscore_sidebar_collapsed';
const SIDEBAR_BREAKPOINT = 860;

function applyStoredSidebarState() {
  const app = document.getElementById('app');
  if (!app) return;
  if (window.innerWidth <= SIDEBAR_BREAKPOINT) {
    app.classList.remove('sidebar-collapsed');
    return;
  }
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  app.classList.toggle('sidebar-collapsed', collapsed);
}

function toggleSidebarCollapse() {
  const app = document.getElementById('app');
  if (!app || window.innerWidth <= SIDEBAR_BREAKPOINT) return;
  const collapsed = app.classList.toggle('sidebar-collapsed');
  localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
}

window.addEventListener('resize', debounce(applyStoredSidebarState, 150));
applyStoredSidebarState();

// ทำสีวิชาที่บันทึกไว้ (อาจหม่นจากธีมเก่า) ให้สดพอดีกับโหมดปัจจุบัน — คืนค่าว่างถ้าไม่มีสี
function vividColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex || '';
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0, l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  if (s < 0.08) return hex; // เทา/ดำ/ขาว คงเดิม
  const dark = document.documentElement.dataset.theme === 'dark';
  s = Math.max(s, 0.68);
  l = dark ? Math.min(Math.max(l, 0.60), 0.70) : Math.min(Math.max(l, 0.44), 0.54);
  const f = k => { const a = s * Math.min(l, 1 - l), t = (k + h / 30) % 12; return l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)); };
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}

// สีของวิชา = สีของระดับชั้น (ทุกหน้าใช้สีเดียวกัน) ถ้าไม่ระบุระดับให้ใช้สีที่บันทึกไว้แบบปรับให้สด
function courseColor(c) {
  if (c && c.level && getLevelColor(c.level) !== LEVEL_COLOR_FALLBACK) return getLevelColor(c.level).strong;
  return vividColor(c && c.color) || getLevelColor(c && c.level).strong;
}


// ==========================================================================
// ตัวโหลด (แทนข้อความ "กำลังโหลด...")
//   showLoading('list' | 'dash' | 'cat' | 'cat-sm', target = #view)
//   - รอ 180ms ก่อนค่อยแสดง: ถ้าข้อมูลมาเร็วกว่านั้นจะไม่เห็นตัวโหลดเลย (ไม่แฟลช)
//   - ระหว่างรอ หน้าเดิมค้างอยู่ (#view จางลงเล็กน้อย) ไม่ถูกลบทิ้งทันที
//   - ถ้าเนื้อหาจริงถูกวาดทับไปแล้ว (firstChild เปลี่ยน) จะไม่เขียนตัวโหลดทับ
//   list = โครงรายการวิชา · dash = โครงหน้าแรก · cat = น้องแมวโยกหัว · cat-sm = แบบเล็กสำหรับแท็บในวิชา
// ==========================================================================
const LOAD_DELAY_MS = 180;
const _loadTimers = new WeakMap();

function loaderHtml(kind) {
  if (kind === 'list') {
    const row = '<div class="sk-row"><i class="sk sk-chip"></i><div class="sk-lines"><i class="sk sk-line"></i><i class="sk sk-line sk-short"></i></div><i class="sk sk-btn"></i></div>';
    return `<div class="sk-list" role="status" aria-label="กำลังโหลด">${row.repeat(4)}</div>`;
  }
  if (kind === 'dash') {
    return '<div class="sk-dash" role="status" aria-label="กำลังโหลด"><i class="sk sk-banner"></i>'
      + '<div class="sk-grid"><i class="sk sk-card"></i><i class="sk sk-card"></i></div>'
      + '<div class="sk-grid"><i class="sk sk-card sk-card-lg"></i><i class="sk sk-card sk-card-lg"></i></div></div>';
  }
  return `<div class="loader${kind === 'cat-sm' ? ' loader-sm' : ''}" role="status" aria-live="polite">`
    + '<img class="loader-cat" src="assets/head-cat-still.webp" width="84" height="117" alt="" decoding="async">'
    + '<div>กำลังโหลด<span class="loader-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>';
}

function clearLoading(target) {
  const t = _loadTimers.get(target);
  if (t) { clearTimeout(t); _loadTimers.delete(target); }
}

function showLoading(kind = 'cat', target = document.getElementById('view')) {
  if (!target) return;
  clearLoading(target);
  const isView = target.id === 'view';
  const first = target.firstChild;
  if (isView && first) target.classList.add('view-pending');
  _loadTimers.set(target, setTimeout(() => {
    _loadTimers.delete(target);
    if (isView) target.classList.remove('view-pending');
    if (target.firstChild === first) target.innerHTML = loaderHtml(kind);
  }, LOAD_DELAY_MS));
}
