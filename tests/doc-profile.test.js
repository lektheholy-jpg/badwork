// ทดสอบตัวช่วยกลางข้อมูลส่วนตัวใน js/doc-shell.js (docGetProfile · docProfileInfo) + กันสำเนาของแต่ละระบบกลับมา
// วิธีรัน: node tests/doc-profile.test.js   (หรือ npm run test:docprofile)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };

// ดึงเฉพาะ 2 ฟังก์ชันออกมารัน (doc-shell.js ทั้งไฟล์ต้องการ DOM)
const src = read('js/doc-shell.js');
const grab = re => { const m = src.match(re); if (!m) throw new Error('ไม่พบ ' + re); return m[0]; };
const code = grab(/async function docGetProfile\(\) \{\n[\s\S]*?\n\}\n/) + grab(/function docProfileInfo\(p\) \{\n[\s\S]*?\n\}\n/);

(async () => {
  const make = (extra = {}) => {
    const ctx = { AppState: {}, loadModule: async () => {}, loadTeacherProfile: async () => ({ firstName: 'ก' }), ...extra };
    vm.createContext(ctx); vm.runInContext(code, ctx); return ctx;
  };

  console.log('docProfileInfo');
  const c = make();
  const full = c.docProfileInfo({ prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', position: 'ครู', academicStanding: 'ชำนาญการ', school: 'โรงเรียนก', affiliation: 'สพม.1', subjectGroup: 'คณิตศาสตร์', schoolDistrict: 'เมือง', schoolProvince: 'บุรีรัมย์', agency: 'หน่วยงาน', logo: 'data:x' });
  ok(full.name === 'นายสมชาย ใจดี', 'ชื่อ = คำนำหน้า+ชื่อ เว้นวรรค นามสกุล', full.name);
  ok(full.position === 'ครู ชำนาญการ', 'ตำแหน่ง + วิทยฐานะ', full.position);
  ok(full.school === 'โรงเรียนก' && full.affiliation === 'สพม.1' && full.subjectGroup === 'คณิตศาสตร์' && full.agency === 'หน่วยงาน' && full.logo === 'data:x', 'ส่งต่อ school · affiliation · subjectGroup · agency · logo');
  ok(full.district === 'เมือง' && full.province === 'บุรีรัมย์', 'district/province เป็นค่าดิบ');
  ok(full.location === 'อำเภอเมือง จังหวัดบุรีรัมย์', 'location = อำเภอX จังหวัดY', full.location);
  const dup = c.docProfileInfo({ schoolDistrict: 'อำเภอเมือง', schoolProvince: 'จ.บุรีรัมย์' });
  ok(dup.location === 'อำเภอเมือง จังหวัดบุรีรัมย์', 'ตัดคำนำหน้าที่พิมพ์ซ้ำ (อำเภอ/จ.) ไม่ให้ซ้อน', dup.location);
  ok(c.docProfileInfo({ schoolDistrict: 'เขตบางนา' }).location === 'อำเภอบางนา', 'ตัด "เขต" นำหน้า');
  ok(c.docProfileInfo({ schoolProvince: 'กรุงเทพ' }).location === 'จังหวัดกรุงเทพ', 'มีแค่จังหวัด → แสดงเฉพาะจังหวัด');
  for (const bad of [null, undefined, {}]) {
    const e = c.docProfileInfo(bad);
    ok(e.name === '' && e.position === '' && e.school === '' && e.location === '', 'โปรไฟล์ว่าง/null → ช่องว่าง ไม่ error', bad);
  }
  ok(c.docProfileInfo({ lastName: 'ใจดี' }).name === 'ใจดี', 'มีแค่นามสกุล → ไม่มีช่องว่างเกิน');

  console.log('docGetProfile');
  let r = await make().docGetProfile();
  ok(r && r.firstName === 'ก', 'โหลดโปรไฟล์ได้ → คืนค่านั้น');
  let loaded = null;
  make({ loadModule: async n => { loaded = n; } }).docGetProfile();
  await Promise.resolve();
  ok(loaded === 'profile', 'โหลดโมดูล profile ก่อนอ่าน');
  const cached = { firstName: 'แคช' };
  r = await make({ loadTeacherProfile: async () => { throw new Error('offline'); }, AppState: { teacherProfile: cached } }).docGetProfile();
  ok(r === cached, 'อ่านไม่ได้ → ใช้โปรไฟล์ที่แคชใน AppState');
  r = await make({ loadModule: async () => { throw new Error('x'); } }).docGetProfile();
  ok(r === null, 'โหลดโมดูลไม่ได้และไม่มีแคช → null (ตัวอย่างพิมพ์ใช้จุดไข่ปลา)');

  console.log('กันสำเนากลับมา');
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'doc-shell.js');
  const own = files.filter(f => /function\s+\w*(GetProfile|ProfileInfo)\s*\(/.test(strip(read('js/' + f))));
  ok(own.length === 0, 'ไม่มีฟังก์ชันอ่าน/แปลงโปรไฟล์ของระบบเองนอก doc-shell.js' + (own.length ? ' — พบที่: ' + own.join(', ') : ''));
  const tpl = read('tools/templates/ui.js.tpl');
  ok(!/function\s+__ID__(GetProfile|ProfileInfo)/.test(tpl) && tpl.includes('docGetProfile') && tpl.includes('docProfileInfo'), 'เทมเพลตตัวสร้างระบบเอกสารใหม่ใช้ตัวช่วยกลาง ไม่ปั๊มสำเนา');

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
