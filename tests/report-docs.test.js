// ทดสอบส่วน "เอกสารที่ต้องส่งในภาคเรียนนี้" ของหน้ารายงาน (js/report-page.js): จับคู่ปีงบประมาณ · รวมสถานะ · สร้างแถว · HTML
// วิธีรัน: node tests/report-docs.test.js   (หรือ npm run test:reportdocs)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };

// report-page.js ทั้งไฟล์ต้องการ DOM — ดึงเฉพาะตัวช่วยที่ไม่แตะ DOM ออกมารัน
const src = read('js/report-page.js');
const grab = re => { const m = src.match(re); if (!m) throw new Error('ไม่พบ ' + re); return m[0]; };
const code = [
  /function reportFiscalYear\(year, sem\) \{\n[\s\S]*?\n\}\n/,
  /function reportDocState\(docs\) \{\n[\s\S]*?\n\}\n/,
  /const RP_STATE_BADGE = \{\n[\s\S]*?\n\};\n/,
  /function reportDocRows\([\s\S]*?\n\}\n/,
  /function reportDocsHtml\(rows\) \{\n[\s\S]*?\n\}\n/,
].map(grab).join('\n');
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ctx = { escapeHtml: esc };
vm.createContext(ctx); vm.runInContext(code, ctx);

console.log('reportFiscalYear (ปีงบ N = ภาค 2/(N-1) + ภาค 1/N)');
ok(ctx.reportFiscalYear('2569', '1') === '2569', 'ภาค 1/2569 → ปีงบ 2569');
ok(ctx.reportFiscalYear('2568', '2') === '2569', 'ภาค 2/2568 → ปีงบ 2569');
ok(ctx.reportFiscalYear('2569', '3') === null && ctx.reportFiscalYear('', '1') === null && ctx.reportFiscalYear('abc', '1') === null, 'ภาคอื่น/ไม่มีปี → null (ไม่โชว์แถว PA)');

console.log('reportDocState');
ok(ctx.reportDocState(null) === 'unknown', 'อ่านไม่ได้ (null) → unknown');
ok(ctx.reportDocState([]) === 'none', 'ไม่มีเอกสาร → none');
ok(ctx.reportDocState([{ status: 'draft' }, {}]) === 'draft', 'มีแต่ร่าง/ไม่มีสถานะ → draft');
ok(ctx.reportDocState([{ status: 'draft' }, { status: 'submitted' }]) === 'submitted', 'มีฉบับที่ส่งแล้ว → submitted');

console.log('reportDocRows');
const data = {
  idp: [{ status: 'submitted' }], sar: [], tra: [{ status: 'draft' }, { status: 'draft' }], car: null,
  paAgr: [{ status: 'draft' }], paRpt: [],
  syllabus: [{ course: { code: 'ว21101', name: 'วิทยาการคำนวณ' }, state: 'done' }, { course: { code: '', name: 'ชุมนุม' }, state: 'none' }],
};
const rows = ctx.reportDocRows({ year: '2569', sem: '1' }, data);
const by = n => rows.find(r => r.name.includes(n));
ok(rows.length === 8, 'วิชา 2 + SAR + ID-Plan + PA + รายงานผล PA + แผนการอบรม + วิจัย = 8 แถว', rows.length);
ok(by('ว21101').state === 'done' && by('ว21101').route === 'structure-page', 'Syllabus รายวิชา: ทำแล้ว · เปิดหน้าโครงสร้างวิชา');
ok(by('ชุมนุม').name === 'Course Syllabus · ชุมนุม' && by('ชุมนุม').state === 'none', 'วิชาไม่มีรหัส: ไม่มีช่องว่างเกิน');
ok(by('SAR').state === 'none' && by('SAR').tab === 'sar' && by('SAR').sys === 'idp' && by('SAR').meta === 'ภาคเรียนที่ 1/2569', 'SAR: ยังไม่ได้ทำ · เปิดแท็บ sar ของระบบ idp');
ok(by('ID-Plan').state === 'submitted' && by('ID-Plan').meta === 'ปีการศึกษา 2569', 'ID-Plan: ส่งแล้ว · ผูกกับปีการศึกษา');
ok(by('Personal Agreement').meta === 'ปีงบประมาณ 2569' && by('Personal Agreement').state === 'draft', 'PA: ผูกกับปีงบประมาณ · ร่าง');
ok(by('รายงานผล PA').tab === 'rpt' && by('รายงานผล PA').sys === 'pa', 'รายงานผล PA: เปิดแท็บ rpt ของระบบ pa');
ok(by('แผนการอบรม').meta === 'ภาคเรียนที่ 1/2569 · 2 ฉบับ', 'หลายฉบับในภาคเดียว → บอกจำนวนฉบับ', by('แผนการอบรม').meta);
ok(by('วิจัย').state === 'unknown', 'อ่านไม่สำเร็จ → ตรวจสถานะไม่ได้ (ไม่ถือว่ายังไม่ได้ทำ)');
const rows3 = ctx.reportDocRows({ year: '2569', sem: '3' }, { ...data, syllabus: [] });
ok(!rows3.some(r => r.name.includes('PA')) && rows3.length === 4, 'ภาคฤดูร้อน/ภาคอื่น: ไม่มีแถว PA (ปีงบไม่ชัด)', rows3.length);

console.log('reportDocsHtml');
const html = ctx.reportDocsHtml(rows);
ok(html.includes('ทำแล้ว/ส่งแล้ว 2 จาก 8 รายการ'), 'สรุปจำนวนที่ทำแล้ว/ส่งแล้ว (Syllabus ทำแล้ว 1 + ID-Plan ส่งแล้ว 1)', html.slice(0, 120));
ok((html.match(/class="report-room-row"/g) || []).length === 8, 'หนึ่งแถวต่อหนึ่งรายการ');
ok(html.includes('badge-success') && html.includes('badge-grade-mid') && html.includes('badge-neutral'), 'ใช้คลาส badge ที่มีอยู่ใน style.css แล้ว (ไม่เพิ่ม CSS)');
ok(html.includes('data-tab="sar"') && html.includes('data-sys="idp"') && html.includes('>เริ่มทำ<') && html.includes('>เปิด<'), 'ปุ่มเปิด/เริ่มทำ พร้อมแท็บปลายทาง');
const xss = ctx.reportDocsHtml(ctx.reportDocRows({ year: '2569', sem: '1' }, { syllabus: [{ course: { code: '<img onerror=x>', name: '"a"' }, state: 'none' }] }));
ok(!xss.includes('<img') && xss.includes('&lt;img'), 'ชื่อวิชาถูก escape ก่อนใส่ HTML');

console.log('\nการเชื่อมต่อในหน้ารายงาน');
ok(/<div id="report-docs-body"><\/div>/.test(src) && /drawDocs\(\);\n/.test(src), 'มีส่วนเอกสารที่ต้องส่ง และเรียกวาดทุกครั้งที่เปลี่ยนภาคเรียน');
ok(/loadModules\(LAZY_BUNDLES\.docConfigs\)/.test(src) && !/['"](idp_plans|idp_sar|pa_agreements|pa_reports|tra_docs|car_docs)['"]/.test(src), 'ชื่อ collection อ่านจาก config ของระบบ ไม่เขียนตรงในไฟล์');
ok(!/\.(set|add|update|delete)\(/.test(src.slice(src.indexOf('loadReportDocStatus'))), 'ส่วนนี้อ่านอย่างเดียว ไม่เขียน Firestore');
const pkg = JSON.parse(read('package.json'));
ok(!!pkg.scripts['test:reportdocs'], 'package.json: มีสคริปต์ test:reportdocs');

console.log(`\n${fail ? '✗ ไม่ผ่าน ' + fail + ' ข้อ' : '✓ ผ่านทุกข้อ'} (${pass} ผ่าน)`);
process.exit(fail ? 1 : 0);
