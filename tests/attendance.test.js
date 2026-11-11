// ทดสอบตรรกะเวลาเรียน (js/attendance.js) ด้วยข้อมูลตัวอย่างจากรายงาน NextSchool NX (ว22103 ม.2/1: 18 คาบ)
// วิธีรัน: node tests/attendance.test.js   (หรือ npm test)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };

const ctx = vm.createContext({ console });
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'attendance.js'), 'utf8');
vm.runInContext(src + '\n;this.T = { ckParseDate, ckFmtDate, ckDayLabel, ckSortSessions, ckWeeklySessions, ckTakenIds, ckStat, ckPct, ckRoomOf, ckTimetableSlots, ckDefaultTermDates, ckSessionsFromTimetable };', ctx);
const T = ctx.T;

const rules = { late: true, leave: false, thr: 80 };
const sessions = Array.from({ length: 18 }, (_, i) => ({ id: 's' + (i + 1), date: `2026-05-${String(i + 1).padStart(2, '0')}`, type: 'class' }));
const ids = sessions.map(s => s.id);
const recFor = (ex) => Object.fromEntries(ids.map((id, i) => [id, ex[i + 1] || 'p']));

console.log('สถิติรายคน (ตรงกับ PDF)');
let st = T.ckStat(recFor({ 5: 'l' }), ids, rules);
ok(st.present === 17 && st.c.l === 1 && st.c.a === 0 && st.pct === 94.44, 'ลา 1 ครั้ง → มา 17 · 94.44%', st);
st = T.ckStat(recFor({ 4: 'a', 5: 'l' }), ids, rules);
ok(st.present === 16 && st.c.a === 1 && st.pct === 88.89, 'ขาด 1 ลา 1 → มา 16 ขาด 1 · 88.89%', st);
st = T.ckStat(recFor({ 4: 'a', 7: 'a' }), ids, rules);
ok(st.present === 16 && st.c.a === 2 && st.pct === 88.89, 'ขาด 2 → มา 16 ขาด 2 · 88.89%', st);
st = T.ckStat(recFor({}), ids, rules);
ok(st.present === 18 && st.pct === 100 && T.ckPct(st.pct) === '100', 'มาครบ → 100%', st);

console.log('กติกา');
st = T.ckStat(recFor({ 3: 's' }), ids, rules);
ok(st.present === 18, 'สายนับเป็นมา (ค่าเริ่มต้น)');
st = T.ckStat(recFor({ 3: 's' }), ids, { ...rules, late: false });
ok(st.present === 17 && st.c.s === 1, 'ปิด "สายนับเป็นมา" → สายไม่นับ');
st = T.ckStat(recFor({ 3: 'l' }), ids, { ...rules, leave: true });
ok(st.present === 18, 'เปิด "ลานับเป็นมา" → ลานับ');
st = T.ckStat(recFor({ 1: 'a', 2: 'a', 3: 'a', 4: 'a' }), ids, rules);
ok(st.pct === 77.78 && st.low === true, 'ต่ำกว่า 80% → ติดธง มส', st);
st = T.ckStat(recFor({ 1: 'a', 2: 'a' }), ids, rules);
ok(st.pct === 88.89 && st.low === false, 'สูงกว่าเกณฑ์ → ไม่ติดธง');

console.log('คาบที่เช็คแล้ว');
const recAll = { a: { s1: 'p', s2: 'a' }, b: { s1: 'p' } };
const hol = [...sessions.slice(0, 3), { id: 'h1', date: '2026-05-20', type: 'holiday' }];
ok(JSON.stringify(T.ckTakenIds(hol, recAll)) === '["s1","s2"]', 'นับเฉพาะคาบที่มีบันทึก');
ok(T.ckTakenIds(hol, { a: { h1: 'p' } }).length === 0, 'วันหยุดไม่นับแม้มีบันทึก');
st = T.ckStat({ s1: 'a' }, ['s1', 's2'], rules);
ok(st.c.a === 1 && st.c.p === 1 && st.pct === 50, 'คาบที่เช็คแล้วแต่ไม่มีบันทึกของคนนี้ (เพิ่มชื่อทีหลัง) → นับเป็นมา');
st = T.ckStat({}, [], rules);
ok(st.pct === null && st.low === false && T.ckPct(null) === '-', 'ยังไม่มีคาบที่เช็ค → ไม่คิด % ไม่ติดธง');

console.log('สร้างคาบรายสัปดาห์');
let n = 0; const mk = () => 'n' + (++n);
let w = T.ckWeeklySessions('2026-05-22', 18, [], mk);
ok(w.length === 18 && w[0].date === '2026-05-22' && w[1].date === '2026-05-29' && w[17].date === '2026-09-18', '18 สัปดาห์ จาก 22 พ.ค. → 18 ก.ย.', [w[0], w[17]]);
w = T.ckWeeklySessions('2026-05-22', 3, [{ id: 'x', date: '2026-05-29', type: 'class' }], mk);
ok(w.length === 2 && !w.some(s => s.date === '2026-05-29'), 'ข้ามวันที่ที่มีคาบอยู่แล้ว');
ok(T.ckWeeklySessions('', 5, [], mk).length === 0, 'วันที่ไม่ถูกต้อง → ไม่สร้าง');
w = T.ckWeeklySessions('2026-12-25', 2, [], mk);
ok(w[1].date === '2027-01-01', 'ข้ามปีได้ถูกต้อง', w);

console.log('วันที่/เรียงลำดับ');
ok(T.ckDayLabel('2026-05-22') === '22 พ.ค.' && T.ckDayLabel('xx') === '-', 'ป้ายวันที่ภาษาไทย');
ok(T.ckSortSessions([{ id: 'b', date: '2026-06-05' }, { id: 'a', date: '2026-05-22' }]).map(s => s.id).join() === 'a,b', 'เรียงตามวันที่');

console.log('ตารางสอน');
ok(T.ckRoomOf('ม.2/4') === '4' && T.ckRoomOf('2/10') === '10' && T.ckRoomOf('') === '' && T.ckRoomOf('ม.2') === '2', 'อ่านเลขห้องจากป้ายชั้น');
const course = { id: 'c1', code: 'ว22103', year: '2569', semester: '1' };
const entries = [
  { kind: 'class', day: 5, period: 2, span: 2, courseId: 'c1', cls: 'ม.2/1', code: 'ว22103' },
  { kind: 'class', day: 2, period: 0, span: 1, courseId: 'c1', cls: 'ม.2/2' },
  { kind: 'class', day: 3, period: 4, span: 1, code: 'ว 22103', cls: '' },
  { kind: 'class', day: 1, period: 1, span: 1, courseId: 'other', cls: 'ม.2/1' },
  { kind: 'activity', day: 4, period: 1, span: 1, courseId: 'c1', cls: 'ม.2/1' },
];
const slots = T.ckTimetableSlots(entries, course, '1');
ok(slots.length === 2 && slots[0].day === 3 && slots[1].day === 5 && slots[1].span === 2, 'เลือกเฉพาะวิชา+ห้องนี้ (ตัดห้องอื่น วิชาอื่น กิจกรรม)', slots);
ok(T.ckTimetableSlots(entries, course, '2').some(s => s.day === 2), 'ห้อง 2 ได้ช่องของห้อง 2');
const d = T.ckDefaultTermDates(course); const d2 = T.ckDefaultTermDates({ year: '2569', semester: '2' });
ok(d.start === '2026-05-15' && d.end === '2026-09-30' && d2.start === '2026-11-01' && d2.end === '2027-02-28', 'ช่วงภาคเรียนเริ่มต้น', [d, d2]);
n = 0;
const gen = T.ckSessionsFromTimetable([{ day: 5, period: 2, span: 2 }], '2026-05-22', '2026-09-25', [], mk);
// PDF ตัวอย่างมี 18 คาบ เพราะไม่มี 31 ก.ค. (วันหยุด) — ตารางสอนให้ครบ 19 ศุกร์ ครูทำ 31 ก.ค. เป็นวันหยุดเอง
ok(gen.length === 19 && gen[0].date === '2026-05-22' && gen[0].period === 3 && gen[0].span === 2 && gen[18].date === '2026-09-25', 'ทุกวันศุกร์ 22 พ.ค.–25 ก.ย. = 19 คาบ (รวม 31 ก.ค.)', [gen.length, gen[0], gen[18]]);
ok(gen.filter(x => x.date !== '2026-07-31').length === 18, 'ตัด 31 ก.ค. ออก = 18 คาบ ตรงกับ PDF');
const gen2 = T.ckSessionsFromTimetable([{ day: 5, period: 2, span: 1 }], '2026-05-22', '2026-06-05', [{ id: 'x', date: '2026-05-29', type: 'class', period: 3 }, { id: 'y', date: '2026-06-05', type: 'class' }], mk);
ok(gen2.length === 1 && gen2[0].date === '2026-05-22', 'ข้ามคาบซ้ำ และวันที่ที่มีคาบยังไม่ระบุชั่วโมง', gen2);
const two = T.ckSessionsFromTimetable([{ day: 5, period: 0, span: 1 }, { day: 5, period: 5, span: 1 }], '2026-05-22', '2026-05-22', [], mk);
ok(two.length === 2 && two[0].period === 1 && two[1].period === 6, 'วันเดียวสอน 2 ช่วง → 2 คาบ');
ok(T.ckSessionsFromTimetable([], '2026-05-22', '2026-09-25', [], mk).length === 0 && T.ckSessionsFromTimetable([{ day: 5, period: 0, span: 1 }], '2026-09-25', '2026-05-22', [], mk).length === 0, 'ไม่มีช่อง/ช่วงวันที่กลับด้าน → ไม่สร้าง');
ok(T.ckSortSessions([{ id: 'b', date: '2026-05-22', period: 6 }, { id: 'a', date: '2026-05-22', period: 1 }]).map(x => x.id).join() === 'a,b', 'เรียงตามวันที่ แล้วตามคาบ');

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
