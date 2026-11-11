// ทดสอบตรรกะเวลาเรียน (js/attendance.js) ด้วยข้อมูลตัวอย่างจากรายงาน NextSchool NX (ว22103 ม.2/1: 18 คาบ)
// วิธีรัน: node tests/attendance.test.js   (หรือ npm test)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };

const ctx = vm.createContext({ console });
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'attendance.js'), 'utf8');
vm.runInContext(src + '\n;this.T = { ckParseDate, ckFmtDate, ckDayLabel, ckSortSessions, ckWeeklySessions, ckTakenIds, ckStat, ckPct };', ctx);
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

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
