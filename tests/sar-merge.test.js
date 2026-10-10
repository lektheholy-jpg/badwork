// ทดสอบ sarMergeCourseRows (js/sar.js): รวมห้อง/จำนวนนักเรียนจากบันทึกคะแนน + ชั่วโมงรายห้องจากตารางสอน
// วิธีรัน: node tests/sar-merge.test.js   (หรือ npm run test:sar)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const ctx = { console, escapeHtml: s => String(s), Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/sar.js'), 'utf8'), ctx, { filename: 'js/sar.js' });
const merge = (l, e) => JSON.parse(JSON.stringify(vm.runInContext('sarMergeCourseRows', ctx)(l, e)));
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const course = (o) => Object.assign({ id: 'c1', code: 'ค31101', name: 'คณิตศาสตร์', credit: 1.5, act: false, title: 'ค31101 คณิตศาสตร์', rooms: [] }, o);
const ent = (o) => Object.assign({ kind: 'class', code: 'ค31101', title: 'คณิตศาสตร์', cls: '', span: 1, courseId: 'c1' }, o);

console.log('A · ชั่วโมงรายห้อง (ไม่เอายอดรวมทุกห้องไปใส่ซ้ำ)');
{
  const r = merge([course({ rooms: [{ room: 'ม.4/1', n: 40 }, { room: 'ม.4/2', n: 38 }, { room: 'ม.4/3', n: 35 }] })],
    [ent({ cls: 'ม.4/1', span: 2 }), ent({ cls: 'ม.4/2', span: 2 }), ent({ cls: 'ม.4/3', span: 1 }), ent({ cls: 'ม.4/3', span: 1 })]);
  ok(r.teaching.length === 3 && r.teaching.map(x => x.hours).join() === '2,2,2', 'สอน 3 ห้อง ห้องละ 2 คาบ → 2,2,2 (ไม่ใช่ 6,6,6): ' + r.teaching.map(x => x.hours));
  ok(r.teaching.map(x => x.n).join() === '40,38,35' && r.teaching[0].room === 'ม.4/1', 'ห้อง/จำนวนนักเรียนมาจากบันทึกคะแนน');
  ok(r.noHours === 0 && r.noN === 0 && r.activities.length === 0, 'ไม่มีแถวค้าง/แถวกิจกรรม');
}
console.log('B · กิจกรรมพัฒนาผู้เรียน (ชื่อ+ชั่วโมงจากตารางสอน เติมจำนวนนักเรียนจากบันทึกคะแนน)');
{
  const act = course({ id: 'a1', code: 'ก31901', name: 'ชุมนุมหุ่นยนต์', title: 'ก31901 ชุมนุมหุ่นยนต์', act: true, rooms: [{ room: 'ชุมนุม', n: 25 }] });
  const r = merge([act], [{ kind: 'activity', code: '', title: 'ชุมนุมหุ่นยนต์', cls: '', span: 1, courseId: '' }]);
  ok(r.activities.length === 1 && r.activities[0].n === '25' && r.activities[0].hours === '1' && r.teaching.length === 0, 'กิจกรรมได้ n=25 ชม.=1 (จับคู่ด้วยชื่อ): ' + JSON.stringify(r.activities));
}
console.log('C · การจับคู่ห้อง/วิชา');
{
  let r = merge([course({ rooms: [{ room: 'ม.4/1', n: 30 }] })], [ent({ cls: '4/1', span: 3, courseId: '' })]);
  ok(r.teaching[0].hours === '3', 'ห้อง "4/1" ตรงกับ "ม.4/1" (จับด้วยรหัสวิชา เมื่อไม่ได้ผูก courseId)');
  r = merge([course({ rooms: [{ room: 'ม.4/1', n: 30 }] })], [ent({ cls: 'ม.4/1', span: 3, courseId: 'อื่น' })]);
  ok(r.teaching[0].hours === '3' && r.teaching.length === 2 && r.teaching[1].hours === '3', 'คาบที่ผูกกับวิชาอื่น ไม่ถูกจับมาปน → วิชานี้ใช้หน่วยกิต (1.5×2) + คาบนั้นเข้าเป็นแถวแยก');
  r = merge([course({ rooms: [{ room: 'ม.4/1', n: 20 }, { room: 'ม.4/2', n: 20 }] })], [ent({ cls: '', span: 4 })]);
  ok(r.teaching.map(x => x.hours).join() === '2,2', 'ตารางไม่ระบุห้อง → หารเฉลี่ยตามจำนวนห้อง');
}
console.log('D · ไม่มีตารางสอน / มีแต่ตารางสอน');
{
  let r = merge([course({ credit: 1.5, rooms: [{ room: 'ม.4/1', n: 30 }] })], []);
  ok(r.teaching[0].hours === '3', 'ไม่มีตารางสอน → ชั่วโมงจากหน่วยกิต 1.5 × 2 = 3');
  r = merge([], [ent({ code: 'ว31101', title: 'ฟิสิกส์', cls: 'ม.5/1', span: 2, courseId: '' }), ent({ code: 'ว31101', title: 'ฟิสิกส์', cls: 'ม.5/1', span: 1, courseId: '' }), { kind: 'activity', code: '', title: 'โฮมรูม', cls: 'ม.5/1', span: 1 }]);
  ok(r.teaching.length === 1 && r.teaching[0].hours === '3' && r.teaching[0].n === '' && r.activities.length === 1 && r.activities[0].name === 'โฮมรูม' && r.noN === 2, 'ไม่มีบันทึกคะแนน → ใช้ตารางสอนอย่างเดียว (รวมคาบซ้ำ) เว้นจำนวนนักเรียน');
  r = merge([course({ rooms: [{ room: 'ม.4/1', n: 0 }] })], [ent({ cls: 'ม.4/1', span: 2 })]);
  ok(r.noN === 1 && r.teaching[0].hours === '2', 'ห้องที่ยังไม่มีนักเรียนนับเป็น "ยังไม่มีจำนวนนักเรียน"');
}
console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nALL PASS');
process.exit(fail ? 1 : 0);
