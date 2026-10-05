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

// ==========================================================================
// ระดับชั้น (ม.1-ม.6) และห้อง (1-13) — ตัวเลือกมาตรฐานที่ใช้ทั้งแอป
// สีของแต่ละระดับชั้นเป็นโทนอ่อน (soft/pastel) ใช้แยกกลุ่มวิชาให้มองง่าย
// ==========================================================================
const LEVEL_OPTIONS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
const ROOM_OPTIONS = Array.from({ length: 13 }, (_, i) => String(i + 1));
const LEVEL_COLORS = {
  'ม.1': { tint: '#E3EFFF', strong: '#2D80F2' },
  'ม.2': { tint: '#DDF5F0', strong: '#0F8F7B' },
  'ม.3': { tint: '#FFF0D2', strong: '#C77A00' },
  'ม.4': { tint: '#FFE9DF', strong: '#D9582F' },
  'ม.5': { tint: '#FFE3E4', strong: '#E5484D' },
  'ม.6': { tint: '#EDE6FF', strong: '#7B52E6' },
};
// เวอร์ชันโหมดมืด: พื้นเข้ม ตัวเน้นสว่างขึ้นให้อ่านออกบนพื้นดำ
const LEVEL_COLORS_DARK = {
  'ม.1': { tint: '#16304F', strong: '#5AA2FF' },
  'ม.2': { tint: '#0F2E2A', strong: '#2FC9AE' },
  'ม.3': { tint: '#3A2A0C', strong: '#FFB84D' },
  'ม.4': { tint: '#3D2218', strong: '#FF9A78' },
  'ม.5': { tint: '#3D1B1E', strong: '#FF6B70' },
  'ม.6': { tint: '#2A1F4D', strong: '#B79BFF' },
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

// เหมือน parseImportSheet แต่ไม่กรองเฉพาะห้องเดียว — คืนค่าเลขห้อง (ที่ normalize ผ่าน
// extractRoomFromClassLabel แล้ว) ติดมากับทุกแถว เพื่อเอาไปแยกกลุ่มตามห้องเองภายนอกฟังก์ชัน
// ใช้กับฟีเจอร์ "นำเข้ารายชื่อ แยกห้องอัตโนมัติ" ที่ระดับวิชา (หลายห้องในไฟล์เดียว)
function parseImportSheetMultiRoom(aoa) {
  const isRowBlank = (row) => !row || row.every(c => String(c ?? '').trim() === '');

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
    return { rows: [], roomColumnFound: false, totalParsed: 0 };
  }

  const map = bestMap;
  const roomColumnFound = 'room' in map;
  const dataRows = aoa.slice(headerRowIdx + 1).filter(r => !isRowBlank(r));

  const rows = dataRows.map(r => {
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
      room: roomColumnFound ? extractRoomFromClassLabel(get('room')) : '',
    };
  }).filter(r => r.firstName);

  return { rows, roomColumnFound, totalParsed: rows.length };
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
