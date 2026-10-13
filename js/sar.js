// ==========================================================================
// SAR — แท็บ "Self-Assessment Report" ในหน้า ID-Plan (รายงานผลการปฏิบัติงานและการประเมินตนเองรายบุคคล)
//   อยู่ในระบบเอกสาร 'idp' (แท็บ 'sar' ใน IDP_CONFIG.tabs) · เก็บที่ users/{uid}/idp_sar (IDP_CONFIG.collections.sar)
//   โหลดหลัง idp.js (LAZY_BUNDLES.idp) — ใช้ idpGetProfile / idpProfileInfo / idpPullTimetableEntries จาก idp.js
//   โครงเอกสาร: { semester, year, status, f:{ช่องเดี่ยว}, rows:{ตารางแถวซ้ำ}, lv:{ระดับคุณภาพรายข้อ} }
//   ค่าที่คำนวณ (เกรดเฉลี่ย · ร้อยละ · คะแนนมาตรฐาน · ระดับคุณภาพ) ไม่เก็บ — คำนวณสดจาก sarStats(d) ทั้งหน้าจอและตอนพิมพ์
// ==========================================================================

const SAR = { view: 'list', docId: null, doc: null, list: null };

// ระดับคุณภาพตามคะแนนเฉลี่ย [ขั้นต่ำ, ป้าย] — แก้เกณฑ์ที่ตรงนี้ที่เดียว
const SAR_LV = {
  std:    [[4.51, 'ยอดเยี่ยม'], [3.51, 'ดีเลิศ'], [2.51, 'ดี'], [1.51, 'ปานกลาง'], [0, 'กำลังพัฒนา']],
  survey: [[4.51, 'มากที่สุด'], [3.51, 'มาก'], [2.51, 'ปานกลาง'], [1.51, 'น้อย'], [0, 'น้อยที่สุด']],
  plan:   [[3.5, 'ดีมาก'], [2.5, 'ดี'], [1.5, 'ปานกลาง'], [0, 'ปรับปรุง']],
};
const sarLabel = (kind, avg) => avg > 0 ? SAR_LV[kind].find(([min]) => avg >= min - 1e-9)[1] : '—';

const SAR_METHODS = ['การอธิบาย', 'การศึกษาค้นคว้าด้วยตนเอง', 'การสาธิต / ทดลอง', 'กลุ่มสืบค้นความรู้', 'การใช้เกมประกอบ', 'กลุ่มสัมพันธ์', 'บทบาทสมมุติ', 'การเรียนรู้แบบร่วมมือ', 'คอมพิวเตอร์ช่วยสอน', 'ความคิดรวบยอด', 'การถามตอบ', 'โปรแกรมสำเร็จรูป', 'การแก้ปัญหา', 'การพัฒนากระบวนการคิด'];
const SAR_COND = ['ตรงตามวุฒิ/สาขาวิชาที่จบการศึกษา', 'ตรงตามความถนัด', 'ตรงตามประสบการณ์การสอน', 'ตรงกับความรู้ความสามารถ', 'ตรงกับความต้องการ/ความสนใจ'];
const SAR_SURVEY = ['ครูแจ้งผลการเรียนรู้ให้นักเรียนทราบอย่างชัดเจน', 'ครูจัดกิจกรรมการเรียนรู้สนุกและน่าสนใจ', 'เนื้อหาที่สอนทันสมัยเสมอ', 'ครูใช้สื่อประกอบการเรียนการสอนที่เหมาะสมและหลากหลาย', 'ครูใช้คำถามซักถามนักเรียนบ่อย ๆ', 'ครูประยุกต์สาระที่สอนเข้ากับเหตุการณ์ปัจจุบัน/สภาพแวดล้อม', 'ครูส่งเสริมนักเรียนได้ฝึกปฏิบัติจริง มีการจัดการ และการแก้ปัญหา', 'ครูให้นักเรียนฝึกกระบวนการคิด คิดวิเคราะห์ คิดสร้างสรรค์', 'ครูส่งเสริมให้นักเรียนทำงานร่วมกันทั้งเป็นกลุ่มและรายบุคคล', 'ครูให้นักเรียนแสวงหาความรู้จากแหล่งเรียนรู้ต่าง ๆ', 'ครูมีการเสริมแรงให้นักเรียนที่ร่วมกิจกรรมการเรียนการสอน', 'ครูเปิดโอกาสให้นักเรียนซักถามปัญหา', 'ครูคอยกระตุ้นให้นักเรียนตื่นตัวในการเรียนเสมอ', 'ครูสอดแทรกคุณธรรมและค่านิยม 12 ประการในวิชาที่สอน', 'ครูยอมรับความคิดเห็นของนักเรียนที่ต่างไปจากครู', 'นักเรียนมีส่วนร่วมในการวัดและประเมินผลการเรียน', 'ครูมีการประเมินผลการเรียนด้วยวิธีการที่หลากหลายและยุติธรรม', 'ครูมีความตั้งใจในการจัดกิจกรรมการเรียนการสอน', 'บุคลิกภาพ การแต่งกายและการพูดจาของครูเหมาะสม', 'ครูเข้าสอนและออกชั้นเรียนตรงตามเวลา'];
const SAR_PLAN = ['การวิเคราะห์มาตรฐานฯ และตัวชี้วัด/ผลการเรียนรู้', 'การออกแบบกิจกรรมการเรียนรู้', 'การออกแบบปฏิสัมพันธ์', 'การออกแบบประเมินผล', 'การใช้สื่ออุปกรณ์การเรียนรู้'];
const SAR_STD = [
  ['มาตรฐานที่ 1 คุณภาพของผู้เรียน', [
    '1.1 (1) มีความสามารถในการอ่าน การเขียน การสื่อสารและการคิดคำนวณ', '1.1 (2) มีความสามารถในการคิดวิเคราะห์ คิดอย่างมีวิจารณญาณ อภิปรายแลกเปลี่ยนความคิดเห็น และแก้ปัญหา', '1.1 (3) มีความสามารถในการสร้างนวัตกรรม', '1.1 (4) มีความสามารถในการใช้เทคโนโลยีสารสนเทศ และการสื่อสาร', '1.1 (5) มีผลสัมฤทธิ์ทางการเรียนตามหลักสูตรสถานศึกษา', '1.1 (6) มีความรู้ทักษะพื้นฐาน และเจตคติที่ดีต่องานอาชีพ',
    '1.2 (1) การมีคุณลักษณะและค่านิยมที่ดีตามที่สถานศึกษากำหนด', '1.2 (2) ความภูมิใจในท้องถิ่นและความเป็นไทย', '1.2 (3) การยอมรับที่จะอยู่ร่วมกันบนความแตกต่างและหลากหลาย', '1.2 (4) สุขภาวะทางร่างกาย และจิตสังคม']],
  ['มาตรฐานที่ 2 กระบวนการบริหารและการจัดการ', [
    '2.1 มีเป้าหมายวิสัยทัศน์และพันธกิจที่สถานศึกษากำหนดชัดเจน', '2.2 มีระบบบริหารจัดการคุณภาพของสถานศึกษา', '2.3 ดำเนินงานพัฒนาวิชาการที่เน้นคุณภาพผู้เรียนรอบด้าน ตามหลักสูตรสถานศึกษา และทุกกลุ่มเป้าหมาย', '2.4 พัฒนาครูและบุคลากรให้มีความเชี่ยวชาญทางวิชาชีพ', '2.5 จัดสภาพแวดล้อมทางกายภาพและสังคมที่เอื้อต่อการจัดการเรียนรู้อย่างมีคุณภาพ', '2.6 จัดระบบเทคโนโลยีสารสนเทศเพื่อสนับสนุนการบริหารจัดการและการจัดการเรียนรู้']],
  ['มาตรฐานที่ 3 กระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ', [
    '3.1 จัดการเรียนรู้ผ่านกระบวนการคิดและปฏิบัติจริง และสามารถนำไปประยุกต์ใช้ในชีวิตได้', '3.2 ใช้สื่อ เทคโนโลยีสารสนเทศ และแหล่งเรียนรู้ที่เอื้อต่อการเรียนรู้', '3.3 มีการบริหารจัดการชั้นเรียนเชิงบวก', '3.4 ตรวจสอบและประเมินผู้เรียนอย่างเป็นระบบ และนำผลมาพัฒนาผู้เรียน', '3.5 มีการแลกเปลี่ยนเรียนรู้และให้ข้อมูลสะท้อนกลับ เพื่อพัฒนาและปรับปรุงการจัดการเรียนรู้']],
];
const SAR_DUTY = ['5.1 กลุ่มบริหารวิชาการ', '5.2 กลุ่มบริหารงานพัฒนานักเรียน', '5.3 กลุ่มบริหารทั่วไป', '5.4 กลุ่มบริหารบุคคล', '5.5 กลุ่มบริหารงบประมาณ'];
// หัวข้อกลางของเอกสาร — ใช้ร่วมกันทั้งฟอร์มและตอนพิมพ์ (ถ้อยคำตามตัวอย่าง SAR-2-2568) · แก้ที่นี่ที่เดียว
const SAR_H = {
  p1: 'ส่วนที่ 1 ข้อมูลพื้นฐาน',
  s11: '1.1 ข้อมูลพื้นฐาน',
  s12: '1.2 ข้อมูลการปฏิบัติหน้าที่',
  teach: '1.2.1 ปฏิบัติการสอน',                         // + ภาคเรียนที่ … ปีการศึกษา … (ตอนพิมพ์)
  act: '1.2.2 กิจกรรมพัฒนาผู้เรียน ที่ปฏิบัติการพัฒนาผู้เรียน', // + ภาคเรียนที่ … ปีการศึกษา … (ตอนพิมพ์)
  home: '1.2.3 ปฏิบัติหน้าที่ครูที่ปรึกษา',
  attend: '1.2.4 ข้อมูลเกี่ยวกับเวลาการมาปฏิบัติหน้าที่ราชการ', // + (ช่วงเวลาที่รายงาน) ถ้ากรอกไว้
  p2: 'ส่วนที่ 2 ผลงานที่เกิดจากการปฏิบัติหน้าที่',
  g1: '1. ด้านการจัดการเรียนการสอน',
  g1note: '(ให้ครูผู้สอนรายงานผลการปฏิบัติงานตามมาตรฐานตามตัวชี้วัด หลักเกณฑ์และวิธีการประเมินผลการปฏิบัติงานของข้าราชการครู สายครูผู้สอน)',
  l12: '1.2 การจัดการเรียนรู้',
  q124: '1.2.4 คุณภาพผู้เรียน',
  acad: '1.2.4.1 ผลสัมฤทธิ์ทางวิชาการของผู้เรียน',
  trait: '1.2.4.2 คุณลักษณะที่พึงประสงค์ของผู้เรียน',
  meth: '1.2.5 รูปแบบ/วิธีการจัดกิจกรรมการเรียนการสอนที่ครูใช้ คือ ข้อใดบ้าง (ตอบได้มากกว่า 1 ข้อ)',
  cond: '1.2.6 สภาพการปฏิบัติงานสอน',
  survey: '1.2.7 ผลการประเมินการสอนของครูโดยนักเรียน',
  plan: '1.6 การประเมินตนเองเกี่ยวกับการจัดทำแผนการจัดการเรียนรู้ที่เน้นผู้เรียนเป็นสำคัญ',
  g2: '2. ด้านการบริหารจัดการชั้นเรียน',
  g3: '3. ด้านการพัฒนาตนเองและพัฒนาวิชาชีพ',            // + (ช่วงเวลาที่รายงาน) ถ้ากรอกไว้
  s31: '3.1 การพัฒนาตนเอง',
  s32: '3.2 การพัฒนาวิชาชีพ',
  g4: '4. การได้รับรางวัล / ประกาศเกียรติคุณ / ผลงานดีเด่น / เกียรติประวัติที่ปรากฏต่อสาธารณชนด้านสถานศึกษา / ครู / นักเรียน',
  g5: '5. งานอื่นๆ ที่ได้รับมอบหมาย',
  p3: 'ส่วนที่ 3 ผลการดำเนินงานตามมาตรฐานการศึกษาขั้นพื้นฐาน เพื่อการประกันคุณภาพภายในของสถานศึกษา',
};
// ช่องบรรยายส่วนที่ 2 · [รหัสช่อง = id ของ textarea ต่อท้าย sar-, หัวข้อ, ระดับหัวข้อตอนพิมพ์ (1 = หัวข้อใหญ่ · 2 = x.y · 3 = x.y.z)]
//   เรียงตามลำดับในเอกสาร · n121–n123 แยกจาก n12 เดิม (ข้อมูลเก่าย้ายเข้า n121 ใน sarNormalize) · รหัสต้องตรงกับ IDP_CONFIG.sarAi (js/idp-config.js)
const SAR_NARR = [['n11', '1.1 การสร้างและหรือพัฒนาหลักสูตร', 2], ['n121', '1.2.1 การออกแบบหน่วยการเรียนรู้', 3], ['n122', '1.2.2 การจัดทำแผนการจัดการเรียนรู้/แผนการจัดการศึกษาเฉพาะบุคคล/แผนการสอนรายบุคคล/แผนการจัดประสบการณ์', 3], ['n123', '1.2.3 กลยุทธ์ในการจัดการเรียนรู้', 3], ['n13', '1.3 การสร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยีทางการศึกษา และแหล่งเรียนรู้', 2], ['n14', '1.4 การวัดและประเมินผลการเรียนรู้', 2], ['n15', '1.5 ศึกษา วิเคราะห์ สังเคราะห์ และหรือวิจัย เพื่อแก้ปัญหาหรือพัฒนาการเรียนรู้ที่ส่งผลต่อคุณภาพผู้เรียน', 2], ['n21', '2.1 การบริหารจัดการชั้นเรียน และการจัดทำข้อมูลสารสนเทศ', 2], ['n22', '2.2 การจัดระบบดูแลช่วยเหลือนักเรียน', 2], ['guide', '6. แนวทางการพัฒนาคุณภาพผู้เรียน (ในภาคเรียนต่อไป)', 1]];
const sarNarr = k => (SAR_NARR.find(n => n[0] === k) || [])[1] || k;

// ตารางแถวซ้ำ: [รหัสช่อง, หัวคอลัมน์]
const SAR_TRAITS8 = ['รักชาติ ศาสน์ กษัตริย์', 'ซื่อสัตย์สุจริต', 'มีวินัย', 'ใฝ่เรียนรู้', 'อยู่อย่างพอเพียง', 'มุ่งมั่นในการทำงาน', 'รักความเป็นไทย', 'มีจิตสาธารณะ'];
const SAR_RATE5 = ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด']; // หัวคอลัมน์/ตัวเลือกระดับ 5 → 1 (1.2.6 · 1.2.7)
const SAR_DQ = ['ดี', 'พอใช้', 'ปรับปรุง'];
// กลุ่มย่อยของมาตรฐานที่ 1 ในส่วนที่ 3 (ข้อที่ขึ้นต้น "1.1 (n)" / "1.2 (n)") — ชื่อกลุ่มตามประเด็นพิจารณาของมาตรฐานการศึกษาขั้นพื้นฐาน · แก้ที่นี่ที่เดียว
const SAR_STD_GRP = { '1.1': '1.1 ผลสัมฤทธิ์ทางวิชาการของผู้เรียน', '1.2': '1.2 คุณลักษณะที่พึงประสงค์ของผู้เรียน' };
// ผู้รับรองท้ายเอกสาร (ลำดับตามตัวอย่าง SAR-2-2568) · [ตำแหน่ง, ที่มาของชื่อ] — ชื่อ 2 ระดับกลางกรอกในฟอร์ม (f.sgAsst / f.sgDeputy) ส่วนอีก 2 ระดับดึงจากข้อมูลส่วนตัว
// [ตำแหน่ง(pi → ข้อความ), ชื่อ, เป็นผู้อำนวยการ?] — 3 ระดับแรกขึ้น "ได้ตรวจสอบแล้วรับรองข้อมูลถูกต้องและเป็นจริง" · ผู้อำนวยการขึ้น "ความเห็น" (ตามตัวอย่าง SAR-2-2568)
const SAR_SIGN = [[pi => 'หัวหน้ากลุ่มสาระการเรียนรู้' + (pi.subjectGroup || ''), (f, p) => p?.subjectHead], [() => 'ผู้ช่วยผู้อำนวยการกลุ่มบริหารงานบุคคล', f => f.sgAsst], [() => 'รองผู้อำนวยการกลุ่มบริหารงานบุคคล', f => f.sgDeputy], [pi => 'ผู้อำนวยการ' + (pi.school || ''), (f, p) => p?.director, true]];
// หัวคอลัมน์ตอนพิมพ์ที่ต่างจากหัวในฟอร์ม (ถ้อยคำตามตัวอย่าง)
const SAR_PRINT_HEAD = { teaching: { name: 'รายวิชาที่ปฏิบัติการสอน', n: 'จำนวนนักเรียน(คน)', hours: 'จำนวนชั่วโมง/สัปดาห์' }, activities: { name: 'กิจกรรมพัฒนาผู้เรียนและชุมชน', n: 'จำนวนนักเรียน', hours: 'จำนวนชั่วโมง/สัปดาห์' }, training: { place: 'สถานที่จัดอบรม', hours: 'จำนวนชั่วโมง' } };
// ข้อความมาตรฐานที่พิมพ์ตามตัวอย่าง SAR-2-2568 — แก้ถ้อยคำที่นี่ที่เดียว
const SAR_P1_TITLE = 'ความสำคัญของการรายงานผลการปฏิบัติงาน';
const SAR_P1_INTRO = [
  'พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม (ฉบับที่ 2) พ.ศ. 2545 เป็นกฎหมายการศึกษาของชาติ ซึ่งกระทรวงศึกษาธิการได้กำกับดูแลให้การปฏิรูปการศึกษาดังกล่าวเป็นไปตามเจตนารมณ์แห่งพระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม (ฉบับที่ 2) พ.ศ. 2545 ดังนั้น สถานศึกษาจึงมีภารกิจในการจัดการศึกษาครอบคลุมทุกด้านการวัดและประเมินผล เป็นภารกิจหนึ่งที่ต้องมีการปรับเปลี่ยนวิธีการดำเนินงาน ขอบเขตและสาระการประเมินอันจะนำไปสู่การพัฒนาการเรียนการสอน',
  'รายงานผลการปฏิบัติงานในหน้าที่ เพื่อให้สอดคล้องกับภาระหน้าที่และผลการปฏิบัติภาระหน้าที่ ให้เป็นไปตามมาตรฐานคุณภาพที่กำหนดไว้ในมาตรฐานการศึกษาขั้นพื้นฐานหรือมาตรฐานของหลักสูตร การปฏิบัติงานตามภาระหน้าที่ของข้าราชการครูและบุคลากรทางการศึกษาและประเมินผลการปฏิบัติงานว่า มีคุณภาพสูงเพียงใดหรือไม่ ฉะนั้น การเขียนรายงานผลการปฏิบัติงานและการประเมินตนเองฉบับนี้ จึงดำเนินการเพื่อให้สอดคล้องกับแนวทางการประกันคุณภาพของสถานศึกษาดังกล่าว ดังนี้',
];
const SAR_AGENCY_DEFAULT = 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน'; // ส่วนราชการ (1.1) — ช่องว่างใช้ค่านี้
// เกณฑ์การประเมินรายข้อของ 1.6 (ตามตัวอย่าง) · ลำดับตรงกับ SAR_PLAN
const SAR_PLAN_CRIT = [
  ['มีการระบุตัวชี้วัด/ผลการเรียนรู้', 'มีการวิเคราะห์ตัวชี้วัด/ผลการเรียนรู้ แยกออกเป็น 3 ด้านคือ ความรู้ เจตคติ ทักษะ (KPA)', 'มีความเหมาะสม สอดคล้องกับกิจกรรมการเรียนรู้', 'สอดคล้องกับผลการเรียนรู้ที่คาดหวัง', 'ครอบคลุมมาตรฐานการศึกษา'],
  ['การออกแบบกิจกรรมการเรียนรู้เป็นขั้นตอน', 'แผนการจัดกิจกรรมการเรียนรู้มีองค์ประกอบครบ 4 ด้าน (แลกเปลี่ยนประสบการณ์ การสร้างองค์ความรู้ นำเสนอความรู้ ปฏิบัติ / ประยุกต์ใช้)', 'มีความเหมาะสมกับจุดประสงค์การเรียนรู้', 'มีความสอดคล้องกับจุดประสงค์การเรียนรู้ทั้ง 3 ด้าน (ความรู้ เจตคติ ทักษะ)', 'สามารถปฏิบัติได้จริง'],
  ['มีการจัดกิจกรรมการเรียนรู้โดยใช้กระบวนการกลุ่ม', 'มีความหลากหลายในการมีส่วนร่วมของผู้เรียน', 'มีการกำหนดบทบาทและกิจกรรมอย่างชัดเจน', 'ปฏิบัติจริง', 'ผู้เรียนสนุกสนาน เกิดการเรียนรู้'],
  ['มีการประเมินผลการเรียนในแต่ละแผน', 'มีการกำหนดวิธีการประเมินผลหลากหลาย', 'วิธีการประเมินผลสอดคล้องกับจุดประสงค์การเรียนรู้', 'ปฏิบัติจริง', 'นำผลการประเมินมาพัฒนาการเรียนรู้'],
  ['มีการใช้สื่อ อุปกรณ์หรือแหล่งเรียนรู้', 'มีการกำหนดขั้นตอนหรือวิธีการใช้สื่อ หรือแหล่งเรียนรู้', 'มีการใช้สื่อ อุปกรณ์หรือแหล่งการเรียนรู้เหมาะสมกับกิจกรรมการเรียนรู้', 'มีสื่อ อุปกรณ์ แหล่งเรียนรู้', 'มีการพัฒนาสื่อ อุปกรณ์ แหล่งเรียนรู้'],
];
const SAR_PLAN_NOTE = '(ระดับ 4 มี 5 ข้อ · ระดับ 3 มี 4 ข้อ · ระดับ 2 มี 3 ข้อ · ระดับ 1 มี 1-2 ข้อ)';
const SAR_PLAN_JUDGE = ['4 หมายถึง มีการปฏิบัติอยู่ในระดับดีมาก หรือพอใจมากที่สุด', '3 หมายถึง มีการปฏิบัติอยู่ในระดับดี หรือพอใจมาก', '2 หมายถึง มีการปฏิบัติอยู่ในระดับปานกลาง หรือพอใจพอใช้', '1 หมายถึง มีการปฏิบัติอยู่ในระดับปรับปรุง หรือไม่พอใจ'];
// คำชี้แจงและเกณฑ์การตัดสินของส่วนที่ 3 — {school} แทนด้วยชื่อสถานศึกษา
const SAR_P3_GUIDE = ['ศึกษาเกณฑ์มาตรฐานคุณภาพการศึกษาของ{school} มาตรฐานที่ 1-3', 'มาตรฐานที่ 1-3 ประเมินผลแล้วจะได้ผลระดับคุณภาพตัวบ่งชี้/มาตรฐาน แล้วทำเครื่องหมาย ✓ ลงในช่องระดับคุณภาพ'];
const SAR_P3_JUDGE = ['5 หมายถึง มีผลการปฏิบัติอยู่ในระดับยอดเยี่ยม', '4 หมายถึง มีผลการปฏิบัติอยู่ในระดับดีเลิศ', '3 หมายถึง มีผลการปฏิบัติอยู่ในระดับดี', '2 หมายถึง มีผลการปฏิบัติอยู่ในระดับปานกลาง', '1 หมายถึง มีผลการปฏิบัติอยู่ในระดับกำลังพัฒนา'];
// อำเภอ/จังหวัด — ผู้ใช้พิมพ์มาพร้อมคำนำหน้าหรือไม่ก็ได้
const sarStripPre = (v, re) => String(v ?? '').trim().replace(re, '').trim();
const sarAddr = f => [f.district && `อำเภอ${sarStripPre(f.district, /^(อำเภอ|อ\.)\s*/)}`, f.province && `จังหวัด${sarStripPre(f.province, /^(จังหวัด|จ\.)\s*/)}`].filter(Boolean).join(' ');
const SAR_ROWS = {
  teaching:   [['name', 'รายวิชาที่สอน'], ['room', 'ห้อง'], ['n', 'จำนวนนักเรียน'], ['hours', 'ชม./สัปดาห์']],
  activities: [['name', 'กิจกรรมพัฒนาผู้เรียน'], ['room', 'ห้อง/กลุ่ม'], ['n', 'จำนวนนักเรียน'], ['hours', 'ชม./สัปดาห์']],
  grades:     [['name', 'วิชา'], ['room', 'ห้อง'], ['n', 'N'], ['g4', '4'], ['g35', '3.5'], ['g3', '3'], ['g25', '2.5'], ['g2', '2'], ['g15', '1.5'], ['g1', '1'], ['g0', '0'], ['r', 'ร'], ['ms', 'มส.']],
  traits:     [['room', 'ชั้น/ห้อง'], ['n', 'จำนวนนักเรียน'], ['g3', 'ดีเยี่ยม'], ['g2', 'ดี'], ['g1', 'ผ่าน'], ['g0', 'ไม่ผ่าน']],
  training:   [['date', 'วัน เดือน ปี'], ['topic', 'เรื่องที่รับการอบรม/พัฒนา'], ['place', 'สถานที่'], ['org', 'หน่วยงานที่จัด'], ['hours', 'ชั่วโมง']],
  awards:     [['date', 'วัน/เดือน/ปี'], ['title', 'รางวัล/เกียรติคุณ'], ['org', 'หน่วยงานที่มอบ'], ['evidence', 'หลักฐาน']],
  duty:       [['name', 'งานที่ปฏิบัติ']],
};
const sarCols = key => SAR_ROWS[key] || SAR_ROWS.duty; // duty0..duty4 ใช้คอลัมน์ชุดเดียวกัน
const SAR_G = [['g4', 4], ['g35', 3.5], ['g3', 3], ['g25', 2.5], ['g2', 2], ['g15', 1.5], ['g1', 1], ['g0', 0]];

const sarEsc = s => escapeHtml(String(s ?? ''));
const sarNum = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
const sarFmt = (n, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
function sarGet(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function sarSet(o, path, v) { const p = path.split('.'); const last = p.pop(); p.reduce((a, k) => (a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}), o)[last] = v; }

// ---------------- ข้อมูล ----------------
const sarCol = uid => docSystem('idp').col('sar', uid);
async function sarLoadList() {
  const uid = AppState.user?.uid;
  if (!uid) return [];
  const snap = await sarCol(uid).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function sarSave(data) {
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = data;
  const clean = Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('_'))); // คีย์ชั่วคราวของหน้าจอ (เช่น _ctxSeeded ของผู้ช่วย AI) ไม่เก็บลง Firestore
  if (SAR.docId) { await sarCol(uid).doc(SAR.docId).update({ ...clean, updatedAt: now }); return SAR.docId; }
  const ref = await sarCol(uid).add({ ...clean, createdAt: now, updatedAt: now });
  SAR.docId = ref.id;
  return ref.id;
}
function sarNormalize(d) {
  d = d || {};
  d.semester = String(d.semester || '1');
  d.year = String(d.year || new Date().getFullYear() + 543);
  d.status = d.status || 'draft';
  d.f = d.f && typeof d.f === 'object' ? d.f : {};
  d.rows = d.rows && typeof d.rows === 'object' ? d.rows : {};
  d.lv = d.lv && typeof d.lv === 'object' ? d.lv : {};
  // ช่อง 1.2 เดิม (n12 = ออกแบบหน่วย · แผน · กลยุทธ์ รวมช่องเดียว) แยกเป็น n121–n123 แล้ว — ข้อความเดิมย้ายเข้า n121 ทั้งก้อน (ไม่ทิ้ง) · _n12 = ธงให้ฟอร์มแจ้งครู (ขึ้นต้น _ ไม่ถูกเก็บลง Firestore)
  if ('n12' in d.f) {
    if (d.f.n12 && !d.f.n121 && !d.f.n122 && !d.f.n123) { d.f.n121 = d.f.n12; d._n12 = true; }
    delete d.f.n12;
  }
  // บริบทงานของผู้ช่วย AI (js/sar-ai.js) — ตัดความยาวตาม IDP_CONFIG.sarAi.aiCtx.maxLen · 1 ฟิลด์ระดับบน (ไม่เกิน validDoc(30)) · ไม่มี config (ไม่ได้โหลดระบบ ID-Plan) = คงค่าเดิม
  const mx = typeof IDP_CONFIG !== 'undefined' && IDP_CONFIG.sarAi ? IDP_CONFIG.sarAi.aiCtx.maxLen : null;
  if (mx) {
    const ac = d.aiCtx && typeof d.aiCtx === 'object' ? d.aiCtx : {};
    d.aiCtx = {};
    Object.entries(mx).forEach(([k, n]) => { d.aiCtx[k] = String(ac[k] || '').slice(0, n); });
  }
  return d;
}
// ข้อมูลส่วนตัวใน SAR (ส่วนที่ 1.1) — ดึงจากหน้า "ข้อมูลส่วนตัว" : อายุ ← วันเกิด · อายุราชการ ← วันที่บรรจุ · คุณวุฒิ/วิชาเอก/สถาบัน ← วุฒิการศึกษาที่สูงสุด ·
//   วิทยฐานะ ← academicStanding · ตำแหน่งเลขที่ ← positionNo · ถ้าในโปรไฟล์ยังว่าง ใช้ค่าที่เคยกรอกไว้ใน SAR ฉบับเก่า (f.*) แทน
const SAR_EDU_RANK = ['อนุปริญญา', 'ประกาศนียบัตรวิชาชีพชั้นสูง (ปวส.)', 'ปริญญาตรี', 'ประกาศนียบัตรบัณฑิต', 'ปริญญาโท', 'ปริญญาเอก'];
function sarPersonal(prof, f) {
  const p = prof || {}, o = f || {};
  const since = iso => (typeof profileSince === 'function' ? profileSince(iso) : null);
  const age = since(p.birthDate), svc = since(p.startDate);
  const top = (p.education || []).filter(r => r && (r.level || r.major || r.institution))
    .reduce((b, r) => (!b || SAR_EDU_RANK.indexOf(r.level) > SAR_EDU_RANK.indexOf(b.level) ? r : b), null);
  return {
    age: age ? String(age.years) : String(o.age ?? ''),
    svcY: svc ? String(svc.years) : String(o.svcY ?? ''),
    svcM: svc ? String(svc.months) : String(o.svcM ?? ''),
    degree: top?.level || o.degree || '',
    major: top?.major || o.major || '',
    inst: top?.institution || o.inst || '',
    rank: p.academicStanding || o.rank || '',
    posNo: p.positionNo || o.posNo || '',
    position: p.position || '',
  };
}
const sarTitle = d => `SAR ภาคเรียนที่ ${d.semester || '—'} ปีการศึกษา ${d.year || '—'}`;

// ---------------- ปกและคำนำ ----------------
// คำนำมาตรฐาน (ตามตัวอย่าง SAR-2-2568) ดึงชื่อสถานศึกษา · สังกัด · ปีการศึกษา จากข้อมูลส่วนตัว — ช่องคำนำในฟอร์มว่าง = ใช้ข้อความนี้ · ครูแก้เองได้ (เก็บใน f.preface)
function sarPrefaceDefault(d, pi) {
  const sc = pi.school || 'สถานศึกษา', af = pi.affiliation ? ' ' + pi.affiliation : '';
  return [
    `รายงานการประเมินตนเอง (Self-Assessment Report : SAR) เป็นการประเมินการปฏิบัติหน้าที่ตามพระราชบัญญัติการศึกษาแห่งชาติ พุทธศักราช 2542 และฉบับปรับปรุง พุทธศักราช 2545 รวมทั้งมาตรฐานการศึกษาของสถานศึกษา ข้าพเจ้าได้จัดทำขึ้นเพื่อรายงานผลการจัดการเรียนการสอนและการปฏิบัติหน้าที่ของข้าพเจ้า ตลอดจนกิจกรรมต่าง ๆ ที่ได้ส่งเสริมให้นักเรียนมีคุณลักษณะและคุณภาพตามระดับมาตรฐานคุณภาพการศึกษาของ${sc}${af} ประจำปีการศึกษา ${d.year}`,
    `รายงานนี้ สถานศึกษาสามารถนำผลการดำเนินงานไปจัดทำการประเมินคุณภาพภายในและสรุปรายงานให้ผู้บังคับบัญชาตามลำดับสายงาน ตลอดจนเผยแพร่ให้กับผู้ปกครอง นักเรียน ชุมชนในสังคมได้ทราบผลการปฏิบัติงานของบุคลากร ${sc}${af}`,
    'ข้อมูลที่ได้จากการประเมินตนเอง (Self-Assessment Report : SAR) ในครั้งนี้ ข้าพเจ้าจะได้นำไปใช้เป็นแนวทางในการปรับปรุงเพื่อพัฒนาการปฏิบัติงานที่ได้รับมอบหมาย เพื่อส่งเสริมและพัฒนาศักยภาพของผู้เรียนให้สูงขึ้นในทุก ๆ ด้านต่อไป',
  ].join('\n\n');
}
// ตราโรงเรียนบนปกดึงจากข้อมูลส่วนตัว (profile.logo · อัปโหลดที่หน้าข้อมูลส่วนตัวครั้งเดียว) · SAR ที่เคยเก็บตราไว้ใน f.logo = ค่าสำรองจนกว่าจะย้ายเข้าข้อมูลส่วนตัว
// ย้ายตราเดิมใน SAR เข้าข้อมูลส่วนตัวเมื่อโปรไฟล์ยังไม่มีตรา · คืน true เมื่อย้ายสำเร็จ (ผิดพลาด เช่น rules ยังไม่อัปเดต = false และคง f.logo ไว้ ไม่ให้ตราหาย)
async function sarMoveLogoToProfile(prof, logo) {
  try {
    await loadModule('profile');
    const url = cleanProfileLogo(logo);
    if (!url) return false;
    await db.collection('users').doc(AppState.user.uid).update({ 'profile.logo': url });
    if (prof) prof.logo = url;
    if (AppState.teacherProfile) AppState.teacherProfile.logo = url;
    return true;
  } catch (e) {
    console.warn('ย้ายตราโรงเรียนเข้าข้อมูลส่วนตัวไม่สำเร็จ', e);
    return false;
  }
}

// ---------------- คำนวณ (ใช้ทั้งหน้าจอและตอนพิมพ์) ----------------
function sarStats(d) {
  const R = d.rows || {}, L = d.lv || {};
  const sum = (a, k) => (a || []).reduce((s, r) => s + sarNum(r[k]), 0);
  const gs = r => {
    const c = SAR_G.reduce((s, [k]) => s + sarNum(r[k]), 0);
    const fx = SAR_G.reduce((s, [k, w]) => s + sarNum(r[k]) * w, 0);
    return { c, all: c + sarNum(r.r) + sarNum(r.ms), avg: c ? fx / c : 0 };
  };
  const tot = {};
  [...SAR_G.map(g => g[0]), 'r', 'ms', 'n'].forEach(k => { tot[k] = sum(R.grades, k); });
  const gt = gs(tot), pct = n => (gt.all ? (n / gt.all) * 100 : 0);
  const avgOf = a => { const v = (a || []).filter(Boolean); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  const sv = avgOf(L.survey), pl = avgOf(L.plan);
  return {
    teachHours: sum(R.teaching, 'hours'), teachN: sum(R.teaching, 'n'), actHours: sum(R.activities, 'hours'), actN: sum(R.activities, 'n'),
    rowG: (R.grades || []).map(gs), gradeTot: tot, gt,
    pHigh: pct(tot.g4 + tot.g35 + tot.g3), pMid: pct(tot.g25 + tot.g2 + tot.g15 + tot.g1), pLow: pct(tot.g0 + tot.r + tot.ms),
    traitN: sum(R.traits, 'n'), trainHours: sum(R.training, 'hours'),
    methodN: Object.values(d.f.m || {}).filter(Boolean).length,
    homeN: sarNum(d.f.hmM) + sarNum(d.f.hmF),
    sv, svLabel: sarLabel('survey', sv), pl, plLabel: sarLabel('plan', pl),
    std: SAR_STD.map(([, items], i) => {
      const v = (L['std' + i] || []).slice(0, items.length).filter(Boolean), s = v.reduce((a, b) => a + b, 0);
      const avg = v.length ? s / v.length : 0;
      return { sum: s, answered: v.length, total: items.length, avg, label: sarLabel('std', avg) };
    }),
  };
}

// ---------------- ฟอร์ม ----------------
const sarIn = (path, v, ph = '', extra = '') => `<input class="input-sm" data-f="${path}" value="${sarEsc(v)}" placeholder="${sarEsc(ph)}" ${extra}>`;
const sarFld = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;

function sarRowHtml(key, row = {}) {
  const cols = sarCols(key);
  return `<tr>${cols.map(([c, label]) => `<td data-label="${sarEsc(label)}"><input class="input-sm" data-c="${c}" value="${sarEsc(row[c])}"></td>`).join('')}${key === 'grades' ? '<td data-label="เฉลี่ย / ตรวจสอบ" class="sar-rowcalc"></td>' : ''}<td><button type="button" class="btn btn-danger-ghost btn-sm sar-del" aria-label="ลบแถว">${DOC_ICO_DEL}</button></td></tr>`;
}
function sarTable(key, title, addLabel, extraHead = '') {
  const rows = SAR.doc.rows[key]?.length ? SAR.doc.rows[key] : [{}];
  return `<div class="doc-subsec"><div class="doc-subsec-hd">${title}</div>
    <div class="idp-table-wrap"><table class="idp-comp-table${key === 'grades' ? ' sar-grades' : ''}"><thead><tr>${sarCols(key).map(c => `<th>${sarEsc(c[1])}</th>`).join('')}${extraHead}<th></th></tr></thead>
    <tbody data-rows="${key}">${rows.map(r => sarRowHtml(key, r)).join('')}</tbody></table></div>
    <div class="u-mt-4"><button type="button" class="btn btn-ghost btn-sm" data-add="${key}">${DOC_ICO_ADD} ${addLabel}</button></div></div>`;
}
function sarMatrix(group, items, levels, heads) {
  const cur = SAR.doc.lv[group] || [];
  return `<div class="idp-table-wrap"><table class="idp-comp-table sar-matrix"><thead><tr><th>รายการ</th>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${items.map((t, i) => `<tr><td class="sar-mx-item">${sarEsc(t)}</td>${levels.map((lv, j) => `<td><label class="sar-mx-cell"><input type="radio" name="lv-${group}-${i}" data-lv="${group}" data-i="${i}" value="${lv}" aria-label="${sarEsc(t)}: ${heads[j]}"${cur[i] === lv ? ' checked' : ''}><span class="sar-mx-txt">${heads[j]}</span></label></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

function sarCollect() {
  const form = document.getElementById('sar-form');
  if (!form || !SAR.doc) return;
  const d = SAR.doc;
  d.semester = form.querySelector('#sar-semester')?.value || d.semester;
  d.year = (form.querySelector('#sar-year')?.value || '').trim() || d.year;
  d.status = form.querySelector('#sar-status')?.value || d.status;
  form.querySelectorAll('[data-f]').forEach(el => sarSet(d.f, el.dataset.f, el.type === 'checkbox' ? el.checked : el.value.trim()));
  form.querySelectorAll('tbody[data-rows]').forEach(tb => {
    d.rows[tb.dataset.rows] = [...tb.rows].map(tr => Object.fromEntries([...tr.querySelectorAll('[data-c]')].map(i => [i.dataset.c, i.value.trim()])));
  });
  const lv = {};
  form.querySelectorAll('input[data-lv]:checked').forEach(r => { (lv[r.dataset.lv] = lv[r.dataset.lv] || [])[Number(r.dataset.i)] = Number(r.value); });
  Object.keys(lv).forEach(g => { lv[g] = Array.from(lv[g], v => v || 0); });
  d.lv = lv;
}

function sarCalc() {
  const d = SAR.doc, s = sarStats(d), $ = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  $('sar-t-sum', `รวม ${sarFmt(s.teachHours, 1)} ชม./สัปดาห์ · นักเรียน ${s.teachN} คน (นับซ้ำตามรายวิชา)`);
  $('sar-a-sum', `รวม ${sarFmt(s.actHours, 1)} ชม./สัปดาห์`);
  $('sar-hm-n', `รวม ${s.homeN} คน`);
  $('sar-m-n', `จำนวนรูปแบบ/วิธีที่ใช้: ${s.methodN} วิธี`);
  $('sar-tr-n', `รวม ${s.traitN} คน`);
  $('sar-tn-h', `รวม ${sarFmt(s.trainHours, 1)} ชั่วโมง`);
  $('sar-g-res', s.gt.all ? `เฉลี่ย ${sarFmt(s.gt.avg)} · ผลการเรียน 3 ขึ้นไป ${sarFmt(s.pHigh)}% · 1–2.5 ${sarFmt(s.pMid)}% · 0/ร/มส ${sarFmt(s.pLow)}% (รวม ${s.gt.all} คน)` : 'กรอกจำนวนนักเรียนตามผลการเรียน ระบบคำนวณค่าเฉลี่ยและร้อยละให้');
  $('sar-sv-res', s.sv ? `ค่าเฉลี่ย ${sarFmt(s.sv)} → ระดับ ${s.svLabel}` : '');
  $('sar-pl-res', s.pl ? `ค่าเฉลี่ย ${sarFmt(s.pl)} → ระดับคุณภาพ ${s.plLabel}` : '');
  s.std.forEach((x, i) => $('sar-std-' + i, x.answered ? `คะแนนรวม ${x.sum} ÷ ${x.answered} ตัวบ่งชี้ = ${sarFmt(x.avg)} → ${x.label}${x.answered < x.total ? ` (ตอบ ${x.answered}/${x.total} ข้อ)` : ''}` : ''));
  document.querySelectorAll('#sar-form tbody[data-rows="grades"] tr').forEach((tr, i) => {
    const g = s.rowG[i], n = sarNum(d.rows.grades?.[i]?.n), cell = tr.querySelector('.sar-rowcalc');
    if (g && cell) cell.textContent = g.all ? `${sarFmt(g.avg)}${g.all !== n ? ` ⚠ รวม ${g.all} ≠ N ${n}` : ''}` : '';
  });
}

// วิชาที่เป็นกิจกรรมพัฒนาผู้เรียน (ไม่ใช่รายวิชา): รหัสขึ้นต้น ก หรือชื่อเข้าข่าย — ผิดก็แก้ย้ายเองในฟอร์มได้
const sarIsActivity = c => /^ก/.test(String(c.code || '').trim()) || /ชุมนุม|กิจกรรม|ลูกเสือ|เนตรนารี|แนะแนว|โฮมรูม|ผู้บำเพ็ญ|สวดมนต์/.test(c.name || '');
// รวมรายวิชา/กิจกรรมจาก "บันทึกคะแนน" (ห้อง · จำนวนนักเรียน) เข้ากับ "ตารางสอน" (จำนวนคาบ = ชม./สัปดาห์) เป็นแถวเดียวต่อวิชา+ห้อง
//   list    = [{ id, code, name, credit, act, title, rooms: [{ room, label, n }] }] (รายวิชาของภาคเรียนนั้น · room = เลขห้องในบันทึกคะแนน เช่น "1" · label = ชื่อห้องเต็ม "ม.2/1" = ระดับชั้นของวิชา/ห้อง ตรงกับที่ตารางสอนใช้)
//   entries = คาบที่วางในตารางสอน (idpPullTimetableEntries) — จับคู่กับวิชาด้วย courseId (ถ้าผูกไว้) หรือรหัส/ชื่อ · จับคู่ห้องด้วย cls
//   ห้อง "1" ของวิชาระดับ ม.2 กับคาบ "ม.2/1" ในตารางสอน = ห้องเดียวกัน → แสดง "ม.2/1" แถวเดียว · วิชามีห้องเดียวแต่ชื่อห้องในตารางเขียนต่างไป → ถือเป็นห้องนั้น
//   ชั่วโมงรายห้อง = ผลรวมคาบของห้องนั้น · ตารางไม่ระบุห้อง = หารเฉลี่ยตามจำนวนห้อง · วิชาไม่อยู่ในตารางเลย = หน่วยกิต × 2 (0.5 หน่วยกิต = 1 ชม./สัปดาห์)
//   คาบในตารางที่ไม่มีวิชา/ห้องตรงกัน (เช่น กิจกรรมที่ไม่มีรายวิชา) ยังเข้าตาราง โดยเว้นจำนวนนักเรียนให้กรอกเอง
const sarRoomKey = s => String(s ?? '').replace(/\s+/g, '').replace(/^ม\.?/, '').toLowerCase();
const sarNameKey = s => String(s ?? '').replace(/\s+/g, '').toLowerCase();
// ชื่อห้องเต็ม = ระดับชั้นของวิชา + "/" + เลขห้อง (เช่น ม.2 + 1 → ม.2/1 — สูตรเดียวกับ ttFindSection ในตารางสอน) · ห้องที่เขียนเต็มมาแล้ว (มี / หรือขึ้นต้น ม.) ใช้ตามนั้น
function sarRoomLabel(c, room) {
  const r = String(room ?? '').trim(), lv = String(c.level || '').trim();
  return !r || !lv || /\/|^ม\.?\s*\d/.test(r) ? r : `${lv}/${r}`;
}
function sarMergeCourseRows(list, entries) {
  entries = entries || [];
  const used = new Set(), out = { teaching: [], activities: [], noHours: 0, noN: 0 };
  const same = (c, e) => e.courseId ? e.courseId === c.id
    : (c.code && e.code && sarNameKey(e.code) === sarNameKey(c.code)) || (!!e.title && sarNameKey(e.title) === sarNameKey(c.name));
  const span = es => es.reduce((t, e) => t + (Number(e.span) || 1), 0);
  (list || []).forEach(c => {
    const es = entries.filter(e => same(c, e));
    c.rooms.forEach(rm => {
      const lab = rm.label || rm.room || '';
      const lk = sarRoomKey(lab), rk = sarRoomKey(rm.room);
      let mine = es.filter(e => e.cls && !used.has(e) && (sarRoomKey(e.cls) === lk || (rk && sarRoomKey(e.cls).endsWith('/' + rk))));
      if (!mine.length && c.rooms.length === 1) mine = es.filter(e => e.cls && !used.has(e)); // วิชามีห้องเดียว (เหมือน ttFindSection)
      let hours = null;
      if (mine.length) { mine.forEach(e => used.add(e)); hours = span(mine); }
      else {
        const gen = es.filter(e => !e.cls);
        if (gen.length) { gen.forEach(e => used.add(e)); hours = Math.round((span(gen) / c.rooms.length) * 2) / 2; }
        else if (!es.length && Number(c.credit) > 0) hours = Number(c.credit) * 2;
      }
      if (hours == null) out.noHours++;
      if (!rm.n) out.noN++;
      (c.act ? out.activities : out.teaching).push({ name: c.title, room: lab, n: String(rm.n ?? ''), hours: hours == null ? '' : String(hours) });
    });
  });
  const grp = new Map();
  entries.filter(e => !used.has(e)).forEach(e => {
    const act = e.kind === 'activity' || !e.code;
    const key = [act, e.code || '', e.title || '', sarRoomKey(e.cls)].join('|');
    const g = grp.get(key) || { act, name: [e.code, e.title].filter(Boolean).join(' '), room: e.cls || '', hours: 0 };
    g.hours += Number(e.span) || 1;
    grp.set(key, g);
  });
  grp.forEach(g => { (g.act ? out.activities : out.teaching).push({ name: g.name, room: g.room, n: '', hours: String(g.hours) }); out.noN++; });
  return out;
}

// ดึงจากรายวิชา/ห้อง/คะแนน/เกรดของภาคเรียน+ปีนั้น (loadCoursesWithGrades ใน dashboard.js ใช้แคชเดียวกับหน้าแรก) ร่วมกับตารางสอนของภาคเดียวกัน
async function sarPullCourses(d) {
  const { courses } = await loadCoursesWithGrades();
  const yr = String(d.year).trim(), sm = String(d.semester).trim();
  const mine = courses.filter(c => String(c.year || '').trim() === yr && String(c.semester || '').trim() === sm);
  let entries = [];
  try { entries = await idpPullTimetableEntries({ type: 'term', year: d.year, sem: d.semester }); } catch (e) { /* ไม่มีตารางสอน → ชั่วโมงคิดจากหน่วยกิต/เว้นให้กรอกเอง */ }
  if (!mine.length && !entries.length) return { found: 0 };
  const list = mine.map(c => ({
    id: c.id, code: c.code || '', name: c.name || '', credit: c.credit, act: sarIsActivity(c), title: [c.code, c.name].filter(Boolean).join(' '),
    rooms: (c.roomsData || []).map(rm => ({ room: rm.room || '', label: sarRoomLabel(c, rm.room), n: gradeSummaryCounts(rm.students).N })),
  }));
  const m = sarMergeCourseRows(list, entries);
  const rows = { teaching: m.teaching, activities: m.activities, grades: [] };
  let noScore = 0;
  mine.forEach(c => {
    if (sarIsActivity(c)) return;
    (c.roomsData || []).forEach(rm => {
      const g = gradeSummaryCounts(rm.students); // N + จำนวนตามเกรด (นับเฉพาะคนที่มีคะแนนแล้ว)
      const gr = { name: [c.code, c.name].filter(Boolean).join(' '), room: sarRoomLabel(c, rm.room), n: String(g.N) };
      ['g4', 'g35', 'g3', 'g25', 'g2', 'g15', 'g1', 'g0'].forEach((k, i) => { gr[k] = g.counts[i] ? String(g.counts[i]) : ''; });
      rows.grades.push(gr);
      if (!g.n) noScore++;
    });
  });
  Object.assign(d.rows, rows);
  return { found: mine.length, teach: rows.teaching.length, act: rows.activities.length, noScore, noHours: m.noHours, noN: m.noN, noTimetable: !entries.length };
}

// ดึง "การอบรม" (3.1) และ "เกียรติบัตร/รางวัล" (4) จากแท็บอบรม/เกียรติบัตร/รางวัลในหน้าข้อมูลส่วนตัว (js/records.js · เก็บแยกตามปีการศึกษา)
//   ดึงทั้งปีการศึกษาของ SAR (ไม่แยกภาคเรียน — โรงเรียนเปิดเทอมต่างกัน ถ้าตัดตามเดือนแล้วคลาดจะหายเงียบๆ) · แถวที่เกินช่วงรายงานลบเองในฟอร์มได้
//   ข้อมูลส่วนตัวไม่มีช่อง "สถานที่" จึงเว้นว่างให้กรอกเอง · หลักฐาน = ชื่อไฟล์ที่แนบไว้ (ถ้ามี) · เรียงเก่า→ใหม่
async function sarPullRecords(d) {
  await loadModule('records');
  const year = Number(String(d.year).trim());
  if (!year) return { bad: true };
  const list = (await recLoadYear(year)).slice().reverse();
  const when = r => (r.date ? recDateTh(r.date) : '');
  const training = list.filter(r => r.type === 'training')
    .map(r => ({ date: when(r), topic: r.title, place: '', org: r.org || '', hours: r.hours ? recHoursText(r.hours) : '' }));
  const awards = list.filter(r => r.type !== 'training')
    .map(r => ({ date: when(r), title: r.title, org: r.org || '', evidence: r.file ? r.file.name : '' }));
  if (training.length) d.rows.training = training;
  if (awards.length) d.rows.awards = awards;
  return { year, train: training.length, award: awards.length };
}

async function sarRenderFormView() {
  const sys = docSystem(), root = docMount(), seq = sys.state.seq;
  const stillHere = () => !docStale(root, seq, sys) && sys.state.tab === 'sar' && SAR.view === 'form';
  const d = SAR.doc = sarNormalize(SAR.doc);
  const prof = await idpGetProfile(); // อ่านล่าสุดทุกครั้ง — เพิ่มข้อมูลส่วนตัวแล้วกลับมาเห็นทันที
  if (d.f.logo) { // SAR เก่าที่เก็บตราไว้ในเอกสารเอง → ย้ายเข้าข้อมูลส่วนตัว (โปรไฟล์มีตราแล้ว = ใช้ของโปรไฟล์ ทิ้งของเก่า)
    const had = !!prof?.logo, moved = !had && await sarMoveLogoToProfile(prof, d.f.logo);
    if (had || moved) delete d.f.logo;
    if (moved) showToast('ย้ายตราโรงเรียนไปเก็บในข้อมูลส่วนตัวแล้ว');
  }
  if (!stillHere()) return;
  const pi = idpProfileInfo(prof), f = d.f, ps = sarPersonal(prof, f), logo = pi.logo || f.logo || '';
  const pf = prof || {}; // ตัดสินจากข้อมูลส่วนตัวจริง (ไม่นับค่าสำรองจาก SAR เก่า) — ถ้าว่างให้ชวนไปเพิ่ม
  const miss = [['วันเกิด', pf.birthDate], ['วันที่บรรจุ', pf.startDate], ['วุฒิการศึกษา', (pf.education || []).length], ['วิทยฐานะ', pf.academicStanding], ['เลขที่ตำแหน่ง', pf.positionNo]].filter(m => !m[1]).map(m => m[0]);
  const sec = (t, body) => `<section class="doc-section"><h2 class="doc-sec-title">${t}</h2>${body}</section>`;
  const num = (label, path) => sarFld(label, sarIn(path, sarGet(d.f, path), '', 'inputmode="decimal"'));
  const lv5 = [5, 4, 3, 2, 1];
  // ช่องบรรยายส่วนที่ 2 (textarea id = sar-<รหัส>) และหัวข้อกลุ่มในฟอร์ม (หัวข้อใหญ่ 1. 2. 3. … ไม่มีช่องกรอกของตัวเอง)
  const narr = (k, rows = 3) => `<div class="field u-mt-4"><div class="doc-item-h"><label for="sar-${k}">${sarEsc(sarNarr(k))}</label></div><textarea class="idp-ta" id="sar-${k}" data-f="${k}" rows="${rows}">${sarEsc(f[k])}</textarea></div>`;
  const grp = (t, note = '') => `<div class="doc-subsec-hd u-mt-4">${sarEsc(t)}${note ? ` <span class="doc-sec-note">${sarEsc(note)}</span>` : ''}</div>`;

  root.innerHTML = `
  <div class="pa-form-head">
    <button type="button" class="btn btn-ghost btn-sm" id="sar-back-btn">← กลับ</button>
    <div><h2 class="pa-form-title">SAR · ${SAR.docId ? 'แก้ไขรายงาน' : 'สร้างรายงานใหม่'}</h2>
    <div class="u-note">รายงานผลการปฏิบัติงานและการประเมินตนเองรายบุคคล (Self-Assessment Report)</div></div>
  </div>
  <form id="sar-form" class="doc-form" autocomplete="off" novalidate>
    <div class="doc-form-header"><div class="doc-form-meta">
      <label>ภาคเรียนที่ <select id="sar-semester"><option value="1"${d.semester === '1' ? ' selected' : ''}>1</option><option value="2"${d.semester === '2' ? ' selected' : ''}>2</option></select></label>
      <label>ปีการศึกษา <input id="sar-year" type="text" inputmode="numeric" maxlength="4" value="${sarEsc(d.year)}"></label>
      <label>ช่วงเวลาที่รายงาน ${sarIn('period', f.period, 'เช่น 1 ต.ค. 2568 – 30 เม.ย. 2569')}</label>
      <label>สถานะ <select id="sar-status"><option value="draft"${d.status === 'draft' ? ' selected' : ''}>ร่าง</option><option value="submitted"${d.status === 'submitted' ? ' selected' : ''}>ส่งแล้ว</option></select></label>
    </div></div>

    ${sec('ปกและคำนำ', `
      <div class="doc-subsec"><div class="doc-subsec-hd">ตราโรงเรียนบนปก <span class="doc-sec-note">(ดึงจากข้อมูลส่วนตัว — แก้ที่นั่นครั้งเดียว)</span></div>
        <div class="pf-logo-box">
          <div class="pf-logo-thumb">${logo ? `<img src="${sarEsc(logo)}" alt="ตราโรงเรียน">` : '<span>ยังไม่มีภาพ</span>'}</div>
          <div class="pf-logo-act"><button type="button" class="btn btn-ghost btn-sm" id="sar-goto-logo">${logo ? 'เปลี่ยนตราในข้อมูลส่วนตัว' : 'ไปเพิ่มตราในข้อมูลส่วนตัว'}</button></div>
        </div>
      </div>
      <div class="doc-subsec"><div class="doc-subsec-hd">ที่ตั้งสถานศึกษาและส่วนราชการ <span class="doc-sec-note">(พิมพ์บนปก · 1.1 · บันทึกข้อความ)</span></div>
        <div class="doc-form-meta">${sarFld('อำเภอ', sarIn('district', f.district, 'เช่น หนองกี่'))}${sarFld('จังหวัด', sarIn('province', f.province, 'เช่น บุรีรัมย์'))}${sarFld('ส่วนราชการ', sarIn('agency', f.agency, SAR_AGENCY_DEFAULT))}</div>
      </div>
      <div class="doc-subsec"><div class="doc-subsec-hd">คำนำ</div>
        <div class="field"><textarea class="idp-ta" id="sar-preface" data-f="preface" rows="8" placeholder="เว้นว่าง = ใช้คำนำมาตรฐาน (ดึงชื่อสถานศึกษา สังกัด และปีการศึกษาให้อัตโนมัติ)">${sarEsc(f.preface)}</textarea></div>
        <button type="button" class="btn btn-ghost btn-sm u-mt-12" id="sar-preface-fill">ใส่ข้อความมาตรฐานเพื่อแก้ไข</button>
      </div>`)}

    ${sec('ส่วนที่ 1  ข้อมูลพื้นฐาน', `
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.s11} <span class="doc-sec-note">(ทั้งหมดในส่วนนี้ดึงจากข้อมูลส่วนตัว — แก้ที่นั่นครั้งเดียว)</span></div>
        <dl class="pa-pf pa-pf-auto">
          ${[['ชื่อ', pi.name], ['ตำแหน่ง', pi.position], ['กลุ่มสาระฯ', pi.subjectGroup], ['สถานศึกษา', pi.school], ['อายุ', ps.age && ps.age + ' ปี'], ['อายุราชการ', ps.svcY !== '' && `${ps.svcY} ปี ${ps.svcM || 0} เดือน`], ['คุณวุฒิสูงสุด', ps.degree], ['วิชาเอก', ps.major], ['จากสถาบัน', ps.inst], ['วิทยฐานะ', ps.rank], ['ตำแหน่งเลขที่', ps.posNo]]
            .map(([l, v]) => `<div class="pa-pf-item"><dt>${l}</dt><dd>${sarEsc(v || '—')}</dd></div>`).join('')}
        </dl>
        ${miss.length ? `<div class="pa-pf-note"><span>ยังไม่มีในข้อมูลส่วนตัว: ${miss.join(' · ')}</span><button type="button" class="btn btn-ghost btn-sm" id="sar-goto-profile">ไปเพิ่มในข้อมูลส่วนตัว</button></div>` : ''}
      </div>
      <div class="doc-subsec">
        <button type="button" class="btn btn-primary btn-sm" id="sar-cs-pull">ดึงจากรายวิชา · คะแนน · ตารางสอน (ภาคเรียนนี้)</button>
        <div class="u-note u-mt-12">รวมสองแหล่งในปุ่มเดียว: ห้องและจำนวนนักเรียนมาจากบันทึกคะแนน · ชั่วโมง/สัปดาห์นับจากคาบของห้องนั้นในตารางสอน (ทั้งรายวิชาและกิจกรรมพัฒนาผู้เรียน) · ตารางผลการเรียน (1.2.4.1) มาจากเกรดของแต่ละห้อง · ช่องไหนไม่พบข้อมูลจะเว้นว่างให้กรอกเอง แก้ไขต่อในช่องได้</div>
      </div>
      <h3 class="sar-sub-title">${SAR_H.s12}</h3>
      ${sarTable('teaching', SAR_H.teach, 'เพิ่มรายวิชา')}<div class="u-note" id="sar-t-sum"></div>
      ${sarTable('activities', SAR_H.act, 'เพิ่มกิจกรรม')}<div class="u-note" id="sar-a-sum"></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.home}</div><div class="doc-form-meta">
        ${sarFld('ชั้น/ห้อง', sarIn('hmCls', f.hmCls, 'เช่น ม.1/1'))}${num('ชาย (คน)', 'hmM')}${num('หญิง (คน)', 'hmF')}</div><div class="u-note" id="sar-hm-n"></div></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.attend} <span class="doc-sec-note">(ครั้ง / วัน — เว้นว่างถ้าไม่มี)</span></div><div class="sar-att">
        ${[['late', 'มาสาย'], ['sick', 'ลาป่วย'], ['biz', 'ลากิจ'], ['ord', 'ลาอุปสมบท'], ['mat', 'ลาคลอด']].map(([k, l]) => `<div class="sar-att-item"><div class="sar-att-t">${l}</div><div class="sar-att-in">${num('ครั้ง', 'at.' + k + 'T')}${num('วัน', 'at.' + k + 'D')}</div></div>`).join('')}</div></div>`)}

    ${sec('ส่วนที่ 2  ผลงานที่เกิดจากการปฏิบัติหน้าที่', `
      ${grp(SAR_H.g1, SAR_H.g1note)}
      ${narr('n11')}
      ${grp(SAR_H.l12)}
      ${d._n12 ? '<div class="u-note u-mt-4">ข้อความเดิมของหัวข้อ 1.2 (ฉบับที่บันทึกไว้ก่อนแยกช่อง) อยู่ในช่อง 1.2.1 ทั้งก้อน — แบ่งไปช่อง 1.2.2 และ 1.2.3 เองได้</div>' : ''}
      ${narr('n121')}${narr('n122')}${narr('n123')}
      ${grp(SAR_H.q124)}
      ${sarTable('grades', `${SAR_H.acad} <span class="doc-sec-note">(จำนวนนักเรียนตามระดับผลการเรียน)</span>`, 'เพิ่มรายวิชา', '<th>เฉลี่ย / ตรวจสอบ</th>')}<div class="u-note" id="sar-g-res"></div>
      ${sarTable('traits', `${SAR_H.trait} <span class="doc-sec-note">(จำนวนคนตามผลการประเมิน)</span>`, 'เพิ่มห้อง')}<div class="u-note" id="sar-tr-n"></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.meth}</div>
        <div class="doc-checks doc-checks-auto">
          ${SAR_METHODS.map((m, i) => `<label class="doc-check"><input type="checkbox" data-f="m.${i}"${f.m?.[i] ? ' checked' : ''}> ${m}</label>`).join('')}
        </div>
        <div class="field u-mt-12"><label for="sar-mo">อื่น ๆ (ระบุ)</label>${sarIn('mOther', f.mOther, 'ระบุรูปแบบ/วิธีอื่น ๆ (ถ้ามี)').replace('class="input-sm"', 'class="input-sm" id="sar-mo"')}</div><div class="u-note" id="sar-m-n"></div></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.cond}</div>${sarMatrix('cond', SAR_COND, lv5, ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'])}</div>
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.survey}</div>${sarMatrix('survey', SAR_SURVEY, lv5, ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'])}<div class="u-note" id="sar-sv-res"></div></div>
      <div class="doc-subsec"><div class="doc-subsec-hd">${SAR_H.plan} <span class="doc-sec-note">(ระดับ 4 = ดีมาก … 1 = ปรับปรุง)</span></div>${sarMatrix('plan', SAR_PLAN, [4, 3, 2, 1], ['4', '3', '2', '1'])}<div class="u-note" id="sar-pl-res"></div></div>
      ${narr('n13')}${narr('n14')}${narr('n15')}
      ${grp(SAR_H.g2)}
      ${narr('n21')}${narr('n22')}
      ${grp(SAR_H.g3)}
      <div class="u-mt-4"><button type="button" class="btn btn-primary btn-sm" id="sar-rec-pull">ดึงอบรม · เกียรติบัตร/รางวัล จากข้อมูลส่วนตัว (ปีการศึกษานี้)</button></div>
      <div class="u-note">ดึงจากแท็บอบรม/เกียรติบัตร/รางวัลในหน้าข้อมูลส่วนตัว ทั้งปีการศึกษา — ใส่ในหัวข้อ 3.1 (อบรม) และ 4 (เกียรติบัตร + รางวัล) · ไม่มีช่องสถานที่ให้เว้นว่าง · ลบแถวที่อยู่นอกช่วงรายงานหรือแก้ต่อในช่องได้</div>
      ${sarTable('training', SAR_H.s31, 'เพิ่มการอบรม')}<div class="u-note" id="sar-tn-h"></div>
      <div class="field u-mt-4"><label for="sar-plc">${SAR_H.s32}</label>${sarIn('plc', f.plc, 'เช่น เข้าร่วมกิจกรรม PLC ภาคเรียนที่ 2 จำนวน … ชั่วโมง').replace('class="input-sm"', 'class="input-sm" id="sar-plc"')}</div>
      ${grp(SAR_H.g4)}
      ${sarTable('awards', 'รายการรางวัล / เกียรติคุณ', 'เพิ่มรางวัล')}
      ${grp(SAR_H.g5)}
      ${SAR_DUTY.map((t, i) => `${sarTable('duty' + i, t, 'เพิ่มงาน')}<div class="field"><label>สรุปได้ว่า ระดับคุณภาพการปฏิบัติงาน
          <select data-f="dq${i}">${['', 'ดี', 'พอใช้', 'ปรับปรุง'].map(o => `<option value="${o}"${f['dq' + i] === o ? ' selected' : ''}>${o || '— เลือก —'}</option>`).join('')}</select></label></div>`).join('')}
      ${narr('guide', 4)}`)}

    ${sec('ส่วนที่ 3  ผลการดำเนินงานตามมาตรฐานการศึกษาขั้นพื้นฐาน เพื่อการประกันคุณภาพภายในของสถานศึกษา', `
      <div class="u-note">ระดับคุณภาพ 5 = ยอดเยี่ยม · 4 = ดีเลิศ · 3 = ดี · 2 = ปานกลาง · 1 = กำลังพัฒนา — ค่าเฉลี่ยและระดับคุณภาพคำนวณให้</div>
      ${SAR_STD.map(([t, items], i) => `<div class="doc-subsec"><div class="doc-subsec-hd">${sarEsc(t)}</div>${sarMatrix('std' + i, items, lv5, ['5', '4', '3', '2', '1'])}<div class="u-note" id="sar-std-${i}"></div></div>`).join('')}`)}

    ${sec('ผู้ลงนามรับรอง', `
      <div class="u-note">ท้ายรายงานมีผู้รับรอง 4 ระดับ: หัวหน้ากลุ่มสาระฯ (ดึงจากข้อมูลส่วนตัว) → ผู้ช่วยผู้อำนวยการกลุ่มบริหารงานบุคคล → รองผู้อำนวยการกลุ่มบริหารงานบุคคล → ผู้อำนวยการ (ดึงจากข้อมูลส่วนตัว) · เว้นว่างได้ จะพิมพ์เป็นเส้นจุดให้เขียนชื่อเอง</div>
      <div class="doc-form-meta u-mt-12">${sarFld('ผู้ช่วยผู้อำนวยการกลุ่มบริหารงานบุคคล', sarIn('sgAsst', f.sgAsst))}${sarFld('รองผู้อำนวยการกลุ่มบริหารงานบุคคล', sarIn('sgDeputy', f.sgDeputy))}</div>`)}

    ${sec('บันทึกข้อความและภาคผนวก', `
      <div class="u-note">ท้ายเล่มพิมพ์หน้าภาคผนวก (หัวข้อ เกียรติบัตร · ภาพประกอบกิจกรรม · อื่นๆ — แนบเอกสารเองหลังพิมพ์) และบันทึกข้อความนำส่งรายงาน · ที่/วันที่ เว้นว่าง = เส้นจุดให้เขียนเอง</div>
      <div class="doc-form-meta u-mt-12">${sarFld('ที่ (เลขหนังสือ)', sarIn('memoNo', f.memoNo, 'เช่น 12/2569'))}${sarFld('วันที่', sarIn('memoDate', f.memoDate, 'เช่น 16 มีนาคม 2569'))}</div>
      <div class="doc-checks u-mt-12"><label class="doc-check"><input type="checkbox" data-f="noApx"${f.noApx ? ' checked' : ''}> ไม่พิมพ์หน้าภาคผนวก</label><label class="doc-check"><input type="checkbox" data-f="noMemo"${f.noMemo ? ' checked' : ''}> ไม่พิมพ์บันทึกข้อความ</label></div>`)}

    <div class="pa-form-footer">
      ${SAR.docId ? `<button type="button" class="btn btn-danger-ghost" id="sar-del-btn">${DOC_ICO_DEL} ลบ</button>` : ''}
      <button type="button" class="btn btn-ghost" id="sar-print-btn">${DOC_ICO_PRINT} พิมพ์</button>
      <button type="button" class="btn btn-ghost" id="sar-cancel-btn">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="sar-save-btn">บันทึก SAR</button>
    </div>
  </form>`;
  docSwapIn(root);
  const form = document.getElementById('sar-form');
  if (typeof badworkAiMount === 'function' && typeof sarAiSys === 'function') { badworkAiMount(root, form, sarAiSys()); sarAiAttach(form, sarAiSys()); } // ปุ่มผู้ช่วย AI ส่วนที่ 2 (js/badwork-ai.js + ตัวต่อ js/sar-ai.js) — ไม่มีไฟล์นี้ฟอร์มก็ทำงานตามเดิม
  const update = () => { sarCollect(); sarCalc(); };
  form.querySelector('#sar-preface-fill')?.addEventListener('click', () => {
    const ta = form.querySelector('#sar-preface');
    if (ta.value.trim() && !confirm('แทนที่คำนำที่พิมพ์ไว้ด้วยข้อความมาตรฐาน?')) return;
    ta.value = sarPrefaceDefault(SAR.doc, pi);
    sarCollect();
  });
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('click', e => {
    const add = e.target.closest('[data-add]'), del = e.target.closest('.sar-del');
    if (add) { form.querySelector(`tbody[data-rows="${add.dataset.add}"]`).insertAdjacentHTML('beforeend', sarRowHtml(add.dataset.add)); update(); }
    if (del) { const tb = del.closest('tbody'); if (tb.rows.length > 1) del.closest('tr').remove(); else del.closest('tr').querySelectorAll('input').forEach(i => { i.value = ''; }); update(); }
  });
  sarCalc();

  document.getElementById('sar-cs-pull')?.addEventListener('click', async () => {
    sarCollect();
    const has = ['teaching', 'activities', 'grades'].some(k => (d.rows[k] || []).some(r => Object.values(r).some(Boolean)));
    if (has && !confirm('แทนที่ภาระสอน กิจกรรม และตารางผลการเรียนที่กรอกไว้ ด้วยข้อมูลจากรายวิชา + ตารางสอน?')) return;
    const btn = document.getElementById('sar-cs-pull');
    btn.disabled = true;
    try {
      const r = await sarPullCourses(d);
      if (!r.found) { showToast(`ไม่พบรายวิชาหรือตารางสอนภาคเรียนที่ ${d.semester} ปี ${d.year} — ตรวจภาคเรียน/ปีของรายวิชา`); return; }
      if (stillHere()) {
        await sarRenderFormView();
        showToast(`ดึงแล้ว: สอน ${r.teach} แถว · กิจกรรม ${r.act} แถว${r.noTimetable ? ' · ยังไม่มีตารางสอนภาคนี้ (ชั่วโมงคิดจากหน่วยกิต)' : ''}${r.noHours ? ` · ${r.noHours} แถวยังไม่มีชั่วโมง` : ''}${r.noN ? ` · ${r.noN} แถวยังไม่มีจำนวนนักเรียน` : ''}${r.noScore ? ` · ${r.noScore} ห้องยังไม่มีคะแนน` : ''}`);
      }
    } catch (e) { showToast('ดึงข้อมูลรายวิชาไม่สำเร็จ: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });
  document.getElementById('sar-rec-pull')?.addEventListener('click', async () => {
    sarCollect();
    const filled = k => (d.rows[k] || []).some(r => Object.values(r).some(Boolean));
    if ((filled('training') || filled('awards')) && !confirm('แทนที่ตารางการอบรม (3.1) และรางวัล (4) ที่กรอกไว้ ด้วยข้อมูลจากข้อมูลส่วนตัว? (ตารางที่ในข้อมูลส่วนตัวไม่มีรายการ จะไม่ถูกแตะ)')) return;
    const btn = document.getElementById('sar-rec-pull');
    btn.disabled = true;
    try {
      const r = await sarPullRecords(d);
      if (r.bad) { showToast('ปีการศึกษาไม่ถูกต้อง — ตรวจช่องปีการศึกษาด้านบน'); return; }
      if (!r.train && !r.award) { showToast(`ไม่พบอบรม/เกียรติบัตร/รางวัลของปีการศึกษา ${r.year} ในข้อมูลส่วนตัว`); return; }
      if (stillHere()) { await sarRenderFormView(); showToast(`ดึงแล้ว: อบรม ${r.train} รายการ · เกียรติบัตร/รางวัล ${r.award} รายการ (ปีการศึกษา ${r.year}) · ตรวจว่าอยู่ในช่วงรายงาน`); }
    } catch (e) { showToast('ดึงข้อมูลไม่สำเร็จ: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });
  document.getElementById('sar-goto-profile')?.addEventListener('click', () => { sarCollect(); navigate('profile'); });
  document.getElementById('sar-goto-logo')?.addEventListener('click', () => { sarCollect(); navigate('profile'); });
  ['sar-back-btn', 'sar-cancel-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => { sarCollect(); SAR.view = 'list'; sarRenderListView(); }));
  document.getElementById('sar-print-btn')?.addEventListener('click', () => { sarCollect(); SAR.previewId = SAR.docId; docSwitchTab('sarprev'); });
  document.getElementById('sar-save-btn')?.addEventListener('click', async () => {
    sarCollect();
    const btn = document.getElementById('sar-save-btn');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try { await sarSave(d); SAR.list = null; showToast('บันทึกแล้ว'); }
    catch (e) { showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
    btn.disabled = false; btn.textContent = 'บันทึก SAR';
  });
  document.getElementById('sar-del-btn')?.addEventListener('click', async () => {
    if (!confirm('ลบ SAR นี้?')) return;
    try {
      await sarCol(AppState.user.uid).doc(SAR.docId).delete();
      SAR.docId = null; SAR.doc = null; SAR.list = null; SAR.view = 'list';
      sarRenderListView();
    } catch (e) { showToast('ลบไม่สำเร็จ: ' + e.message, 'error'); }
  });
}

// ---------------- รายการ ----------------
async function sarRenderListView() {
  const sys = docSystem(), root = docMount(), seq = sys.state.seq;
  docShowLoading(root);
  try {
    if (!SAR.list) SAR.list = await sarLoadList();
    if (docStale(root, seq, sys) || sys.state.tab !== 'sar' || SAR.view !== 'list') return;
    const list = SAR.list;
    root.innerHTML = docListHtml({
      list, icon: IDP_ICO_DOC, hue: 'blue', title: sarTitle, sub: d => idpUpdatedAt(d), actions: ['print', 'dup', 'edit', 'del'],
      emptyTitle: 'ยังไม่มี SAR', emptySub: 'กดปุ่มด้านล่างเพื่อสร้างรายงานผลการปฏิบัติงานและการประเมินตนเอง (SAR)', newLabel: 'สร้าง SAR ใหม่',
    });
    docSwapIn(root);
    const open = (id, dup) => {
      const found = list.find(x => x.id === id);
      if (!found) return null;
      const d = sarNormalize(JSON.parse(JSON.stringify(found)));
      if (dup) { ['id', 'createdAt', 'updatedAt'].forEach(k => delete d[k]); d.status = 'draft'; }
      return d;
    };
    const edit = (id, dup) => {
      const d = open(id, dup); if (!d) return;
      SAR.docId = dup ? null : id; SAR.doc = d; SAR.view = 'form';
      sarRenderFormView();
      if (dup) showToast('คัดลอกแล้ว — แก้ไขแล้วกด “บันทึก” จะได้เป็นฉบับใหม่');
    };
    docBindList(root, {
      create: () => { SAR.docId = null; SAR.doc = sarNormalize({}); SAR.view = 'form'; sarRenderFormView(); },
      open: id => edit(id), edit: id => edit(id), dup: id => edit(id, true),
      print: id => { SAR.previewId = id; docSwitchTab('sarprev'); },
      del: async id => { await sarCol(AppState.user.uid).doc(id).delete(); SAR.list = null; await sarRenderListView(); },
    });
  } catch (e) {
    if (!root.isConnected) return;
    docSwapIn(root);
    root.innerHTML = `<div class="doc-error">โหลดรายการไม่สำเร็จ: ${sarEsc(e.message)}</div>`;
  }
}

function sarRenderView() {
  if (SAR.view === 'form') return sarRenderFormView();
  return sarRenderListView();
}
function sarBeforeLeave() { if (SAR.view === 'form') sarCollect(); }

// ---------------- CSS / HTML ต้นฉบับ (ใช้ร่วมกันระหว่างพิมพ์และตัวอย่างบนจอ) ----------------
const SAR_PRINT_CSS = `
@page{size:A4 portrait;margin:1.6cm 1.4cm}
body{font-family:'TH SarabunPSK','TH Sarabun PSK','THSarabunPSK','TH Sarabun New','PA Sarabun','Noto Sans Thai',Tahoma,sans-serif;font-size:14pt;line-height:1.3}
h1,h2,h3{margin:.6em 0 .2em}h1{font-size:18pt;text-align:center}h2{font-size:15pt}h3{font-size:14pt}h3.l1{font-size:15pt}h3.l3{margin-left:.8cm}h3.l4{margin-left:1.6cm}h3 .nt{font-weight:400}
table{border-collapse:collapse;width:100%;margin:.3em 0}th,td{border:1px solid #000;padding:2px 5px;vertical-align:top}th{text-align:center}.c{text-align:center}.sg{margin:2em 0 0 auto;width:9cm;text-align:center;break-inside:avoid}p{margin:.2em 0}
section{break-after:page}section:last-child{break-after:auto}
.sar-logo{display:block;width:3.4cm;height:auto;margin:0 auto .6cm}
.sar-cv-t{text-align:center;font-size:20pt;line-height:1.5}.sar-cv-t:first-child{margin-top:3.2cm}.sar-logo+.sar-cv-t{margin-top:0}
.sar-cv-by,.sar-cv-sc{text-align:center;font-size:20pt;line-height:1.6}.sar-cv-by{margin-top:6.5cm}.sar-cv-sc{margin-top:5cm}
.sar-pf-h{text-align:center;font-size:22pt;font-weight:700;margin:1.2cm 0 .8cm}
.sar-pf-p{text-indent:2cm;text-align:justify;font-size:16pt;line-height:1.5;margin:0 0 .5em}
.sar-pf-sg{text-align:right;font-size:16pt;margin:1.5cm 1.5cm 0 0}
.sar-p1h{text-align:center;font-weight:700;font-size:16pt;margin:.5em 0 .3em}.sar-note{margin:.3em 0 .6em}.sar-note p{margin:.1em 0}.sar-small{font-size:12pt}
.sar-memo-h{text-align:center;font-size:22pt;font-weight:700;margin:.4cm 0 .6cm}.sar-memo p{font-size:16pt;line-height:1.4}.sgm{margin:.9em 0 0 auto;width:9cm;text-align:center;break-inside:avoid;font-size:14pt}.sgm .l{text-align:left}.sgm .dl{border-bottom:1px dotted #000;height:1.15em}.sar-apx p{font-size:16pt;margin:.4em 0 .4em 3cm}
.bx{display:inline-block;width:.38cm;height:.38cm;border:1px solid #000;text-align:center;line-height:.36cm;font-size:11pt;vertical-align:middle;margin:0 .15cm 0 .3cm}.ck{white-space:nowrap}
table.nb th,table.nb td{border:0;padding:1px 5px}.sg .l{text-align:left}.sg .dl{border-bottom:1px dotted #000;height:1.15em}`;

// สร้าง HTML เนื้อหา SAR (ใช้ทั้งตอนพิมพ์และตอนแสดงตัวอย่างบนจอ)
function sarBuildBodyHtml(d, prof) {
  const pi = idpProfileInfo(prof), s = sarStats(d), f = d.f || {}, R = d.rows || {}, L = d.lv || {}, ps = sarPersonal(prof, f);
  const E = sarEsc, cell = v => (v === '' || v == null ? '' : E(v));
  // seq = หัวคอลัมน์เลขลำดับ ("ที่" / "ครั้งที่") — เติมคอลัมน์แรกให้ตอนพิมพ์เท่านั้น ไม่ได้เก็บในข้อมูล
  const hh = (key, c) => (SAR_PRINT_HEAD[key] || {})[c[0]] || c[1];
  const tbl = (key, extra, seq) => `<table><tr>${seq ? `<th>${seq}</th>` : ''}${sarCols(key).map(c => `<th>${E(hh(key, c))}</th>`).join('')}</tr>${(R[key] || []).filter(r => Object.values(r).some(Boolean)).map((r, i) => `<tr>${seq ? `<td class="c">${i + 1}</td>` : ''}${sarCols(key).map(([c]) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}${extra || ''}</table>`;
  // ตารางติ๊กระดับ · heads = หัวคอลัมน์ (ค่าเริ่มต้น = ตัวเลขระดับ) · o.first = หัวคอลัมน์แรก · o.span = หัวกลุ่มของคอลัมน์ระดับ · o.seq = คอลัมน์ "ที่" แยก · o.num = ใส่เลขข้อนำหน้า
  const mx = (group, items, levels, heads, o = {}) => {
    const cur = L[group] || [], hs = (heads || levels).map(l => `<th>${l}</th>`).join('');
    const first = o.seq ? `<th>ที่</th><th>${E(o.first || 'รายการ')}</th>` : `<th${o.span ? ' rowspan="2"' : ''}>${E(o.first || 'รายการ')}</th>`;
    const head = o.span ? `<tr>${first}<th colspan="${levels.length}">${E(o.span)}</th></tr><tr>${hs}</tr>` : `<tr>${first}${hs}</tr>`;
    return `<table>${head}${items.map((t, i) => `<tr>${o.seq ? `<td class="c">${i + 1}</td>` : ''}<td>${E(o.num ? `${i + 1}. ${t}` : t)}</td>${levels.map(l => `<td class="c">${cur[i] === l ? '✓' : ''}</td>`).join('')}</tr>`).join('')}</table>`;
  };
  // 1.6: ดัชนีชี้วัด (พร้อมจำนวนข้อต่อระดับ) · ระดับคุณภาพ 4–1 · เกณฑ์การประเมินรายข้อ (ตามตัวอย่าง)
  const planTbl = () => `<table><tr><th rowspan="2">ดัชนีชี้วัด</th><th colspan="4">ระดับคุณภาพ</th><th rowspan="2">เกณฑ์การประเมิน</th></tr><tr>${[4, 3, 2, 1].map(l => `<th>${l}</th>`).join('')}</tr>
  ${SAR_PLAN.map((t, i) => `<tr><td>${i + 1}. ${E(t)}<br><span class="sar-small">${E(SAR_PLAN_NOTE)}</span></td>${[4, 3, 2, 1].map(l => `<td class="c">${(L.plan || [])[i] === l ? '✓' : ''}</td>`).join('')}<td class="sar-small">${SAR_PLAN_CRIT[i].map((c, j) => `${j + 1}. ${E(c)}`).join('<br>')}</td></tr>`).join('')}</table>`;
  const bx = on => `<span class="bx">${on ? '✓' : ''}</span>`;
  const chk = (opts, cur) => opts.map(o => `<span class="ck">${bx(o === cur)}${E(o)}</span>`).join(' ');
  // หัวข้อพิมพ์ครบเสมอแม้ช่องว่าง (ตามตัวอย่าง) · lv = ระดับหัวข้อ 1/2/3/4 → <h3 class="lN"> (ขนาด/เยื้องใน SAR_PRINT_CSS)
  const hd = (lv, t, note = '') => `<h3 class="l${lv}">${E(t)}${note ? ` <span class="nt">${E(note)}</span>` : ''}</h3>`;
  const narr = k => { const n = SAR_NARR.find(x => x[0] === k); return hd(n[2], n[1]) + (f[k] ? `<p>${docNl(f[k])}</p>` : ''); };
  const sy = `ภาคเรียนที่ ${d.semester} ปีการศึกษา ${d.year}`, per = f.period ? `(${f.period})` : '';
  const attK = ['late', 'sick', 'biz', 'ord', 'mat'], attT = ['มาสาย', 'ลาป่วย', 'ลากิจ', 'ลาอุปสมบท', 'ลาคลอด'];
  const dash = v => (v ? String(v) : '-');
  // กลุ่ม "จำนวน" = ที่กรอกในช่วงเวลารายงาน (แถวช่วงเวลาคั่นก่อน) · กลุ่ม "รวม" = ผลรวม (มีช่วงเดียวจึงเท่ากัน) — ตามตัวอย่างไม่มีแถวรวมท้ายตาราง
  const at = (f.period ? `<tr><td colspan="5">${E(f.period)}</td></tr>` : '')
    + attK.map((k, i) => `<tr><td>${attT[i]}</td><td class="c">${cell(f.at?.[k + 'T']) || '-'}</td><td class="c">${cell(f.at?.[k + 'D']) || '-'}</td><td class="c">${dash(sarNum(f.at?.[k + 'T']))}</td><td class="c">${dash(sarNum(f.at?.[k + 'D']))}</td></tr>`).join('');
  const fxFmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1)); // fx = จำนวน × ระดับ (3.5 / 2.5 / 1.5 ทำให้มีทศนิยม .5)
  const gr = s.gradeTot, hasG = (R.grades || []).length > 0;
  // ตารางผลการเรียน (พิมพ์) ตามตัวอย่าง: ห้อง · N · 4…0 · รวม (n) · ร · มส. · เฉลี่ย · วิชา (ท้ายแถว) · แถว รวม (f) / รวม (fx = จำนวน × ระดับ) / เฉลี่ย
  const gTable = () => `<table><tr><th rowspan="3">ห้อง</th><th rowspan="3">จำนวนนักเรียนทั้งหมด (N)</th><th colspan="11">จำนวนนักเรียน (คน)</th><th rowspan="3">ผลการเรียนเฉลี่ย</th><th rowspan="3">วิชา</th></tr>
  <tr><th colspan="7">ผ่านการประเมิน (X)</th><th>ไม่ผ่านการประเมิน</th><th rowspan="2">รวม (n)</th><th rowspan="2">ร</th><th rowspan="2">มส.</th></tr>
  <tr>${SAR_G.map(g => `<th>${g[1]}</th>`).join('')}</tr>
  ${(R.grades || []).map((r, i) => `<tr><td>${cell(r.room)}</td><td class="c">${cell(r.n)}</td>${SAR_G.map(([k]) => `<td class="c">${cell(r[k]) || '-'}</td>`).join('')}<td class="c">${s.rowG[i].all || ''}</td><td class="c">${cell(r.r) || '-'}</td><td class="c">${cell(r.ms) || '-'}</td><td class="c">${s.rowG[i].c ? sarFmt(s.rowG[i].avg) : ''}</td><td>${cell(r.name)}</td></tr>`).join('')}
  ${hasG ? `<tr><th>รวม (f)</th><th>${gr.n}</th>${SAR_G.map(([k]) => `<th>${gr[k]}</th>`).join('')}<th>${s.gt.all}</th><th>${gr.r}</th><th>${gr.ms}</th><th></th><th></th></tr>
  <tr><th>รวม (fx)</th><th></th>${SAR_G.map(([k, w]) => `<th>${fxFmt(gr[k] * w)}</th>`).join('')}<th>${fxFmt(SAR_G.reduce((a, [k, w]) => a + gr[k] * w, 0))}</th><th></th><th></th><th></th><th></th></tr>
  <tr><th>เฉลี่ย</th><th colspan="14">${s.gt.c ? sarFmt(s.gt.avg) : ''}</th></tr>` : ''}</table>`;
  // คุณลักษณะอันพึงประสงค์: คอลัมน์ "คุณลักษณะอันพึงประสงค์" เป็นช่องรวมทุกแถว ใส่ 8 ข้อ · ผลประเมิน 4 ระดับต่อห้อง · แถวรวมท้ายตาราง
  const trRows = (R.traits || []).filter(r => Object.values(r).some(Boolean)), trSum = k => trRows.reduce((a, r) => a + sarNum(r[k]), 0);
  const trT = () => `<table><tr><th rowspan="2">ชั้น</th><th rowspan="2">จำนวนนักเรียน</th><th rowspan="2">คุณลักษณะอันพึงประสงค์</th><th colspan="4">ผลการประเมิน (คน/ร้อยละ)</th></tr><tr><th>ดีเยี่ยม 3</th><th>ดี 2</th><th>ผ่าน 1</th><th>ไม่ผ่าน 0</th></tr>
  ${(trRows.length ? trRows : [{}]).map((r, i) => `<tr><td>${cell(r.room)}</td><td class="c">${cell(r.n)}</td>${i === 0 ? `<td rowspan="${trRows.length || 1}">${SAR_TRAITS8.map((t, j) => `${j + 1}. ${E(t)}`).join('<br>')}</td>` : ''}${['g3', 'g2', 'g1', 'g0'].map(k => `<td class="c">${cell(r[k])}</td>`).join('')}</tr>`).join('')}
  ${trRows.length ? `<tr><th>รวม</th><th>${s.traitN}</th><th></th>${['g3', 'g2', 'g1', 'g0'].map(k => `<th>${trSum(k) || ''}</th>`).join('')}</tr>` : ''}</table>`;
  // ส่วนที่ 3: ตารางเดียวต่อมาตรฐาน · มาตรฐานที่ 1 แบ่งกลุ่ม 1.1 / 1.2 (แถวหัวกลุ่ม · ข้อเรียง 1) 2) …) · แถว "คะแนนรวม" ท้ายตารางแยกตามระดับ (ระดับ × จำนวนข้อที่ติ๊ก)
  const stdTbl = (t, items, i) => {
    const cur = L['std' + i] || [], lv = [5, 4, 3, 2, 1];
    const row = (txt, idx) => `<tr><td>${E(txt)}</td>${lv.map(l => `<td class="c">${cur[idx] === l ? '✓' : ''}</td>`).join('')}</tr>`;
    const grp = items.every(x => /^\d+\.\d+ \(\d+\) /.test(x)) ? items.map(x => x.match(/^(\d+\.\d+) \((\d+)\) (.*)$/)) : null;
    const body = grp
      ? [...new Set(grp.map(m => m[1]))].map(k => `<tr><td colspan="6"><b>${E(SAR_STD_GRP[k] || k)}</b></td></tr>${grp.map((m, idx) => (m[1] === k ? row(`${m[2]}) ${m[3]}`, idx) : '')).join('')}`).join('')
      : items.map((x, idx) => row(x, idx)).join('');
    const tot = lv.map(l => { const n = cur.slice(0, items.length).filter(v => v === l).length; return `<th>${n ? n * l : ''}</th>`; }).join('');
    return `${hd(2, t)}<table><tr><th rowspan="2">ตัวบ่งชี้</th><th colspan="5">ระดับคุณภาพตัวบ่งชี้/มาตรฐาน</th></tr><tr>${lv.map(l => `<th>${l}</th>`).join('')}</tr>${body}<tr><th>คะแนนรวม</th>${tot}</tr></table>`;
  };
  // บันทึกข้อความนำส่งรายงาน (ท้ายเล่มตามตัวอย่าง) · ผู้ให้ความเห็น 4 ระดับใช้ SAR_SIGN ชุดเดียวกับท้ายรายงาน · ที่/วันที่ เว้นว่าง = เส้นจุด
  const memo = () => {
    const dots = '………………', pos = ps.position || pi.position;
    return `<section class="sar-memo"><div class="sar-memo-h">บันทึกข้อความ</div>
    <p><b>ส่วนราชการ</b> ${E(pi.school)}${sarAddr(f) ? ' ' + E(sarAddr(f)) : ''}</p>
    <p><b>ที่</b> ${E(f.memoNo || dots)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>วันที่</b> ${E(f.memoDate || dots)}</p>
    <p><b>เรื่อง</b> รายงานผลการปฏิบัติงานภาคเรียนที่ ${E(d.semester)} ประจำปีการศึกษา ${E(d.year)}</p>
    <p><b>เรียน</b> ผู้อำนวยการ${E(pi.school)}</p>
    <p class="sar-pf-p">ด้วยข้าพเจ้า ${E(pi.name)} ตำแหน่ง ${E(pos)} ${E(pi.school)} ได้รับมอบหมายให้ปฏิบัติงานต่าง ๆ ในภาคเรียนที่ ${E(d.semester)} ประจำปีการศึกษา ${E(d.year)} ซึ่งข้าพเจ้าได้ปฏิบัติหน้าที่ที่ได้รับมอบหมายด้วยความมุ่งมั่น ตั้งใจ มีความรับผิดชอบ เสียสละกำลังกาย กำลังใจ และสติปัญญา ทำให้งานมีประสิทธิภาพและประสิทธิผล ก่อให้เกิดผลดีแก่นักเรียน สถานศึกษา และชุมชน จึงเสนอรายงานผลการปฏิบัติงานตามรายละเอียดแนบท้ายหนังสือนี้</p>
    <p class="sar-pf-p">จึงเรียนมาเพื่อโปรดทราบ</p>
    <div class="sgm">ลงชื่อ ……………………………… ผู้รายงาน<br>(${E(pi.name)})<br>ตำแหน่ง ${E(pos)}</div>
    ${SAR_SIGN.map(([t, who]) => `<div class="sgm"><div class="l">ความเห็นของ${E(t(pi))}</div><div class="dl"></div><div>ลงชื่อ ………………………………</div>(${E(who(f, prof) || '………………………')})</div>`).join('')}
    </section>`;
  };
  // ลำดับตามตัวอย่าง SAR-2-2568: ส่วนที่ 1 → ส่วนที่ 2 (1. การเรียนการสอน [1.1 → 1.2.1–1.2.7 → 1.6 → 1.3–1.5] · 2. ชั้นเรียน · 3. พัฒนาตนเอง · 4. รางวัล · 5. งานอื่น · 6. แนวทาง) → ส่วนที่ 3
  return `
  <section>
    ${pi.logo || f.logo ? `<img class="sar-logo" src="${E(pi.logo || f.logo)}" alt="">` : ''}
    <div class="sar-cv-t">รายงานผลการปฏิบัติงานและการประเมินตนเองรายบุคคล</div>
    <div class="sar-cv-t">Self - Assessment Report : SAR</div>
    <div class="sar-cv-t">${sy}</div>
    <div class="sar-cv-by">จัดทำโดย<br>${E(pi.name)}<br>ตำแหน่ง ${E(ps.position || pi.position)}</div>
    <div class="sar-cv-sc">${E(pi.school)}${sarAddr(f) ? `<br>${E(sarAddr(f))}` : ''}${pi.affiliation ? `<br>${E(pi.affiliation)}` : ''}</div>
  </section>
  <section>
    <div class="sar-pf-h">คำนำ</div>
    ${(f.preface && f.preface.trim() ? f.preface : sarPrefaceDefault(d, pi)).split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p class="sar-pf-p">${docNl(p.trim())}</p>`).join('')}
    <div class="sar-pf-sg">${E(pi.name)}</div>
  </section>
  <section>
  <h2>${E(SAR_H.p1)}</h2>
  <div class="sar-p1h">${E(SAR_P1_TITLE)}</div>
  ${SAR_P1_INTRO.map(t => `<p class="sar-pf-p">${E(t)}</p>`).join('')}
  ${hd(2, SAR_H.s11)}
  <p>ชื่อ ${E(pi.name)} กลุ่มสาระการเรียนรู้ ${E(pi.subjectGroup)} อายุ ${E(ps.age)} ปี อายุราชการ ${E(ps.svcY)} ปี ${E(ps.svcM)} เดือน คุณวุฒิสูงสุด ${E(ps.degree)} วิชาเอก ${E(ps.major)} จาก ${E(ps.inst)} ตำแหน่ง ${E(ps.position || pi.position)} วิทยฐานะ ${E(ps.rank)} ตำแหน่งเลขที่ ${E(ps.posNo)} สถานศึกษา ${E(pi.school)}${sarAddr(f) ? ' ' + E(sarAddr(f)) : ''}${pi.affiliation ? ' ' + E(pi.affiliation) : ''} ส่วนราชการ ${E(f.agency || SAR_AGENCY_DEFAULT)}</p>
  ${hd(2, SAR_H.s12)}
  ${hd(3, `${SAR_H.teach}${sy}`)}${tbl('teaching', `<tr><th colspan="3">รวม</th><th>${s.teachN}</th><th>${sarFmt(s.teachHours, 1)}</th></tr>`, 'ที่')}
  ${hd(3, `${SAR_H.act}${sy}`)}${tbl('activities', `<tr><th colspan="3">รวม</th><th></th><th>${sarFmt(s.actHours, 1)}</th></tr>`, 'ที่')}
  ${hd(3, SAR_H.home)}<table><tr><th rowspan="2">ชั้น / ห้อง</th><th colspan="2">จำนวนนักเรียน</th><th rowspan="2">รวมทั้งสิ้น (คน)</th></tr><tr><th>ชาย (คน)</th><th>หญิง (คน)</th></tr><tr><td class="c">${E(f.hmCls)}</td><td class="c">${cell(f.hmM) || '-'}</td><td class="c">${cell(f.hmF) || '-'}</td><td class="c">${s.homeN}</td></tr></table>
  ${hd(3, `${SAR_H.attend}${per}`)}<table><tr><th rowspan="2">ประเภท</th><th colspan="2">จำนวน</th><th colspan="2">รวม</th></tr><tr><th>ครั้ง</th><th>วัน</th><th>ครั้ง</th><th>วัน</th></tr>${at}</table>
  <h2>${E(SAR_H.p2)}</h2>
  ${hd(1, SAR_H.g1, SAR_H.g1note)}
  ${narr('n11')}
  ${hd(2, SAR_H.l12)}
  ${narr('n121')}${narr('n122')}${narr('n123')}
  ${hd(3, SAR_H.q124)}
  ${hd(4, SAR_H.acad)}
  ${gTable()}
  <p>ร้อยละของนักเรียนที่ได้รับผลการเรียน 3 ขึ้นไป ${sarFmt(s.pHigh)}</p>
  <p>ร้อยละของนักเรียนที่ได้รับผลการเรียน 1-2.5 ${sarFmt(s.pMid)}</p>
  <p>ร้อยละของนักเรียนที่ได้ผลการเรียน 0, ร, มส ${sarFmt(s.pLow)}</p>
  ${hd(4, SAR_H.trait)}${trT()}
  ${hd(3, SAR_H.meth)}<table class="nb">${Array.from({ length: Math.ceil(SAR_METHODS.length / 2) }, (_, r) => `<tr>${[2 * r, 2 * r + 1].map(i => (i < SAR_METHODS.length ? `<td>${bx(f.m?.[i])}${E(SAR_METHODS[i])}</td>` : '<td></td>')).join('')}</tr>`).join('')}</table>
  <p>อื่น ๆ ระบุ ${E(f.mOther || '……………………………')}<br>สรุป จำนวนรูปแบบ / วิธีการจัดกิจกรรมการเรียนการสอนที่ครูใช้ ${s.methodN + (f.mOther ? 1 : 0)} วิธี</p>
  ${hd(3, SAR_H.cond)}${mx('cond', SAR_COND, [5, 4, 3, 2, 1], SAR_RATE5, { seq: true, first: 'รายการปฏิบัติ' })}
  ${hd(3, SAR_H.survey)}${mx('survey', SAR_SURVEY, [5, 4, 3, 2, 1], SAR_RATE5, { first: 'กิจกรรม', span: 'ระดับการประเมิน', num: true })}<p>จากผลการประเมินการสอนของครูโดยนักเรียน พบว่าอยู่ในระดับ ${chk(SAR_RATE5, s.svLabel)}</p>
  ${hd(2, SAR_H.plan)}${planTbl()}<p>สรุป : การจัดทำแผนการจัดการเรียนรู้นี้ อยู่ในระดับคุณภาพ ${s.plLabel}</p>
  <div class="sar-note sar-small"><b>เกณฑ์การตัดสิน</b>${SAR_PLAN_JUDGE.map(t => `<p>${E(t)}</p>`).join('')}</div>
  ${narr('n13')}${narr('n14')}${narr('n15')}
  ${hd(1, SAR_H.g2)}
  ${narr('n21')}${narr('n22')}
  ${hd(1, SAR_H.g3, per)}
  ${hd(2, SAR_H.s31)}${tbl('training', `<tr><th colspan="5">รวม</th><th>${sarFmt(s.trainHours, 1)}</th></tr>`, 'ครั้งที่')}
  ${hd(2, SAR_H.s32)}${f.plc ? `<p>${E(f.plc)}</p>` : ''}
  ${hd(1, SAR_H.g4)}${tbl('awards', '', 'ที่')}
  ${hd(1, SAR_H.g5)}
  ${SAR_DUTY.map((t, i) => `${hd(2, t)}${(R['duty' + i] || []).filter(r => r.name).map((r, j) => `<p>5.${i + 1}.${j + 1} ${E(r.name)}</p>`).join('')}<p>สรุปได้ว่า ระดับคุณภาพการปฏิบัติงาน ${chk(SAR_DQ, f['dq' + i])}</p>`).join('')}
  ${hd(1, sarNarr('guide'))}${f.guide ? `<p>${docNl(f.guide)}</p>` : ''}
  <h2>${E(SAR_H.p3)}</h2>
  <div class="sar-note"><b>คำชี้แจง</b>${SAR_P3_GUIDE.map((t, i) => `<p>${i + 1}. ${E(t.replace('{school}', pi.school || 'สถานศึกษา'))}</p>`).join('')}<p>${SAR_P3_GUIDE.length + 1}. เกณฑ์การตัดสิน</p>${SAR_P3_JUDGE.map(t => `<p>&nbsp;&nbsp;&nbsp;&nbsp;${E(t)}</p>`).join('')}</div>
  ${SAR_STD.map(([t, items], i) => `${stdTbl(t, items, i)}<p>สรุปผลการประเมินมาตรฐานที่ ${i + 1} (คะแนนรวมทั้งหมด/${s.std[i].total}) ${s.std[i].answered ? sarFmt(s.std[i].avg) : '—'}<br>ระดับคุณภาพ ${s.std[i].label}</p>`).join('')}
  <p>ข้าพเจ้าขอรับรองว่าข้อมูลที่ได้ประเมินตนเองทั้งหมดถูกต้องตรงตามเอกสารหลักฐานที่มีอยู่จริง</p>
  <div class="sg">ลงชื่อ ……………………………… ผู้รายงาน<br>(${E(pi.name)})<br>ตำแหน่ง ${E(pi.position)}</div>
  ${SAR_SIGN.map(([t, who, dir]) => `<div class="sg"><div class="l">${dir ? 'ความเห็น' : 'ได้ตรวจสอบแล้วรับรองข้อมูลถูกต้องและเป็นจริง'}</div><div class="dl"></div><div class="dl"></div><div>ลงชื่อ ……………………………… ผู้รับรอง</div>(${E(who(f, prof) || '………………………')})<br>ตำแหน่ง ${E(t(pi))}</div>`).join('')}
  </section>
  ${f.noApx ? '' : `<section class="sar-apx"><div class="sar-pf-h">ภาคผนวก</div><p>1. เกียรติบัตร</p><p>2. ภาพประกอบกิจกรรม</p><p>3. อื่นๆ</p></section>`}
  ${f.noMemo ? '' : memo()}`;
}

async function sarPrint(d) {
  const prof = await idpGetProfile();
  const html = sarBuildBodyHtml(d, prof);
  return docPrintWindow({ title: sarTitle(d), css: SAR_PRINT_CSS, html });
}

// ---------------- ตัวอย่าง/พิมพ์บนจอ (docRenderPreview) — แท็บ 'sarprev' ต่อจากแท็บ 'sar' ----------------
const SAR_SHEET = { port: { w: 210, h: 297, pad: [16, 14, 16, 14], label: 'A4 แนวตั้ง' } };

async function sarRenderPreviewView(pickId) {
  const sys = docSystem();
  return docRenderPreview({
    sys, tab: 'sarprev',
    load: async () => {
      const open = SAR.view === 'form' ? SAR.doc : null;
      let list = [];
      try { list = await sarLoadList(); } catch (e) { /* โหลดรายการไม่ได้ → ดูได้เฉพาะรายงานที่เปิดอยู่ */ }
      const openKey = open ? (SAR.docId || '__open__') : null;
      const items = [];
      if (open) items.push({ id: openKey, label: `${sarTitle(open)} · ${SAR.docId ? 'กำลังแก้ไข' : 'ฉบับที่ยังไม่บันทึก'}` });
      list.filter(x => x.id !== openKey).forEach(x => items.push({ id: x.id, label: sarTitle(x) }));
      if (!items.length) return { items };
      const pid = items.some(x => x.id === pickId) ? pickId : items[0].id;
      const d = pid === openKey ? open : sarNormalize(JSON.parse(JSON.stringify(list.find(x => x.id === pid))));
      const profile = await idpGetProfile();
      return { items, pickId: pid, d, open, openKey, profile };
    },
    selectLabel: 'เลือก SAR',
    empty: { icon: IDP_ICO_DOC, title: 'ยังไม่มี SAR', sub: 'สร้างรายงานผลการปฏิบัติงานก่อน แล้วดูตัวอย่างและพิมพ์ที่นี่', gotoLabel: 'ไปที่แบบฟอร์ม', gotoTab: 'sar' },
    hint: () => 'ตัวอย่าง SAR แบบ A4 แนวตั้ง — กด "พิมพ์ / บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้',
    sheets: ctx => ({
      html: () => docSheetsHtml(SAR_PRINT_CSS, `<div class="sar1">${sarBuildBodyHtml(ctx.d, ctx.profile)}</div>`),
      specs: SAR_SHEET, bodyClass: 'sar1',
      keep: 'h2,h3',
      fonts: [...DOC_FONT_SPECS],
    }),
    onPick: id => { SAR.previewId = id; sarRenderPreviewView(id); },
    onEdit: ctx => {
      if (ctx.pickId !== ctx.openKey) {
        if (ctx.open && !confirm('เปิด SAR นี้เพื่อแก้ไข? ส่วนที่แก้ในรายงานที่เปิดอยู่และยังไม่ได้บันทึกจะหายไป')) return;
        SAR.docId = ctx.pickId;
        SAR.doc = ctx.d;
      }
      SAR.view = 'form';
      docSwitchTab('sar'); // กลับไปแท็บ SAR (แสดงฟอร์ม)
    },
    onPrint: (ctx, view) => {
      const frame = view.querySelector('.doc-preview-frame');
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    },
  });
}
