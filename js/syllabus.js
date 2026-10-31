// ==========================================================================
// โครงสร้างรายวิชา (Course Syllabus) — ตารางหน่วยการเรียนรู้ตามแบบ "โครงสร้างรายวิชา" ของหลักสูตร
//   (หัวเอกสาร · หน่วยที่/ชื่อหน่วย · มาตรฐาน/ตัวชี้วัด · สาระการเรียนรู้ย่อยพร้อมเวลา · น้ำหนักคะแนน ·
//    อัตราส่วนระหว่างภาค:ปลายภาค · รวมชั่วโมง/คะแนน) หน้าตาและตัวช่วยเดียวกับฟอร์มคำอธิบายรายวิชา (js/course-desc.js)
//   • อยู่ในหน้า "ตั้งค่าโครงสร้างวิชา" → แท็บ "Course Syllabus" (ฟอร์ม) + แท็บ "ตัวอย่าง Course Syllabus" ต่อจากแท็บคำอธิบายรายวิชา (js/picker-pages.js)
//     หน้าตาเหมือนคู่แท็บคำอธิบายรายวิชา (js/course-desc.js) และฟอร์มเอกสารอื่น: doc-form-header → doc-section → pa-form-footer · ตัวอย่างมีแค่ปุ่ม แก้ไข / พิมพ์
//   • ที่มาของข้อมูล (ตารางจึงตรงกับคะแนนจริงเสมอ):
//       แม่แบบวิชา            → รหัส · ชื่อวิชา · ระดับชั้น · หน่วยกิต
//       settings/structure    → หน่วยการเรียนรู้ (ลำดับ · ชื่อ) · น้ำหนักคะแนนต่อหน่วย (รวม max ของชิ้นงานในหน่วย) · กลางภาค · ปลายภาค
//       settings/description  → ประเภทวิชา (พื้นฐาน/เพิ่มเติม) · กลุ่มสาระฯ (ใช้เป็นค่าเริ่มต้น) · ตัวชี้วัดสำหรับปุ่มดึงมาใส่
//       settings/syllabus     → ที่ครูกรอกเอง: กลุ่มสาระฯ · ต่อหน่วย (อ้าง id หน่วย): มาตรฐาน/ตัวชี้วัด + สาระย่อยพร้อมชั่วโมง
//   • Firestore: users/{uid}/courseTemplates/{templateId}/settings/syllabus (อ้างผ่าน courseBaseRef) — firestore.rules เดิมของ courseTemplates/{document=**} ครอบคลุมอยู่แล้ว
//     หน่วยที่ถูกลบออกจากโครงสร้างคะแนน → ข้อมูลของหน่วยนั้นถูกข้าม (ยังเก็บไว้) · หน่วยใหม่ → แถวว่างให้กรอก · เปลี่ยนชื่อหน่วย → ชื่อในตารางเปลี่ยนตาม
//   • สาระย่อย (1.1, 1.2) ใช้จัดเวลาอย่างเดียว ไม่ผูกกับชิ้นงานที่เก็บคะแนน
//   • หน้าวิชาที่เปิดสอน (แท็บภาพรวม) แสดงการ์ดอ่านอย่างเดียวจากแม่แบบ (js/courses.js · syllabusCardHtml) และพิมพ์ผ่าน syPrintCourse
//   • lazy: loadModules(LAZY_BUNDLES.syll) (doc-system → doc-shell → course-desc → syllabus) — ใช้ cdGroupIndicators/cdLevelText/cdNormalize/cdRef ของ course-desc.js
// ==========================================================================

const SY_DOC_ID = 'syllabus';   // settings/syllabus
const SY_MAX = { area: 80, std: 200, title: 400, hours: 5, topics: 12, units: 40, core: 1000, kw: 600, inds: 100, when: 200, obj: 1500, pmedia: 400, aind: 200, aweek: 40, adue: 40, assess: 120, mother: 120, res: 1500, books: 1000, rules: 2000, apr: 8, role: 120, aname: 80 }; // core/kw = สาระแกนกลาง/คำสำคัญต่อตัวชี้วัด (ข้อ 13) · when/obj/pmedia = ครั้งที่-วันเวลา/จุดประสงค์/สื่อ ต่อหน่วย (ข้อ 14) · aind/aweek/adue = ตัวชี้วัด/สัปดาห์/กำหนดส่ง ต่อรายการคะแนน (ข้อ 15)
const SY_CREDIT_HOURS = 40;     // 1 หน่วยกิต = 40 ชั่วโมง (0.5 = 20 · 1.5 = 60)
const SY_COLS = [10, 18, 15, 34, 11, 12]; // ความกว้างคอลัมน์ (%) หน่วยที่ · ชื่อหน่วย · มาตรฐาน · สาระ · เวลา · น้ำหนัก
const SY_SAVE_LABEL = 'บันทึกโครงสร้างรายวิชา';

// ข้อ 17–21 (ท้ายเอกสาร): วิธีการสอน · สื่อ/แหล่งเรียนรู้ · หนังสืออ่านประกอบ · มาตรฐาน/ตัวชี้วัด (ดึงจากคำอธิบายรายวิชา) · ข้อตกลง · ช่องลงชื่อ/ความเห็นผู้บริหาร
const SY_METHODS = [['practice', 'ลงมือปฏิบัติ (Practice)'], ['demo', 'แบบสาธิต'], ['lecture', 'แบบบรรยาย'], ['group', 'กิจกรรมกลุ่ม (Group Process)'], ['coop', 'ทำงานรับผิดชอบร่วมกัน (Co-operative Learning)']];
const SY_SAMPLE_RULES = ['ห้ามนำอาหาร เครื่องดื่ม เข้ามารับประทานในห้องคอม', 'ช่วยกันรักษาความสะอาดเครื่องคอมพิวเตอร์และห้องเรียน', 'ห้ามเล่นเกมส์โดยเด็ดขาด', 'ห้ามใช้โทรศัพท์ในห้องเรียน ถ้าเห็นโดนยึดและหักคะแนน', 'ห้ามออกนอกห้องก่อนได้รับอนุญาต', 'แต่งกายให้ถูกกระเบียบ', 'ห้ามส่งเสียงดังและพูดจาหยาบคาย'].join('\n');
// ผู้ให้ความเห็น (ค่าเริ่มต้นเมื่อยังไม่เคยบันทึก) — ครูเพิ่ม/ลบ/เปลี่ยนตำแหน่งได้ · approve = มีช่อง “อนุญาตให้ใช้สอนได้ / ควรปรับปรุง”
const syDefaultApprovers = (area) => [
  { role: 'หัวหน้ากลุ่มสาระการเรียนรู้' + (area || ''), name: '', approve: false },
  { role: 'ผู้ช่วยผู้อำนวยการฝ่ายวิชาการ', name: '', approve: false },
  { role: 'รองผู้อำนวยการฝ่ายวิชาการ', name: '', approve: false },
  { role: 'ผู้อำนวยการโรงเรียน', name: '', approve: true },
];

// มีค่าที่พิมพ์ค้างยังไม่บันทึกหรือไม่ — หน้าที่สลับแท็บเรียกถามก่อนทิ้ง (js/picker-pages.js)
let _syDirty = false;
function syIsDirty() { return _syDirty; }
// สถานะของแท็บที่เปิดอยู่: ข้อมูลที่โหลด + ร่างที่พิมพ์ค้าง (เก็บข้ามมุมมองแก้ไข ↔ ตัวอย่าง)
const SY = { id: null, course: null, struct: null, desc: null, profile: null, term: null, termPicked: false, saved: null, draft: null, nav: {}, existed: false, savedAt: null };
function syDiscard() { SY.draft = null; _syDirty = false; }
// บริบทของหน้าข้อมูลรายวิชา: โปรไฟล์ครู + ภาคเรียน/ปีที่ใช้พิมพ์ (ชั่วโมงต่อสัปดาห์ที่แก้ทับอยู่ในเอกสารที่บันทึก/ร่าง)
const syCtx = () => ({ profile: SY.profile, term: SY.term });
// เก็บค่าที่พิมพ์ค้างในฟอร์มเป็นร่าง — เรียกก่อนออกจากแท็บฟอร์ม (js/picker-pages.js) เพื่อให้แท็บตัวอย่างเห็นค่านี้ · ร่างผูกกับวิชา (SY.id)
function syStashDraft() {
  const form = document.getElementById('sy-form');
  if (form && _syDirty) SY.draft = syCollect(form);
}

// ช่องสาระการเรียนรู้ขยายสูงตามข้อความ — เนื้อหายาวขึ้นบรรทัดใหม่ให้เห็นครบ ไม่ต้องเลื่อนอ่านในช่องบรรทัดเดียว (แท็บที่ซ่อนอยู่วัดความสูงไม่ได้ → ข้าม แล้ววัดใหม่เมื่อมองเห็น)
function syGrow(ta) {
  if (!ta || !ta.offsetParent) return;
  ta.setAttribute('style', '--grow-h:auto'); // ส่งเป็นตัวแปร --grow-h อย่างเดียว (ไม่เขียนความสูงลงสไตล์ตรง ๆ) — กฎความสูงอยู่ใน .sy-t-title ใน CSS
  ta.setAttribute('style', `--grow-h:${ta.scrollHeight + 2}px`);
}

const syStr = (v, n) => String(v == null ? '' : v).slice(0, n);
const syRound1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const syFmt = (n) => String(syRound1(n));

// ชั่วโมง: ตัวเลข ≥ 0 ทศนิยมไม่เกิน 1 ตำแหน่ง ไม่เกิน 999 — ค่าอื่น = ว่าง
function syHours(v) {
  const s = String(v == null ? '' : v).trim().replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)).replace(',', '.'); // เลขไทย ๒ และ 1,5 อ่านได้
  const n = Number(s);
  if (!s || !isFinite(n) || n < 0) return '';
  return String(syRound1(Math.min(n, 999)));
}

// ---------------------------------------------------------------- หน้าข้อมูลรายวิชา (หน้าแรกของเอกสาร — ตามแบบ "หลักสูตรรายวิชา (Course Syllabus)")
// ทุกช่องดึงอัตโนมัติ (โปรไฟล์ครู · แม่แบบวิชา · คำอธิบายรายวิชา · วิชาที่เปิดสอน) ไม่เก็บซ้ำ — เก็บลง settings/syllabus เฉพาะ hoursWeek ที่ครูแก้ทับ
const SY_WEEKS = 20; // 1 ภาคเรียน = 20 สัปดาห์ → ชั่วโมงต่อสัปดาห์ = ชั่วโมงต่อภาคเรียน ÷ 20 (1 หน่วยกิต = 40 ชม. = 2 ชม./สัปดาห์)

// ระดับชั้นแบบเต็มตามแบบฟอร์ม: ม.1 → มัธยมศึกษาปีที่ 1 · ป.6 → ประถมศึกษาปีที่ 6 · แปลงไม่ได้ (เช่น ม.4-6) = ตามที่พิมพ์ (ตัดคำว่า "ชั้น" นำหน้า)
function syLevelLong(level) {
  const v = String(level == null ? '' : level).trim().replace(/\s+/g, ' ');
  const m = /^(?:ชั้น\s*)?([มป])\.?\s*([1-6])$/.exec(v);
  if (m) return (m[1] === 'ม' ? 'มัธยมศึกษาปีที่ ' : 'ประถมศึกษาปีที่ ') + m[2];
  return v.replace(/^ชั้น\s*/, '');
}

// ภาคเรียนปัจจุบัน: พ.ค.–ต.ค. = ภาค 1 · พ.ย.–เม.ย. = ภาค 2 (กติกาเดียวกับ ttCurrentTerm ของตารางสอน — ไม่โหลดโมดูลตารางสอนเพียงเพื่อสูตรนี้)
function syCurrentTerm(now = new Date()) {
  const m = now.getMonth() + 1, be = now.getFullYear() + 543;
  if (m >= 5 && m <= 10) return { semester: '1', year: String(be) };
  return { semester: '2', year: String(m >= 11 ? be : be - 1) };
}

// ภาคเรียน/ปีของวิชาที่เปิดสอนล่าสุดจากแม่แบบนี้ — ใช้เป็นค่าเริ่มต้นตอนแก้ที่แม่แบบ (แม่แบบไม่มีภาคเรียนของตัวเอง) · อ่านไม่ได้/ไม่มีวิชา = null
async function syLatestTerm(templateId) {
  try {
    const snap = await db.collection('users').doc(AppState.user.uid).collection('courses').where('templateId', '==', templateId).get();
    const rank = (s) => ({ '1': 1, '2': 2 }[String(s)] || 0);
    const list = snap.docs.map(d => d.data()).filter(c => /^\d{4}$/.test(String(c.year || '')) && rank(c.semester))
      .sort((a, b) => (Number(b.year) - Number(a.year)) || (rank(b.semester) - rank(a.semester)));
    return list.length ? { semester: String(list[0].semester), year: String(list[0].year) } : null;
  } catch (e) { return null; }
}

// รหัสมาตรฐานแบบเทียบกัน: "ว 4.2" = "ว4.2" = "ว. 4.2"
const syCodeKey = (c) => String(c || '').replace(/[\s.]/g, '');

// แยกรหัสตัวชี้วัด "ว 4.2 ม.1/1" → { head: 'ว 4.2', sub: 'ม.1/1' } (กติกาเดียวกับ cdGroupIndicators) · ไม่เข้ารูปแบบ = ทั้งรหัสเป็น head ไม่มี sub
function syIndSplit(raw) {
  const code = String(raw || '').trim().replace(/\s+/g, ' ');
  const m = /^(.+?) ((?:[ก-ฮ]{1,3}\.? )?\S*\d\S*\/\S*\d\S*)$/.exec(code);
  return { code, head: m ? m[1] : code, sub: m ? m[2] : '' };
}

// ตัวชี้วัดจัดเป็นกลุ่มตามมาตรฐาน (หัวกลุ่ม = รหัส + ข้อความมาตรฐานที่ตรงรหัส) เรียงเลขต่อเนื่องทุกกลุ่ม — รวมจำนวน = จำนวนตัวชี้วัด
//   แยกรหัสตัวชี้วัด "ว 4.2 ม.1/1" เป็นหัว "ว 4.2" + ส่วนย่อย "ม.1/1" ด้วยกติกาเดียวกับ cdGroupIndicators · มาตรฐานที่ไม่มีตัวชี้วัดก็แสดงเป็นหัวกลุ่มว่าง
function syOutcomes(desc) {
  const d = desc || {}, stds = Array.isArray(d.standards) ? d.standards : [], inds = Array.isArray(d.indicators) ? d.indicators : [];
  const groups = [], at = new Map();
  const group = (head) => {
    const key = syCodeKey(head);
    if (!at.has(key)) {
      const std = stds.find(r => syCodeKey(r.code) === key);
      at.set(key, groups.length);
      groups.push({ head: std ? [std.code, std.text].filter(Boolean).join(' ') : String(head || '').trim(), items: [] });
    }
    return groups[at.get(key)];
  };
  stds.forEach(r => { if (r.code) group(r.code); else if (r.text) group(r.text); });
  let n = 0;
  inds.forEach(r => {
    const { code, head, sub } = syIndSplit(r && r.code);
    const text = String((r && r.text) || '').trim() || sub || code;
    if (!text) return;
    group(head).items.push({ n: ++n, text });
  });
  return { groups, count: n };
}

// โมเดลหน้าข้อมูลรายวิชา (ฟังก์ชันล้วน) — m = โมเดลตารางที่คำนวณแล้ว (ใช้ชั่วโมง/หน่วยกิต) · ctx = { profile, term, hoursWeek }
//   ภาคเรียน/ปี: ctx.term (ที่ครูเลือกตอนแก้ที่แม่แบบ) → วิชาที่เปิดสอน (course.semester/year) · ชั่วโมงต่อภาคเรียน: หน่วยกิต × 40 ถ้ามีหน่วยกิต ไม่งั้นผลรวมชั่วโมงสาระย่อย
//   ชั่วโมงต่อสัปดาห์: ที่ครูแก้ทับ → ÷ 20 (ไม่อ่านจากตารางสอน: วิชาเดียวสอนหลายห้อง จึงบอกไม่ได้ว่าคาบไหนนับเป็นของเอกสารนี้)
function syCoverModel(course, desc, m, ctx) {
  const c = course || {}, dsc = desc || {}, x = ctx || {}, t = x.term || {};
  const info = docProfileInfo(x.profile);
  const credit = Number(c.credit);
  const hoursSem = m.hoursExpected != null ? m.hoursExpected : (m.hoursTotal > 0 ? m.hoursTotal : null);
  const ovr = Number(syHours(x.hoursWeek)) > 0 ? syHours(x.hoursWeek) : '';
  const hoursWeek = ovr !== '' ? Number(ovr) : (hoursSem != null ? syRound1(hoursSem / SY_WEEKS) : null);
  const out = syOutcomes(dsc);
  return {
    school: info.school, name: String(c.name || ''), code: String(c.code || ''),
    credit: credit > 0 ? credit.toFixed(1) : '', area: m.area || info.subjectGroup, // กลุ่มสาระฯ: ที่กรอกในเอกสาร → คำอธิบายรายวิชา → โปรไฟล์ครู
    semester: String(t.semester || c.semester || ''), year: String(t.year || c.year || ''),
    teacher: info.name, type: 'วิชา' + m.type, hoursWeek, hoursSem, level: syLevelLong(c.level),
    descMain: String(dsc.descMain || '').trim(), descPurpose: String(dsc.descPurpose || '').trim(),
    groups: out.groups, count: out.count,
  };
}

// ทำให้เอกสารที่บันทึกไว้ครบทุกช่อง: ตัดช่องว่าง/ความยาว/จำนวน · ทิ้งสาระย่อยที่ว่าง · ทิ้งหน่วยที่ไม่มีเนื้อหา/id ซ้ำ
//   กลุ่มสาระฯ ที่ไม่เคยบันทึก (ไม่มีฟิลด์ area) → ใช้ค่าจากคำอธิบายรายวิชา (descArea) · เคยบันทึกเป็นค่าว่างแล้ว = ว่างตามนั้น
function syNormalize(d, descArea) {
  d = d && typeof d === 'object' ? d : {};
  const seen = new Set();
  const units = (Array.isArray(d.units) ? d.units : []).slice(0, SY_MAX.units).map(u => ({
    id: syStr(u && u.id, 80),
    standard: syStr(u && u.standard, SY_MAX.std).trim(),
    topics: (Array.isArray(u && u.topics) ? u.topics : []).slice(0, SY_MAX.topics)
      .map(t => ({ title: syStr(t && t.title, SY_MAX.title).replace(/\s*[\r\n]+\s*/g, ' ').trim(), hours: syHours(t && t.hours) }))
      .filter(t => t.title || t.hours),
  })).filter(u => {
    if (!u.id || seen.has(u.id) || !(u.standard || u.topics.length)) return false;
    seen.add(u.id);
    return true;
  });
  const hw = Number(syHours(d.hoursWeek)) > 0 ? syHours(d.hoursWeek) : '';
  const seenA = new Set();
  const analysis = (Array.isArray(d.analysis) ? d.analysis : []).slice(0, SY_MAX.inds).map(r => ({
    key: syStr(r && r.key, 80), core: syStr(r && r.core, SY_MAX.core).trim(), keywords: syStr(r && r.keywords, SY_MAX.kw).trim(),
    k: syHours(r && r.k), p: syHours(r && r.p), a: syHours(r && r.a),
  })).filter(r => {
    if (!r.key || seenA.has(r.key) || !(r.core || r.keywords || r.k || r.p || r.a)) return false;
    seenA.add(r.key);
    return true;
  });
  const pl = d.plan && typeof d.plan === 'object' ? d.plan : {}, seenP = new Set();
  const plan = {
    units: (Array.isArray(pl.units) ? pl.units : []).slice(0, SY_MAX.units).map(r => ({
      id: syStr(r && r.id, 80), when: syStr(r && r.when, SY_MAX.when).trim(), objectives: syStr(r && r.objectives, SY_MAX.obj).trim(), media: syStr(r && r.media, SY_MAX.pmedia).trim(),
    })).filter(r => {
      if (!r.id || seenP.has(r.id) || !(r.when || r.objectives || r.media)) return false;
      seenP.add(r.id);
      return true;
    }),
    media: syStr(pl.media, SY_MAX.pmedia).trim(), midAfter: syStr(pl.midAfter, 80).trim(), midHours: syHours(pl.midHours), finalHours: syHours(pl.finalHours),
  };
  const seenS = new Set();
  const assess = (Array.isArray(d.assess) ? d.assess : []).slice(0, SY_MAX.assess).map(r => ({ // ข้อ 15: ค่าที่ครูกรอกต่อรายการคะแนน (อ้าง id รายการ · '@mid'/'@final' = สอบกลางภาค/ปลายภาค)
    id: syStr(r && r.id, 80), kind: r && (r.kind === 'quiz' || r.kind === 'work') ? r.kind : '', work: r && r.work === 'group' ? 'group' : '',
    ind: syStr(r && r.ind, SY_MAX.aind).trim(), week: syStr(r && r.week, SY_MAX.aweek).trim(), due: syStr(r && r.due, SY_MAX.adue).trim(),
  })).filter(r => {
    if (!r.id || seenS.has(r.id) || !(r.kind || r.work || r.ind || r.week || r.due)) return false;
    seenS.add(r.id);
    return true;
  });
  const mt = Array.isArray(d.methods) ? SY_METHODS.map(x => x[0]).filter(k => d.methods.includes(k)) : null; // ข้อ 17: ไม่มีฟิลด์ = ยังไม่เคยเลือก (ใช้ค่าเริ่มต้นทุกวิธี) · มีแต่ว่าง = ไม่เลือกเลย
  const mOther = syStr(d.methodsOther, SY_MAX.mother).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  const tx = (v, n) => syStr(v, n).replace(/\r\n?/g, '\n').trim();
  const resources = tx(d.resources, SY_MAX.res), books = tx(d.books, SY_MAX.books), rules = tx(d.rules, SY_MAX.rules);
  const approvers = Array.isArray(d.approvers) ? d.approvers.slice(0, SY_MAX.apr).map(r => ({ role: syStr(r && r.role, SY_MAX.role).replace(/\s*[\r\n]+\s*/g, ' ').trim(), name: syStr(r && r.name, SY_MAX.aname).replace(/\s*[\r\n]+\s*/g, ' ').trim(), approve: !!(r && r.approve) })).filter(r => r.role || r.name) : null; // มีฟิลด์แต่ว่าง = ไม่มีช่องความเห็น
  const planHas = plan.units.length || plan.media || plan.midAfter || plan.midHours || plan.finalHours;
  return { area: syStr(d.area != null ? d.area : descArea, SY_MAX.area).trim(), ...(hw ? { hoursWeek: hw } : {}), units, analysis, ...(planHas ? { plan } : {}), ...(assess.length ? { assess } : {}), ...(mt ? { methods: mt } : {}), ...(mOther ? { methodsOther: mOther } : {}), ...(resources ? { resources } : {}), ...(books ? { books } : {}), ...(rules ? { rules } : {}), ...(approvers ? { approvers } : {}) }; // hoursWeek เก็บเฉพาะเมื่อครูแก้ทับ (ว่าง = คำนวณจากหน่วยกิต)
}

// หน่วย/คะแนนจากโครงสร้างคะแนน (ฟังก์ชันล้วน — ทดสอบได้) — items = เอกสารใน assessments · sd = settings/structure
//   ลำดับหน่วย = เหมือนหน้าโครงสร้างคะแนน: หน่วยที่ยังไม่จัดหมวด → แต่ละหมวดตามลำดับหมวด (ในหมวดตามลำดับหน่วย)
//   คืน { units: [{ id, name, weight }], outside: คะแนนเก็บนอกหน่วย, collect, midterm, final }
function syStructFrom(items, sd) {
  items = Array.isArray(items) ? items : [];
  const gids = Array.isArray(sd && sd.groups) ? sd.groups.map(g => g && g.id) : [];
  const all = (Array.isArray(sd && sd.units) ? sd.units : []).filter(u => u && u.id)
    .map(u => ({ id: u.id, name: String(u.name || ''), groupId: gids.includes(u.groupId) ? u.groupId : null }));
  const ordered = [null, ...gids].flatMap(gid => all.filter(u => u.groupId === gid));
  const max = (i) => Number(i && i.max) || 0;
  const collect = items.filter(i => i.category === 'collect');
  const ids = new Set(ordered.map(u => u.id));
  const one = (cat) => max(items.find(i => i.category === cat));
  return {
    units: ordered.map(u => ({
      id: u.id, name: u.name, weight: syRound1(collect.filter(i => i.unitId === u.id).reduce((s, i) => s + max(i), 0)),
      works: collect.filter(i => i.unitId === u.id).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)).map(i => String(i.name || '').trim()).filter(Boolean), // ภาระงานของหน่วย (ข้อ 14) เรียงตามโครงสร้างคะแนน
    })),
    items: collect.map(i => ({ id: i.id, name: String(i.name || '').trim(), max: syRound1(max(i)), unitId: ids.has(i.unitId) ? i.unitId : '', order: Number(i.order) || 0 })) // รายการคะแนนเก็บทั้งหมด เรียงตามหน่วย แล้วตามลำดับในโครงสร้าง (ข้อ 15)
      .map(i => ({ ...i, at: i.unitId ? ordered.findIndex(u => u.id === i.unitId) : ordered.length }))
      .sort((a, b) => a.at - b.at || a.order - b.order).map(({ at, order, ...i }) => i),
    outside: syRound1(collect.filter(i => !ids.has(i.unitId)).reduce((s, i) => s + max(i), 0)),
    collect: syRound1(collect.reduce((s, i) => s + max(i), 0)),
    midterm: one('midterm'),
    final: one('final'),
  };
}

async function syLoadStruct(course) {
  const base = courseBaseRef(course);
  const [snap, sdoc] = await Promise.all([base.collection('assessments').get(), base.collection('settings').doc('structure').get()]);
  return syStructFrom(snap.docs.map(d => ({ id: d.id, ...d.data() })), sdoc.exists ? sdoc.data() : null);
}

// เจ้าของเอกสาร syllabus/description: วิชาที่เปิดสอนในเทอมอ่านจากแม่แบบที่ผูกอยู่ (ใช้ร่วมทุกเทอม) · ไม่ผูกแม่แบบ = ของวิชานั้นเอง
function syOwner(course) {
  return course.templateId ? { id: course.templateId, isTemplate: true } : course;
}

// โหลดทุกอย่างที่ตารางต้องใช้ — โครงสร้างคะแนนอ่านจาก `course` (วิชาที่เปิดสอนมีโครงสร้างของตัวเอง) · syllabus/คำอธิบายอ่านจาก `owner`
async function syLoad(course, owner = course) {
  const set = courseBaseRef(owner).collection('settings');
  const [sSnap, dSnap, struct, profile, term] = await Promise.all([
    set.doc(SY_DOC_ID).get(), set.doc('description').get(), syLoadStruct(course), docGetProfile(),
    course.isTemplate ? syLatestTerm(course.id) : null, // แม่แบบไม่มีภาคเรียนของตัวเอง → ใช้ของวิชาที่เปิดสอนล่าสุด
  ]);
  const desc = cdNormalize(dSnap.exists ? dSnap.data() : {}, owner);
  const raw = sSnap.exists ? sSnap.data() : null;
  return { struct, desc, profile, term, saved: syNormalize(raw || {}, desc.area), existed: !!raw, savedAt: raw ? raw.updatedAt || null : null };
}

// โมเดลของตาราง: หัวเอกสาร + แถวหน่วย + ยอดรวม + คำเตือน
// ชื่อหน่วยที่ครูตั้งมักขึ้นต้นว่า "หน่วยการเรียนรู้ที่ 1 …" ซึ่งซ้ำกับคอลัมน์ "หน่วยที่" → ตัดคำนำออกเมื่อเลขตรงกับลำดับหน่วย (เลขไม่ตรง/ไม่มีชื่อต่อท้าย = คงเดิม ไม่ซ่อนความผิดพลาด)
// ข้อ 13 วิเคราะห์มาตรฐานตัวชี้วัด: 1 ตัวชี้วัดในคำอธิบายรายวิชา = 1 แถว (เรียงตามคำอธิบายรายวิชา) · สาระแกนกลาง/คำสำคัญ/คะแนน K P A ที่ครูกรอกเก็บตาม key = รหัสตัวชี้วัด
//   ตัวชี้วัดที่รหัสซ้ำกันได้ key ต่อท้ายด้วยลำดับ (#n) · saved = analysis ที่ normalize แล้ว · รวม K/P/A = ผลบวกของแถว
function syAnalysisModel(desc, saved) {
  const byKey = new Map((Array.isArray(saved) ? saved : []).map(r => [r.key, r]));
  const rows = [], seen = new Set();
  (Array.isArray(desc && desc.indicators) ? desc.indicators : []).forEach(r => {
    const code = String((r && r.code) || '').trim().replace(/\s+/g, ' '), text = String((r && r.text) || '').trim();
    if (!code && !text) return;
    let key = syCodeKey(code || text).slice(0, 72);
    if (seen.has(key)) key += '#' + (rows.length + 1);
    seen.add(key);
    const sv = byKey.get(key) || {};
    rows.push({ n: rows.length + 1, key, code, text, core: sv.core || '', keywords: sv.keywords || '', k: sv.k || '', p: sv.p || '', a: sv.a || '' });
  });
  const sum = (f) => syRound1(rows.reduce((a, r) => a + (Number(r[f]) || 0), 0));
  return { rows, k: sum('k'), p: sum('p'), a: sum('a') };
}

// ข้อ 14 กำหนดการจัดการเรียนรู้: 1 หน่วย = 1 แถว (ชั่วโมง/ตัวชี้วัด/เนื้อหา/ภาระงานดึงจากโครงสร้างเดิม) · ครูกรอกเพิ่มเฉพาะครั้งที่-วันเวลา จุดประสงค์ สื่อ
//   แถวสอบกลางภาค/ปลายภาคมีเมื่อโครงสร้างคะแนนมีคะแนนสอบนั้น (ชั่วโมงสอบครูกรอกเอง) · สอบกลางภาคแทรกหลังหน่วยที่ครูเลือก (ว่าง = หน่วยที่ชั่วโมงสะสมถึงครึ่งหนึ่ง)
//   ครั้งที่ที่ครูไม่กรอก = เสนอจากชั่วโมงสะสม ÷ ชั่วโมงต่อสัปดาห์ (whenAuto) · ชั่วโมงสะสมนับรวมชั่วโมงสอบ
const syNumbered = (t) => String(t || '').split(/\r?\n/).map(x => x.trim().replace(/^[0-9๐-๙]+[.)]\s+/, '').trim()).filter(Boolean);
// วันเปิดเรียนตามปฏิทินโรงเรียน: ภาค 1 = 16 พ.ค. · ภาค 2 = 1 พ.ย. ของปี ค.ศ. = ปีการศึกษา − 543 · ตรงเสาร์/อาทิตย์ → เลื่อนเป็นวันจันทร์ถัดไป
//   สัปดาห์ที่ n = จันทร์ถึงศุกร์ (SY_WEEK_DAYS วัน) นับจากวันเปิดเรียน · ไม่หักวันหยุดนักขัตฤกษ์ (แอปยังไม่มีปฏิทินโรงเรียน)
const SY_TERM_OPEN = { '1': [4, 16], '2': [10, 1] }; // [เดือน (0 = ม.ค.), วัน]
const SY_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const SY_WEEK_DAYS = 5;
function syTermStart(semester, year) {
  const o = SY_TERM_OPEN[String(semester)], be = Number(year);
  if (!o || !Number.isInteger(be) || be < 2500 || be > 2700) return null;
  const d = new Date(Date.UTC(be - 543, o[0], o[1])), wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() + 2); else if (wd === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
// สัปดาห์ที่ a–b (นับจาก 1) → ช่วงวันที่ เช่น "1-12 มิ.ย.69" · ข้ามเดือน "15 มิ.ย.–3 ก.ค.69" · ข้ามปี "29 ธ.ค.69–2 ม.ค.70"
function syWeekRange(start, a, b) {
  const DAY = 864e5, from = new Date(start.getTime() + (a - 1) * 7 * DAY), to = new Date(start.getTime() + ((b - 1) * 7 + SY_WEEK_DAYS - 1) * DAY);
  const yy = (d) => String((d.getUTCFullYear() + 543) % 100).padStart(2, '0'), mon = (d) => SY_MONTHS[d.getUTCMonth()];
  if (from.getUTCFullYear() !== to.getUTCFullYear()) return `${from.getUTCDate()} ${mon(from)}${yy(from)}–${to.getUTCDate()} ${mon(to)}${yy(to)}`;
  if (from.getUTCMonth() !== to.getUTCMonth()) return `${from.getUTCDate()} ${mon(from)}–${to.getUTCDate()} ${mon(to)}${yy(to)}`;
  return `${from.getUTCDate()}-${to.getUTCDate()} ${mon(to)}${yy(to)}`;
}
function syPlanModel(units, struct, plan, hoursWeek, term) {
  const pl = plan || {}, byId = new Map((pl.units || []).map(r => [r.id, r])), hw = Number(hoursWeek) > 0 ? Number(hoursWeek) : 0;
  const hasMid = (struct.midterm || 0) > 0, hasFinal = (struct.final || 0) > 0;
  const midH = hasMid ? Number(pl.midHours) || 0 : 0, finH = hasFinal ? Number(pl.finalHours) || 0 : 0;
  let midIdx = -1;
  if (hasMid && units.length) {
    midIdx = units.findIndex(u => u.id === pl.midAfter);
    if (midIdx < 0) {
      const total = units.reduce((a, u) => a + u.hours, 0);
      let cum = 0;
      midIdx = units.length - 1;
      for (let i = 0; i < units.length; i++) {
        cum += units[i].hours;
        if (total > 0 ? cum * 2 >= total : i + 1 >= units.length / 2) { midIdx = i; break; }
      }
    }
  }
  const rows = [];
  let cum = 0;
  const start = syTermStart((term || {}).semester, (term || {}).year);
  const weeks = (h) => {
    if (!(hw > 0) || !(h > 0)) return null;
    const a = Math.floor(cum / hw + 1e-9) + 1;
    return [a, Math.max(a, Math.ceil((cum + h) / hw - 1e-9))];
  };
  const span = (h) => { const w = weeks(h); return w ? 'ครั้งที่ ' + (w[0] === w[1] ? w[0] : w[0] + '-' + w[1]) : ''; }; // whenAuto ต้องเป็น "ครั้งที่ a-b" เท่านั้น — ข้อ 15 ดึงเลขสุดท้ายไปเป็นสัปดาห์ (syLastNum)
  const dates = (h) => { const w = weeks(h); return w && start ? syWeekRange(start, w[0], w[1]) : ''; };
  const show = (h) => [span(h), dates(h)].filter(Boolean).join('\n'); // ที่เสนอ/พิมพ์เมื่อครูไม่กรอกเอง: ครั้งที่ + ช่วงวันที่
  units.forEach((u, i) => {
    const sv = byId.get(u.id) || {};
    rows.push({
      kind: 'unit', n: u.n, id: u.id, name: u.name, hours: u.hours, standard: u.standard, topics: u.topics.map(t => t.title).filter(Boolean), works: u.works || [],
      when: sv.when || '', whenAuto: span(u.hours), whenShow: show(u.hours), objectives: syNumbered(sv.objectives), media: sv.media || pl.media || '',
    });
    cum += u.hours;
    if (i === midIdx) { rows.push({ kind: 'mid', hours: midH, whenAuto: span(midH), whenShow: show(midH) }); cum += midH; }
  });
  if (hasFinal && units.length) rows.push({ kind: 'final', hours: finH, whenAuto: span(finH), whenShow: show(finH) });
  return { rows, total: syRound1(rows.reduce((a, r) => a + (Number(r.hours) || 0), 0)), hasMid, hasFinal, midId: midIdx >= 0 ? units[midIdx].id : '' };
}

// ข้อ 15 แผนการประเมินผลการเรียน: ดึงรายการคะแนนจากโครงสร้างคะแนน · ครูกรอกเพิ่มเฉพาะที่ระบบเดาไม่ได้ (ประเภท · ตัวชี้วัด · สัปดาห์ · ลักษณะงาน · กำหนดส่ง)
//   ค่าเริ่มต้น: ประเภท = ทดสอบย่อยถ้าชื่อขึ้นต้น “ทดสอบ”/“แบบทดสอบ” ไม่งั้นเป็นชิ้นงาน · ตัวชี้วัด = ของหน่วยที่ชิ้นงานอยู่ · สัปดาห์ = สัปดาห์สุดท้ายของหน่วยตามข้อ 14
//   สอบกลางภาค = ตัวชี้วัดของหน่วยถึงที่สอบ · สอบปลายภาค = หน่วยที่เหลือ · ตารางที่ 1 รวมชิ้นงานเป็นแถว “ภาระงานเดี่ยว/กลุ่ม จำนวน N ชิ้น” · ตารางที่ 2 แจกแจงรายชิ้น
const syLastNum = (t) => { const m = /(\d+)(?!.*\d)/.exec(String(t || '')); return m ? m[1] : ''; };
const syIsQuizName = (n) => /^\s*(แบบ)?ทดสอบ|^\s*quiz/i.test(String(n || ''));
const syStdJoin = (list) => { const seen = new Set(); list.forEach(t => String(t || '').split(/\r?\n/).forEach(x => { x = x.trim(); if (x) seen.add(x); })); return [...seen].join('\n'); };
function syAssessModel(struct, assess, units, plan) {
  const byId = new Map((Array.isArray(assess) ? assess : []).map(r => [r.id, r]));
  const uById = new Map(units.map(u => [u.id, u])), prow = new Map(plan.rows.filter(r => r.kind === 'unit').map(r => [r.id, r]));
  const items = (struct.items || []).map(it => {
    const sv = byId.get(it.id) || {}, u = uById.get(it.unitId), pr = prow.get(it.unitId);
    const defKind = syIsQuizName(it.name) ? 'quiz' : 'work', defInd = u ? syStdJoin([u.standard]) : '', defWeek = pr ? syLastNum(pr.whenAuto) : '';
    return { id: it.id, name: it.name, max: it.max, kind: sv.kind || defKind, defKind, rawKind: sv.kind || '', work: sv.work === 'group' ? 'group' : 'solo',
      ind: sv.ind || defInd, defInd, rawInd: sv.ind || '', week: sv.week || defWeek, defWeek, rawWeek: sv.week || '', due: sv.due || '' };
  });
  const midIdx = units.findIndex(u => u.id === plan.midId), hasSplit = plan.hasMid && midIdx >= 0 && midIdx + 1 < units.length;
  const exam = (id, label, max, defInd, defWeek) => {
    const sv = byId.get(id) || {};
    return { id, label, max, ind: sv.ind || defInd, defInd, rawInd: sv.ind || '', week: sv.week || defWeek, defWeek, rawWeek: sv.week || '' };
  };
  const exams = [];
  if ((struct.midterm || 0) > 0) exams.push(exam('@mid', 'สอบกลางภาค', struct.midterm, syStdJoin(units.slice(0, midIdx >= 0 ? midIdx + 1 : units.length).map(u => u.standard)), syLastNum((plan.rows.find(r => r.kind === 'mid') || {}).whenAuto)));
  if ((struct.final || 0) > 0) exams.push(exam('@final', 'สอบปลายภาค', struct.final, syStdJoin((hasSplit ? units.slice(midIdx + 1) : units).map(u => u.standard)), syLastNum((plan.rows.find(r => r.kind === 'final') || {}).whenAuto)));
  const quizzes = items.filter(i => i.kind === 'quiz'), works = items.filter(i => i.kind === 'work');
  const solo = works.filter(i => i.work !== 'group'), group = works.filter(i => i.work === 'group');
  const sum = (a) => syRound1(a.reduce((t, i) => t + i.max, 0));
  const rows = [
    ...quizzes.map((q, i) => ({ label: `ทดสอบย่อยครั้งที่ ${i + 1}`, ind: q.ind, week: q.week, pts: q.max })),
    ...exams.map(x => ({ label: x.label, ind: x.ind, week: x.week, pts: x.max })),
    ...(solo.length ? [{ label: `ภาระงานเดี่ยว จำนวน ${solo.length} ชิ้น`, ind: '', week: `1-${SY_WEEKS}`, pts: sum(solo) }] : []),
    ...(group.length ? [{ label: `ภาระงานกลุ่ม จำนวน ${group.length} ชิ้น`, ind: '', week: `1-${SY_WEEKS}`, pts: sum(group) }] : []),
  ];
  return { items, exams, quizzes, works, rows, total: sum(rows.map(r => ({ max: r.pts }))), workTotal: sum(works) };
}

// ข้อ 17–21 + ช่องลงชื่อ: ฟังก์ชันล้วน — s = เอกสารที่ normalize แล้ว · ข้อ 18 ที่ครูไม่กรอก = ใช้สื่อ/แหล่งเรียนรู้ที่กรอกไว้ในข้อ 14 · ข้อ 20 ดึงจากคำอธิบายรายวิชา (m.cover.groups)
function syTailModel(s, cover, area) {
  const on = new Set(Array.isArray(s.methods) ? s.methods : SY_METHODS.map(x => x[0]));
  const a = String(area || '').replace(/^กลุ่มสาระการเรียนรู้\s*/, '').trim();
  const planMedia = (s.plan && s.plan.media) || '';
  return {
    methods: SY_METHODS.map(([k, label]) => ({ k, label, on: on.has(k) })), methodsOther: s.methodsOther || '',
    resources: syNumbered(s.resources || planMedia), resourcesAuto: !s.resources && !!planMedia,
    books: syNumbered(s.books), rules: syNumbered(s.rules),
    teacher: cover.teacher, approvers: (Array.isArray(s.approvers) ? s.approvers : syDefaultApprovers(a)).map(r => ({ ...r })),
  };
}

function syUnitTitle(name, n) {
  const raw = String(name == null ? '' : name).trim();
  const m = /^หน่วย(?:การเรียนรู้)?(?:ที่)?\s*([0-9๐-๙]+)\s*[:：.)\-–—]*\s*/.exec(raw);
  if (!m) return raw;
  const num = Number(m[1].replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)));
  const rest = raw.slice(m[0].length).trim();
  return num === n && rest ? rest : raw;
}

function syModel(course, struct, saved, desc, ctx) {
  const c = course || {}, dsc = desc || {};
  const s = syNormalize(saved, dsc.area);
  const byId = new Map(s.units.map(u => [u.id, u]));
  const units = struct.units.map((u, i) => {
    const sv = byId.get(u.id) || { standard: '', topics: [] };
    return {
      n: i + 1, id: u.id, name: syUnitTitle(u.name, i + 1) || `หน่วยที่ ${i + 1}`, standard: sv.standard, topics: sv.topics, works: u.works || [],
      hours: syRound1(sv.topics.reduce((a, t) => a + (Number(t.hours) || 0), 0)), weight: u.weight,
    };
  });
  const hoursTotal = syRound1(units.reduce((a, u) => a + u.hours, 0));
  const credit = Number(c.credit);
  const hoursExpected = credit > 0 ? syRound1(credit * SY_CREDIT_HOURS) : null;
  const grand = syRound1(struct.collect + struct.midterm + struct.final);
  const sp = s.plan || {};
  const examH = syRound1(((struct.midterm || 0) > 0 ? Number(sp.midHours) || 0 : 0) + ((struct.final || 0) > 0 ? Number(sp.finalHours) || 0 : 0)); // ชั่วโมงสอบที่ครูกรอก (ข้อ 14)
  const warnings = [];
  if (!units.length) warnings.push('ยังไม่มีหน่วยการเรียนรู้ในโครงสร้างคะแนน — เพิ่มหน่วยที่แท็บ “โครงสร้างคะแนน” แล้วกลับมากรอกที่นี่');
  if (hoursExpected != null && hoursTotal !== hoursExpected && syRound1(hoursTotal + examH) !== hoursExpected) warnings.push(`ชั่วโมงรวม ${syFmt(hoursTotal)}${examH > 0 ? ` (รวมชั่วโมงสอบ ${syFmt(hoursTotal + examH)})` : ''} ไม่เท่ากับ ${syFmt(credit)} หน่วยกิต × ${SY_CREDIT_HOURS} = ${syFmt(hoursExpected)} ชั่วโมง`);
  if (grand !== 100) warnings.push(`คะแนนรวมทั้งสิ้น ${syFmt(grand)} ไม่ครบ 100 (แก้ที่แท็บ “โครงสร้างคะแนน”)`);
  const m = {
    code: String(c.code || ''), name: String(c.name || ''), level: String(c.level || ''), credit: String(c.credit == null ? '' : c.credit),
    type: CD_TYPES.includes(dsc.type) ? dsc.type : CD_TYPES[0], area: s.area,
    units, outside: struct.outside, collect: struct.collect, midterm: struct.midterm, final: struct.final, grand,
    ratio: [syRound1(struct.collect + struct.midterm), struct.final], hoursTotal, hoursExpected, warnings,
  };
  m.analysis = syAnalysisModel(dsc, s.analysis);
  const kpa = m.analysis.k + m.analysis.p + m.analysis.a;
  if (kpa > 0 && syRound1(kpa) !== 100) warnings.push(`คะแนน K + P + A ในข้อ 13 รวม ${syFmt(kpa)} ไม่ครบ 100`);
  m.cover = syCoverModel(c, dsc, m, { ...(ctx || {}), hoursWeek: (ctx && ctx.hoursWeek != null) ? ctx.hoursWeek : s.hoursWeek });
  m.plan = syPlanModel(units, struct, s.plan, m.cover.hoursWeek, m.cover);
  m.assess = syAssessModel(struct, s.assess, units, m.plan);
  m.tail = syTailModel(s, m.cover, m.area);
  return m;
}

// ---------------------------------------------------------------- สถานะการบันทึก
// ป้ายบอกสถานะอยู่ที่หัวฟอร์ม (ขวาของ .doc-form-header เหมือนช่อง "สถานะ" ของฟอร์มเอกสารอื่น): ยังไม่เคยบันทึก · มีที่ยังไม่ได้บันทึก · บันทึกแล้ว (พร้อมเวลา)
//   แท็บตัวอย่างไม่มีป้าย/ปุ่มบันทึก (เหมือนตัวอย่างคำอธิบายรายวิชา) — ข้อความแนะนำใต้แถบบอกเองเมื่อตัวอย่างใช้ค่าที่ยังไม่บันทึก
function syTimeText(ts) {
  try {
    const dt = ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts instanceof Date ? ts : null);
    return dt ? dt.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  } catch (e) { return ''; }
}
function syRefreshStatus(container) {
  const el = container.querySelector('#sy-status');
  if (!el) return;
  const when = syTimeText(SY.savedAt);
  el.className = 'sy-status' + (_syDirty ? ' is-dirty' : '');
  el.textContent = _syDirty ? '● มีที่ยังไม่ได้บันทึก' : !SY.existed ? 'ยังไม่เคยบันทึก' : '✓ บันทึกแล้ว' + (when ? ' · ' + when : '');
}
const syStatusHtml = '<span class="sy-status" id="sy-status" role="status"></span>';

// ช่องเวลาที่พิมพ์แล้วอ่านเป็นตัวเลขไม่ได้ (เช่น "2 ชม.") → ทำเครื่องหมายช่อง แล้วคืนช่องแรก · ไม่ปล่อยให้ถูกทิ้งเงียบ ๆ ตอนบันทึก
function syFindBadHours(form) {
  let first = null;
  form.querySelectorAll('.sy-t-hours, .sy-kpa, .sy-ph').forEach(inp => {
    const bad = !!inp.value.trim() && syHours(inp.value) === '';
    inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad && !first) first = inp;
  });
  return first;
}

// บันทึกเอกสารที่ normalize แล้ว → อัปเดตสถานะ · คืน true เมื่อสำเร็จ · ปุ่มบันทึกทุกปุ่มในกล่องถูกปิดระหว่างบันทึก
async function sySave(container, doc) {
  const btns = [...container.querySelectorAll('.sy-do-save')], labels = btns.map(b => b.textContent);
  btns.forEach(b => { b.disabled = true; b.textContent = 'กำลังบันทึก…'; });
  let done = false;
  try {
    await courseBaseRef(SY.course).collection('settings').doc(SY_DOC_ID).set({ ...doc, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    SY.saved = doc; SY.draft = null; SY.existed = true; SY.savedAt = new Date(); _syDirty = false;
    const filled = doc.units.filter(u => SY.struct.units.some(x => x.id === u.id)).length;
    showToast(`บันทึกโครงสร้างรายวิชาสำเร็จ — กรอกแล้ว ${filled} จาก ${SY.struct.units.length} หน่วย`);
    done = true;
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || ''), 'error');
  }
  btns.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
  return done;
}

// ---------------------------------------------------------------- ตัวอย่างก่อนพิมพ์ / พิมพ์
// เอกสาร A4 แนวตั้ง ขอบ 15 มม. — ตารางกว้างจึงใช้ขอบแคบ · SY1_CSS = สไตล์ของ "กระดาษ" (ตัวอย่าง + หน้าต่างพิมพ์) ไม่ใช่สไตล์ของหน้าเว็บ — ธรรมเนียมเดียวกับ CD1_CSS
// 1 หน่วย = 1 แถวของตาราง (สาระย่อย+ชั่วโมงเป็นกริดซ้อนในเซลล์ ไม่ใช้ rowspan) — docPaginate ตัดตารางทีละแถวและซ้ำหัวตารางทุกแผ่น หน่วยจึงไม่ถูกตัดกลาง
// หน้าข้อมูลรายวิชา/ตารางหน่วย = A4 แนวตั้ง (.pg-port) · ข้อ 13 วิเคราะห์ตัวชี้วัด = A4 แนวนอนตามแบบ (.pg-land) — named page ให้ตรงกับ SY_SHEET
const SY_SHEET = {
  port: { w: 210, h: 297, pad: [15, 15, 15, 15], label: 'A4 แนวตั้ง' }, // mm [บน, ขวา, ล่าง, ซ้าย] — ต้องตรงกับ @page sy-port
  land: { w: 297, h: 210, pad: [15, 15, 15, 15], label: 'A4 แนวนอน' },  // ต้องตรงกับ @page sy-land
};
const SY_PAGE = '@page{size:A4 portrait;margin:15mm}@page sy-port{size:A4 portrait;margin:15mm}@page sy-land{size:A4 landscape;margin:15mm}html,body{margin:0;background:#fff}';
const syKind = (section) => (section.classList.contains('pg-land') ? 'land' : 'port');
const SY_TG = (SY_COLS[3] / (SY_COLS[3] + SY_COLS[4]) * 100).toFixed(3); // สัดส่วนช่องสาระ : ช่องเวลา ในเซลล์รวมของแถวหน่วย — ให้เส้นตรงกับคอลัมน์ของหัวตาราง

const SY_ACOLS = [5, 10, 21, 27, 19, 6, 6, 6]; // ข้อ 13: ที่ · รหัส · ตัวชี้วัด · สาระแกนกลาง · คำสำคัญ · K · P · A (%)
const SY_PCOLS = [14, 9, 27, 36, 14]; // ข้อ 14: ครั้งที่/วัน/เวลา · ชั่วโมง · ตัวชี้วัด/จุดประสงค์ · สาระ/เนื้อหา/ภาระงาน · สื่อ (%)
const SY_PHEAD = [['ครั้งที่/', 'วัน/เวลา'], ['จำนวน', 'ชั่วโมง'], ['ตัวชี้วัดหรือ', 'ผลการเรียนรู้/', 'จุดประสงค์การเรียนรู้'], ['สาระการเรียนรู้/เนื้อหาที่สอน/', 'กิจกรรมสำคัญ/ภาระงาน'], ['สื่อ/', 'แหล่งเรียนรู้']];
const SY_QCOLS = [7, 39, 26, 14, 14]; // ข้อ 15 ตารางวิธีการประเมิน: ที่ · วิธีการประเมิน · ตัวชี้วัด · ช่วงเวลา(สัปดาห์) · คะแนน (%)
const SY_QHEAD = [['ที่'], ['วิธีการประเมินนักเรียน'], ['ตัวชี้วัด/', 'ผลการเรียนรู้'], ['ช่วงเวลา', '(สัปดาห์)'], ['คะแนน', '(ร้อยละ)']];
const SY_WCOLS = [7, 31, 20, 10, 16, 16]; // ข้อ 15 ตารางชิ้นงาน: ที่ · ชื่อชิ้นงาน · ตัวชี้วัด · คะแนน · ลักษณะงาน · กำหนดส่ง
const SY_WHEAD = [['ที่'], ['ชื่อชิ้นงาน'], ['ตัวชี้วัด/', 'ผลการเรียนรู้'], ['คะแนน'], ['ลักษณะงาน'], ['กำหนดส่ง']];
const SY_AHEAD = [['ที่'], ['รหัส'], ['ตัวชี้วัด/', 'ผลการเรียนรู้'], ['สาระแกนกลาง'], ['คำสำคัญ']];

// หัวตาราง: ในแต่ละช่อง 1 สมาชิก = 1 บรรทัด และแต่ละบรรทัดไม่ถูกตัดกลางคำ (.sy-hl) — เรียงตาม SY_COLS
const SY_HEAD = [['หน่วย', 'ที่'], ['ชื่อหน่วย', 'การเรียนรู้'], ['มาตรฐาน/', 'ตัวชี้วัด'], ['สาระการเรียนรู้ ', '(เนื้อหา)'], ['เวลา', '(ชั่วโมง)'], ['น้ำหนัก', 'คะแนน']];

const SY1_CSS = `
.sy1{background:#fff;color:#000;font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','THSarabunNew','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:16pt;line-height:1.28}
.sy1 *{box-sizing:border-box}
.sy1 .pg-port{page:sy-port}
.sy1 .pg-land{page:sy-land}
.sy1 .sy-title{text-align:center;font-weight:700;font-size:18pt;margin-bottom:.3em;overflow-wrap:anywhere}
.sy1 .sy-l{display:flex;justify-content:space-between;gap:1em;font-weight:700;padding:0 1mm;overflow-wrap:anywhere}
.sy1 .sy-l>span:last-child{text-align:right}
.sy1 table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:.4em}
.sy1 col{width:var(--w)}
.sy1 th,.sy1 td{border:.75pt solid #aaa;padding:.1em .3em;vertical-align:top;overflow-wrap:anywhere}
.sy1 th{font-weight:700;text-align:center;vertical-align:middle;padding:.1em .15em;overflow-wrap:normal;word-break:normal}
.sy1 .sy-hl{display:inline-block;white-space:nowrap}
.sy1 tr{break-inside:avoid;page-break-inside:avoid}
.sy1 td.sy-c{text-align:center}
.sy1 td.sy-tc{padding:0;vertical-align:top;position:relative}
.sy1 td.sy-tc::after{content:"";position:absolute;top:0;bottom:0;left:${SY_TG}%;border-left:.75pt solid #aaa;pointer-events:none}
.sy1 .sy-tr{display:grid;grid-template-columns:${SY_TG}% ${(100 - SY_TG).toFixed(3)}%}
.sy1 .sy-tr+.sy-tr{border-top:.75pt solid #555}
.sy1 .sy-tt{padding:.1em .3em;overflow-wrap:anywhere}
.sy1 .sy-th{padding:.1em .3em;text-align:center}
.sy1 tr.sy-sum td{font-weight:700;text-align:center}
.sy1 tr.sy-pe td{text-align:center}
.sy1 .sy-pl-l{margin-top:.15em}
.sy1 .sy-ra{display:grid;grid-template-columns:minmax(0,1fr) 9em;padding-left:1.5em;margin:.1em 0}
.sy1 td.sy-l2{text-align:left}
.sy1 .sy-pl-i{display:grid;grid-template-columns:var(--nw,1.3em) minmax(0,1fr);overflow-wrap:anywhere}
.sy1 .sy-pl-n{white-space:nowrap}
.sy1 .sy-pl-t{min-width:0;overflow-wrap:anywhere}
.sy1 section+section{break-before:page;page-break-before:always}
.sy1 .sy-ct{text-align:center;font-size:18pt;line-height:1.4;overflow-wrap:anywhere}
.sy1 .sy-rule{border-top:.75pt solid #000;margin:.4em 0 .5em}
.sy1 .sy-f{margin:.15em 0;overflow-wrap:anywhere}
.sy1 .sy-gap{display:inline-block;width:2.5em}
.sy1 .sy-h{font-weight:700;margin:.55em 0 .2em;break-after:avoid;page-break-after:avoid}
.sy1 .sy-p{text-indent:2.5em;text-align:justify;margin:.15em 0;overflow-wrap:anywhere}
.sy1 .sy-sg{text-indent:2.5em;margin:.45em 0 .1em;break-after:avoid;page-break-after:avoid;overflow-wrap:anywhere}
.sy1 .sy-oi{text-indent:2.5em;margin:.1em 0;overflow-wrap:anywhere}
.sy1 .sy-oi.sy-tot{text-indent:0;margin-top:.15em}
.sy1 .sy-ck{display:grid;grid-template-columns:1fr 1fr;gap:.1em 1em;margin:.15em 0 .15em 2.5em}
.sy1 .sy-li{display:grid;grid-template-columns:var(--nw,1.3em) minmax(0,1fr);margin:.1em 0 .1em 2.5em;overflow-wrap:anywhere}
.sy1 .sy-ap{break-inside:avoid;page-break-inside:avoid;margin-top:.5em}
.sy1 .sy-ap .sy-h{margin-top:.2em}
.sy1 .sy-sig{margin-left:42%;text-align:center;overflow-wrap:anywhere}
.sy1 .sy-dl{border-bottom:.75pt dotted #000;height:1.3em;margin:.1em 0}
`;

// ข้อความหลายบรรทัด (ช่องมาตรฐาน/ตัวชี้วัด) → <br>
const syLines = (t) => String(t || '').split(/\r?\n/).map(escapeHtml).join('<br>');

// ข้อความหลายย่อหน้า (คั่นด้วยบรรทัดว่าง) → <div class="sy-p"> ต่อย่อหน้า · ขึ้นบรรทัดเดี่ยว = <br>
const syParas = (t) => String(t || '').split(/\r?\n\s*\r?\n/).map(x => x.trim()).filter(Boolean).map(x => `<div class="sy-p">${syLines(x)}</div>`).join('');

// หน้าแรก (<section>) ตามแบบ "หลักสูตรรายวิชา (Course Syllabus)": หัวเรื่อง+โรงเรียน → เส้น → ข้อ 1–10 → เส้น → 11. คำอธิบายรายวิชา → ผลการเรียนรู้/ตัวชี้วัด → รวม N
//   ทุกบล็อกเป็นลูกตรงของ <section> เพื่อให้ docPaginate ตัดหน้าได้ · ช่องที่ยังว่างแสดงจุดไข่ปลา
function syCoverSectionHtml(m) {
  const cv = m.cover, e = escapeHtml, dots = n => '…'.repeat(n), f = syFmt;
  const v = (x, n) => e(x) || dots(n);
  const area = cv.area.replace(/^กลุ่มสาระการเรียนรู้\s*/, '').trim();
  const row = (label, val) => `<div class="sy-f">${label} ${val}</div>`;
  const outcomes = cv.groups.map(g => (g.head ? `<div class="sy-sg">${e(g.head)}</div>` : '') + g.items.map(i => `<div class="sy-oi">${i.n}. ${e(i.text)}</div>`).join('')).join('');
  return `<section class="pg-port">
  <div class="sy-ct">หลักสูตรรายวิชา (Course Syllabus)</div>
  <div class="sy-ct">${v(cv.school, 20)}</div>
  <div class="sy-rule"></div>
  ${row('1. ชื่อวิชา', v(cv.name, 20))}
  ${row('2. รหัสวิชา', v(cv.code, 6))}
  ${row('3. จำนวนหน่วยกิต', cv.credit ? e(cv.credit) : dots(3))}
  ${row('4. กลุ่มสาระการเรียนรู้', v(area, 12))}
  ${row('5. ภาคเรียนที่', v(cv.semester, 1))}
  ${row('6. ปีการศึกษา', v(cv.year, 4))}
  ${row('7. ชื่อผู้สอน', v(cv.teacher, 14))}
  ${row('8. ประเภทวิชา', e(cv.type.replace(/^วิชา/, '') ? cv.type : ''))}
  ${row('9. จำนวนชั่วโมง', `${cv.hoursWeek != null ? f(cv.hoursWeek) : dots(2)} ชั่วโมง / สัปดาห์ <span class="sy-gap"></span>${cv.hoursSem != null ? f(cv.hoursSem) : dots(2)} ชั่วโมง / ภาคเรียน`)}
  ${row('10. ระดับชั้น', v(cv.level, 12))}
  <div class="sy-rule"></div>
  <div class="sy-h">11. คำอธิบายรายวิชา</div>
  ${syParas(cv.descMain) || `<div class="sy-p">${dots(40)}</div>`}
  ${syParas(cv.descPurpose)}
  <div class="sy-h">ผลการเรียนรู้ /ตัวชี้วัด</div>
  ${outcomes}
  <div class="sy-oi sy-tot">รวม ${cv.count ? cv.count : dots(2)} ผลการเรียนรู้/ตัวชี้วัด</div>
</section>`;
}

// เนื้อกระดาษหน้าตาราง (<section>) — หัวเรื่อง · ชื่อวิชา/รหัส/กลุ่มสาระ · ชั้น/เวลา/หน่วยกิต · ตารางหน่วยการเรียนรู้ · สรุปอัตราส่วนและยอดรวม
//   ช่องที่ยังว่างแสดงจุดไข่ปลา เหมือนฟอร์มราชการที่รอกรอก
function syTableSectionHtml(m) {
  const e = escapeHtml, dots = n => '…'.repeat(n), f = syFmt;
  const area = m.area.replace(/^กลุ่มสาระการเรียนรู้\s*/, '').trim(); // กันพิมพ์คำนำมาซ้ำกับที่กระดาษใส่ให้
  const hours = m.hoursTotal > 0 ? f(m.hoursTotal) : (m.hoursExpected != null ? f(m.hoursExpected) : '');
  const topicRows = (u) => (u.topics.length ? u.topics : [{ title: '', hours: '' }])
    .map((t, i) => `<div class="sy-tr"><span class="sy-tt">${t.title ? `${u.n}.${i + 1} ${e(t.title)}` : '&nbsp;'}</span><span class="sy-th">${e(t.hours)}</span></div>`).join('');
  const unitRow = (u) => `<tr class="sy-u"><td class="sy-c">${u.n}</td><td class="sy-c">${e(u.name)}</td><td class="sy-c">${syLines(u.standard)}</td><td class="sy-tc" colspan="2">${topicRows(u)}</td><td class="sy-c">${f(u.weight)}</td></tr>`;
  const sum = (label, h, w) => `<tr class="sy-sum"><td colspan="4">${label}</td><td>${h}</td><td>${w}</td></tr>`;
  return `<section class="pg-port">
  <div class="sy-title">โครงสร้างรายวิชา${e(m.type)}${e(area)}</div>
  <div class="sy-l"><span>${e(m.name) || dots(20)} ${e(m.code) || dots(6)}</span> <span>กลุ่มสาระการเรียนรู้${e(area) || dots(12)}</span></div>
  <div class="sy-l"><span>${e(cdLevelText(m.level)) || 'ชั้น' + dots(12)} เวลา ${hours || dots(3)} ชั่วโมง</span> <span>จำนวน ${e(m.credit) || dots(3)} หน่วยกิต</span></div>
  <table>
    <colgroup>${SY_COLS.map(w => `<col style="--w:${w}%">`).join('')}</colgroup>
    <thead><tr>${SY_HEAD.map(h => `<th>${h.map(l => `<span class="sy-hl">${l}</span>`).join('<br>')}</th>`).join('')}</tr></thead>
    <tbody>
      ${m.units.map(unitRow).join('\n      ')}
      ${m.outside > 0 ? sum('คะแนนเก็บนอกหน่วย', '', f(m.outside)) : ''}
      <tr class="sy-sum"><td colspan="6">อัตราส่วนระหว่างภาค : ปลายภาค ${f(m.ratio[0])} : ${f(m.ratio[1])} คะแนน</td></tr>
      ${sum('รวมชั่วโมง/คะแนนระหว่างภาค', '', f(m.collect))}
      ${sum('รวมชั่วโมง/คะแนนกลางภาค', '', f(m.midterm))}
      ${sum('รวมชั่วโมง/คะแนนปลายภาค', '', f(m.final))}
      ${sum('รวมทั้งสิ้น', f(m.hoursTotal), f(m.grand))}
    </tbody>
  </table>
</section>`;
}

// เนื้อกระดาษทั้งเอกสาร: หน้าข้อมูลรายวิชา (ตามรูปแบบหลักสูตร) ตามด้วยตารางหน่วยการเรียนรู้ ข้อ 13 วิเคราะห์ตัวชี้วัด ข้อ 14 กำหนดการจัดการเรียนรู้ ข้อ 15–16 แผนการประเมินผลการเรียน/รายละเอียดภาระชิ้นงาน และข้อ 17–21 พร้อมช่องลงชื่อ — แต่ละส่วนขึ้นหน้าใหม่
function sySheetBodyHtml(m) { return [syCoverSectionHtml(m), syTableSectionHtml(m), syAnalysisSectionHtml(m), syPlanSectionHtml(m), syAssessSectionHtml(m), syTailSectionHtml(m)].filter(Boolean).join('\n'); }

// ข้อ 17–21 + ลงชื่อครูประจำวิชา + ความเห็นผู้บริหาร (หน้าแนวตั้ง) — ช่องที่ยังว่างแสดงจุดไข่ปลา · ทุกบล็อกเป็นลูกตรงของ <section> (ช่องลงชื่อแต่ละคนห่อเป็นก้อนเดียว ไม่ถูกตัดกลาง)
function syTailSectionHtml(m) {
  const e = escapeHtml, t = m.tail, dots = n => '…'.repeat(n), empty = `<div class="sy-p">${dots(40)}</div>`;
  const list = (arr) => { if (!arr.length) return empty; const nw = (String(arr.length).length * 0.5 + 0.8).toFixed(1); return arr.map((x, i) => `<div class="sy-li" style="--nw:${nw}em"><span>${i + 1}.</span><span>${e(x)}</span></div>`).join(''); };
  const box = (on) => (on ? '[ / ]' : '[&nbsp;&nbsp;&nbsp;&nbsp;]');
  const mrows = [...t.methods.map(x => ({ label: x.label, on: x.on })), ...(t.methodsOther ? [{ label: 'อื่น ๆ ' + t.methodsOther, on: true }] : [])];
  const outcomes = m.cover.groups.length ? m.cover.groups.map(g => (g.head ? `<div class="sy-sg">${e(g.head)}</div>` : '') + g.items.map(i => `<div class="sy-oi">${i.n}. ${e(i.text)}</div>`).join('')).join('') : empty;
  const nm = e(m.name) || dots(12);
  const approver = (r) => `<div class="sy-ap">
    <div class="sy-h">ความเห็นของ${e(r.role) || dots(10)}</div>
    ${r.approve ? '<div class="sy-f">( ) อนุญาตให้ใช้สอนได้ ( ) ควรปรับปรุง</div>' : ''}
    <div class="sy-dl"></div>
    <div class="sy-sig">ลงชื่อ${dots(12)}</div>
    <div class="sy-sig">(${e(r.name) || dots(8)})</div>
    <div class="sy-sig">${e(r.role)}</div>
  </div>`;
  return `<section class="pg-port">
  <div class="sy-h">17. วิธีการจัดการเรียนการสอน (ระบุได้มากกว่า 1 วิธี)</div>
  <div class="sy-ck">${mrows.map(x => `<span>${box(x.on)} ${e(x.label)}</span>`).join('')}</div>
  <div class="sy-h">18. สื่อ / แหล่งเรียนรู้</div>
  ${list(t.resources)}
  <div class="sy-h">19. รายชื่อหนังสืออ่านประกอบ</div>
  ${list(t.books)}
  <div class="sy-h">20. มาตรฐานการเรียนรู้/ตัวชี้วัด (จุดประสงค์การเรียนรู้) รายวิชา${nm}</div>
  ${outcomes}
  <div class="sy-h">21. ข้อตกลงในการเรียนรายวิชา ${nm}</div>
  ${list(t.rules)}
  <div class="sy-ap">
    <div class="sy-sig">ลงชื่อ${dots(8)}ครูประจำวิชา</div>
    <div class="sy-sig">(${e(t.teacher) || dots(8)})</div>
  </div>
  ${t.approvers.map(approver).join('\n  ')}
</section>`;
}

// ข้อ 13 วิเคราะห์มาตรฐานตัวชี้วัด หรือผลการเรียนรู้ — ตารางต่อจากโครงสร้างรายวิชา (ไม่มีตัวชี้วัดในคำอธิบายรายวิชา = ไม่มีหน้านี้)
//   หัว 2 แถว (เกณฑ์การประเมินฯ คร่อม K P A) — docPaginate ซ้ำ thead ทั้งก้อนทุกแผ่น · แถวรวมอยู่ใน tbody
function syAnalysisSectionHtml(m) {
  const e = escapeHtml, f = syFmt, a = m.analysis;
  if (!a || !a.rows.length) return '';
  const hl = (h) => h.map(l => `<span class="sy-hl">${l}</span>`).join('<br>');
  const row = (r) => `<tr class="sy-ar"><td class="sy-c">${r.n}</td><td class="sy-c">${e(r.code)}</td><td>${syLines(r.text)}</td><td>${syLines(r.core)}</td><td>${syLines(r.keywords)}</td><td class="sy-c">${e(r.k)}</td><td class="sy-c">${e(r.p)}</td><td class="sy-c">${e(r.a)}</td></tr>`;
  return `<section class="pg-land">
  <div class="sy-h">13. วิเคราะห์มาตรฐานตัวชี้วัด หรือผลการเรียนรู้</div>
  <table>
    <colgroup>${SY_ACOLS.map(w => `<col style="--w:${w}%">`).join('')}</colgroup>
    <thead><tr>${SY_AHEAD.map(h => `<th rowspan="2">${hl(h)}</th>`).join('')}<th colspan="3">${hl(['เกณฑ์การประเมิน', 'ผลการเรียนรู้', 'ของผู้เรียน'])}</th></tr><tr><th>K</th><th>P</th><th>A</th></tr></thead>
    <tbody>
      ${a.rows.map(row).join('\n      ')}
      <tr class="sy-sum"><td colspan="5">รวม</td><td>${f(a.k)}</td><td>${f(a.p)}</td><td>${f(a.a)}</td></tr>
    </tbody>
  </table>
</section>`;
}

// ข้อ 14 กำหนดการจัดการเรียนรู้ (หน้าแนวตั้ง) — แถวละ 1 หน่วย + แถวสอบกลางภาค/ปลายภาค + รวม · ไม่มีหน่วยในโครงสร้างคะแนน = ไม่มีหน้านี้
function syPlanSectionHtml(m) {
  const e = escapeHtml, f = syFmt, pl = m.plan;
  if (!pl || !pl.rows.some(r => r.kind === 'unit')) return '';
  const hl = (h) => h.map(l => `<span class="sy-hl">${l}</span>`).join('<br>');
  const list = (arr) => { const nw = (String(arr.length).length * 0.5 + 0.8).toFixed(1); return arr.map((t, i) => `<div class="sy-pl-i" style="--nw:${nw}em"><span class="sy-pl-n">${i + 1}.</span> <span class="sy-pl-t">${e(t)}</span></div>`).join(''); }; // เลขแยกคอลัมน์ของตัวเอง → บรรทัดต่อไปชิดแนวเดียวกับตัวอักษรบรรทัดแรก (เดิมใช้ text-indent ติดลบ แล้วเลขสั้นกว่าช่องเยื้อง ทำให้แนวเหลื่อม)
  const hrs = (h) => (Number(h) > 0 ? f(h) : '');
  const unit = (r) => `<tr class="sy-pu"><td class="sy-c">${syLines(r.when || r.whenShow)}</td><td class="sy-c">${hrs(r.hours)}</td>`
    + `<td>${syLines(r.standard)}${r.objectives.length ? `<div class="sy-pl-l">จุดประสงค์การเรียนรู้</div>${list(r.objectives)}` : ''}</td>`
    + `<td>${r.topics.length ? `<div class="sy-pl-l">เนื้อหา</div>${list(r.topics)}` : ''}${r.works.length ? `<div class="sy-pl-l">ภาระงาน</div>${list(r.works)}` : ''}</td>`
    + `<td>${syLines(r.media)}</td></tr>`;
  const exam = (r) => `<tr class="sy-pe"><td></td><td>${hrs(r.hours)}</td><td colspan="3">${r.kind === 'mid' ? 'สอบกลางภาค' : 'สอบปลายภาค'}</td></tr>`;
  return `<section class="pg-port">
  <div class="sy-h">14. กำหนดการจัดการเรียนรู้</div>
  <table>
    <colgroup>${SY_PCOLS.map(w => `<col style="--w:${w}%">`).join('')}</colgroup>
    <thead><tr>${SY_PHEAD.map(h => `<th>${hl(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${pl.rows.map(r => (r.kind === 'unit' ? unit(r) : exam(r))).join('\n      ')}
      <tr class="sy-sum"><td>รวม</td><td>${f(pl.total)}</td><td colspan="3"></td></tr>
    </tbody>
  </table>
</section>`;
}

// ข้อ 15 แผนการประเมินผลการเรียน (หน้าแนวตั้ง) — อัตราส่วน 2 ข้อ · ตารางวิธีการประเมิน · ตารางรายละเอียดชิ้นงาน · หมายเหตุผลการเรียน “ร” · ไม่มีรายการคะแนนเลย = ไม่มีหน้านี้
function syAssessSectionHtml(m) {
  const e = escapeHtml, f = syFmt, a = m.assess;
  if (!a || !a.rows.length) return '';
  const hl = (h) => h.map(l => `<span class="sy-hl">${l}</span>`).join('<br>');
  const kpa = m.analysis.k + m.analysis.p + m.analysis.a;
  const head = (cols, heads) => `<colgroup>${cols.map(w => `<col style="--w:${w}%">`).join('')}</colgroup>\n    <thead><tr>${heads.map(h => `<th>${hl(h)}</th>`).join('')}</tr></thead>`;
  const q = (r, i) => `<tr><td class="sy-c">${i + 1}</td><td class="sy-l2">${e(r.label)}</td><td class="sy-c">${syLines(r.ind)}</td><td class="sy-c">${e(r.week)}</td><td class="sy-c">${f(r.pts)}</td></tr>`;
  const w = (r, i) => `<tr><td class="sy-c">${i + 1}</td><td class="sy-l2">${e(r.name)}</td><td class="sy-c">${syLines(r.ind)}</td><td class="sy-c">${f(r.max)}</td><td class="sy-c">${r.work === 'group' ? 'งานกลุ่ม' : 'งานเดี่ยว'}</td><td class="sy-c">${e(r.due)}</td></tr>`;
  return `<section class="pg-port">
  <div class="sy-h">15. แผนการประเมินผลการเรียน</div>
  <div class="sy-ra"><span>1. อัตราส่วนคะแนนระหว่างภาค : คะแนนปลายภาค</span> <span>= ${f(m.ratio[0])} : ${f(m.ratio[1])}</span></div>
  ${kpa > 0 ? `<div class="sy-ra"><span>2. อัตราส่วนคะแนน K : P : A</span> <span>= ${f(m.analysis.k)} : ${f(m.analysis.p)} : ${f(m.analysis.a)}</span></div>` : ''}
  <div class="sy-h">โดยมีรายละเอียดดังนี้</div>
  <table>
    ${head(SY_QCOLS, SY_QHEAD)}
    <tbody>
      ${a.rows.map(q).join('\n      ')}
      <tr class="sy-sum"><td colspan="4">รวม</td><td>${f(a.total)}</td></tr>
    </tbody>
  </table>
  ${a.works.length ? `<div class="sy-h">16. รายละเอียดภาระชิ้นงาน</div>
  <table>
    ${head(SY_WCOLS, SY_WHEAD)}
    <tbody>
      ${a.works.map(w).join('\n      ')}
      <tr class="sy-sum"><td colspan="3">รวม</td><td>${f(a.workTotal)}</td><td colspan="2"></td></tr>
    </tbody>
  </table>
  <div class="sy-p">หากนักเรียนขาดส่งชิ้นงานและมีคะแนนตลอดภาคเรียนไม่ถึง ${f(a.workTotal)} คะแนน จะได้รับผลการเรียน “ร” ในรายวิชานี้ (การกำหนดน้ำหนักคะแนนต่อภาระหรือชิ้นงาน ไม่ควรกำหนดเกินชิ้นละ 5 คะแนนสำหรับงานเดี่ยว และ 10 คะแนนสำหรับงานกลุ่ม)</div>` : ''}
</section>`;
}

function syDocTitle(c) { return ['Course Syllabus', c.code, c.name].filter(Boolean).join(' '); }

// พิมพ์ / บันทึกเป็น PDF ผ่านหน้าต่างใหม่ (docPrintWindow ต้องถูกเรียกจากการคลิกโดยตรง)
function syPrint(m) {
  return docPrintWindow({ title: syDocTitle(m), css: SY1_CSS, page: SY_PAGE, html: `<div class="sy1">${sySheetBodyHtml(m)}</div>` }); // m มีหน้าข้อมูลรายวิชา (m.cover) อยู่แล้ว
}

// พิมพ์จากหน้าวิชาที่เปิดสอน (js/courses.js) — window.open ต้องมาก่อน await จึงส่ง html เป็นฟังก์ชัน (docPrintWindow เปิดหน้าต่างก่อนแล้วค่อยเรียก) · โหลดข้อมูลหลังคลิกได้
function syPrintCourse(course) {
  return docPrintWindow({
    title: syDocTitle(course), css: SY1_CSS, page: SY_PAGE,
    html: async () => {
      const d = await syLoad(course, syOwner(course));
      return `<div class="sy1">${sySheetBodyHtml(syModel(course, d.struct, d.saved, d.desc, { profile: d.profile }))}</div>`; // ภาคเรียน/ปีมาจากวิชาที่เปิดสอนเอง
    },
  });
}

// หน้าตัวอย่าง: แผ่น A4 ตัดหน้าด้วยโครงกลาง (docRenderSheets) · โครงกลางดูแท็บจาก sys.state.tab เพื่อเลิกฟัง resize — ส่ง sys จำลอง
const SY_PREVIEW_SYS = { state: { tab: 'syllprev' } };
function syShowPreview(container, m, fromDraft, onEdit) {
  container.innerHTML = `
    <div class="doc-preview-bar">
      <div class="doc-preview-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="sy-prev-edit">${DOC_ICO_EDIT} แก้ไข</button>
        <button type="button" class="btn btn-primary btn-sm" id="sy-prev-print">${DOC_ICO_PRINT} พิมพ์ / บันทึกเป็น PDF</button>
      </div>
    </div>
    <div class="u-note doc-preview-hint">${fromDraft ? 'ตัวอย่างนี้รวมส่วนที่ยังไม่ได้บันทึก (ยังไม่ถูกเก็บลงแม่แบบ) · ' : ''}กดพิมพ์แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้ · ใช้ Chrome/Edge จะแบ่งหน้าได้ถูกต้องที่สุด</div>
    ${m.warnings.length ? `<div class="sy-warn" role="status">${m.warnings.map(escapeHtml).join('<br>')}</div>` : ''}
    <div class="doc-preview-frame-wrap"><iframe class="doc-preview-frame is-fit" title="ตัวอย่างโครงสร้างรายวิชา"></iframe></div>`;
  container.querySelector('#sy-prev-edit').addEventListener('click', () => { if (onEdit) onEdit(); });
  container.querySelector('#sy-prev-print').addEventListener('click', () => syPrint(m));
  const body = sySheetBodyHtml(m);
  docRenderSheets(SY_PREVIEW_SYS, 'syllprev', container, null, { // ไม่รอ — แถบแสดงไปก่อน กระดาษตามมา
    html: () => docSheetsHtml(SY1_CSS, `<div class="sy1">${body}</div>`),
    specs: SY_SHEET, bodyClass: 'sy1', keep: '.sy-title, .sy-h, .sy-sg', kindOf: syKind,
  }).catch(err => console.error('syShowPreview:', err));
}

// ---------------------------------------------------------------- ฟอร์ม (มุมมองแก้ไข)
function syTopicRowHtml(t = {}) {
  return `<div class="doc-lrow sy-trow">
    <textarea class="input-sm sy-t-title" rows="1" maxlength="${SY_MAX.title}" placeholder="เช่น ถูกต้อง ปลอดภัย ใช่เลย (เลข 1.1, 1.2 ใส่ให้เอง)" aria-label="ชื่อสาระการเรียนรู้ย่อย">${escapeHtml(t.title || '')}</textarea>
    <input class="input-sm sy-t-hours" type="text" inputmode="decimal" maxlength="${SY_MAX.hours}" placeholder="ชม." value="${escapeHtml(t.hours || '')}" aria-label="เวลา (ชั่วโมง)">
    <button type="button" class="btn btn-danger-ghost btn-sm doc-l-del sy-t-del" title="ลบแถว" aria-label="ลบแถว">${DOC_ICO_DEL}</button>
  </div>`;
}

// ตัวชี้วัดในคำอธิบายรายวิชา จัดเป็นกลุ่มตามมาตรฐาน ให้ครูติ๊กเลือกทั้งหมดหรือบางข้อใส่ช่อง "มาตรฐาน/ตัวชี้วัด" ของหน่วย
//   group = { head: รหัสมาตรฐานตามที่พิมพ์, key: รูปที่ใส่ช่อง (ตัดช่องว่างหลังตัวอักษรนำหน้า "ว 4.2" → "ว4.2"), title: ข้อความมาตรฐานที่รหัสตรงกัน, items: [{ sub: "ม.2/1", text }] }
function syIndicatorOptions(desc) {
  const stds = Array.isArray(desc && desc.standards) ? desc.standards : [];
  const groups = [], at = new Map();
  (Array.isArray(desc && desc.indicators) ? desc.indicators : []).forEach(r => {
    const { code, head, sub } = syIndSplit(r && r.code);
    if (!code) return; // แถวที่ไม่มีรหัส (มีแต่ข้อความ) ไม่มีอะไรให้ใส่ช่องรหัส
    if (!at.has(head)) {
      const std = stds.find(x => syCodeKey(x && x.code) === syCodeKey(head));
      at.set(head, groups.length);
      groups.push({ head, key: head.replace(/^([ก-ฮ]+)\s+/, '$1'), title: std ? String(std.text || '').trim() : '', items: [] });
    }
    groups[at.get(head)].items.push({ sub, text: String((r && r.text) || '').trim() });
  });
  return groups;
}

// บรรทัดที่จะใส่ช่องมาตรฐาน จากข้อที่ติ๊ก (sel = Set ของ "กลุ่ม:ข้อ") — บางข้อในกลุ่ม → "ว4.2 / ม.2/1, ม.2/3" · ตัวชี้วัดที่ไม่มีรหัสย่อย = รหัสมาตรฐานอย่างเดียว
function syPickLines(groups, sel) {
  return groups.map((g, gi) => {
    const hit = g.items.filter((_, ii) => sel.has(gi + ':' + ii));
    if (!hit.length) return null;
    const subs = hit.map(it => it.sub).filter(Boolean);
    return subs.length ? `${g.key} / ${subs.join(', ')}` : g.key;
  }).filter(Boolean);
}

// ต่อบรรทัดใหม่ท้ายช่องมาตรฐาน โดยข้ามบรรทัดที่มีอยู่แล้ว (ติ๊กซ้ำไม่ซ้อนกัน) → { text, added }
function syAppendLines(current, lines) {
  const have = new Set(String(current || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean));
  const add = lines.filter(l => !have.has(l));
  const base = String(current || '').trim();
  return { text: add.length ? (base ? base + '\n' : '') + add.join('\n') : String(current || ''), added: add.length };
}

const syUnitStatus = (u) => (u.standard || u.topics.length ? `กรอกแล้ว · ${syFmt(u.hours)} ชั่วโมง` : 'ยังไม่ได้กรอก');

// กล่องเลือกตัวชี้วัด (พับเก็บได้): เลือกทั้งหมด · ทั้งมาตรฐาน · รายข้อ — ติ๊กอย่างเดียวไม่แก้เอกสาร จนกว่าจะกด "ใส่ลงช่อง"
function syPickHtml(groups) {
  if (!groups.length) return '';
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return `<details class="sy-pick"><summary>เลือกจากคำอธิบายรายวิชา…</summary><div class="sy-pick-box">
      <label class="sy-pick-all"><input type="checkbox" class="sy-pick-all-cb"> เลือกทั้งหมด (${total} ข้อ)</label>
      ${groups.map((g, gi) => `<div class="sy-pick-g">
        <label class="sy-pick-gh"><input type="checkbox" class="sy-pick-g-cb" data-g="${gi}"> <b>${escapeHtml(g.head)}</b>${g.title ? ' ' + escapeHtml(g.title) : ''}</label>
        ${g.items.map((it, ii) => `<label class="sy-pick-i"><input type="checkbox" class="sy-pick-cb" data-g="${gi}" data-i="${ii}"> ${it.sub ? `<span class="sy-pick-code">${escapeHtml(it.sub)}</span> ` : ''}${escapeHtml(it.text)}</label>`).join('')}
      </div>`).join('')}
      <div class="sy-pick-foot"><span class="sy-pick-n" role="status">เลือก 0 ข้อ</span><button type="button" class="btn btn-primary btn-sm sy-pick-apply" disabled>ใส่ลงช่อง</button></div>
    </div></details>`;
}

function syUnitHtml(u, groups) {
  const pick = syPickHtml(groups);
  return `<div class="pa-witem sy-unit" data-unit="${escapeHtml(u.id)}">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-n">หน่วยที่ ${u.n}</span><span class="sy-unit-name">${escapeHtml(u.name)}</span><span class="sy-unit-s">${syUnitStatus(u)}</span><span class="sy-unit-w">น้ำหนักคะแนน ${syFmt(u.weight)}</span></div>
    <div class="field"><label>มาตรฐาน/ตัวชี้วัด
      <textarea class="input-sm sy-std" rows="2" maxlength="${SY_MAX.std}" placeholder="เช่น ว4.2 / ม.2/4">${escapeHtml(u.standard)}</textarea>
    </label>${pick}</div>
    <div class="doc-lblock sy-topics">
      <div class="doc-lhead" aria-hidden="true"><span>สาระการเรียนรู้ (เนื้อหา)</span><span>เวลา (ชั่วโมง)</span><span></span></div>
      <div class="doc-lrows sy-trows">${(u.topics.length ? u.topics : [{}]).map(syTopicRowHtml).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm doc-l-add sy-t-add">${DOC_ICO_ADD} เพิ่มสาระการเรียนรู้</button>
    </div>
  </div>`;
}

// ข้อ 13: การ์ดต่อ 1 ตัวชี้วัด — สาระแกนกลาง · คำสำคัญ · คะแนน K P A (รหัส/ข้อความดึงจากคำอธิบายรายวิชา แก้ที่นั่น)
function syIndHtml(r) {
  const e = escapeHtml, kpa = [['k', 'K (ความรู้)'], ['p', 'P (ทักษะ)'], ['a', 'A (เจตคติ)']];
  return `<div class="pa-witem sy-ind" data-key="${e(r.key)}">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-n">${r.n}</span><span class="sy-unit-name">${e(r.code)}</span><span class="sy-ind-t">${e(r.text)}</span></div>
    <div class="field"><label>สาระแกนกลาง
      <textarea class="input-sm sy-core" rows="3" maxlength="${SY_MAX.core}" placeholder="เช่น - แนวคิดเชิงนามธรรม เป็นการประเมินความสำคัญของปัญหา (ขึ้นบรรทัดใหม่ = ข้อใหม่)">${e(r.core)}</textarea>
    </label></div>
    <div class="field"><label>คำสำคัญ
      <textarea class="input-sm sy-kw" rows="2" maxlength="${SY_MAX.kw}" placeholder="เช่น - computational thinking">${e(r.keywords)}</textarea>
    </label></div>
    <div class="sy-ind-kpa">${kpa.map(([f, label]) => `<label>${label}<input class="input-sm sy-kpa" data-f="${f}" type="text" inputmode="decimal" maxlength="${SY_MAX.hours}" placeholder="คะแนน" value="${e(r[f])}"></label>`).join('')}</div>
  </div>`;
}

// ข้อ 14: การ์ดต่อหน่วย — ส่วนที่ดึงจากโครงสร้างเดิมแสดงเป็นข้อความ (แก้ที่ต้นทาง) · ช่องกรอกเฉพาะที่ยังไม่มีข้อมูล: ครั้งที่/วัน/เวลา · จุดประสงค์ · สื่อ
function syPlanRoHtml(r) {
  const e = escapeHtml;
  return [`ตัวชี้วัด: ${r.standard ? e(r.standard.replace(/\s*\r?\n\s*/g, ' · ')) : 'ยังไม่ได้กรอกในส่วนที่ 2'}`, `เนื้อหา: ${r.topics.length ? r.topics.length + ' รายการ' : 'ยังไม่ได้กรอกในส่วนที่ 2'}`,
    `ภาระงาน: ${r.works.length ? e(r.works.join(' · ')) : 'ยังไม่มีชิ้นงานในหน่วยนี้ (เพิ่มที่แท็บโครงสร้างคะแนน)'}`].map(x => `<div>${x}</div>`).join('');
}
function syPlanHtml(r, sv) {
  const e = escapeHtml;
  return `<div class="pa-witem sy-pl" data-unit="${e(r.id)}">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-n">หน่วยที่ ${r.n}</span><span class="sy-unit-name">${e(r.name)}</span><span class="sy-pl-h">${syFmt(r.hours)} ชั่วโมง</span></div>
    <div class="sy-pl-ro">${syPlanRoHtml(r)}</div>
    <div class="field"><label>ครั้งที่ / วัน / เวลา
      <textarea class="input-sm sy-pl-when" rows="2" maxlength="${SY_MAX.when}" placeholder="${e(r.whenShow || 'เช่น ครั้งที่ 1-2 (ขึ้นบรรทัดใหม่แล้วใส่วันที่ เช่น 1-14 มิ.ย.69)')}">${e(sv.when || '')}</textarea>
    </label></div>
    <div class="field"><label>จุดประสงค์การเรียนรู้ (1 บรรทัด = 1 ข้อ ระบบใส่เลขให้)
      <textarea class="input-sm sy-pl-obj" rows="3" maxlength="${SY_MAX.obj}">${e(sv.objectives || '')}</textarea>
    </label></div>
    <div class="field"><label>สื่อ/แหล่งเรียนรู้ของหน่วยนี้
      <textarea class="input-sm sy-pl-media" rows="2" maxlength="${SY_MAX.pmedia}" placeholder="ว่าง = ใช้ค่าของทุกหน่วย">${e(sv.media || '')}</textarea>
    </label></div>
  </div>`;
}
// ช่องกลางของข้อ 14: สื่อใช้กับทุกหน่วย · ชั่วโมง/ตำแหน่งแถวสอบ (แสดงเมื่อโครงสร้างคะแนนมีคะแนนสอบนั้น)
function syPlanCommonHtml(m, pl) {
  const e = escapeHtml, unitRows = m.plan.rows.filter(r => r.kind === 'unit');
  const exam = (m.plan.hasMid || m.plan.hasFinal) ? `<div class="pa-witem sy-pl sy-pl-x">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-name">สอบกลางภาค / ปลายภาค</span></div>
    <div class="sy-pl-exam">
      ${m.plan.hasMid ? `<label>สอบกลางภาคหลัง<select id="sy-mid-after" class="input-sm"><option value="">อัตโนมัติ (ครึ่งหนึ่งของภาค)</option>${unitRows.map(r => `<option value="${e(r.id)}"${pl.midAfter === r.id ? ' selected' : ''}>หน่วยที่ ${r.n}</option>`).join('')}</select></label>
      <label>ชั่วโมงสอบกลางภาค<input id="sy-mid-h" class="input-sm sy-ph" type="text" inputmode="decimal" maxlength="${SY_MAX.hours}" placeholder="เช่น 1" value="${e(pl.midHours || '')}"></label>` : ''}
      ${m.plan.hasFinal ? `<label>ชั่วโมงสอบปลายภาค<input id="sy-fin-h" class="input-sm sy-ph" type="text" inputmode="decimal" maxlength="${SY_MAX.hours}" placeholder="เช่น 1" value="${e(pl.finalHours || '')}"></label>` : ''}
    </div>
  </div>` : '';
  return `<div class="pa-witem sy-pl sy-pl-x">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-name">ทุกหน่วย</span></div>
    <div class="field"><label>สื่อ/แหล่งเรียนรู้ (ใช้กับทุกหน่วย เว้นหน่วยที่กรอกเอง)
      <textarea id="sy-media" class="input-sm" rows="3" maxlength="${SY_MAX.pmedia}" placeholder="เช่น 1. หนังสือเรียนวิทยาการคำนวณ ม.1 (ขึ้นบรรทัดใหม่ = ข้อใหม่)">${e(pl.media || '')}</textarea>
    </label></div>
  </div>${exam}`;
}

// ข้อ 15: การ์ดต่อ 1 รายการคะแนน (ชื่อ/คะแนนดึงจากโครงสร้างคะแนน แก้ที่ต้นทาง) — ประเภท · ตัวชี้วัด · สัปดาห์ (ทดสอบย่อย) · ลักษณะงาน/กำหนดส่ง (ชิ้นงาน) · ช่องว่าง = ใช้ค่าที่ระบบเสนอ (แสดงเป็น placeholder)
function syAssessCardHtml(r) {
  const e = escapeHtml, sel = (v, cur) => (v === cur ? ' selected' : '');
  return `<div class="pa-witem sy-as" data-id="${e(r.id)}" data-kind="${r.kind}">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-name">${e(r.name) || 'ไม่มีชื่อ'}</span><span class="sy-unit-w">${syFmt(r.max)} คะแนน</span></div>
    <div class="sy-as-grid">
      <label>ประเภท<select class="input-sm sy-as-kind"><option value=""${sel('', r.rawKind)}>อัตโนมัติ (${r.defKind === 'quiz' ? 'ทดสอบย่อย' : 'ชิ้นงาน'})</option><option value="work"${sel('work', r.rawKind)}>ชิ้นงาน</option><option value="quiz"${sel('quiz', r.rawKind)}>ทดสอบย่อย</option></select></label>
      <label class="sy-as-q"${r.kind === 'quiz' ? '' : ' hidden'}>สัปดาห์ที่ทดสอบ<input class="input-sm sy-as-week" type="text" maxlength="${SY_MAX.aweek}" placeholder="${e(r.defWeek || 'เช่น 3')}" value="${e(r.rawWeek)}"></label>
      <label class="sy-as-w"${r.kind === 'work' ? '' : ' hidden'}>ลักษณะงาน<select class="input-sm sy-as-work"><option value="">งานเดี่ยว</option><option value="group"${sel('group', r.work)}>งานกลุ่ม</option></select></label>
      <label class="sy-as-w"${r.kind === 'work' ? '' : ' hidden'}>กำหนดส่ง<input class="input-sm sy-as-due" type="text" maxlength="${SY_MAX.adue}" placeholder="เช่น 14 มิ.ย. 69" value="${e(r.due)}"></label>
    </div>
    <div class="field"><label>ตัวชี้วัด/ผลการเรียนรู้
      <textarea class="input-sm sy-as-ind" rows="2" maxlength="${SY_MAX.aind}" placeholder="${e(r.defInd ? 'ว่าง = ' + r.defInd.replace(/\s*\r?\n\s*/g, ' · ') : 'เช่น ว4.2 / ม.2/4')}">${e(r.rawInd)}</textarea>
    </label></div>
  </div>`;
}
// สอบกลางภาค/ปลายภาค: ตัวชี้วัด + สัปดาห์ที่สอบ
function syAssessExamHtml(x) {
  const e = escapeHtml;
  return `<div class="pa-witem sy-as sy-as-x" data-id="${e(x.id)}" data-kind="exam">
    <div class="pa-witem-h sy-unit-h"><span class="sy-unit-name">${e(x.label)}</span><span class="sy-unit-w">${syFmt(x.max)} คะแนน</span></div>
    <div class="sy-as-grid">
      <label>สัปดาห์ที่สอบ<input class="input-sm sy-as-week" type="text" maxlength="${SY_MAX.aweek}" placeholder="${e(x.defWeek || 'เช่น 10')}" value="${e(x.rawWeek)}"></label>
    </div>
    <div class="field"><label>ตัวชี้วัด/ผลการเรียนรู้
      <textarea class="input-sm sy-as-ind" rows="2" maxlength="${SY_MAX.aind}" placeholder="${e(x.defInd ? 'ว่าง = ' + x.defInd.replace(/\s*\r?\n\s*/g, ' · ') : 'เช่น ว4.2 / ม.2/4')}">${e(x.rawInd)}</textarea>
    </label></div>
  </div>`;
}
const syAssessFormHtml = (m) => (m.assess.items.length || m.assess.exams.length)
  ? `<div class="u-note u-mb-12">ชื่อรายการและคะแนนดึงจากแท็บโครงสร้างคะแนน (แก้ที่ต้นทาง) · อัตราส่วนระหว่างภาค:ปลายภาค และ K:P:A คำนวณจากโครงสร้างคะแนนกับส่วนที่ 3 · ตัวชี้วัดและสัปดาห์เว้นว่าง = ใช้ค่าที่ระบบเสนอจากหน่วยการเรียนรู้ (ข้อ 14) · ชื่อที่ขึ้นต้นว่า “ทดสอบ” นับเป็นทดสอบย่อย ที่เหลือเป็นชิ้นงาน — เปลี่ยนได้ที่ช่องประเภท</div>${m.assess.items.map(syAssessCardHtml).join('')}${m.assess.exams.map(syAssessExamHtml).join('')}`
  : '<div class="empty-state">ยังไม่มีรายการคะแนนในโครงสร้างคะแนน — เพิ่มที่แท็บ “โครงสร้างคะแนน” แล้วกลับมากรอกที่นี่ (ไม่มีรายการคะแนน = ไม่พิมพ์ข้อ 15)</div>';

// ข้อ 17–21: วิธีสอน (ติ๊กได้หลายวิธี) · สื่อ · หนังสืออ่านประกอบ · ข้อตกลง (1 บรรทัด = 1 ข้อ ระบบใส่เลขให้) · ข้อ 20 ดึงจากคำอธิบายรายวิชา อ่านอย่างเดียว
function syTailFormHtml(m, data) {
  const e = escapeHtml, t = m.tail, planMedia = (data.plan && data.plan.media) || '';
  const sub = (hd, body) => `<div class="doc-subsec"><div class="doc-subsec-hd">${hd}</div>${body}</div>`; // หัวข้อย่อย + ช่องกรอก เหมือนฟอร์ม SAR/PA (.doc-subsec)
  return `<div class="u-note u-mb-12">ข้อ 17–21 พิมพ์ต่อท้ายเอกสารหลังข้อ 16 · ข้อความหลายข้อให้ขึ้นบรรทัดใหม่ (ระบบใส่เลขข้อให้เอง) · ช่องที่เว้นว่างจะพิมพ์เป็นจุดไข่ปลาให้เขียนเพิ่มด้วยมือ</div>
  ${sub('17. วิธีการจัดการเรียนการสอน <span class="doc-sec-note">(เลือกได้มากกว่า 1 วิธี)</span>', `<div class="doc-checks doc-checks-auto">${t.methods.map(x => `<label class="doc-check"><input type="checkbox" class="sy-mt" data-k="${x.k}"${x.on ? ' checked' : ''}> ${e(x.label)}</label>`).join('')}</div>
    <div class="field u-mt-12"><label for="sy-mt-other">อื่น ๆ (ระบุ)</label><input id="sy-mt-other" class="input-sm" type="text" maxlength="${SY_MAX.mother}" placeholder="ระบุวิธีอื่น ๆ (ถ้ามี)" value="${e(data.methodsOther || '')}"></div>`)}
  ${sub('18. สื่อ / แหล่งเรียนรู้', `<div class="field"><textarea id="sy-res" class="input-sm" rows="3" maxlength="${SY_MAX.res}" aria-label="สื่อ / แหล่งเรียนรู้" placeholder="${e(planMedia ? 'ว่าง = ใช้ตามที่กรอกในข้อ 14: ' + planMedia.replace(/\s*\r?\n\s*/g, ' · ') : 'เช่น แหล่งข้อมูลบนเครือข่ายอินเทอร์เน็ต (ขึ้นบรรทัดใหม่ = ข้อใหม่)')}">${e(data.resources || '')}</textarea></div>`)}
  ${sub('19. รายชื่อหนังสืออ่านประกอบ', `<div class="field"><textarea id="sy-books" class="input-sm" rows="3" maxlength="${SY_MAX.books}" aria-label="รายชื่อหนังสืออ่านประกอบ" placeholder="เช่น คู่มือรายวิชาพื้นฐานวิทยาศาสตร์ เทคโนโลยี (วิทยาการคำนวณ) สสวท.">${e(data.books || '')}</textarea></div>`)}
  ${sub('20. มาตรฐานการเรียนรู้/ตัวชี้วัด (จุดประสงค์การเรียนรู้)', `<div class="u-note">${m.cover.count ? `ดึงจากคำอธิบายรายวิชาอัตโนมัติ ${m.cover.count} ตัวชี้วัด (แก้ที่แท็บ “คำอธิบายรายวิชา”)` : 'ยังไม่มีตัวชี้วัดในคำอธิบายรายวิชา — เพิ่มที่แท็บ “คำอธิบายรายวิชา” แล้วจะแสดงในข้อนี้เอง'}</div>`)}
  ${sub('21. ข้อตกลงในการเรียนรายวิชา', `<div class="field"><textarea id="sy-rules" class="input-sm" rows="5" maxlength="${SY_MAX.rules}" aria-label="ข้อตกลงในการเรียนรายวิชา" placeholder="เช่น ห้ามนำอาหารเข้าห้องคอม (ขึ้นบรรทัดใหม่ = ข้อใหม่)">${e(data.rules || '')}</textarea></div>
    <button type="button" class="btn btn-ghost btn-sm" id="sy-rules-sample">ใส่ข้อตกลงตัวอย่าง</button>`)}`;
}
function syApproverRowHtml(r = {}) {
  const e = escapeHtml;
  return `<div class="doc-lrow sy-apr">
    <input class="input-sm sy-apr-role" type="text" maxlength="${SY_MAX.role}" placeholder="ตำแหน่ง เช่น ผู้อำนวยการโรงเรียน" value="${e(r.role || '')}" aria-label="ตำแหน่งผู้ให้ความเห็น">
    <input class="input-sm sy-apr-name" type="text" maxlength="${SY_MAX.aname}" placeholder="ชื่อ-สกุล (ว่าง = เว้นจุดไข่ปลา)" value="${e(r.name || '')}" aria-label="ชื่อผู้ให้ความเห็น">
    <label class="doc-check" title="มีช่อง “อนุญาตให้ใช้สอนได้ / ควรปรับปรุง” ใต้ความเห็น"><input type="checkbox" class="sy-apr-ok"${r.approve ? ' checked' : ''}> ช่องอนุญาต</label>
    <button type="button" class="btn btn-danger-ghost btn-sm doc-l-del sy-apr-del" title="ลบแถว" aria-label="ลบแถว">${DOC_ICO_DEL}</button>
  </div>`;
}
const syApproversFormHtml = (m) => `<div class="u-note u-mb-12">ช่องลงชื่อครูประจำวิชาใช้ชื่อจากข้อมูลส่วนตัวอัตโนมัติ · ด้านล่างคือผู้ให้ความเห็นต่อจากครู (พิมพ์เรียงตามลำดับ) — เพิ่ม ลบ หรือเปลี่ยนตำแหน่ง/ชื่อได้ เช่น เพิ่มหัวหน้างานของวิชา</div>
  <div class="doc-lblock sy-aprs">
    <div class="doc-lhead" aria-hidden="true"><span>ตำแหน่ง</span><span>ชื่อ-สกุล</span><span>อนุญาต/ปรับปรุง</span><span></span></div>
    <div class="doc-lrows sy-apr-rows">${m.tail.approvers.map(syApproverRowHtml).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm doc-l-add sy-apr-add">${DOC_ICO_ADD} เพิ่มผู้ให้ความเห็น</button>
  </div>`;

// ข้อมูลรายวิชา ข้อ 1–10 ของหน้าแรก (อ่านอย่างเดียว ดึงอัตโนมัติ) — วาดใหม่ทุกครั้งที่ค่าในฟอร์มเปลี่ยน
function syCoverGridHtml(m) {
  const cv = m.cover, num = (x) => (x == null ? '' : syFmt(x));
  return docProfileGridHtml([
    ['โรงเรียน', cv.school], ['1 ชื่อวิชา', cv.name], ['2 รหัสวิชา', cv.code], ['3 หน่วยกิต', cv.credit], ['4 กลุ่มสาระฯ', cv.area],
    ['5 ภาคเรียนที่', cv.semester], ['6 ปีการศึกษา', cv.year], ['7 ผู้สอน', cv.teacher], ['8 ประเภทวิชา', cv.type.replace(/^วิชา/, '')],
    ['9 ชั่วโมง/สัปดาห์', num(cv.hoursWeek)], ['9 ชั่วโมง/ภาคเรียน', num(cv.hoursSem)], ['10 ระดับชั้น', cv.level],
    ['11 คำอธิบายรายวิชา', cv.descMain ? 'กรอกแล้ว' : ''], ['ผลการเรียนรู้/ตัวชี้วัด', cv.count ? cv.count + ' ข้อ' : ''],
  ], { auto: true });
}
// รายการที่ยังขาดในหน้าแรก (บอกที่แก้) — ไม่ขวางการบันทึก แค่เตือน
function syCoverGaps(m) {
  const cv = m.cover, gaps = [];
  if (!cv.school || !cv.teacher) gaps.push('ชื่อโรงเรียน/ชื่อผู้สอน ยังไม่ครบ — กรอกที่หน้าข้อมูลส่วนตัว');
  if (!cv.level || !cv.credit || !cv.code) gaps.push('รหัสวิชา/ระดับชั้น/หน่วยกิต ยังไม่ครบ — แก้ที่ปุ่ม “แก้ไขข้อมูลวิชา”');
  if (!cv.descMain || !cv.count) gaps.push('คำอธิบายรายวิชา/ตัวชี้วัด ยังไม่ครบ — กรอกที่แท็บ “คำอธิบายรายวิชา”');
  return gaps;
}

// สรุปตัวเลขเป็นการ์ดเล็กชุดเดียวกับข้อมูลในฟอร์มเอกสารอื่น (docProfileGridHtml) · คำเตือนอยู่ใต้การ์ด
function syCheckHtml(m) {
  return docProfileGridHtml([
    ['ชั่วโมงรวม', syFmt(m.hoursTotal) + (m.hoursExpected != null ? ' / ' + syFmt(m.hoursExpected) : '')],
    ['คะแนนระหว่างภาค', syFmt(m.collect)], ['กลางภาค', syFmt(m.midterm)], ['ปลายภาค', syFmt(m.final)], ['รวมทั้งสิ้น', syFmt(m.grand)],
  ].concat(m.analysis.rows.length ? [['K รวม', syFmt(m.analysis.k)], ['P รวม', syFmt(m.analysis.p)], ['A รวม', syFmt(m.analysis.a)]] : []), { auto: true })
  + (m.outside > 0 ? `<div class="u-note u-mt-4">มีคะแนนเก็บนอกหน่วย ${syFmt(m.outside)} คะแนน — จะแสดงเป็นแถว “คะแนนเก็บนอกหน่วย” ในตาราง</div>` : '')
  + m.warnings.map(w => `<div class="sy-warn" role="status">${escapeHtml(w)}</div>`).join('');
}

// ค่าในฟอร์ม → เอกสาร · หน่วยที่ไม่อยู่ในโครงสร้างคะแนนแล้ว (ข้อมูลเดิมที่ถูกข้าม) ยังเก็บไว้ ไม่ถูกลบตอนบันทึก — กลับมาใช้ได้ถ้าเพิ่มหน่วยนั้นคืน
function syCollect(form) {
  const live = [...form.querySelectorAll('.sy-unit')].map(el => ({
    id: el.dataset.unit,
    standard: el.querySelector('.sy-std').value,
    topics: [...el.querySelectorAll('.sy-trow')].map(r => ({ title: r.querySelector('.sy-t-title').value, hours: r.querySelector('.sy-t-hours').value })),
  }));
  const liveA = [...form.querySelectorAll('.sy-ind')].map(el => ({
    key: el.dataset.key, core: el.querySelector('.sy-core').value, keywords: el.querySelector('.sy-kw').value,
    k: el.querySelector('.sy-kpa[data-f="k"]').value, p: el.querySelector('.sy-kpa[data-f="p"]').value, a: el.querySelector('.sy-kpa[data-f="a"]').value,
  }));
  const shownA = new Set(liveA.map(r => r.key)); // ตัวชี้วัดที่ถูกลบจากคำอธิบายรายวิชาแล้ว ยังเก็บค่าไว้ (กลับมาใช้ได้ถ้าเพิ่มคืน)
  const orphanA = ((SY.saved && SY.saved.analysis) || []).filter(r => !shownA.has(r.key));
  const livePl = [...form.querySelectorAll('.sy-pl[data-unit]')].map(el => ({
    id: el.dataset.unit, when: el.querySelector('.sy-pl-when').value, objectives: el.querySelector('.sy-pl-obj').value, media: el.querySelector('.sy-pl-media').value,
  }));
  const shownP = new Set(livePl.map(r => r.id)); // หน่วยที่ไม่อยู่ในโครงสร้างคะแนนแล้ว ยังเก็บค่าไว้
  const savedPl = (SY.saved && SY.saved.plan) || {};
  const fv = (sel, back) => { const el = form.querySelector(sel); return el ? el.value : back; }; // ไม่มีช่องในฟอร์ม (เช่น ไม่มีคะแนนสอบ) = คงค่าที่บันทึกไว้
  const plan = { units: [...livePl, ...(savedPl.units || []).filter(r => !shownP.has(r.id))], media: fv('#sy-media', savedPl.media || ''),
    midAfter: fv('#sy-mid-after', savedPl.midAfter || ''), midHours: fv('#sy-mid-h', savedPl.midHours || ''), finalHours: fv('#sy-fin-h', savedPl.finalHours || '') };
  const liveS = [...form.querySelectorAll('.sy-as')].map(el => {
    const q = (c) => { const x = el.querySelector(c); return x ? x.value : ''; };
    return { id: el.dataset.id, kind: q('.sy-as-kind'), work: q('.sy-as-work'), ind: q('.sy-as-ind'), week: q('.sy-as-week'), due: q('.sy-as-due') };
  });
  const shownS = new Set(liveS.map(r => r.id)); // รายการที่ถูกลบจากโครงสร้างคะแนนแล้ว ยังเก็บค่าไว้ (กลับมาใช้ได้ถ้าเพิ่มคืน)
  const orphanS = ((SY.saved && SY.saved.assess) || []).filter(r => !shownS.has(r.id));
  const inStruct = new Set(SY.struct.units.map(u => u.id));
  const orphans = ((SY.saved && SY.saved.units) || []).filter(u => !inStruct.has(u.id));
  const val = (sel) => { const el = form.querySelector(sel); return el ? el.value : ''; };
  const tail = { // ข้อ 17–21 + ผู้ให้ความเห็น (ฟอร์มมีช่องเสมอ — ติ๊กไม่เลือกเลย/ลบทุกแถว = เก็บเป็นค่าว่างตามนั้น)
    methods: [...form.querySelectorAll('.sy-mt:checked')].map(c => c.dataset.k), methodsOther: val('#sy-mt-other'),
    resources: val('#sy-res'), books: val('#sy-books'), rules: val('#sy-rules'),
    approvers: [...form.querySelectorAll('.sy-apr')].map(r => ({ role: r.querySelector('.sy-apr-role').value, name: r.querySelector('.sy-apr-name').value, approve: r.querySelector('.sy-apr-ok').checked })),
  };
  return syNormalize({ area: form.querySelector('#sy-area').value, hoursWeek: form.querySelector('#sy-hw').value, units: [...live, ...orphans], analysis: [...liveA, ...orphanA], plan, assess: [...liveS, ...orphanS], ...tail }, '');
}

function syCurrent() { return SY.draft || SY.saved; }

function syShowForm(container) {
  const data = syCurrent(), c = SY.course;
  const m = syModel(c, SY.struct, data, SY.desc, syCtx());
  const indGroups = syIndicatorOptions(SY.desc);
  container.innerHTML = `
  <div class="u-note u-mb-12">กรอกโครงสร้างรายวิชาตามแบบของหลักสูตร — ข้อมูลเก็บไว้กับแม่แบบวิชานี้ และแสดงในหน้ารายวิชาของทุกเทอมที่เปิดสอนวิชานี้ · ชื่อหน่วย น้ำหนักคะแนน กลางภาค/ปลายภาค มาจากแท็บ “โครงสร้างคะแนน” (<a href="#" id="sy-goto-score">ไปแท็บโครงสร้างคะแนน</a>) · เวลารวมบวกจากชั่วโมงของสาระย่อย · ดูหน้ากระดาษก่อนพิมพ์ได้ที่แท็บ “ตัวอย่าง Course Syllabus” แต่ตัวอย่างไม่ได้บันทึกให้ — กดบันทึกทุกครั้ง</div>
  <form id="sy-form" class="doc-form" autocomplete="off" novalidate>

    <div class="doc-form-header">
      <div class="doc-form-meta">
        <label class="sy-area-l">กลุ่มสาระการเรียนรู้
          <input id="sy-area" type="text" maxlength="${SY_MAX.area}" placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี" value="${escapeHtml(data.area)}">
        </label>
      </div>
      ${syStatusHtml}
    </div>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 1  ข้อมูลรายวิชา</h2>
      <div id="sy-cover-grid">${syCoverGridHtml(m)}</div>
      <div class="sy-cover-edit">
        <div class="field"><label for="sy-sem">ภาคเรียนที่ (ใช้พิมพ์)</label><select id="sy-sem" class="input-sm"><option value="1"${SY.term && SY.term.semester === '1' ? ' selected' : ''}>1</option><option value="2"${SY.term && SY.term.semester === '2' ? ' selected' : ''}>2</option></select></div>
        <div class="field"><label for="sy-year">ปีการศึกษา (พ.ศ.)</label><input id="sy-year" class="input-sm" type="text" inputmode="numeric" maxlength="4" value="${escapeHtml((SY.term && SY.term.year) || '')}"></div>
        <div class="field"><label for="sy-hw">ชั่วโมง / สัปดาห์</label><input id="sy-hw" class="input-sm" type="text" inputmode="decimal" maxlength="${SY_MAX.hours}" placeholder="ว่าง = หน่วยกิต × 40 ÷ ${SY_WEEKS}" value="${escapeHtml(data.hoursWeek || '')}"></div>
      </div>
      <div id="sy-cover-gaps">${syCoverGaps(m).map(g => `<div class="sy-gap-note" role="status">${escapeHtml(g)}</div>`).join('')}</div>
      ${docProfileNoteHtml('ข้อมูลดึงอัตโนมัติจากข้อมูลส่วนตัว แม่แบบวิชา และคำอธิบายรายวิชา — ภาคเรียน/ปีเป็นค่าตั้งต้นจากวิชาที่เปิดสอนล่าสุด ไม่ได้ถูกบันทึก', 'sy-edit-info', 'แก้ไขข้อมูลวิชา')}
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 2  หน่วยการเรียนรู้</h2>
      ${m.units.length ? m.units.map(u => syUnitHtml(u, indGroups)).join('') : '<div class="empty-state">ยังไม่มีหน่วยการเรียนรู้ — เพิ่มหน่วยที่แท็บ “โครงสร้างคะแนน” (ปุ่ม + หน่วยการเรียนรู้) แล้วกลับมากรอกที่นี่</div>'}
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 3  วิเคราะห์มาตรฐานตัวชี้วัด (ข้อ 13)</h2>
      ${m.analysis.rows.length ? `<div class="u-note u-mb-12">ตัวชี้วัดดึงจากคำอธิบายรายวิชา — กรอกสาระแกนกลาง คำสำคัญ และคะแนน K P A ของแต่ละตัวชี้วัด (ผลรวมแสดงในส่วนที่ 8)</div>${m.analysis.rows.map(syIndHtml).join('')}` : '<div class="empty-state">ยังไม่มีตัวชี้วัดในคำอธิบายรายวิชา — เพิ่มที่แท็บ “คำอธิบายรายวิชา” แล้วกลับมากรอกที่นี่ (ไม่มีตัวชี้วัด = ไม่พิมพ์ข้อ 13)</div>'}
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 4  กำหนดการจัดการเรียนรู้ (ข้อ 14)</h2>
      ${m.plan.rows.some(r => r.kind === 'unit') ? `<div class="u-note u-mb-12">ชั่วโมง ตัวชี้วัด เนื้อหา และภาระงานดึงจากส่วนที่ 2 กับแท็บโครงสร้างคะแนน (แก้ที่ต้นทาง) — ที่นี่กรอกเฉพาะที่ยังไม่มีข้อมูล · ครั้งที่เว้นว่าง = คำนวณจากชั่วโมง ÷ ชั่วโมงต่อสัปดาห์</div>${syPlanCommonHtml(m, (data.plan || {}))}${m.plan.rows.filter(r => r.kind === 'unit').map(r => syPlanHtml(r, ((data.plan && data.plan.units) || []).find(x => x.id === r.id) || {})).join('')}` : '<div class="empty-state">ยังไม่มีหน่วยการเรียนรู้ — เพิ่มที่แท็บ “โครงสร้างคะแนน” แล้วกลับมากรอกที่นี่ (ไม่มีหน่วย = ไม่พิมพ์ข้อ 14)</div>'}
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 5  แผนการประเมินผลการเรียน (ข้อ 15–16)</h2>
      <div id="sy-assess">${syAssessFormHtml(m)}</div>
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 6  วิธีสอน สื่อ และข้อตกลง (ข้อ 17–21)</h2>
      ${syTailFormHtml(m, data)}
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 7  ช่องลงชื่อและความเห็นผู้บริหาร</h2>
      <div id="sy-aprs-box">${syApproversFormHtml(m)}</div>
    </section>

    <section class="doc-section">
      <h2 class="doc-sec-title">ส่วนที่ 8  สรุปและตรวจสอบ</h2>
      <div id="sy-check">${syCheckHtml(m)}</div>
    </section>

    <div class="pa-form-footer"><button type="button" class="btn btn-primary sy-do-save" id="sy-save-btn">${SY_SAVE_LABEL}</button></div>
  </form>`;
  const form = container.querySelector('#sy-form');
  const unitEls = [...form.querySelectorAll('.sy-unit')];
  const recheck = () => {
    const mm = syModel(c, SY.struct, syCollect(form), SY.desc, syCtx());
    form.querySelector('#sy-check').innerHTML = syCheckHtml(mm);
    form.querySelector('#sy-cover-grid').innerHTML = syCoverGridHtml(mm);
    form.querySelector('#sy-cover-gaps').innerHTML = syCoverGaps(mm).map(g => `<div class="sy-gap-note" role="status">${escapeHtml(g)}</div>`).join('');
    form.querySelectorAll('.sy-pl[data-unit]').forEach(el => { // กำหนดการ: ชั่วโมง/ข้อมูลที่ดึงมา + ครั้งที่ที่เสนอ อัปเดตสด
      const r = mm.plan.rows.find(x => x.kind === 'unit' && x.id === el.dataset.unit);
      if (!r) return;
      el.querySelector('.sy-pl-h').textContent = `${syFmt(r.hours)} ชั่วโมง`;
      el.querySelector('.sy-pl-ro').innerHTML = syPlanRoHtml(r);
      if (r.whenShow) el.querySelector('.sy-pl-when').placeholder = r.whenShow;
    });
    form.querySelectorAll('.sy-as').forEach(el => { // ข้อ 15: ประเภทที่ใช้จริง (อัตโนมัติ/เลือกเอง) สลับช่องสัปดาห์ ↔ ลักษณะงาน/กำหนดส่ง · ค่าที่ระบบเสนอเป็น placeholder อัปเดตสด
      const it = mm.assess.items.find(x => x.id === el.dataset.id), ex = mm.assess.exams.find(x => x.id === el.dataset.id), r = it || ex;
      if (!r) return;
      const d = it ? it.kind : 'exam';
      el.dataset.kind = d;
      el.querySelectorAll('.sy-as-q').forEach(x => { x.hidden = d !== 'quiz'; });
      el.querySelectorAll('.sy-as-w').forEach(x => { x.hidden = d !== 'work'; });
      el.querySelector('.sy-as-ind').placeholder = r.defInd ? 'ว่าง = ' + r.defInd.replace(/\s*\r?\n\s*/g, ' · ') : 'เช่น ว4.2 / ม.2/4';
      if (it) { const ak = el.querySelector('.sy-as-kind'); ak.options[0].textContent = `อัตโนมัติ (${it.defKind === 'quiz' ? 'ทดสอบย่อย' : 'ชิ้นงาน'})`; }
      el.querySelector('.sy-as-week').placeholder = r.defWeek || 'เช่น 3';
    });
    mm.units.forEach((u, i) => { if (unitEls[i]) unitEls[i].querySelector('.sy-unit-s').textContent = syUnitStatus(u); }); // ป้ายสถานะต่อหน่วยอัปเดตสด
  };
  const readTerm = () => { // ภาคเรียน/ปีที่ใช้พิมพ์ — ค่าชั่วคราวของหน้านี้ ไม่ถือว่าแก้เอกสาร (ไม่ตั้งธงยังไม่บันทึก)
    const yr = form.querySelector('#sy-year').value.trim();
    SY.term = { semester: form.querySelector('#sy-sem').value, year: /^\d{4}$/.test(yr) ? yr : '' };
    SY.termPicked = true;
    recheck();
  };
  const touch = (e) => {
    if (e && e.target && e.target.closest && e.target.closest('.sy-pick')) return; // ติ๊กเลือกตัวชี้วัดยังไม่ใช่การแก้เอกสาร (แก้เมื่อกด "ใส่ลงช่อง")
    if (e && e.target && (e.target.id === 'sy-sem' || e.target.id === 'sy-year')) return readTerm();
    _syDirty = true; recheck(); syRefreshStatus(container);
  };
  syRefreshStatus(container);
  form.addEventListener('input', touch);
  form.addEventListener('change', touch);
  const growAll = () => form.querySelectorAll('.sy-t-title').forEach(syGrow);
  form.addEventListener('input', (e) => { if (e.target.classList && e.target.classList.contains('sy-t-title')) syGrow(e.target); });
  growAll();
  if (typeof ResizeObserver === 'function') { // เปิดแท็บที่ซ่อนอยู่ / ย่อ-ขยายหน้าจอ → ความกว้างเปลี่ยน บรรทัดตัดใหม่ → วัดความสูงอีกครั้ง
    let lastW = 0;
    new ResizeObserver(() => { const w = form.clientWidth; if (w !== lastW) { lastW = w; growAll(); } }).observe(form);
  }

  form.addEventListener('click', (e) => {
    const add = e.target.closest('.sy-t-add'), del = e.target.closest('.sy-t-del');
    if (add) {
      const box = add.closest('.sy-unit').querySelector('.sy-trows');
      if (box.children.length >= SY_MAX.topics) { showToast(`เพิ่มสาระย่อยได้สูงสุด ${SY_MAX.topics} รายการต่อหน่วย`); return; }
      box.insertAdjacentHTML('beforeend', syTopicRowHtml());
      box.lastElementChild.querySelector('.sy-t-title').focus();
      touch();
    } else if (del) { del.closest('.sy-trow').remove(); touch(); }
  });
  form.addEventListener('click', (e) => { // ผู้ให้ความเห็น (เพิ่ม/ลบแถว) · ข้อตกลงตัวอย่าง
    const add = e.target.closest('.sy-apr-add'), del = e.target.closest('.sy-apr-del'), sample = e.target.closest('#sy-rules-sample');
    if (add) {
      const box = form.querySelector('.sy-apr-rows');
      if (box.children.length >= SY_MAX.apr) { showToast(`เพิ่มผู้ให้ความเห็นได้สูงสุด ${SY_MAX.apr} คน`); return; }
      box.insertAdjacentHTML('beforeend', syApproverRowHtml());
      box.lastElementChild.querySelector('.sy-apr-role').focus();
      touch();
    } else if (del) { del.closest('.sy-apr').remove(); touch(); }
    else if (sample) {
      const ta = form.querySelector('#sy-rules'), r = syAppendLines(ta.value, SY_SAMPLE_RULES.split('\n'));
      ta.value = r.text;
      if (r.added) touch(); else showToast('ข้อตกลงตัวอย่างมีอยู่ในช่องแล้ว');
    }
  });
  // เลือกตัวชี้วัดจากคำอธิบายรายวิชา: ติ๊กทั้งหมด/ทั้งมาตรฐาน/รายข้อ → "ใส่ลงช่อง" ต่อท้ายช่องมาตรฐานของหน่วยนั้น (ข้ามบรรทัดที่มีอยู่แล้ว)
  const pickSel = (box) => new Set([...box.querySelectorAll('.sy-pick-cb:checked')].map(c => c.dataset.g + ':' + c.dataset.i));
  const pickSync = (box) => { // ซิงก์ช่องติ๊กกลุ่ม/ทั้งหมด (ติ๊กบางส่วน = สถานะกึ่งกลาง) + จำนวน + ปุ่มใส่
    const all = [...box.querySelectorAll('.sy-pick-cb')];
    box.querySelectorAll('.sy-pick-g-cb').forEach(g => {
      const mine = all.filter(c => c.dataset.g === g.dataset.g), n = mine.filter(c => c.checked).length;
      g.checked = n > 0 && n === mine.length; g.indeterminate = n > 0 && n < mine.length;
    });
    const n = all.filter(c => c.checked).length, a = box.querySelector('.sy-pick-all-cb');
    a.checked = n > 0 && n === all.length; a.indeterminate = n > 0 && n < all.length;
    box.querySelector('.sy-pick-n').textContent = `เลือก ${n} ข้อ`;
    box.querySelector('.sy-pick-apply').disabled = n === 0;
  };
  form.addEventListener('change', (e) => {
    const t = e.target, box = t.closest && t.closest('.sy-pick-box');
    if (!box) return;
    if (t.classList.contains('sy-pick-all-cb')) box.querySelectorAll('.sy-pick-cb').forEach(c => { c.checked = t.checked; });
    else if (t.classList.contains('sy-pick-g-cb')) box.querySelectorAll(`.sy-pick-cb[data-g="${t.dataset.g}"]`).forEach(c => { c.checked = t.checked; });
    pickSync(box);
  });
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('.sy-pick-apply');
    if (!btn) return;
    const pick = btn.closest('.sy-pick'), box = pick.querySelector('.sy-pick-box'), ta = btn.closest('.field').querySelector('.sy-std');
    const r = syAppendLines(ta.value, syPickLines(indGroups, pickSel(box)));
    ta.value = r.text;
    box.querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = false; c.indeterminate = false; });
    pickSync(box);
    pick.open = false;
    if (r.added) touch(); else showToast('ตัวชี้วัดที่เลือกมีอยู่ในช่องแล้ว');
  });

  container.querySelector('#sy-goto-score').addEventListener('click', (e) => { e.preventDefault(); if (SY.nav.score) SY.nav.score(); });
  container.querySelector('#sy-edit-info').addEventListener('click', () => { // ปุ่มเดียวกับ "แก้ไขข้อมูลวิชา" ที่หัวหน้า · เก็บค่าที่พิมพ์ค้างเป็นร่างก่อน เพราะบันทึกข้อมูลวิชาแล้วหน้าจะวาดใหม่
  syStashDraft();
  const btn = document.getElementById('struct-edit-info-btn');
  if (btn) btn.click();
});

  // บันทึกจากปุ่มท้ายฟอร์ม — ช่องเวลาที่อ่านไม่ได้ = หยุดและชี้ช่อง · บันทึกสำเร็จแล้ววาดฟอร์มใหม่จากค่าที่ถูกเก็บจริง (เช่น "2.0" → "2" · แถวว่างหายไป) ผู้ใช้จะเห็นตรงกับที่อยู่ในฐานข้อมูล
  const onSave = async () => {
    const bad = syFindBadHours(form);
    if (bad) { showToast('เวลา (ชั่วโมง) ชั่วโมงสอบ และคะแนน K/P/A ต้องเป็นตัวเลข เช่น 1 หรือ 1.5 — แก้ช่องที่ขีดแดงก่อนบันทึก', 'error'); bad.focus(); return; }
    if (await sySave(container, syCollect(form)) && container.isConnected) syShowForm(container);
  };
  container.querySelectorAll('.sy-do-save').forEach(b => b.addEventListener('click', onSave));
  form.addEventListener('input', (e) => { if (e.target.classList.contains('sy-t-hours') || e.target.classList.contains('sy-kpa') || e.target.classList.contains('sy-ph')) e.target.setAttribute('aria-invalid', 'false'); });
}

// โหลดข้อมูลของแท็บให้พร้อมใน SY — มีร่างค้างของวิชานี้อยู่ (สลับระหว่างแท็บฟอร์ม ↔ ตัวอย่าง) ใช้ต่อได้เลย ไม่โหลดใหม่ · ไม่งั้นโหลดใหม่ทุกครั้ง (โครงสร้างคะแนนอาจเพิ่งแก้)
//   คืน false เมื่อโหลดไม่ได้ (แสดงข้อความแทนในกล่อง) หรือผู้ใช้ออกจากแท็บไปแล้ว
async function syEnsure(container, course) {
  if (SY.id === course.id && _syDirty && SY.draft) { SY.course = course; return true; } // ใช้ร่างเดิมต่อ แต่ข้อมูลวิชาเอาล่าสุด (เพิ่งแก้ระดับชั้น/หน่วยกิตได้)
  const keepTerm = SY.id === course.id && SY.termPicked ? SY.term : null; // ภาคเรียน/ปีที่ครูเลือกเอง (ไม่ถูกบันทึก) ต้องอยู่ข้ามการสลับแท็บ/โหลดใหม่ ตราบที่ยังเป็นวิชาเดิม
  syDiscard();
  let data;
  try { data = await syLoad(course, course); }
  catch (err) {
    console.error(err);
    if (container.isConnected) container.innerHTML = `<div class="card"><div class="empty-state">โหลดโครงสร้างรายวิชาไม่สำเร็จ: ${escapeHtml(err.message || '')}</div></div>`;
    return false;
  }
  if (!container.isConnected) return false; // ผู้ใช้สลับแท็บ/ออกจากหน้าไปแล้ว
  Object.assign(SY, { id: course.id, course, struct: data.struct, desc: data.desc, profile: data.profile, term: keepTerm || data.term || syCurrentTerm(), termPicked: !!keepTerm, saved: data.saved, draft: null, existed: data.existed, savedAt: data.savedAt });
  return true;
}

// แท็บ "Course Syllabus" (ฟอร์ม) ของแม่แบบวิชา — nav = { score() } พาไปแท็บโครงสร้างคะแนน (การสลับไปแท็บตัวอย่างใช้แถบแท็บของหน้า เหมือนคำอธิบายรายวิชา)
async function renderSyllabusTab(container, course, nav) {
  showLoading('cat-sm', container);
  if (!(await syEnsure(container, course))) return;
  SY.nav = nav || {};
  syShowForm(container);
}

// แท็บ "ตัวอย่าง Course Syllabus" — ร่างที่พิมพ์ค้างถ้ามี ไม่งั้นที่บันทึกไว้ · onEdit() = ปุ่ม "แก้ไข" พากลับแท็บฟอร์ม
async function renderSyllabusPreviewTab(container, course, onEdit) {
  showLoading('cat-sm', container);
  if (!(await syEnsure(container, course))) return;
  const fromDraft = !!(SY.draft && _syDirty);
  syShowPreview(container, syModel(course, SY.struct, syCurrent(), SY.desc, syCtx()), fromDraft, onEdit);
}
