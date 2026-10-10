// ==========================================================================
// ข้อตกลงในการพัฒนางาน (PA 1/ส – Performance Agreement)
// บันทึก/แก้ไข PA ของครูตามปีงบประมาณ · Firestore: users/{uid}/pa_agreements/{docId}
// โครงเอกสารตามแบบ PA 1/ส ของ สพฐ. (ปีงบประมาณ 2569):
//   ส่วนที่ 1  1. ภาระงาน (1.1–1.4)  2. งานตามมาตรฐานตำแหน่ง 15 ข้อ × (งาน/ผลลัพธ์/ตัวชี้วัด)
//   ส่วนที่ 2  ประเด็นท้าทาย (สภาพปัญหา · วิธีดำเนินการ · ผลลัพธ์เชิงปริมาณ/คุณภาพ)
// ข้อมูลผู้จัดทำดึงจากหน้าข้อมูลส่วนตัว · ชั่วโมงสอนดึงจากตารางสอน (เก็บเป็นสำเนาในเอกสาร แก้ได้)
// ฟิลด์ระดับบนของเอกสาร (≤ 30 ตาม firestore.rules validDoc):
//   fiscalYear, status, classroomTypes{}, load{}, workItems{}, challengeTitle, problem, method,
//   outcomeQuant, outcomeQual, signDate, owner{}, aiCtx{}  (+ ฟิลด์แบบเดิม: workload, outcome, tasks, selfDev ที่ยังอ่านได้)
//   aiCtx = บริบทงานจริงสั้นๆ ที่ผู้ช่วย AI ใช้ (ระดับชั้น/ห้อง/นักเรียน/ปัญหา/ผลปีก่อน/จุดเน้น) — 1 ฟิลด์ระดับบน ไม่เกิน validDoc(30)
// ==========================================================================

// ------------------------------------------------------------------
// ค่าคงที่ของระบบ PA (โครงแบบ PA 1/ส · แท็บ · ชื่อ collection · ค่าของผู้ช่วย AI) อยู่ที่ PA_CONFIG ใน js/pa-config.js
// และ state ของหน้า (tab/view/docId/doc/list/…) อยู่ที่ระบบเอกสารใน js/doc-system.js — โค้ดในไฟล์นี้อ่านผ่าน const sys = docSystem() เท่านั้น
// (sys.config = config · sys.state = state ของหน้า/แท็บข้อตกลง · sys.rptState = state ของแท็บรายงานผล · sys.col(kind, uid) = collection)
// ------------------------------------------------------------------

// ภาคเรียนของปีงบประมาณ: ปีงบ 2569 (1 ต.ค. 68 – 30 ก.ย. 69) = ภาค 2/2568 และ 1/2569
function paTermLabels(fy) {
  fy = Number(fy);
  return fy > 2400 ? [`ภาคเรียนที่ 2/${fy - 1}`, `ภาคเรียนที่ 1/${fy}`] : ['ภาคเรียนที่ 2', 'ภาคเรียนที่ 1'];
}

// ------------------------------------------------------------------
// Firestore ref
// ------------------------------------------------------------------
function paCol(uid) {
  const sys = docSystem();
  return sys.col('agreements', uid);
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
  const sys = docSystem();
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _id, createdAt: _c, updatedAt: _u, ...clean } = data; // ฟิลด์ระบบไม่ถูกเขียนกลับ
  Object.keys(clean).forEach(k => { if (k[0] === '_') delete clean[k]; }); // ตัวแปรชั่วคราวในหน้าฟอร์ม
  data = clean;
  if (sys.state.docId) {
    await paRef(uid, sys.state.docId).update({ ...data, updatedAt: now });
    return sys.state.docId;
  } else {
    const ref = await paCol(uid).add({ ...data, createdAt: now, updatedAt: now });
    sys.state.docId = ref.id;
    return ref.id;
  }
}

// ------------------------------------------------------------------
// ลบ PA
// ------------------------------------------------------------------
async function paDelete(docId) {
  const sys = docSystem();
  const uid = AppState.user?.uid;
  if (!uid) return;
  await paRef(uid, docId).delete();
  sys.state.list = null;
}

// ------------------------------------------------------------------
// ช่วยเหลือทั่วไป
function paPeriodText(y) {
  y = Number(y);
  return y > 2400 ? `ระหว่างวันที่ 1 เดือน ตุลาคม พ.ศ. ${y - 1} ถึงวันที่ 30 เดือน กันยายน พ.ศ. ${y}` : '';
}
function paDocTitle(d) {
  return d.fiscalYear ? `ปีงบประมาณ พ.ศ. ${d.fiscalYear}` : `ปีการศึกษา ${d.year || '—'} ภาคเรียนที่ ${d.semester || '—'}`; // รายการเก่าใช้ปีการศึกษา/ภาคเรียน
}

// เติมค่าเริ่มต้นให้ครบทุกฟิลด์ (รองรับเอกสารรุ่นเก่าที่มีแค่ classroomBasic / workload / outcome)
function paNormalize(d) {
  const sys = docSystem();
  d = d || {};
  const ct = d.classroomTypes || {};
  d.classroomTypes = {
    basic: ct.basic !== undefined ? !!ct.basic : !!d.classroomBasic,
    early: !!ct.early, special: !!ct.special, vocational: !!ct.vocational, nonformal: !!ct.nonformal,
  };
  const L = d.load && typeof d.load === 'object' ? d.load : {};
  d.load = { group: String(L.group || '') };
  sys.config.loadLists.forEach(k => {
    d.load[k] = (Array.isArray(L[k]) ? L[k] : []).map(r => ({ name: String((r && r.name) || ''), hours: Number(r && r.hours) || 0 }));
  });
  d.workItems = d.workItems && typeof d.workItems === 'object' ? d.workItems : {};
  ['challengeTitle', 'problem', 'method', 'outcomeQuant', 'outcomeQual', 'signDate'].forEach(k => { d[k] = String(d[k] || ''); });
  const c = d.aiCtx && typeof d.aiCtx === 'object' ? d.aiCtx : {};
  d.aiCtx = {};
  Object.entries(sys.config.aiCtx.maxLen).forEach(([k, n]) => { d.aiCtx[k] = String(c[k] || '').slice(0, n); });
  return d;
}

function paBlankDoc() {
  return paNormalize({
    fiscalYear: String(docFiscalYear()),
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
//   scope = { type: 'term'|'year'|'fiscal', year, sem } → รวมตารางของทุกภาคเรียนในช่วงนั้น · ไม่ส่ง scope = ภาคเรียนที่ใช้งานอยู่ตอนนี้ (ใช้ตอนสร้างแผนใหม่)
//   วิชามีรหัส → 1.1 รายวิชา (เรียงตามรหัส) · ไม่มีรหัส/เป็นคาบกิจกรรม → กิจกรรมพัฒนาผู้เรียน (ดู ttAggregateTerms ใน js/timetable.js)
async function paPullTimetable(scope) {
  await loadModule('timetable');
  if (scope && scope.year) {
    const { items, missing } = ttCollectScope(await loadAllTimetables(), scope);
    return { ...ttAggregateTerms(items, false), term: ttScopeLabel(scope), missing };
  }
  const tt = await loadTimetable();
  return { ...ttAggregateTerms([{ tt }], false), term: ttTermLabel(tt.term), missing: [] };
}

// ไอคอนเฉพาะของ PA (ไอคอนทั่วไป DOC_ICO_* อยู่ที่ js/doc-shell.js)
const PA_ICO_PA    = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg>`;


// ==================================================================
// เอกสาร PA 1/ส สำหรับดูตัวอย่าง/พิมพ์ (ใช้ร่วมกับแท็บรายงานใน pa-report.js)
// ==================================================================

const PA1_CSS = `
.pa1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.22;text-align:left;font-kerning:normal}
.pa1 *{box-sizing:border-box}
.pa1 b{font-weight:700}
.pa1 .p1-code{text-align:right;font-size:.82em;margin:0 0 .5em}
.pa1 .p1-c{text-align:center;font-weight:700}
.pa1 .p1-sp{height:.9em}
.pa1 .p1-h{font-weight:700;margin-top:.7em;break-after:avoid;page-break-after:avoid}
.pa1 .p1-p{text-indent:1.27cm}
.pa1 .p1-tx{text-indent:3.81cm}
.pa1 .p1-hd{font-weight:700;text-indent:2.54cm;margin-top:.7em;break-after:avoid;page-break-after:avoid}
.pa1 .p1-ind1{padding-left:1.27cm}
.pa1 .p1-ind2{padding-left:2.54cm}
.pa1 .p1-ind3{padding-left:3.81cm}
.pa1 .p1-ind4{padding-left:5.08cm}
.pa1 .p1-row{display:flex;align-items:baseline}
.pa1 .p1-row>.n{flex:1 1 auto;min-width:0}
.pa1 .p1-row>.h{flex:0 0 5.6cm;white-space:nowrap}
.pa1 .p1-list{padding-left:3.81cm;margin:.3em 0 .3em 0}
.pa1 .p1-list>div{display:flex;align-items:baseline;line-height:1.35}
.pa1 .bx{display:inline-block;width:.78em;height:.78em;margin-right:.45em;vertical-align:-.06em}
.pa1 .bx svg{display:block;width:100%;height:100%}
.pa1 table{width:100%;border-collapse:collapse;margin-top:.4em;table-layout:fixed}
.pa1 th,.pa1 td{border:1px solid #000;padding:.28em .4em;vertical-align:top;text-align:left;overflow-wrap:anywhere}
.pa1 th{text-align:center;font-weight:400;background:#fcc;padding:.7em .35em;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pa1 th b{font-weight:700}
.pa1 thead{display:table-header-group}
.pa1 tr.grp td{font-weight:700;padding:.3em .4em;break-after:avoid;page-break-after:avoid}
.pa1 td.wl{font-weight:700}
.pa1 .gap{height:.55em}
.pa1 .p1-note{margin-top:.8em}
.pa1 .p1-note div{text-indent:1.27cm}
.pa1 .p1-break{break-before:page;page-break-before:always;height:0}
.pa1 .p1-sign{margin:1.9em 0 0 6.9cm;width:9cm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.pa1 .p1-dir{margin-top:1.4em;break-inside:avoid;page-break-inside:avoid}
.pa1 .p1-dir .p1-sign{margin-top:1.1em}
.pa1 .p1-line{border-bottom:1px dotted #000;height:1.45em}
.pa1 .mt0{margin-top:0}
.pa1 .mt2{margin-top:.2em}
.pa1 .mt3{margin-top:.3em}
.pa1 .mt5{margin-top:.5em}
.pa1 .mt10{margin-top:1em}
.pa1 .mt11{margin-top:1.1em}
.pa1 .keep-next{break-after:avoid;page-break-after:avoid}
.pa1 .ti0{text-indent:0}
.pa1 col.c1{width:24%}
.pa1 col.c2{width:30%}
.pa1 col.c3{width:25%}
.pa1 col.c4{width:21%}
.pa1 col.r1{width:9%}
.pa1 col.r2{width:50%}
.pa1 col.r3{width:41%}
`;

function paBuildDocHtml(d, o) {
  const sys = docSystem();
  d = paNormalize(JSON.parse(JSON.stringify(d || {})));
  o = o || {};
  const L = d.load;
  const [t1, t2] = paTermLabels(d.fiscalYear);
  const dots = '……………………………';
  const e = escapeHtml;
  const CHK = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="#000" stroke-width=".9"/>';
  const box = on => `<span class="bx">${CHK}${on ? '<path d="M2.2 5.3l2 2.1 3.8-4.6" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</svg></span>`;
  const hrs = h => `จำนวน ${docFmtH(h)} ชั่วโมง/สัปดาห์`;
  // แถวชื่อ + ชั่วโมง (ชั่วโมงเรียงเป็นคอลัมน์เดียวกันทั้งหน้าเหมือนแบบฟอร์ม)
  const row = (cls, text, h) => `<div class="p1-row ${cls}"><span class="n">${text}</span><span class="h">${h ? hrs(h) : ''}</span></div>`;
  const rows = (list, cls, prefix = '') => list.map(r => row(cls, prefix + docNl(r.name), r.hours)).join('');
  const sect = (no, title, list, withHours = true) => {
    const s = docSum(list);
    const h = !withHours ? '' : s ? hrs(s) : `จำนวน ${dots} ชั่วโมง/สัปดาห์`;
    return `<div class="p1-row p1-ind2"><span class="n">${no} ${title}</span><span class="h">${h}</span></div>${rows(list, 'p1-ind3')}`;
  };

  const hasLoad = sys.config.loadLists.some(k => L[k].length);
  const total = docSum(L.subjects) + docSum(L.activities);
  const loadHtml = hasLoad ? `
    <div class="p1-ind2">1.1 ชั่วโมงสอนตามตารางสอน รวมจำนวน ${total ? docFmtH(total) : dots} ชั่วโมง/สัปดาห์ ดังนี้</div>
    ${L.group ? `<div class="p1-ind3"><b>กลุ่มสาระการเรียนรู้${docNl(L.group)}</b></div>` : ''}
    ${rows(L.subjects, 'p1-ind3', 'รายวิชา ')}
    ${L.activities.length ? `${row('p1-ind3', 'กิจกรรมพัฒนาผู้เรียน', docSum(L.activities))}${rows(L.activities, 'p1-ind4', '- ')}` : ''}
    ${sect('1.2', 'งานส่งเสริมและสนับสนุนการจัดการเรียนรู้', L.support)}
    ${sect('1.3', 'งานพัฒนาคุณภาพการจัดการศึกษาของสถานศึกษา', L.quality)}
    ${sect('1.4', 'งานตอบสนองนโยบายและจุดเน้น', L.policy, false)}`
    : (d.workload ? `<div class="p1-ind2">${docNl(d.workload)}</div>` : `<div class="p1-ind2">1.1 ชั่วโมงสอนตามตารางสอน รวมจำนวน ${dots} ชั่วโมง/สัปดาห์</div>`);

  // ภาคเรียนต่อท้ายบรรทัดเดียวกับข้อความ (ตามแบบที่ใช้กันจริง)
  const term = (label, text) => `${label} ${docNl(text)}`;
  const tableRows = sys.config.workItems.map(([, gt, items]) =>
    `<tr class="grp"><td colspan="4">${gt}</td></tr>` + items.map(([id, label]) => {
      const w = d.workItems[id] || {};
      const tasks = [w.s1 && term(t1, w.s1), w.s2 && term(t2, w.s2)].filter(Boolean).join('<div class="gap"></div>');
      return `<tr><td class="wl">${id} ${label}</td><td>${tasks}</td><td>${docNl(w.outcome)}</td><td>${docNl(w.indicator)}</td></tr>`;
    }).join('')).join('');

  // ข้อความหลายบรรทัด → ย่อหน้า (บรรทัดแรกเยื้อง ตามแบบเอกสารราชการ)
  const paras = (val, cls) => {
    const ls = String(val || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    return ls.length ? ls.map(s => `<div class="${cls}">${e(s)}</div>`).join('') : `<div class="${cls}">${dots}</div>`;
  };
  const legacyOutcome = !d.outcomeQuant && !d.outcomeQual && d.outcome;

  // ชื่อ / นามสกุล แยกช่องตามแบบ (เอกสารเก่าเก็บชื่อรวม → แยกที่ช่องว่างแรก)
  const nm = String(o.name || '').trim().match(/^(\S+)\s*(.*)$/) || [];
  const first = nm[1] || '', last = nm[2] || '';
  const val = (v, fb = dots) => v ? `<b>${e(v)}</b>` : fb;

  return `<div class="pa1">
    <div class="p1-code">PA 1/ส</div>
    <div class="p1-c">แบบตกลงในการพัฒนางาน (PA)</div>
    <div class="p1-c">สำหรับข้าราชการครูและบุคลากรทางการศึกษา ตำแหน่ง ครู</div>
    <div class="p1-c">(สังกัดสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน)</div>
    <div class="p1-c">ประจำปีงบประมาณ พ.ศ. ${e(d.fiscalYear)}</div>
    <div class="p1-c">${e(paPeriodText(d.fiscalYear))}</div>

    <div class="p1-h">ผู้จัดทำข้อตกลง</div>
    <div>ชื่อ ${val(first)} นามสกุล ${val(last)} ตำแหน่ง ${val(o.position)} วิทยฐานะ ${val(o.standing)}</div>
    <div>สถานศึกษา ${e(o.school || dots)} สังกัด ${e(o.affiliation || dots)}</div>
    <div>รับเงินเดือนในตำแหน่ง ${e(o.pay || dots)}</div>
    <div class="p1-p mt2"><b>ประเภทห้องเรียนที่จัดการเรียนรู้</b> (สามารถระบุได้มากกว่า 1 ประเภทห้องเรียน ตามสภาพการจัดการเรียนรู้จริง)</div>
    <div class="p1-list">${sys.config.classroomTypes.map(([k, l]) => `<div>${box(d.classroomTypes[k])}<span>${l}</span></div>`).join('')}</div>
    <div class="p1-p mt5">ข้าพเจ้าขอแสดงเจตจำนงในการจัดทำข้อตกลงในการพัฒนางานตำแหน่ง ${e(o.position || 'ครู')} วิทยฐานะ${e(o.standing || dots)} ซึ่งเป็นตำแหน่งและวิทยฐานะที่ดำรงอยู่ในปัจจุบันกับผู้อำนวยการสถานศึกษา ไว้ดังต่อไปนี้</div>

    <div class="p1-h mt10">ส่วนที่ 1 ข้อตกลงในการพัฒนางานตามมาตรฐานตำแหน่ง</div>
    <div class="p1-ind1">1. ภาระงาน จะมีภาระงานเป็นไปตามที่ก.ค.ศ. กำหนด</div>
    ${loadHtml}

    <div class="p1-p mt3 keep-next">2. งานที่จะปฏิบัติตามมาตรฐานตำแหน่งครู (ให้ระบุรายละเอียดของงานที่จะปฏิบัติในแต่ละด้านว่าจะดำเนินการอย่างไร โดยอาจระบุระยะเวลาที่ใช้ในการดำเนินการด้วยก็ได้)</div>
    <table>
      <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
      <thead><tr>
        <th><b>ลักษณะงานที่ปฏิบัติ<br>ตามมาตรฐานตำแหน่ง</b></th>
        <th><b>งาน</b> (Tasks)<br>ที่จะดำเนินการพัฒนา<br>ตามข้อตกลงใน 1 รอบ<br>การประเมิน<br>(โปรดระบุ)</th>
        <th><b>ผลลัพธ์</b> (Outcomes)<br>ของงานตามข้อตกลง<br>ที่คาดหวังให้เกิดขึ้น<br>กับผู้เรียน<br>(โปรดระบุ)</th>
        <th><b>ตัวชี้วัด</b> (Indicators)<br>ที่จะเกิดขึ้นกับผู้เรียนที่แสดงให้เห็นถึงการเปลี่ยนแปลงไปในทางที่ดีขึ้นหรือมีการพัฒนามากขึ้นหรือผลสัมฤทธิ์สูงขึ้น(โปรดระบุ)</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="p1-note"><b>หมายเหตุ</b>
      <div>1. รูปแบบการจัดทำข้อตกลงในการพัฒนา ตามแบบ PA 1 ให้เป็นไปตามบริบท และสภาพการจัดการเรียนรู้ของแต่ละสถานศึกษา โดยความเห็นชอบร่วมกันระหว่างผู้อำนวยการสถานศึกษา ข้าราชการครูและบุคลากรทางการศึกษา ผู้จัดทำข้อตกลง</div>
      <div>2. งาน (Tasks) ที่เสนอเป็นข้อตกลงในการพัฒนางาน ต้องเป็นงานในหน้าที่ความรับผิดชอบหลัก ที่ส่งผลโดยตรงต่อผลลัพธ์การเรียนรู้ของผู้เรียน และให้นำเสนอรายวิชาหลักที่ทำการสอน โดยเสนอในภาพรวมของรายวิชาหลักที่ทำการสอนทุกระดับชั้น ในกรณีที่สอนหลายรายวิชา สามารถเลือกรายวิชาใดวิชาหนึ่งได้ โดยจะต้องแสดงให้เห็นถึงการปฏิบัติงานตามมาตรฐานตำแหน่ง และคณะกรรมการประเมินผลการพัฒนางานตามข้อตกลงสามารถประเมินได้ตามแบบการประเมิน PA 2</div>
      <div>3. การพัฒนางานตามข้อตกลง ตามแบบ PA 1 ให้ความสำคัญกับผลลัพธ์การเรียนรู้ของผู้เรียน (Outcomes) และตัวชี้วัด (Indicators) ที่เป็นรูปธรรม และการประเมินของคณะกรรมการประเมินผลการพัฒนางานตามข้อตกลง ให้คณะกรรมการดำเนินการประเมิน ตามแบบ PA 2 จากการปฏิบัติงานจริง สภาพการจัดการเรียนรู้ในบริบทของแต่ละสถานศึกษา และผลลัพธ์การเรียนรู้ของผู้เรียนที่เกิดจากการพัฒนางานตามข้อตกลงเป็นสำคัญ โดยไม่เน้นการประเมินจากเอกสาร</div>
    </div>

    <div class="p1-break"></div>
    <div class="p1-h mt0">ส่วนที่ 2 ข้อตกลงในการพัฒนางานที่เป็นประเด็นท้าทายในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียน</div>
    <div class="p1-p mt5">ประเด็นที่ท้าทายในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียนของผู้จัดทำข้อตกลง ซึ่งปัจจุบันดำรงตำแหน่ง ครู ต้องแสดงให้เห็นถึงระดับการปฏิบัติที่คาดหวัง คือ <i><u>การปรับประยุกต์</u></i> การจัดการเรียนรู้และการพัฒนาคุณภาพการเรียนรู้ของผู้เรียน ให้เกิดการเปลี่ยนแปลงไปในทางที่ดีขึ้นหรือมีการพัฒนามากขึ้น (ทั้งนี้ ประเด็นท้าทายอาจจะแสดงให้เห็นถึงระดับการปฏิบัติที่คาดหวังที่สูงกว่าได้)</div>
    <div class="p1-p"><b>ประเด็นท้าทาย</b> เรื่อง ${docNl(d.challengeTitle) || dots}</div>
    <div class="p1-hd">1. สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้</div>
    ${paras(d.problem, 'p1-p')}
    <div class="p1-hd mt11">2. วิธีการดำเนินการให้บรรลุผล</div>
    ${paras(d.method, 'p1-tx')}
    <div class="p1-hd mt11">3. ผลลัพธ์การพัฒนาที่คาดหวัง</div>
    ${legacyOutcome ? paras(d.outcome, 'p1-tx') : `
    <div class="p1-ind3">3.1 เชิงปริมาณ</div>${paras(d.outcomeQuant, 'p1-tx')}
    <div class="p1-ind3 mt2">3.2 เชิงคุณภาพ</div>${paras(d.outcomeQual, 'p1-tx')}`}

    <div class="p1-sign">
      <div>ลงชื่อ........................................................................</div>
      <div>(${e(o.name || '………………………………')})</div>
      <div>ตำแหน่ง ${e([o.position, o.standing].filter(Boolean).join(' วิทยฐานะ') || '………………')}</div>
      <div>ผู้จัดทำข้อตกลงในการพัฒนางาน</div>
      <div>${e(docThaiDate(d.signDate) || '................/.............../...................')}</div>
    </div>

    <div class="p1-dir">
      <div class="p1-h mt0">ความเห็นของผู้อำนวยการสถานศึกษา</div>
      <div class="p1-ind2">(&nbsp;&nbsp;&nbsp;) เห็นชอบให้เป็นข้อตกลงในการพัฒนางาน</div>
      <div class="p1-ind2 ti0">(&nbsp;&nbsp;&nbsp;) ไม่เห็นชอบให้เป็นข้อตกลงในการพัฒนางาน โดยมีข้อเสนอแนะเพื่อนำไปแก้ไข และเสนอเพื่อพิจารณาอีกครั้ง ดังนี้</div>
      <div class="p1-line"></div><div class="p1-line"></div>
      <div class="p1-sign">
        <div>ลงชื่อ........................................................................</div>
        <div>(${e(o.director || '………………………………')})</div>
        <div>ตำแหน่ง ผู้อำนวยการ${e(o.school || '')}</div>
        <div>................/.............../...................</div>
      </div>
    </div>
  </div>`;
}

// แผ่นกระดาษตัวอย่างบนจอของ PA 1/ส และแบบรายงานผล (ใช้กับ docRenderPreview({ sheets }) — ตัวพิมพ์จริงยังเป็น paPrint/parptPrint)
//   ขอบแผ่น = DOC_SHEET_A4 = @page ตอนพิมพ์ · หัวข้อ (.p1-h/.p1-hd/.keep-next) ตามไปกับเนื้อหา · .p1-break = ขึ้นหน้าใหม่
const PA1_FONTS = [...DOC_FONT_SPECS, "italic 16pt 'PA Sarabun'"]; // ข้อตกลงมีตัวเอียง
function paSheets(bodyHtml) {
  return { html: () => docSheetsHtml(PA1_CSS, bodyHtml), specs: { port: DOC_SHEET_A4 }, bodyClass: 'pa1', keep: '.p1-h,.p1-hd,.keep-next', breakSel: '.p1-break', fonts: PA1_FONTS };
}

// เปิดหน้าต่างใหม่แล้วสั่งพิมพ์ (ผู้ใช้เลือก "บันทึกเป็น PDF" ได้จากหน้าต่างพิมพ์ของเบราว์เซอร์)
// ฟอนต์: ใช้ TH Sarabun PSK ของเครื่องก่อน (ตัวเดียวกับแบบราชการ) ไม่มีก็ใช้ Sarabun ที่แนบมากับแอป (ทำงานออฟไลน์ได้)
function paPrint(d, o) {
  const title = `PA1_${(o && o.name) || ''}_${d.fiscalYear || ''}`.replace(/\s+/g, '_');
  return docPrintWindow({ // ตัวช่วยกลางใน js/doc-shell.js (เปิดหน้าต่าง → รอฟอนต์ → พิมพ์)
    title,
    css: PA1_CSS,
    html: () => paBuildDocHtml(d, o),
    fonts: PA1_FONTS,
  });
}


// ------------------------------------------------------------------
// คัดลอกข้อตกลงเป็นฉบับร่างใหม่ (ยังไม่บันทึกจนกว่าจะกดบันทึก) เพื่อเอาไปปรับแก้
// ------------------------------------------------------------------
function paDuplicate(src) {
  const sys = docSystem();
  const d = paNormalize(JSON.parse(JSON.stringify(src)));
  ['id', 'createdAt', 'updatedAt', 'owner'].forEach(k => { delete d[k]; }); // owner ดึงจากโปรไฟล์ปัจจุบันตอนบันทึก
  d.status = 'draft';
  d.signDate = '';
  d._ttTried = true; // มีชั่วโมงสอนจากฉบับเดิมแล้ว ไม่ดึงตารางสอนทับ
  sys.state.docId = null;
  sys.state.doc = d;
  sys.state.view = 'form';
  renderPAFormView();
  showToast('คัดลอกแล้ว — แก้ไขตามต้องการ แล้วกด “บันทึกPersonal Agreement” จะได้เป็นฉบับใหม่');
}

// ------------------------------------------------------------------
// หน้ารายการ PA (แท็บแบบฟอร์มข้อตกลง)
// ------------------------------------------------------------------
async function renderPAListView() {
  const sys = docSystem();
  const view = docMount(); // = พื้นที่เนื้อหาของแท็บ
  const seq = sys.state.seq;
  docShowLoading(view);

  let list = [];
  try {
    list = await paLoadList();
    sys.state.list = list;
  } catch (err) {
    if (docStale(view, seq, sys) || sys.state.tab !== 'agreement') return; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
    clearLoading(view);
    view.classList.remove('is-switching');
    view.innerHTML = `<div class="card card-pad"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div></div>`;
    return;
  }

  if (docStale(view, seq, sys) || sys.state.tab !== 'agreement' || sys.state.view !== 'list') return;

  view.innerHTML = docListHtml({
    list, icon: PA_ICO_PA, hue: 'blue',
    title: d => paDocTitle(d),
    sub: d => d.challengeTitle || d.department || d.position || '',
    actions: ['print', 'dup', 'edit', 'del'],
    emptyTitle: 'ยังไม่มีPersonal Agreement',
    emptySub: 'กดปุ่มด้านล่างเพื่อสร้างPersonal Agreement ประจำปีงบประมาณ',
    newLabel: 'สร้างPersonal Agreement ใหม่',
  });

  const openEdit = id => {
    const d = sys.state.list?.find(x => x.id === id);
    if (!d) return;
    sys.state.docId = id;
    sys.state.doc = paNormalize(JSON.parse(JSON.stringify(d))); // deep copy
    sys.state.view = 'form';
    renderPAFormView();
  };
  docBindList(view, {
    create: () => {
      sys.state.docId = null;
      sys.state.doc = paBlankDoc();
      sys.state.view = 'form';
      renderPAFormView();
    },
    open: openEdit,
    edit: openEdit,
    dup: id => { const d = sys.state.list?.find(x => x.id === id); if (d) paDuplicate(d); },
    print: id => { sys.state.previewId = id; docSwitchTab('report'); },
    del: async id => { await paDelete(id); await renderPAListView(); },
  });

  docSwapIn(view);
}

// ------------------------------------------------------------------
// หน้าฟอร์ม PA (อยู่ในแท็บแบบฟอร์มข้อตกลง)
// ------------------------------------------------------------------
// บล็อกภาระงาน 1.1–1.4 ใช้ตัวสร้างกลางใน js/doc-shell.js (docLBlockHtml) ร่วมกับ ID-Plan
const paLoadBlock = (key, title, rows, ph) => docLBlockHtml({ key, title, rows, ph });

async function renderPAFormView() {
  const sys = docSystem();
  const view = docMount(); // = พื้นที่เนื้อหาของแท็บ
  const seq = sys.state.seq;
  const d = sys.state.doc = paNormalize(sys.state.doc);
  const isNew = !sys.state.docId;
  docShowLoading(view);
  let p;
  try { await loadModule('profile'); p = await loadTeacherProfile(); } catch (err) { p = AppState.teacherProfile || {}; }
  if (docStale(view, seq, sys) || sys.state.tab !== 'agreement' || sys.state.view !== 'form') return; // ผู้ใช้สลับแท็บ/ออกไปแล้ว

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
      if (!sys.config.loadLists.some(k => d.load[k].length)) { d.load.subjects = t.subjects; d.load.activities = t.activities; }
    } catch (err) { /* ไม่มีตารางสอน/ออฟไลน์ — ข้าม */ }
    if (docStale(view, seq, sys) || sys.state.tab !== 'agreement' || sys.state.view !== 'form') return;
  }

  const item = (label, val, wide) => `<div class="pa-pf-item${wide ? ' pa-pf-wide' : ''}"><dt>${label}</dt><dd>${val ? escapeHtml(val) : '—'}</dd></div>`;
  const area = (id, label, val, rows, ph = '') =>
    `<div class="field pa-aifield"><div class="pa-field-h"><label for="${id}">${label}</label></div><textarea id="${id}" rows="${rows}" placeholder="${escapeHtml(ph)}">${escapeHtml(val || '')}</textarea></div>`; // ส่วนที่ 2: หัวช่องเป็นที่วางแถวปุ่ม AI (ทางขวาของชื่อช่อง — js/pa-ai.js) เหมือนหัวกล่องของงานแต่ละข้อ
  const [t1, t2] = paTermLabels(d.fiscalYear);
  const wiArea = (id, f, label, val, rows) => {
    const eid = `pa-wi-${id.replace('.', '_')}-${f}`;
    return `<div class="field"><label for="${eid}">${label}</label><textarea id="${eid}" rows="${rows}" data-wi="${id}" data-f="${f}">${escapeHtml(val || '')}</textarea></div>`;
  };
  const hasLegacyLoad = d.workload && !sys.config.loadLists.some(k => d.load[k].length);

  view.innerHTML = `
    <div class="pa-form-head">
      <button type="button" class="btn btn-ghost btn-sm pa-back-btn">← กลับ</button>
      <div>
        <h2 class="pa-form-title">PA 1/ส · ${isNew ? 'สร้างข้อตกลงใหม่' : 'แก้ไขข้อตกลง'}</h2>
        <div class="u-note">แบบตกลงในการพัฒนางาน (PA) สำหรับข้าราชการครูและบุคลากรทางการศึกษา ตำแหน่ง ครู (สังกัด สพฐ.)</div>
      </div>
      ${isNew ? '' : `<button type="button" class="btn btn-ghost btn-sm pa-dup-btn" title="คัดลอกข้อมูลในฟอร์มนี้เป็นฉบับร่างใหม่">${DOC_ICO_COPY} คัดลอกเป็นฉบับใหม่</button>`}
    </div>

    <form id="pa-form" class="pa-form" novalidate>
      <div class="doc-section">
        <h2 class="doc-sec-title">ผู้จัดทำข้อตกลง</h2>
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
            <input id="pa-fiscalYear" type="text" inputmode="numeric" maxlength="4" value="${escapeHtml(d.fiscalYear || '')}" placeholder="${docFiscalYear()}">
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
        <div class="doc-subsec-hd">ประเภทห้องเรียนที่จัดการเรียนรู้ (เลือกได้มากกว่า 1)</div>
        <div class="doc-checks">
          ${sys.config.classroomTypes.map(([k, l]) => `<label class="doc-check"><input type="checkbox" data-ct="${k}"${d.classroomTypes[k] ? ' checked' : ''}> ${l}</label>`).join('')}
        </div>
        <div class="field pa-field-date">
          <label for="pa-signDate">วันที่ลงนามของผู้จัดทำ</label>
          <input id="pa-signDate" type="date" value="${escapeHtml(d.signDate || '')}">
        </div>
      </div>

      <div class="doc-section">
        <h2 class="doc-sec-title">ส่วนที่ 1 · 1. ภาระงาน</h2>
        <div class="pa-pf-note u-mb-12">
          <span>1.1 ดึงจากตารางสอน (นับ 1 คาบ = 1 ชั่วโมง) เก็บเป็นสำเนาในเอกสารนี้ — แก้ไขได้ และไม่เปลี่ยนตามตารางสอนภายหลัง · กดปุ่มเพื่อเลือกช่วงเวลาที่จะดึง (ภาคเรียน / ปีการศึกษา / ปีงบประมาณ)</span>
          <button type="button" class="btn btn-ghost btn-sm" id="pa-tt-pull">ดึงจากตารางสอนใหม่</button>
        </div>
        ${hasLegacyLoad ? `<div class="pa-legacy"><div class="doc-subsec-hd">ข้อความภาระงานแบบเดิม (ยังเก็บไว้ ไม่ถูกลบ)</div><div class="pa-legacy-text">${escapeHtml(d.workload)}</div></div>` : ''}
        <div class="field"><label for="pa-load-group">กลุ่มสาระการเรียนรู้</label><input id="pa-load-group" type="text" maxlength="100" value="${escapeHtml(d.load.group)}" placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี"></div>
        ${paLoadBlock('subjects', '1.1 รายวิชาที่สอน', d.load.subjects, 'เช่น ว32105 วิทยาการคำนวณ')}
        ${paLoadBlock('activities', '1.1 กิจกรรมพัฒนาผู้เรียน', d.load.activities, 'เช่น กิจกรรมชุมนุม')}
        ${docLTotalHtml({ label: 'รวมชั่วโมงสอน (1.1):', id: 'pa-load-total', value: docSum(d.load.subjects) + docSum(d.load.activities) })}
        ${paLoadBlock('support', '1.2 งานส่งเสริมและสนับสนุนการจัดการเรียนรู้', d.load.support, 'เช่น การมีส่วนร่วมชุมชนการเรียนรู้ทางวิชาชีพ')}
        ${paLoadBlock('quality', '1.3 งานพัฒนาคุณภาพการจัดการศึกษาของสถานศึกษา', d.load.quality, 'เช่น เจ้าหน้าที่ตามโครงสร้างฝ่าย')}
        ${paLoadBlock('policy', '1.4 งานตอบสนองนโยบายและจุดเน้น', d.load.policy, 'ระบุงาน (ถ้ามี)')}
      </div>

      <div class="doc-section">
        <h2 class="doc-sec-title">ส่วนที่ 1 · 2. งานที่จะปฏิบัติตามมาตรฐานตำแหน่งครู</h2>
        <div class="u-note u-mb-12">กรอกแต่ละข้อ: งานที่จะทำในแต่ละภาคเรียน · ผลลัพธ์ที่คาดหวังกับผู้เรียน · ตัวชี้วัด — ข้อที่เว้นว่างจะแสดงเป็นช่องว่างในเอกสาร</div>
        ${sys.config.workItems.map(([gid, gt, items]) => `
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

      <div class="doc-section">
        <h2 class="doc-sec-title">ส่วนที่ 2 ข้อตกลงในการพัฒนางานที่เป็นประเด็นท้าทาย</h2>
        ${area('pa-challengeTitle', 'เรื่อง ประเด็นท้าทาย', d.challengeTitle, 3, 'เช่น การพัฒนาทักษะ … ของนักเรียนระดับชั้น … โดยใช้ …')}
        ${area('pa-problem', '1. สภาพปัญหาของผู้เรียนและการจัดการเรียนรู้', d.problem, 5)}
        ${area('pa-method', '2. วิธีการดำเนินการให้บรรลุผล', d.method, 5)}
        ${d.outcome && !d.outcomeQuant && !d.outcomeQual ? `<div class="pa-legacy"><div class="doc-subsec-hd">ผลลัพธ์ที่คาดหวังแบบเดิม (ยังเก็บไว้ — ย้ายไปช่อง 3.1/3.2 ด้านล่างได้)</div><div class="pa-legacy-text">${escapeHtml(d.outcome)}</div></div>` : ''}
        ${area('pa-outcomeQuant', '3.1 ผลลัพธ์การพัฒนาที่คาดหวัง · เชิงปริมาณ', d.outcomeQuant, 4, 'จำนวนห้อง/นักเรียน และร้อยละที่คาดหวัง')}
        ${area('pa-outcomeQual', '3.2 ผลลัพธ์การพัฒนาที่คาดหวัง · เชิงคุณภาพ', d.outcomeQual, 4)}
      </div>

      <div class="pa-form-footer">
        <button type="button" class="btn btn-ghost pa-cancel-btn">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="pa-save-btn">บันทึกPersonal Agreement</button>
      </div>
    </form>`;

  const form = view.querySelector('#pa-form');
  view.querySelectorAll('.pa-back-btn, .pa-cancel-btn').forEach(b => b.addEventListener('click', () => {
    sys.state.view = 'list'; renderPAListView();
  }));
  view.querySelector('.pa-dup-btn')?.addEventListener('click', () => { paCollectFormData(); paDuplicate(sys.state.doc); }); // รวมสิ่งที่พิมพ์ค้างไว้ด้วย
  view.querySelector('.pa-goto-profile').addEventListener('click', () => { paCollectFormData(); navigate('profile'); });
  view.querySelector('#pa-fiscalYear').addEventListener('input', e => {
    view.querySelector('#pa-period').textContent = paPeriodText(e.target.value);
  });

  // เพิ่ม/ลบแถวภาระงาน + รวมชั่วโมง 1.1 แบบสด (ตัวผูกกลางใน doc-shell.js)
  docLBind(form, { totalKeys: ['subjects', 'activities'], totalEl: '#pa-load-total' });

  view.querySelector('#pa-tt-pull').addEventListener('click', () => {
    paCollectFormData();
    docPickTtScope({
      scope: { type: 'fiscal', year: sys.state.doc.fiscalYear || docFiscalYear() },
      onPick: async scope => {
        const has = ['subjects', 'activities'].some(k => sys.state.doc.load[k].length);
        if (has && !confirm('แทนที่รายวิชาและกิจกรรมที่กรอกไว้ด้วยข้อมูลจากตารางสอน?')) return;
        try {
          const t = await paPullTimetable(scope);
          if (!t.subjects.length && !t.activities.length) { showToast(`ยังไม่มีตารางสอนของ${t.term}`); return; }
          sys.state.doc.load.subjects = t.subjects;
          sys.state.doc.load.activities = t.activities;
          const y = window.scrollY;
          await renderPAFormView();
          window.scrollTo(0, y);
          showToast(`ดึงชั่วโมงสอนจากตารางสอน ${t.term} แล้ว` + (t.missing.length ? ` (ไม่พบตารางของ ${t.missing.map(ttTermLabel).join(', ')})` : ''));
        } catch (err) {
          showToast('ดึงตารางสอนไม่สำเร็จ: ' + (err.message || err));
        }
      },
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    paCollectFormData();
    if (!/^\d{4}$/.test(sys.state.doc.fiscalYear)) { showToast('ปีงบประมาณต้องเป็นตัวเลข 4 หลัก เช่น ' + docFiscalYear()); view.querySelector('#pa-fiscalYear').focus(); return; }
    // เก็บสำเนาข้อมูลผู้จัดทำ: เอกสารที่ส่งแล้วและมีสำเนาเดิม = คงไว้ · นอกนั้นใช้ข้อมูลปัจจุบัน
    if (!(sys.state.doc.status === 'submitted' && sys.state.doc.owner)) sys.state.doc.owner = liveOwner;
    const btn = view.querySelector('#pa-save-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      await paSave(sys.state.doc);
      sys.state.list = null; // clear cache
      if (typeof islandToast === 'function') islandToast('บันทึกPersonal Agreement แล้ว', 'save');
      sys.state.view = 'list';
      await renderPAListView();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'บันทึกPersonal Agreement';
      showToast(err.code === 'permission-denied' ? 'บันทึกไม่สำเร็จ: ถูกปฏิเสธสิทธิ์ (ต้องอัปเดต firestore.rules ก่อน)' : 'บันทึกไม่สำเร็จ: ' + (err.message || err));
    }
  });

  if (typeof badworkAiMount === 'function') badworkAiMount(view, form, sys); // ปุ่มผู้ช่วย AI (js/badwork-ai.js + ตัวต่อ js/pa-ai.js) — ไม่มีไฟล์นี้ฟอร์มก็ทำงานตามเดิม

  docSwapIn(view);
}

// ------------------------------------------------------------------
// เก็บค่าจากฟอร์มกลับเข้า sys.state.doc
// ------------------------------------------------------------------
function paCollectFormData() {
  const sys = docSystem();
  const el = id => document.getElementById(id);
  if (!el('pa-form')) return; // ไม่ได้อยู่ในหน้าฟอร์ม
  const get = id => (el(id)?.value || '').trim();

  const classroomTypes = {};
  document.querySelectorAll('[data-ct]').forEach(c => { classroomTypes[c.dataset.ct] = c.checked; });

  const load = { group: get('pa-load-group') };
  sys.config.loadLists.forEach(k => {
    load[k] = docLRows(k) || (sys.state.doc.load?.[k] || []); // ไม่มีบล็อกนี้ในหน้า → คงค่าเดิม
  });

  const workItems = {};
  document.querySelectorAll('[data-wi]').forEach(t => {
    const id = t.dataset.wi;
    if (!workItems[id]) workItems[id] = {};
    workItems[id][t.dataset.f] = t.value.trim();
  });
  Object.keys(workItems).forEach(k => { if (!Object.values(workItems[k]).some(Boolean)) delete workItems[k]; });

  // ช่องบริบท AI อยู่ในการ์ดที่ badwork-ai.js ติดให้ — ถ้าไม่มีช่อง (ไม่โหลดไฟล์นั้น) คงค่าเดิมไว้
  const aiCtx = {};
  Object.entries(sys.config.aiCtx.maxLen).forEach(([k, n]) => { aiCtx[k] = el(sys.config.aiCtx.idPrefix + k) ? get(sys.config.aiCtx.idPrefix + k).slice(0, n) : (sys.state.doc.aiCtx?.[k] || ''); });

  Object.assign(sys.state.doc, {
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
    aiCtx,
  });
}

// ------------------------------------------------------------------
// ลงทะเบียน UI ของระบบ PA เข้าโครงหน้ากลาง (js/doc-shell.js) — ตัวเรนเดอร์อ้างตอนเรียกจริง (กลุ่มไฟล์ PA โหลดครบก่อนเปิดหน้า)
// ------------------------------------------------------------------
registerDocUi('pa', {
  tabs: {
    report: () => renderPAReportView(),         // ตัวอย่าง/พิมพ์ PA 1 (js/pa-report.js)
    rpt: () => renderPARptView(),               // แบบฟอร์มรายงานผล (js/pa-rpt.js)
    rptprev: () => renderPARptPreviewView(),    // ตัวอย่าง/พิมพ์ รายงานผล (js/pa-rpt.js)
    default: sys => sys.state.view === 'form' ? renderPAFormView() : renderPAListView(), // แท็บข้อตกลง
  },
  beforeLeave(sys) { // กำลังกรอกฟอร์มอยู่: เก็บค่าที่พิมพ์ค้างไว้ใน state.doc กลับมาแล้วยังอยู่
    if (sys.state.tab === 'agreement' && sys.state.view === 'form') paCollectFormData();
    if (sys.state.tab === 'rpt' && sys.rptState.view === 'form') parptCollect();
  },
});
