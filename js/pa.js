// ==========================================================================
// ข้อตกลงในการพัฒนางาน (PA 1/ส – Performance Agreement)
// บันทึก/แก้ไข PA ของครูตามปีงบประมาณ · Firestore: users/{uid}/pa_agreements/{docId}
// โครงเอกสารตามแบบ PA 1/ส ของ สพฐ. (ปีงบประมาณ 2569):
//   ส่วนที่ 1  1. ภาระงาน (1.1–1.4)  2. งานตามมาตรฐานตำแหน่ง 15 ข้อ × (งาน/ผลลัพธ์/ตัวชี้วัด)
//   ส่วนที่ 2  ประเด็นท้าทาย (สภาพปัญหา · วิธีดำเนินการ · ผลลัพธ์เชิงปริมาณ/คุณภาพ)
// ข้อมูลผู้จัดทำดึงจากหน้าข้อมูลส่วนตัว · ชั่วโมงสอนดึงจากตารางสอน (เก็บเป็นสำเนาในเอกสาร แก้ได้)
// ฟิลด์ระดับบนของเอกสาร (≤ 30 ตาม firestore.rules validDoc):
//   fiscalYear, status, classroomTypes{}, load{}, workItems{}, challengeTitle, problem, method,
//   outcomeQuant, outcomeQual, signDate, owner{}  (+ ฟิลด์แบบเดิม: workload, outcome, tasks, selfDev ที่ยังอ่านได้)
// ==========================================================================

const PAState = {
  tab: 'agreement', // แท็บที่เปิดอยู่: 'agreement' (แบบฟอร์มข้อตกลง) | 'report' (ตัวอย่าง/พิมพ์ PA 1)
  nextTab: null,    // navigate('pa-report-page') ตั้งค่านี้ให้ renderPAPage เปิดแท็บรายงานเลย
  view: 'list',     // มุมมองในแท็บข้อตกลง: 'list' | 'form'
  docId: null,      // null = สร้างใหม่ | string = แก้ไขที่มีอยู่
  doc: null,        // ข้อมูล PA ที่กำลังแก้
  list: null,       // แคชรายการ
  previewId: null,  // เอกสารที่เลือกดู/พิมพ์ในแท็บรายงาน
};

// ------------------------------------------------------------------
// โครงตามแบบ PA 1/ส
// ------------------------------------------------------------------
const PA_CLASSROOM_TYPES = [
  ['basic', 'ห้องเรียนวิชาสามัญหรือวิชาพื้นฐาน'],
  ['early', 'ห้องเรียนปฐมวัย'],
  ['special', 'ห้องเรียนการศึกษาพิเศษ'],
  ['vocational', 'ห้องเรียนสายวิชาชีพ'],
  ['nonformal', 'ห้องเรียนการศึกษานอกระบบ / ตามอัธยาศัย'],
];

// ส่วนที่ 1 ข้อ 2: [รหัสกลุ่ม, หัวกลุ่ม, [[รหัสข้อ, ลักษณะงานที่ปฏิบัติตามมาตรฐานตำแหน่ง], ...]]
const PA_WORK_ITEMS = [
  ['1', '1. ด้านการจัดการเรียนรู้', [
    ['1.1', 'สร้างและหรือพัฒนาหลักสูตร'],
    ['1.2', 'การออกแบบการจัดการเรียนรู้'],
    ['1.3', 'การจัดการเรียนรู้'],
    ['1.4', 'สร้างและหรือพัฒนาสื่อนวัตกรรม เทคโนโลยี และแหล่งเรียนรู้'],
    ['1.5', 'วัดและประเมินผลการเรียนรู้'],
    ['1.6', 'ศึกษา วิเคราะห์ และสังเคราะห์เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้'],
    ['1.7', 'การจัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน'],
    ['1.8', 'อบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน'],
  ]],
  ['2', '2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้', [
    ['2.1', 'การจัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา'],
    ['2.2', 'ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน'],
    ['2.3', 'ปฏิบัติงานวิชาการและงานอื่นๆ ของสถานศึกษา'],
    ['2.4', 'การประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ'],
  ]],
  ['3', '3. ด้านการพัฒนาตนเองและวิชาชีพ', [
    ['3.1', 'พัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง'],
    ['3.2', 'การมีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ เพื่อพัฒนาการจัดการเรียนรู้'],
    ['3.3', 'การนำความรู้ความสามารถ ทักษะที่ได้จากการพัฒนาตนเอง และวิชาชีพมาใช้ในการพัฒนาการจัดการเรียนรู้ การพัฒนาคุณภาพผู้เรียน และการพัฒนานวัตกรรมการจัดการเรียนรู้'],
  ]],
];

// รายการภาระงาน (แถว {name, hours}) — subjects/activities คือ 1.1 · support = 1.2 · quality = 1.3 · policy = 1.4
const PA_LOAD_LISTS = ['subjects', 'activities', 'support', 'quality', 'policy'];

// ภาคเรียนของปีงบประมาณ: ปีงบ 2569 (1 ต.ค. 68 – 30 ก.ย. 69) = ภาค 2/2568 และ 1/2569
function paTermLabels(fy) {
  fy = Number(fy);
  return fy > 2400 ? [`ภาคเรียนที่ 2/${fy - 1}`, `ภาคเรียนที่ 1/${fy}`] : ['ภาคเรียนที่ 2', 'ภาคเรียนที่ 1'];
}

// ------------------------------------------------------------------
// Firestore ref
// ------------------------------------------------------------------
function paCol(uid) {
  return db.collection('users').doc(uid).collection('pa_agreements');
}

function paRef(uid, docId) {
  return paCol(uid).doc(docId);
}

// ------------------------------------------------------------------
// โหลดรายการ PA ทั้งหมด
// ------------------------------------------------------------------
async function paLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await paCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------------------
// บันทึก PA
// ------------------------------------------------------------------
async function paSave(data) {
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data; // ฟิลด์ระบบไม่ถูกเขียนกลับ
  Object.keys(clean).forEach(k => { if (k[0] === '_') delete clean[k]; }); // ตัวแปรชั่วคราวในหน้าฟอร์ม
  data = clean;
  if (PAState.docId) {
    await paRef(uid, PAState.docId).update({ ...data, updatedAt: now });
    return PAState.docId;
  } else {
    const ref = await paCol(uid).add({ ...data, createdAt: now, updatedAt: now });
    PAState.docId = ref.id;
    return ref.id;
  }
}

// ------------------------------------------------------------------
// ลบ PA
// ------------------------------------------------------------------
async function paDelete(docId) {
  const uid = AppState.user?.uid;
  if (!uid) return;
  await paRef(uid, docId).delete();
  PAState.list = null;
}

// ------------------------------------------------------------------
// ช่วยเหลือทั่วไป
// ------------------------------------------------------------------
// ปีงบประมาณเริ่ม 1 ต.ค. (ต.ค.–ธ.ค. นับเป็นปีงบประมาณถัดไป)
function paFiscalYear(d = new Date()) { return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0); }
function paPeriodText(y) {
  y = Number(y);
  return y > 2400 ? `ระหว่างวันที่ 1 เดือน ตุลาคม พ.ศ. ${y - 1} ถึงวันที่ 30 เดือน กันยายน พ.ศ. ${y}` : '';
}
function paDocTitle(d) {
  return d.fiscalYear ? `ปีงบประมาณ พ.ศ. ${d.fiscalYear}` : `ปีการศึกษา ${d.year || '—'} ภาคเรียนที่ ${d.semester || '—'}`; // รายการเก่าใช้ปีการศึกษา/ภาคเรียน
}
const PA_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
function paThaiDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${+m[3]} ${PA_MONTHS[+m[2] - 1] || ''} ${+m[1] + 543}` : '';
}
function paNum(v) {
  const n = parseFloat(String(v ?? '').replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
const paFmtH = n => String(Math.round((Number(n) || 0) * 100) / 100);
const paSum = rows => (rows || []).reduce((s, r) => s + (Number(r.hours) || 0), 0);
const paNl = s => escapeHtml(s || '').replace(/\n/g, '<br>');

// เติมค่าเริ่มต้นให้ครบทุกฟิลด์ (รองรับเอกสารรุ่นเก่าที่มีแค่ classroomBasic / workload / outcome)
function paNormalize(d) {
  d = d || {};
  const ct = d.classroomTypes || {};
  d.classroomTypes = {
    basic: ct.basic !== undefined ? !!ct.basic : !!d.classroomBasic,
    early: !!ct.early, special: !!ct.special, vocational: !!ct.vocational, nonformal: !!ct.nonformal,
  };
  const L = d.load && typeof d.load === 'object' ? d.load : {};
  d.load = { group: String(L.group || '') };
  PA_LOAD_LISTS.forEach(k => {
    d.load[k] = (Array.isArray(L[k]) ? L[k] : []).map(r => ({ name: String((r && r.name) || ''), hours: Number(r && r.hours) || 0 }));
  });
  d.workItems = d.workItems && typeof d.workItems === 'object' ? d.workItems : {};
  ['challengeTitle', 'problem', 'method', 'outcomeQuant', 'outcomeQual', 'signDate'].forEach(k => { d[k] = String(d[k] || ''); });
  return d;
}

function paBlankDoc() {
  return paNormalize({
    fiscalYear: String(paFiscalYear()),
    classroomTypes: { basic: true },
    status: 'draft',
  });
}

// ข้อมูลผู้จัดทำจากหน้าข้อมูลส่วนตัว (ต้องโหลด profile.js ก่อน เพราะใช้ formatSalary)
function paOwnerFromProfile(p) {
  p = p || {};
  const hasSalary = p.salary !== '' && p.salary != null;
  return {
    name: [(p.prefix || '') + (p.firstName || ''), p.lastName || ''].filter(Boolean).join(' '),
    position: p.position || '',
    standing: p.academicStanding || '',
    pay: [p.ksLevel, hasSalary && 'อัตราเงินเดือน ' + formatSalary(p.salary) + ' บาท'].filter(Boolean).join(' '),
    school: p.school || '',
    affiliation: p.affiliation || '',
    director: p.director || '',
    subjectGroup: p.subjectGroup || '',
  };
}

// ชั่วโมงสอนจากตารางสอน (1 คาบ = 1 ชั่วโมง) — รวมคาบที่วางจริง ไม่นับคาบที่ทับกัน
async function paPullTimetable() {
  await loadModule('timetable');
  const tt = await loadTimetable();
  const placed = ttStats(tt).placed;
  const agg = kind => {
    const m = new Map();
    placed.filter(e => e.kind === kind).forEach(e => {
      const key = (e.code || '') + '|' + e.title;
      const cur = m.get(key) || { name: [e.code, e.title].filter(Boolean).join(' '), hours: 0 };
      cur.hours += e.span;
      m.set(key, cur);
    });
    return [...m.values()];
  };
  return { subjects: agg('class'), activities: agg('activity') };
}

// ------------------------------------------------------------------
// ไอคอน SVG
// ------------------------------------------------------------------
const PA_ICO_ADD   = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`;
const PA_ICO_EDIT  = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16.2 3.6a2.4 2.4 0 0 1 3.4 0l.8.8a2.4 2.4 0 0 1 0 3.4L9.5 18.7a2 2 0 0 1-.9.5l-4.3 1.1a.8.8 0 0 1-1-1l1.1-4.3c.1-.3.3-.6.5-.9Z"/></svg>`;
const PA_ICO_DEL   = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const PA_ICO_PRINT = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`;
const PA_ICO_PA    = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;

// ------------------------------------------------------------------
// ป้ายสถานะ
// ------------------------------------------------------------------
function paStatusBadge(status) {
  if (status === 'submitted') return `<span class="badge badge-success">ส่งแล้ว</span>`;
  return `<span class="badge badge-neutral">ร่าง</span>`;
}

// ==================================================================
// เอกสาร PA 1/ส สำหรับดูตัวอย่าง/พิมพ์ (ใช้ร่วมกับแท็บรายงานใน pa-report.js)
// ==================================================================
const PA1_CSS = `
.pa1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun New','Sarabun','Noto Sans Thai','Noto Sans Thai Looped',Tahoma,sans-serif;font-size:15px;line-height:1.55;text-align:left}
.pa1 *{box-sizing:border-box}
.pa1 .p1-c{text-align:center;font-weight:700}
.pa1 .p1-h{font-weight:700;margin-top:10px}
.pa1 .p1-i1{margin-top:4px}
.pa1 .p1-i2{padding-left:2.2em}
.pa1 .p1-i3{padding-left:4.4em}
.pa1 .p1-box{display:flex;flex-wrap:wrap;gap:0 24px;margin:2px 0 6px}
.pa1 .bx{display:inline-block;width:.8em;height:.8em;border:1px solid #000;margin-right:.45em;vertical-align:-1px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pa1 .bx.on{background:#000;box-shadow:inset 0 0 0 2px #fff}
.pa1 table{width:100%;border-collapse:collapse;margin-top:6px;font-size:.93em}
.pa1 th,.pa1 td{border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left}
.pa1 th{text-align:center;font-weight:700;background:#f1f1f1;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pa1 thead{display:table-header-group}
.pa1 tr{page-break-inside:avoid;break-inside:avoid}
.pa1 tr.grp td{font-weight:700;background:#fafafa;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pa1 .term{font-weight:700}
.pa1 .gap{height:6px}
.pa1 .p1-note{font-size:.9em;margin-top:8px}
.pa1 .p1-break{page-break-before:always;break-before:page}
.pa1 .p1-sign{margin-top:22px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;page-break-inside:avoid;break-inside:avoid}
.pa1 .p1-sign>div{width:min(330px,100%);text-align:center}
.pa1 .p1-dir{margin-top:20px;page-break-inside:avoid;break-inside:avoid}
.pa1 .p1-line{border-bottom:1px dotted #000;height:1.5em}
`;

function paBuildDocHtml(d, o) {
  d = paNormalize(JSON.parse(JSON.stringify(d || {})));
  o = o || {};
  const L = d.load;
  const [t1, t2] = paTermLabels(d.fiscalYear);
  const dots = '……………………………';
  const box = on => `<span class="bx${on ? ' on' : ''}"></span>`;
  const lines = (rows, cls, prefix = '') => rows.map(r => `<div class="${cls}">${prefix}${paNl(r.name)}${r.hours ? ` จำนวน ${paFmtH(r.hours)} ชั่วโมง/สัปดาห์` : ''}</div>`).join('');
  const sect = (no, title, rows, withHours = true) => {
    const s = paSum(rows);
    const tail = !withHours ? '' : s ? ` จำนวน ${paFmtH(s)} ชั่วโมง/สัปดาห์` : ` จำนวน ${dots} ชั่วโมง/สัปดาห์`;
    return `<div class="p1-i1">${no} ${title}${tail}</div>${lines(rows, 'p1-i2')}`;
  };

  const hasLoad = PA_LOAD_LISTS.some(k => L[k].length);
  const total = paSum(L.subjects) + paSum(L.activities);
  const loadHtml = hasLoad ? `
    <div class="p1-i1">1.1 ชั่วโมงสอนตามตารางสอน รวมจำนวน ${total ? paFmtH(total) : dots} ชั่วโมง/สัปดาห์ ดังนี้</div>
    ${L.group ? `<div class="p1-i2">กลุ่มสาระการเรียนรู้${paNl(L.group)}</div>` : ''}
    ${lines(L.subjects, 'p1-i2', 'รายวิชา ')}
    ${L.activities.length ? `<div class="p1-i2">กิจกรรมพัฒนาผู้เรียน จำนวน ${paFmtH(paSum(L.activities))} ชั่วโมง/สัปดาห์</div>${lines(L.activities, 'p1-i3', '- ')}` : ''}
    ${sect('1.2', 'งานส่งเสริมและสนับสนุนการจัดการเรียนรู้', L.support)}
    ${sect('1.3', 'งานพัฒนาคุณภาพการจัดการศึกษาของสถานศึกษา', L.quality)}
    ${sect('1.4', 'งานตอบสนองนโยบายและจุดเน้น', L.policy, false)}`
    : (d.workload ? `<div class="p1-i1">${paNl(d.workload)}</div>` : `<div class="p1-i1">1.1 ชั่วโมงสอนตามตารางสอน รวมจำนวน ${dots} ชั่วโมง/สัปดาห์</div>`);

  const tableRows = PA_WORK_ITEMS.map(([, gt, items]) =>
    `<tr class="grp"><td colspan="4">${gt}</td></tr>` + items.map(([id, label]) => {
      const w = d.workItems[id] || {};
      const tasks = [w.s1 && `<div class="term">${t1}</div>${paNl(w.s1)}`, w.s2 && `<div class="term">${t2}</div>${paNl(w.s2)}`]
        .filter(Boolean).join('<div class="gap"></div>');
      return `<tr><td>${id} ${label}</td><td>${tasks}</td><td>${paNl(w.outcome)}</td><td>${paNl(w.indicator)}</td></tr>`;
    }).join('')).join('');

  const legacyOutcome = !d.outcomeQuant && !d.outcomeQual && d.outcome;
  const block = (n, title, val) => `<div class="p1-h">${n} ${title}</div><div class="p1-i1">${paNl(val) || dots}</div>`;

  return `<div class="pa1">
    <div class="p1-c">แบบตกลงในการพัฒนางาน (PA)</div>
    <div class="p1-c">สำหรับข้าราชการครูและบุคลากรทางการศึกษา ตำแหน่ง ครู</div>
    <div class="p1-c">(สังกัดสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน)</div>
    <div class="p1-c">ประจำปีงบประมาณ พ.ศ. ${escapeHtml(d.fiscalYear)}</div>
    <div class="p1-c">${escapeHtml(paPeriodText(d.fiscalYear))}</div>

    <div class="p1-h">ผู้จัดทำข้อตกลง</div>
    <div>ชื่อ-นามสกุล ${escapeHtml(o.name || dots)} ตำแหน่ง ${escapeHtml(o.position || dots)} วิทยฐานะ ${escapeHtml(o.standing || dots)}</div>
    <div>สถานศึกษา ${escapeHtml(o.school || dots)} สังกัด ${escapeHtml(o.affiliation || dots)}</div>
    <div>รับเงินเดือนในตำแหน่ง ${escapeHtml(o.pay || dots)}</div>
    <div class="p1-h">ประเภทห้องเรียนที่จัดการเรียนรู้ (สามารถระบุได้มากกว่า 1 ประเภทห้องเรียน ตามสภาพการจัดการเรียนรู้จริง)</div>
    <div class="p1-box">${PA_CLASSROOM_TYPES.map(([k, l]) => `<div>${box(d.classroomTypes[k])}${l}</div>`).join('')}</div>
    <div>ข้าพเจ้าขอแสดงเจตจำนงในการจัดทำข้อตกลงในการพัฒนางานตำแหน่ง ${escapeHtml(o.position || 'ครู')} วิทยฐานะ${escapeHtml(o.standing || dots)} ซึ่งเป็นตำแหน่งและวิทยฐานะที่ดำรงอยู่ในปัจจุบันกับผู้อำนวยการสถานศึกษา ไว้ดังต่อไปนี้</div>

    <div class="p1-h">ส่วนที่ 1 ข้อตกลงในการพัฒนางานตามมาตรฐานตำแหน่ง</div>
    <div class="p1-h">1. ภาระงาน จะมีภาระงานเป็นไปตามที่ ก.ค.ศ. กำหนด</div>
    ${loadHtml}

    <div class="p1-h">2. งานที่จะปฏิบัติตามมาตรฐานตำแหน่งครู (ให้ระบุรายละเอียดของงานที่จะปฏิบัติในแต่ละด้านว่าจะดำเนินการอย่างไร โดยอาจระบุระยะเวลาที่ใช้ในการดำเนินการด้วยก็ได้)</div>
    <table>
      <thead><tr>
        <th style="width:20%">ลักษณะงานที่ปฏิบัติตามมาตรฐานตำแหน่ง</th>
        <th style="width:30%">งาน (Tasks) ที่จะดำเนินการพัฒนาตามข้อตกลงใน 1 รอบการประเมิน (โปรดระบุ)</th>
        <th style="width:25%">ผลลัพธ์ (Outcomes) ของงานตามข้อตกลงที่คาดหวังให้เกิดขึ้นกับผู้เรียน (โปรดระบุ)</th>
        <th style="width:25%">ตัวชี้วัด (Indicators) ที่จะเกิดขึ้นกับผู้เรียนที่แสดงให้เห็นถึงการเปลี่ยนแปลงไปในทางที่ดีขึ้นหรือมีการพัฒนามากขึ้นหรือผลสัมฤทธิ์สูงขึ้น (โปรดระบุ)</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="p1-note"><b>หมายเหตุ</b>
      <div>1. รูปแบบการจัดทำข้อตกลงในการพัฒนา ตามแบบ PA 1 ให้เป็นไปตามบริบท และสภาพการจัดการเรียนรู้ของแต่ละสถานศึกษา โดยความเห็นชอบร่วมกันระหว่างผู้อำนวยการสถานศึกษา ข้าราชการครูและบุคลากรทางการศึกษา ผู้จัดทำข้อตกลง</div>
      <div>2. งาน (Tasks) ที่เสนอเป็นข้อตกลงในการพัฒนางาน ต้องเป็นงานในหน้าที่ความรับผิดชอบหลัก ที่ส่งผลโดยตรงต่อผลลัพธ์การเรียนรู้ของผู้เรียน และให้นำเสนอรายวิชาหลักที่ทำการสอน โดยเสนอในภาพรวมของรายวิชาหลักที่ทำการสอนทุกระดับชั้น ในกรณีที่สอนหลายรายวิชา สามารถเลือกรายวิชาใดวิชาหนึ่งได้ โดยจะต้องแสดงให้เห็นถึงการปฏิบัติงานตามมาตรฐานตำแหน่ง และคณะกรรมการประเมินผลการพัฒนางานตามข้อตกลงสามารถประเมินได้ตามแบบการประเมิน PA 2</div>
      <div>3. การพัฒนางานตามข้อตกลง ตามแบบ PA 1 ให้ความสำคัญกับผลลัพธ์การเรียนรู้ของผู้เรียน (Outcomes) และตัวชี้วัด (Indicators) ที่เป็นรูปธรรม และการประเมินของคณะกรรมการประเมินผลการพัฒนางานตามข้อตกลง ให้คณะกรรมการดำเนินการประเมิน ตามแบบ PA 2 จากการปฏิบัติงานจริง สภาพการจัดการเรียนรู้ในบริบทของแต่ละสถานศึกษา และผลลัพธ์การเรียนรู้ของผู้เรียนที่เกิดจากการพัฒนางานตามข้อตกลงเป็นสำคัญ โดยไม่เน้นการประเมินจากเอกสาร</div>
    </div>

    <div class="p1-break"></div>
    <div class="p1-h">ส่วนที่ 2 ข้อตกลงในการพัฒนางานที่เป็นประเด็นท้าทายในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียน</div>
    <div>ประเด็นที่ท้าทายในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียนของผู้จัดทำข้อตกลง ซึ่งปัจจุบันดำรงตำแหน่ง ครู ต้องแสดงให้เห็นถึงระดับการปฏิบัติที่คาดหวัง คือ การปรับประยุกต์การจัดการเรียนรู้และการพัฒนาคุณภาพการเรียนรู้ของผู้เรียน ให้เกิดการเปลี่ยนแปลงไปในทางที่ดีขึ้นหรือมีการพัฒนามากขึ้น (ทั้งนี้ ประเด็นท้าทายอาจจะแสดงให้เห็นถึงระดับการปฏิบัติที่คาดหวังที่สูงกว่าได้)</div>
    <div class="p1-h">ประเด็นท้าทาย เรื่อง ${paNl(d.challengeTitle) || dots}</div>
    ${block('1.', 'สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้', d.problem)}
    ${block('2.', 'วิธีการดำเนินการให้บรรลุผล', d.method)}
    <div class="p1-h">3. ผลลัพธ์การพัฒนาที่คาดหวัง</div>
    ${legacyOutcome ? `<div class="p1-i1">${paNl(d.outcome)}</div>` : `
    <div class="p1-i1"><b>3.1 เชิงปริมาณ</b></div><div class="p1-i2">${paNl(d.outcomeQuant) || dots}</div>
    <div class="p1-i1"><b>3.2 เชิงคุณภาพ</b></div><div class="p1-i2">${paNl(d.outcomeQual) || dots}</div>`}

    <div class="p1-sign">
      <div>ลงชื่อ........................................................................</div>
      <div>(${escapeHtml(o.name || '………………………………')})</div>
      <div>ตำแหน่ง ${escapeHtml([o.position, o.standing].filter(Boolean).join(' วิทยฐานะ') || '………………')}</div>
      <div>ผู้จัดทำข้อตกลงในการพัฒนางาน</div>
      <div>${escapeHtml(paThaiDate(d.signDate) || '................/.............../...................')}</div>
    </div>

    <div class="p1-dir">
      <div class="p1-h">ความเห็นของผู้อำนวยการสถานศึกษา</div>
      <div>(${box(false)}) เห็นชอบให้เป็นข้อตกลงในการพัฒนางาน</div>
      <div>(${box(false)}) ไม่เห็นชอบให้เป็นข้อตกลงในการพัฒนางาน โดยมีข้อเสนอแนะเพื่อนำไปแก้ไข และเสนอเพื่อพิจารณาอีกครั้ง ดังนี้</div>
      <div class="p1-line"></div><div class="p1-line"></div>
      <div class="p1-sign">
        <div>ลงชื่อ........................................................................</div>
        <div>(${escapeHtml(o.director || '………………………………')})</div>
        <div>ตำแหน่ง ผู้อำนวยการ${escapeHtml(o.school || '')}</div>
        <div>................/.............../...................</div>
      </div>
    </div>
  </div>`;
}

// เปิดหน้าต่างใหม่แล้วสั่งพิมพ์ (ผู้ใช้เลือก "บันทึกเป็น PDF" ได้จากหน้าต่างพิมพ์ของเบราว์เซอร์)
function paPrint(d, o) {
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองใหม่'); return; }
  const title = `PA1_${(o && o.name) || ''}_${d.fiscalYear || ''}`.replace(/\s+/g, '_');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${PA1_CSS}@page{size:A4;margin:16mm 14mm}html,body{margin:0;background:#fff}.pa1{font-size:15px}</style></head>
    <body>${paBuildDocHtml(d, o)}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* ผู้ใช้สั่งพิมพ์เองได้ */ } }, 400);
}

// ------------------------------------------------------------------
// โครงหน้า: หัวเรื่อง + แท็บ (แบบฟอร์มข้อตกลง | ตัวอย่าง/พิมพ์) + พื้นที่เนื้อหา
// ปุ่มเมนูข้างปุ่มเดียว (pa-page) เปิดหน้านี้ — สลับสองมุมมองด้วยแท็บโดยไม่วาดทั้งหน้าใหม่
// ------------------------------------------------------------------
const PA_TABS = [['agreement', 'แบบฟอร์มข้อตกลง'], ['report', 'ตัวอย่าง / พิมพ์ PA 1']];

function paBuildShell() {
  const view = document.getElementById('view');
  view.innerHTML = `
    ${pageHeaderHtml('ข้อตกลง PA')}
    <div class="tabs" id="pa-tabs" role="tablist">
      ${PA_TABS.map(([id, label]) => `<div class="tab ${PAState.tab === id ? 'active' : ''}" data-tab="${id}" role="tab" aria-selected="${PAState.tab === id}" tabindex="0">${label}</div>`).join('')}
    </div>
    <div id="pa-tab-body"></div>`;
  const tabs = view.querySelector('#pa-tabs');
  initNavPill(tabs, '.tab', 'seg-pill');
  tabs.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => paSwitchTab(t.dataset.tab));
    t.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); paSwitchTab(t.dataset.tab); }
    });
  });
}

// พื้นที่เนื้อหาของแท็บ — ถ้ายังไม่มีโครง (เช่นถูกเรียกก่อน renderPAPage) ให้สร้างให้
function paMount() {
  const view = document.getElementById('view');
  if (!view.querySelector('#pa-tab-body')) paBuildShell();
  return view.querySelector('#pa-tab-body');
}

// เนื้อหาใหม่มาแล้ว: ยกเลิกตัวโหลด + จางเข้าเฉพาะพื้นที่เนื้อหา (แท็บไม่กะพริบ)
function paSwapIn(body) {
  clearLoading(body);
  body.classList.remove('is-switching', 'tab-swap');
  void body.offsetWidth; // รีสตาร์ทแอนิเมชันถ้าสลับซ้ำเร็วๆ
  body.classList.add('tab-swap');
}

function paRenderTab() {
  if (PAState.tab === 'report') return renderPAReportView();
  return PAState.view === 'form' ? renderPAFormView() : renderPAListView();
}

async function paSwitchTab(tab) {
  if (tab === PAState.tab || !PA_TABS.some(t => t[0] === tab)) return;
  // กำลังกรอกฟอร์มอยู่: เก็บค่าที่พิมพ์ค้างไว้ใน PAState.doc กลับมาที่แท็บข้อตกลงแล้วยังอยู่ครบ
  if (PAState.tab === 'agreement' && PAState.view === 'form') paCollectFormData();
  PAState.tab = tab;
  const tabs = document.getElementById('pa-tabs');
  tabs?.querySelectorAll('.tab').forEach(x => {
    const on = x.dataset.tab === tab;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
  });
  tabs?.__pillPlace?.(true);
  document.getElementById('pa-tab-body')?.classList.add('is-switching'); // หรี่เนื้อหาเดิมทันที ระหว่างรอข้อมูล
  await paRenderTab();
}

// ------------------------------------------------------------------
// หน้ารายการ PA (แท็บแบบฟอร์มข้อตกลง)
// ------------------------------------------------------------------
async function renderPAListView() {
  const view = paMount(); // = พื้นที่เนื้อหาของแท็บ
  showLoading('list', view);

  let list = [];
  try {
    list = await paLoadList();
    PAState.list = list;
  } catch (err) {
    if (!view.isConnected || PAState.tab !== 'agreement') return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }

  if (!view.isConnected || PAState.tab !== 'agreement' || PAState.view !== 'list') return;

  const rows = list.map(d => `
    <div class="pa-row card" data-id="${escapeHtml(d.id)}">
      <span class="pa-row-icon"><span class="nav-icon" style="--w:var(--hue-blue)">${PA_ICO_PA}</span></span>
      <div class="pa-row-info">
        <div class="pa-row-title">${escapeHtml(paDocTitle(d))}</div>
        <div class="pa-row-sub">${escapeHtml(d.challengeTitle || d.department || d.position || '')}</div>
      </div>
      <div class="pa-row-meta">
        ${paStatusBadge(d.status)}
      </div>
      <div class="pa-row-actions">
        <button type="button" class="btn btn-ghost btn-sm pa-print-btn" data-id="${escapeHtml(d.id)}" title="ดูตัวอย่าง / พิมพ์">${PA_ICO_PRINT} พิมพ์</button>
        <button type="button" class="btn btn-ghost btn-sm pa-edit-btn" data-id="${escapeHtml(d.id)}" title="แก้ไข">${PA_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-danger-ghost btn-sm pa-del-btn" data-id="${escapeHtml(d.id)}" title="ลบ">${PA_ICO_DEL}</button>
      </div>
    </div>`).join('');

  const empty = list.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <div class="icon">${PA_ICO_PA}</div>
        <div class="empty-title">ยังไม่มีข้อตกลง PA</div>
        <div class="empty-sub">กดปุ่มด้านล่างเพื่อสร้างข้อตกลง PA ประจำปีงบประมาณ</div>
        <button type="button" class="btn btn-primary pa-new-btn">${PA_ICO_ADD} สร้างข้อตกลง PA ใหม่</button>
      </div>
    </div>` : '';

  view.innerHTML = `
    <div class="pa-toolbar">
      <span class="u-note">${list.length > 0 ? `${list.length} รายการ` : ''}</span>
      ${list.length > 0 ? `<button type="button" class="btn btn-primary btn-sm pa-new-btn">${PA_ICO_ADD} สร้างใหม่</button>` : ''}
    </div>
    ${empty}
    <div class="pa-list">${rows}</div>
    <style>
      .pa-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      .pa-list{display:flex;flex-direction:column;gap:10px}
      .pa-row{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:box-shadow .15s}
      .pa-row:hover{box-shadow:0 0 0 2px var(--primary)}
      .pa-row-icon .nav-icon{width:40px;height:40px;border-radius:var(--radius-xs);display:grid;place-items:center;flex-shrink:0}
      .pa-row-icon .nav-icon::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(145deg,oklch(from var(--w) calc(l + .06) calc(c * 1.18) h),oklch(from var(--w) calc(l - .05) calc(c * 1.25) h));-webkit-mask:var(--squircle) center/100% 100% no-repeat;mask:var(--squircle) center/100% 100% no-repeat}
      .pa-row-info{flex:1;min-width:0}
      .pa-row-title{font-weight:600;font-size:15px;color:var(--ink)}
      .pa-row-sub{font-size:13px;color:var(--ink-soft);margin-top:2px}
      .pa-row-meta{flex-shrink:0}
      .pa-row-actions{display:flex;gap:6px;flex-shrink:0}
      .pa-row-actions .ico{width:16px;height:16px}
      .badge{display:inline-block;padding:3px 10px;border-radius:var(--radius-pill);font-size:12px;font-weight:600}
      @media(max-width:540px){.pa-row{flex-wrap:wrap}.pa-row-actions{width:100%;justify-content:flex-end}}
    </style>`;

  view.querySelectorAll('.pa-new-btn').forEach(b => b.addEventListener('click', () => {
    PAState.docId = null;
    PAState.doc = paBlankDoc();
    PAState.view = 'form';
    renderPAFormView();
  }));
  const openEdit = id => {
    const d = PAState.list?.find(x => x.id === id);
    if (!d) return;
    PAState.docId = id;
    PAState.doc = paNormalize(JSON.parse(JSON.stringify(d))); // deep copy
    PAState.view = 'form';
    renderPAFormView();
  };
  view.querySelectorAll('.pa-edit-btn').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openEdit(b.dataset.id);
  }));
  view.querySelectorAll('.pa-row').forEach(r => r.addEventListener('click', () => openEdit(r.dataset.id)));
  view.querySelectorAll('.pa-print-btn').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    PAState.previewId = b.dataset.id;
    paSwitchTab('report');
  }));
  view.querySelectorAll('.pa-del-btn').forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = b.dataset.id;
    const row = b.closest('.pa-row');
    if (!row.dataset.confirmDel) {
      row.dataset.confirmDel = '1';
      b.textContent = 'ยืนยันลบ?';
      b.classList.add('btn-danger');
      b.classList.remove('btn-danger-ghost');
      setTimeout(() => { delete row.dataset.confirmDel; b.innerHTML = PA_ICO_DEL; b.classList.remove('btn-danger'); b.classList.add('btn-danger-ghost'); }, 3000);
      return;
    }
    b.disabled = true;
    try {
      await paDelete(id);
      await renderPAListView();
    } catch (err) {
      b.disabled = false;
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  }));

  view.classList.remove('is-switching');
  paSwapIn(view);
}

// ------------------------------------------------------------------
// หน้าฟอร์ม PA (อยู่ในแท็บแบบฟอร์มข้อตกลง)
// ------------------------------------------------------------------
function paRowHtml(r = {}, ph = '') {
  return `<div class="pa-lrow">
    <input class="pa-l-name" type="text" maxlength="150" placeholder="${escapeHtml(ph)}" value="${escapeHtml(r.name || '')}" aria-label="ชื่อรายการ">
    <input class="pa-l-hours" type="text" inputmode="decimal" maxlength="5" placeholder="ชม." value="${r.hours ? escapeHtml(paFmtH(r.hours)) : ''}" aria-label="ชั่วโมงต่อสัปดาห์">
    <button type="button" class="btn btn-danger-ghost btn-sm pa-l-del" title="ลบแถว" aria-label="ลบแถว">${PA_ICO_DEL}</button>
  </div>`;
}

function paLoadBlock(key, title, rows, ph) {
  return `<div class="pa-lblock">
    <div class="pa-sub">${title}</div>
    <div class="pa-lrows" data-list="${key}">${rows.map(r => paRowHtml(r, ph)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm pa-l-add" data-list="${key}" data-ph="${escapeHtml(ph)}">${PA_ICO_ADD} เพิ่มแถว</button>
  </div>`;
}

async function renderPAFormView() {
  const view = paMount(); // = พื้นที่เนื้อหาของแท็บ
  const d = PAState.doc = paNormalize(PAState.doc);
  const isNew = !PAState.docId;
  showLoading('list', view);
  let p;
  try { await loadModule('profile'); p = await loadTeacherProfile(); } catch (err) { p = AppState.teacherProfile || {}; }
  if (!view.isConnected || PAState.tab !== 'agreement' || PAState.view !== 'form') return; // ผู้ใช้สลับแท็บ/ออกไปแล้ว

  // เอกสารที่ "ส่งแล้ว" ใช้สำเนาข้อมูลผู้จัดทำที่เก็บไว้ (ไม่เปลี่ยนตามโปรไฟล์) · นอกนั้นใช้ข้อมูลปัจจุบัน
  let liveOwner;
  try { liveOwner = paOwnerFromProfile(p); } catch (err) { liveOwner = {}; }
  const frozen = d.status === 'submitted' && d.owner;
  const o = frozen ? d.owner : liveOwner;

  if (!d.load.group && liveOwner.subjectGroup) d.load.group = liveOwner.subjectGroup;
  // สร้างใหม่: ดึงชั่วโมงสอนจากตารางสอนให้ครั้งเดียว (ลบ/แก้ได้) — ถ้าดึงไม่ได้ก็กรอกเอง
  if (isNew && !d._ttTried) {
    d._ttTried = true;
    try {
      const t = await paPullTimetable();
      if (!PA_LOAD_LISTS.some(k => d.load[k].length)) { d.load.subjects = t.subjects; d.load.activities = t.activities; }
    } catch (err) { /* ไม่มีตารางสอน/ออฟไลน์ — ข้าม */ }
    if (!view.isConnected || PAState.tab !== 'agreement' || PAState.view !== 'form') return;
  }

  const item = (label, val, wide) => `<div class="pa-pf-item${wide ? ' pa-pf-wide' : ''}"><dt>${label}</dt><dd>${val ? escapeHtml(val) : '—'}</dd></div>`;
  const area = (id, label, val, rows, ph = '') =>
    `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}" placeholder="${escapeHtml(ph)}">${escapeHtml(val || '')}</textarea></div>`;
  const [t1, t2] = paTermLabels(d.fiscalYear);
  const wiArea = (id, f, label, val, rows) => {
    const eid = `pa-wi-${id.replace('.', '_')}-${f}`;
    return `<div class="field"><label for="${eid}">${label}</label><textarea id="${eid}" rows="${rows}" data-wi="${id}" data-f="${f}">${escapeHtml(val || '')}</textarea></div>`;
  };
  const hasLegacyLoad = d.workload && !PA_LOAD_LISTS.some(k => d.load[k].length);

  view.innerHTML = `
    <div class="pa-form-head">
      <button type="button" class="btn btn-ghost btn-sm pa-back-btn">← กลับ</button>
      <div>
        <h2 class="pa-form-title">PA 1/ส · ${isNew ? 'สร้างข้อตกลงใหม่' : 'แก้ไขข้อตกลง'}</h2>
        <div class="u-note">แบบตกลงในการพัฒนางาน (PA) สำหรับข้าราชการครูและบุคลากรทางการศึกษา ตำแหน่ง ครู (สังกัด สพฐ.)</div>
      </div>
    </div>

    <form id="pa-form" class="pa-form" novalidate>
      <div class="card card-pad">
        <h2 class="card-title">ผู้จัดทำข้อตกลง</h2>
        <dl class="pa-pf">
          ${item('ชื่อ-นามสกุล', o.name)}${item('ตำแหน่ง', o.position)}
          ${item('วิทยฐานะ', o.standing)}${item('รับเงินเดือนในตำแหน่ง', o.pay)}
          ${item('สถานศึกษา', o.school)}${item('สังกัด', o.affiliation)}
        </dl>
        <div class="pa-pf-note">
          <span>${frozen ? 'เอกสารนี้ส่งแล้ว — ใช้ข้อมูลผู้จัดทำที่บันทึกไว้ตอนส่ง (เปลี่ยนสถานะเป็น "ร่าง" เพื่อดึงข้อมูลล่าสุด)' : `ข้อมูลนี้ดึงจากหน้าข้อมูลส่วนตัว${!o.name || !o.school ? ' — ยังกรอกไม่ครบ' : ''}`}</span>
          <button type="button" class="btn btn-ghost btn-sm pa-goto-profile">ไปแก้ในข้อมูลส่วนตัว</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="pa-fiscalYear">ปีงบประมาณ พ.ศ.</label>
            <input id="pa-fiscalYear" type="text" inputmode="numeric" maxlength="4" value="${escapeHtml(d.fiscalYear || '')}" placeholder="${paFiscalYear()}">
            <div class="field-hint" id="pa-period">${escapeHtml(paPeriodText(d.fiscalYear))}</div>
          </div>
          <div class="field">
            <label for="pa-status">สถานะ</label>
            <select id="pa-status">
              <option value="draft"${(d.status || 'draft') === 'draft' ? ' selected' : ''}>ร่าง</option>
              <option value="submitted"${d.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option>
            </select>
          </div>
        </div>
        <div class="pa-sub">ประเภทห้องเรียนที่จัดการเรียนรู้ (เลือกได้มากกว่า 1)</div>
        <div class="pa-checks">
          ${PA_CLASSROOM_TYPES.map(([k, l]) => `<label class="pa-check"><input type="checkbox" data-ct="${k}"${d.classroomTypes[k] ? ' checked' : ''}> ${l}</label>`).join('')}
        </div>
        <div class="field" style="margin-top:14px;max-width:260px">
          <label for="pa-signDate">วันที่ลงนามของผู้จัดทำ</label>
          <input id="pa-signDate" type="date" value="${escapeHtml(d.signDate || '')}">
        </div>
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ส่วนที่ 1 · 1. ภาระงาน</h2>
        <div class="pa-pf-note" style="margin-bottom:12px">
          <span>1.1 ดึงจากตารางสอน (นับ 1 คาบ = 1 ชั่วโมง) เก็บเป็นสำเนาในเอกสารนี้ — แก้ไขได้ และไม่เปลี่ยนตามตารางสอนภายหลัง · ตารางสอนมีภาคเรียนเดียว ถ้า PA ครอบสองภาคเรียนให้เพิ่มรายวิชาอีกภาคเอง</span>
          <button type="button" class="btn btn-ghost btn-sm" id="pa-tt-pull">ดึงจากตารางสอนใหม่</button>
        </div>
        ${hasLegacyLoad ? `<div class="pa-legacy"><div class="pa-sub">ข้อความภาระงานแบบเดิม (ยังเก็บไว้ ไม่ถูกลบ)</div><div class="pa-legacy-text">${escapeHtml(d.workload)}</div></div>` : ''}
        <div class="field"><label for="pa-load-group">กลุ่มสาระการเรียนรู้</label><input id="pa-load-group" type="text" maxlength="100" value="${escapeHtml(d.load.group)}" placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี"></div>
        ${paLoadBlock('subjects', '1.1 รายวิชาที่สอน', d.load.subjects, 'เช่น ว32105 วิทยาการคำนวณ')}
        ${paLoadBlock('activities', '1.1 กิจกรรมพัฒนาผู้เรียน', d.load.activities, 'เช่น กิจกรรมชุมนุม')}
        <div class="pa-total">รวมชั่วโมงสอน (1.1): <b id="pa-load-total">${paFmtH(paSum(d.load.subjects) + paSum(d.load.activities))}</b> ชั่วโมง/สัปดาห์</div>
        ${paLoadBlock('support', '1.2 งานส่งเสริมและสนับสนุนการจัดการเรียนรู้', d.load.support, 'เช่น การมีส่วนร่วมชุมชนการเรียนรู้ทางวิชาชีพ')}
        ${paLoadBlock('quality', '1.3 งานพัฒนาคุณภาพการจัดการศึกษาของสถานศึกษา', d.load.quality, 'เช่น เจ้าหน้าที่ตามโครงสร้างฝ่าย')}
        ${paLoadBlock('policy', '1.4 งานตอบสนองนโยบายและจุดเน้น', d.load.policy, 'ระบุงาน (ถ้ามี)')}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ส่วนที่ 1 · 2. งานที่จะปฏิบัติตามมาตรฐานตำแหน่งครู</h2>
        <div class="u-note" style="margin-bottom:12px">กรอกแต่ละข้อ: งานที่จะทำในแต่ละภาคเรียน · ผลลัพธ์ที่คาดหวังกับผู้เรียน · ตัวชี้วัด — ข้อที่เว้นว่างจะแสดงเป็นช่องว่างในเอกสาร</div>
        ${PA_WORK_ITEMS.map(([gid, gt, items]) => `
          <details class="pa-wgroup"${gid === '1' ? ' open' : ''}>
            <summary>${gt}</summary>
            ${items.map(([id, label]) => {
              const w = d.workItems[id] || {};
              return `<div class="pa-witem">
                <div class="pa-witem-h">${id} ${label}</div>
                ${wiArea(id, 's1', `งานที่จะดำเนินการ · ${t1}`, w.s1, 3)}
                ${wiArea(id, 's2', `งานที่จะดำเนินการ · ${t2}`, w.s2, 3)}
                ${wiArea(id, 'outcome', 'ผลลัพธ์ (Outcomes) ที่คาดหวังกับผู้เรียน', w.outcome, 3)}
                ${wiArea(id, 'indicator', 'ตัวชี้วัด (Indicators)', w.indicator, 3)}
              </div>`;
            }).join('')}
          </details>`).join('')}
      </div>

      <div class="card card-pad">
        <h2 class="card-title">ส่วนที่ 2 ข้อตกลงในการพัฒนางานที่เป็นประเด็นท้าทาย</h2>
        ${area('pa-challengeTitle', 'เรื่อง ประเด็นท้าทาย', d.challengeTitle, 3, 'เช่น การพัฒนาทักษะ … ของนักเรียนระดับชั้น … โดยใช้ …')}
        ${area('pa-problem', '1. สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้', d.problem, 5)}
        ${area('pa-method', '2. วิธีการดำเนินการให้บรรลุผล', d.method, 5)}
        ${d.outcome && !d.outcomeQuant && !d.outcomeQual ? `<div class="pa-legacy"><div class="pa-sub">ผลลัพธ์ที่คาดหวังแบบเดิม (ยังเก็บไว้ — ย้ายไปช่อง 3.1/3.2 ด้านล่างได้)</div><div class="pa-legacy-text">${escapeHtml(d.outcome)}</div></div>` : ''}
        ${area('pa-outcomeQuant', '3.1 ผลลัพธ์การพัฒนาที่คาดหวัง · เชิงปริมาณ', d.outcomeQuant, 4, 'จำนวนห้อง/นักเรียน และร้อยละที่คาดหวัง')}
        ${area('pa-outcomeQual', '3.2 ผลลัพธ์การพัฒนาที่คาดหวัง · เชิงคุณภาพ', d.outcomeQual, 4)}
      </div>

      <div class="pa-form-footer">
        <button type="button" class="btn btn-ghost pa-cancel-btn">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="pa-save-btn">บันทึกข้อตกลง PA</button>
      </div>
    </form>
    <style>
      .pa-checks{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
      .pa-lblock{margin-top:16px}
      .pa-lrow{display:grid;grid-template-columns:minmax(0,1fr) 76px auto;gap:8px;margin-bottom:8px;align-items:center}
      .pa-lrow input{width:100%;min-width:0}
      .pa-total{margin:12px 0 0;padding:8px 12px;border-radius:var(--radius-s);background:var(--surface-sunken);font-size:14px}
      .pa-legacy{margin-bottom:14px}
      .pa-legacy-text{white-space:pre-wrap;font-size:13.5px;padding:10px 12px;border-radius:var(--radius-s);background:var(--surface-sunken);color:var(--ink-soft)}
      .pa-wgroup{border:1px solid var(--border);border-radius:var(--radius-s);margin-bottom:10px;overflow:hidden}
      .pa-wgroup>summary{cursor:pointer;padding:12px 14px;font-weight:700;background:var(--surface-sunken)}
      .pa-witem{padding:12px 14px;border-top:1px solid var(--border)}
      .pa-witem-h{font-weight:600;margin-bottom:8px;color:var(--ink)}
      @media(max-width:540px){.pa-checks{grid-template-columns:1fr}}
    </style>`;

  const form = view.querySelector('#pa-form');
  view.querySelectorAll('.pa-back-btn, .pa-cancel-btn').forEach(b => b.addEventListener('click', () => {
    PAState.view = 'list'; renderPAListView();
  }));
  view.querySelector('.pa-goto-profile').addEventListener('click', () => { paCollectFormData(); navigate('profile'); });
  view.querySelector('#pa-fiscalYear').addEventListener('input', e => {
    view.querySelector('#pa-period').textContent = paPeriodText(e.target.value);
  });

  // เพิ่ม/ลบแถวภาระงาน + รวมชั่วโมง 1.1 แบบสด
  const updTotal = () => {
    let t = 0;
    ['subjects', 'activities'].forEach(k => form.querySelectorAll(`.pa-lrows[data-list="${k}"] .pa-l-hours`).forEach(i => { t += paNum(i.value); }));
    form.querySelector('#pa-load-total').textContent = paFmtH(t);
  };
  form.addEventListener('click', e => {
    const add = e.target.closest('.pa-l-add');
    if (add) {
      const box = form.querySelector(`.pa-lrows[data-list="${add.dataset.list}"]`);
      box.insertAdjacentHTML('beforeend', paRowHtml({}, add.dataset.ph));
      box.lastElementChild.querySelector('input').focus();
      return;
    }
    const del = e.target.closest('.pa-l-del');
    if (del) { del.closest('.pa-lrow').remove(); updTotal(); }
  });
  form.addEventListener('input', e => { if (e.target.classList.contains('pa-l-hours')) updTotal(); });

  view.querySelector('#pa-tt-pull').addEventListener('click', async () => {
    paCollectFormData();
    const has = ['subjects', 'activities'].some(k => PAState.doc.load[k].length);
    if (has && !confirm('แทนที่รายวิชาและกิจกรรมที่กรอกไว้ด้วยข้อมูลจากตารางสอน?')) return;
    try {
      const t = await paPullTimetable();
      if (!t.subjects.length && !t.activities.length) { showToast('ตารางสอนยังไม่มีคาบ'); return; }
      PAState.doc.load.subjects = t.subjects;
      PAState.doc.load.activities = t.activities;
      const y = window.scrollY;
      await renderPAFormView();
      window.scrollTo(0, y);
      showToast('ดึงชั่วโมงสอนจากตารางสอนแล้ว');
    } catch (err) {
      showToast('ดึงตารางสอนไม่สำเร็จ: ' + (err.message || err));
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    paCollectFormData();
    if (!/^\d{4}$/.test(PAState.doc.fiscalYear)) { showToast('ปีงบประมาณต้องเป็นตัวเลข 4 หลัก เช่น ' + paFiscalYear()); view.querySelector('#pa-fiscalYear').focus(); return; }
    // เก็บสำเนาข้อมูลผู้จัดทำ: เอกสารที่ส่งแล้วและมีสำเนาเดิม = คงไว้ · นอกนั้นใช้ข้อมูลปัจจุบัน
    if (!(PAState.doc.status === 'submitted' && PAState.doc.owner)) PAState.doc.owner = liveOwner;
    const btn = view.querySelector('#pa-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      await paSave(PAState.doc);
      PAState.list = null; // clear cache
      if (typeof islandToast === 'function') islandToast('บันทึกข้อตกลง PA แล้ว', 'save');
      PAState.view = 'list';
      await renderPAListView();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'บันทึกข้อตกลง PA';
      showToast(err.code === 'permission-denied' ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)' : 'บันทึกไม่สำเร็จ: ' + (err.message || err));
    }
  });

  if (typeof paAiMount === 'function') paAiMount(view, form); // ปุ่มผู้ช่วย AI (js/pa-ai.js) — ไม่มีไฟล์นี้ฟอร์มก็ทำงานตามเดิม

  view.classList.remove('is-switching');
  paSwapIn(view);
}

// ------------------------------------------------------------------
// เก็บค่าจากฟอร์มกลับเข้า PAState.doc
// ------------------------------------------------------------------
function paCollectFormData() {
  const el = id => document.getElementById(id);
  if (!el('pa-form')) return; // ไม่ได้อยู่ในหน้าฟอร์ม
  const get = id => (el(id)?.value || '').trim();

  const classroomTypes = {};
  document.querySelectorAll('[data-ct]').forEach(c => { classroomTypes[c.dataset.ct] = c.checked; });

  const load = { group: get('pa-load-group') };
  PA_LOAD_LISTS.forEach(k => {
    const box = document.querySelector(`.pa-lrows[data-list="${k}"]`);
    load[k] = box ? [...box.querySelectorAll('.pa-lrow')]
      .map(r => ({ name: r.querySelector('.pa-l-name').value.trim(), hours: paNum(r.querySelector('.pa-l-hours').value) }))
      .filter(r => r.name || r.hours) : (PAState.doc.load?.[k] || []);
  });

  const workItems = {};
  document.querySelectorAll('[data-wi]').forEach(t => {
    const id = t.dataset.wi;
    if (!workItems[id]) workItems[id] = {};
    workItems[id][t.dataset.f] = t.value.trim();
  });
  Object.keys(workItems).forEach(k => { if (!Object.values(workItems[k]).some(Boolean)) delete workItems[k]; });

  Object.assign(PAState.doc, {
    fiscalYear: get('pa-fiscalYear'),
    status: get('pa-status') || 'draft',
    classroomTypes,
    signDate: get('pa-signDate'),
    load,
    workItems,
    challengeTitle: get('pa-challengeTitle'),
    problem: get('pa-problem'),
    method: get('pa-method'),
    outcomeQuant: get('pa-outcomeQuant'),
    outcomeQual: get('pa-outcomeQual'),
  });
}

// ------------------------------------------------------------------
// renderPAPage — entry point เรียกจาก app.js
// ------------------------------------------------------------------
async function renderPAPage() {
  PAState.tab = PAState.nextTab || 'agreement'; // กดจากเมนูข้าง = เริ่มที่แท็บข้อตกลง (ยกเว้นมีคนขอแท็บรายงานมา)
  PAState.nextTab = null;
  PAState.view = 'list';
  paBuildShell();
  await paRenderTab();
}
