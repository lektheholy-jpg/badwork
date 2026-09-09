// ==========================================================================
// Utils: toast, modal, csv parsing, debounce, grade calculation, mobile nav
// ==========================================================================

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
function parseDelimitedText(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map(line => {
    const delim = line.includes('\t') ? '\t' : ',';
    return line.split(delim).map(c => c.trim());
  });
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

function calcGrade(total, scale) {
  const s = (scale && scale.length ? scale : DEFAULT_GRADE_SCALE)
    .slice()
    .sort((a, b) => b.min - a.min);
  for (const row of s) {
    if (total >= row.min) return row.grade;
  }
  return s.length ? s[s.length - 1].grade : '0';
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const v = String(cell ?? '');
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

// aoa = array-of-arrays (แถวแรกอาจไม่ใช่หัวตาราง เผื่อไฟล์มีแถวว่าง/merge cell ด้านบน)
// คืนค่า { rows: [{no, code, firstName, lastName}], roomColumnFound, matchedRoomCount, totalParsed }
function parseImportSheet(aoa, targetRoom) {
  const isRowBlank = (row) => !row || row.every(c => String(c ?? '').trim() === '');

  // หาแถวหัวตาราง: สแกน 12 แถวแรก เลือกแถวที่จับคู่ field ได้มากที่สุด (อย่างน้อย 2 คอลัมน์)
  let headerRowIdx = -1, bestScore = 0, bestMap = null;
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const row = aoa[i];
    if (isRowBlank(row)) continue;
    const map = {};
    row.forEach((cell, ci) => {
      const field = matchImportHeaderField(cell);
      if (field && !(field in map)) map[field] = ci;
    });
    const score = Object.keys(map).length;
    if (score > bestScore) { bestScore = score; headerRowIdx = i; bestMap = map; }
  }

  if (headerRowIdx === -1 || bestScore < 2) {
    // เดาไม่ได้ว่าหัวตารางอยู่แถวไหน — สมมติว่าไม่มีหัวตาราง ใช้ลำดับคอลัมน์เริ่มต้น: เลขที่, รหัส, ชื่อ, นามสกุล
    const rows = aoa.filter(r => !isRowBlank(r)).map(r => ({
      no: String(r[0] ?? '').trim(),
      code: String(r[1] ?? '').trim(),
      firstName: String(r[2] ?? '').trim(),
      lastName: String(r[3] ?? '').trim(),
    })).filter(r => r.firstName);
    return { rows, roomColumnFound: false, matchedRoomCount: 0, totalParsed: rows.length };
  }

  const map = bestMap;
  const dataRows = aoa.slice(headerRowIdx + 1).filter(r => !isRowBlank(r));
  const roomColumnFound = 'room' in map;
  const targetRoomNorm = String(targetRoom ?? '').trim();

  const allRows = dataRows.map(r => {
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
    return {
      no: get('no'),
      code: get('code'),
      firstName,
      lastName,
      room: get('room'),
    };
  }).filter(r => r.firstName);

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

function readFileAsRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    if (/\.csv$/i.test(file.name)) {
      reader.onload = () => resolve(parseDelimitedText(String(reader.result)));
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.onload = () => {
        try {
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
