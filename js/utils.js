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

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${html}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
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

// แยกเลขห้อง / รายการห้องจากข้อความ เช่น "1,2,3" หรือ "1-5" หรือ "ม.6/1, ม.6/2"
function parseRoomList(text) {
  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  const rooms = [];
  parts.forEach(p => {
    const rangeMatch = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]), end = Number(rangeMatch[2]);
      for (let n = Math.min(start, end); n <= Math.max(start, end); n++) rooms.push(String(n));
    } else if (p) {
      rooms.push(p);
    }
  });
  // ตัดค่าซ้ำ โดยรักษาลำดับเดิม
  return [...new Set(rooms)];
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
// สีของแต่ละระดับชั้นเป็นโทนอ่อน (soft/pastel) ใช้แยกกลุ่มวิชาให้มองง่าย
// ==========================================================================
const LEVEL_OPTIONS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
const ROOM_OPTIONS = Array.from({ length: 13 }, (_, i) => String(i + 1));
const LEVEL_COLORS = {
  'ม.1': { tint: '#E3EFFF', strong: '#2D80F2' },   // ฟ้า
  'ม.2': { tint: '#DDF6EC', strong: '#12A87A' },   // เขียว
  'ม.3': { tint: '#EDE6FF', strong: '#7B52E6' },   // ม่วง
  'ม.4': { tint: '#DCF1FA', strong: '#1A9FD0' },   // ฟ้าอมเขียว
  'ม.5': { tint: '#E4F7DF', strong: '#3FB86B' },   // เขียวสด
  'ม.6': { tint: '#F1E4FB', strong: '#A25BE0' },   // ม่วงกล้วยไม้
};
// เวอร์ชันโหมดมืด: พื้นเข้ม ตัวเน้นสว่างขึ้นให้อ่านออกบนพื้นดำ
const LEVEL_COLORS_DARK = {
  'ม.1': { tint: '#16304F', strong: '#5AA2FF' },
  'ม.2': { tint: '#0F2E26', strong: '#2FD1A0' },
  'ม.3': { tint: '#2A1F4D', strong: '#B79BFF' },
  'ม.4': { tint: '#0F2E3D', strong: '#4CC3F0' },
  'ม.5': { tint: '#16301A', strong: '#6FD98C' },
  'ม.6': { tint: '#35204D', strong: '#CF9BFF' },
};

// ไอคอนเส้นบาง (แทนอีโมจิ) — ใช้เป็น ${icon('book')} ใน template
const ICONS = {
  book: '<path d="M12 6.7c-1.6-1.3-3.7-2-6.1-2-.6 0-1 .5-1 1.1v11.4c0 .6.4 1.1 1 1.1 2.4 0 4.5.7 6.1 2"/><path d="M12 6.7c1.6-1.3 3.7-2 6.1-2 .6 0 1 .5 1 1.1v11.4c0 .6-.4 1.1-1 1.1-2.4 0-4.5.7-6.1 2"/><path d="M12 6.7v13.5"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  sliders: '<line x1="4" y1="8" x2="20" y2="8"/><circle cx="9" cy="8" r="2"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="16" r="2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 17v-3"/><path d="M12 17v-5"/><path d="M15 17v-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z"/>',
};
function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
const LEVEL_COLOR_FALLBACK = { tint: 'var(--surface-sunken)', strong: 'var(--ink-soft)' };
function getLevelColor(level) {
  const dark = document.documentElement.dataset.theme === 'dark';
  return (dark ? LEVEL_COLORS_DARK : LEVEL_COLORS)[level] || LEVEL_COLOR_FALLBACK;
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
            <div class="struct-group-header" style="background:${col.tint}; color:${col.strong};">
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

// แปลง 1 แถวข้อมูลเป็น { no, code, firstName, lastName, room } — ถ้าไม่มีช่องนามสกุล จะแยกคำสุดท้ายของชื่อเต็มออกมาเป็นนามสกุล
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
  return { no: get('no'), code: get('code'), firstName, lastName, room: get('room') };
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
      s.src = 'js/vendor/xlsx.mini.min.js?v=0.20.3';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { _xlsxPromise = null; reject(new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง')); };
      document.head.appendChild(s);
    });
  }
  return _xlsxPromise;
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
function openMobileNav() {
  document.getElementById('app')?.classList.add('nav-open');
}
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
