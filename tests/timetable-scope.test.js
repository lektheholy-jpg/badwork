// ทดสอบการดึงตารางสอนเข้าเอกสาร: ช่วงเวลา (ภาคเรียน/ปีการศึกษา/ปีงบประมาณ) + จัดกลุ่มวิชา/กิจกรรม + เรียงตามรหัส
// ไม่ต้องใช้ jsdom — วิธีรัน: node tests/timetable-scope.test.js   (หรือ npm run test:ttscope)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b });

const ctx = { console, db: {}, AppState: {}, uid4: () => 'id', escapeHtml: s => String(s) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'timetable.js'), 'utf8'), ctx);
const run = code => vm.runInContext(code, ctx);
const j = v => JSON.parse(JSON.stringify(v)); // ข้ามขอบ vm context

const E = (o, i) => ({ id: 'e' + i, kind: 'class', day: 1, period: 0, span: 1, title: 'วิชา', code: '', cls: '', room: '', hue: 'blue', courseId: '', ...o });
const tt = entries => ({ periods: Array.from({ length: 10 }, () => ({ start: '08:00', end: '08:50' })), entries });

console.log('ช่วงเวลา');
eq(j(run("ttScopeTerms({ type: 'term', year: '2569', sem: '1' })")), [{ year: 2569, sem: 1 }], 'ภาคเรียน = ภาคเดียว');
eq(j(run("ttScopeTerms({ type: 'year', year: '2569' })")), [{ year: 2569, sem: 1 }, { year: 2569, sem: 2 }], 'ปีการศึกษา = ภาค 1 + 2');
eq(j(run("ttScopeTerms({ type: 'fiscal', year: '2569' })")), [{ year: 2568, sem: 2 }, { year: 2569, sem: 1 }], 'ปีงบประมาณ 2569 = ภาค 2/2568 + 1/2569');
eq(run("ttScopeLabel({ type: 'fiscal', year: '2569' })"), 'ปีงบประมาณ 2569', 'ป้ายปีงบประมาณ');

console.log('รวมตารางหลายภาค');
{
  const all = { terms: new Map([['2568-2', tt([E({ code: 'ค22102', title: 'คณิต', cls: 'ม.2/1' }, 1)])]]), legacy: null };
  ctx.__all = all;
  const r = j(run("ttCollectScope(__all, { type: 'fiscal', year: '2569' })"));
  ok(r.items.length === 1 && r.items[0].term.sem === 2, 'มีเฉพาะภาค 2/2568');
  eq(r.missing, [{ year: 2569, sem: 1 }], 'ภาค 1/2569 ไม่มีตาราง → อยู่ใน missing');
}

console.log('จัดกลุ่ม + เรียงตามรหัส');
{
  ctx.__items = [{ tt: tt([
    E({ code: 'ว31101', title: 'ฟิสิกส์', cls: 'ม.4/1', day: 1, period: 0, span: 2 }, 1),
    E({ code: 'ค21101', title: 'คณิต', cls: 'ม.1/1', day: 2, period: 0 }, 2),
    E({ code: 'ค21101', title: 'คณิต', cls: 'ม.1/2', day: 3, period: 0 }, 3),
    E({ code: '', title: 'ชุมนุมหุ่นยนต์', day: 4, period: 0 }, 4),            // class ไม่มีรหัส → กิจกรรม
    E({ code: '', title: 'ลูกเสือ', kind: 'activity', day: 5, period: 0 }, 5),
    E({ code: '', title: 'แนะแนว', kind: 'activity', day: 5, period: 1 }, 6),
  ]) }];
  const r = j(run('ttAggregateTerms(__items, false)'));
  eq(r.subjects, [{ name: 'ค21101 คณิต', hours: 2 }, { name: 'ว31101 ฟิสิกส์', hours: 2 }], 'วิชามีรหัส เรียงตามรหัส และรวมชั่วโมงข้ามห้อง');
  eq(r.activities.map(a => a.name), ['ชุมนุมหุ่นยนต์', 'ลูกเสือ', 'แนะแนว'].sort((a, b) => a.localeCompare(b, 'th')), 'วิชาไม่มีรหัส + คาบกิจกรรม = กิจกรรมพัฒนาผู้เรียน เรียงตามชื่อ');
  const w = j(run('ttAggregateTerms(__items, true)'));
  eq(w.subjects.map(s => s.name), ['ค21101 คณิต ม.1', 'ว31101 ฟิสิกส์ ม.4'], 'ID-Plan ต่อท้ายระดับชั้น');
}

console.log('หลายภาค — เขียนรวมเป็นเทอม');
{
  const a = tt([E({ code: 'ค21101', title: 'คณิต', cls: 'ม.1/1', span: 3 }, 1), E({ code: '', title: 'ชุมนุม', day: 2 }, 2)]);
  const b = tt([E({ code: 'ค21102', title: 'คณิต', cls: 'ม.1/1', span: 2 }, 3)]);
  ctx.__items2 = [{ term: { year: 2568, sem: 2 }, tt: a }, { term: { year: 2569, sem: 1 }, tt: b }];
  const r = j(run('ttAggregateTerms(__items2, false)'));
  eq(r.subjects, [{ name: 'ค21101 คณิต (ภาค 2/2568)', hours: 3 }, { name: 'ค21102 คณิต (ภาค 1/2569)', hours: 2 }], 'แต่ละภาคมีแถวของตัวเอง ต่อท้ายชื่อภาค ไม่รวมข้ามภาค');
  eq(r.activities, [{ name: 'ชุมนุม (ภาค 2/2568)', hours: 1 }], 'กิจกรรมก็แยกตามภาค');
  ctx.__items3 = [{ term: { year: 2569, sem: 1 }, tt: b }];
  eq(j(run('ttAggregateTerms(__items3, false)')).subjects, [{ name: 'ค21102 คณิต', hours: 2 }], 'ภาคเดียว ไม่ต่อท้ายชื่อภาค');
}

console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
