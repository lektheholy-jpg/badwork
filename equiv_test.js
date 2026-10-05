const vm = require('vm'), fs = require('fs');
function load(dir, files) {
  const noop = () => {};
  const docStub = new Proxy(function(){}, { get: (t,k)=> k==='documentElement' ? {dataset:{}} : docStub, apply: ()=>docStub, set: ()=>true });
  const ctx = vm.createContext({
    console, document: docStub, window: { addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) }, localStorage: { getItem: ()=>null, setItem: noop },
    AppState: { user: { uid: 'u' } }, db: {}, firebase: {}, XLSX: {}, navigator: {}, location: {}, setTimeout, Promise,
    addEventListener: noop,
  });
  for (const f of files) {
    try { vm.runInContext(fs.readFileSync(`${dir}/${f}`, 'utf8'), ctx, { filename: f }); }
    catch (e) { console.log(`  (load note ${dir}/${f}: ${e.message.slice(0,80)})`); }
  }
  return ctx;
}
const FILES = ['utils.js','dashboard.js','courses.js','picker-pages.js','report-page.js'];
const OLD = load('/home/claude/js_orig', FILES);
const NEW = load('/home/claude/work/badwork/js', FILES);

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : (fail++, console.log('FAIL', name, '\n old:', JSON.stringify(a).slice(0,300), '\n new:', JSON.stringify(b).slice(0,300)));
};
const ws = h => String(h).replace(/\s+/g, ' ').replace(/> </g, '><').trim();

// ===== 1) import parser =====
const T = {
  roomWithHeader: [[], ['ลำดับ','รหัสนักเรียน','ชื่อ-สกุล','ห้อง'], [1,'1001','สมชาย ใจดี','ม.2/1'], [2,'1002','สมหญิง รักเรียน','ม.2/2'], [3,'1003','มานี มีนา','ม.2/1'], [], [4,'1004','ปิติ ชูใจ','ม.2/1']],
  noRoomCol:      [['เลขที่','รหัส','ชื่อ','นามสกุล'], [1,'a1','ก','ข'], [2,'a2','ค','ง']],
  roomNoMatch:    [['เลขที่','ชื่อ-สกุล','ห้อง'], [1,'ก ข','ห้อง 9'], [2,'ค ง','ห้อง 8']],
  noHeader:       [[1,'x1','สมชาย','ใจดี'], [2,'x2','สมหญิง','รักเรียน'], [], [3,'x3','', 'ว่าง']],
  junk:           [['เอกสาร'],[''],['อะไรสักอย่าง']],
  empty:          [],
  singleName:     [['no','code','full name','room'], [1,'c1','มานะ','1'], [2,'c2','ปรีชา ฉลาด เก่ง','2/3']],
  multiRoomLabel: [['ลำดับ','ชื่อ','นามสกุล','ห้อง'], [1,'ก','ข','มัธยมศึกษาปีที่ 2/10'], [2,'ค','ง','ม.2/1'], [3,'จ','ฉ','']],
};
for (const [name, aoa] of Object.entries(T)) {
  for (const room of ['ม.2/1', '1', '', undefined, 'ห้อง 9'])
    eq(`parseImportSheet:${name}:${room}`, OLD.parseImportSheet(aoa, room), NEW.parseImportSheet(aoa, room));
  eq(`parseImportSheetMultiRoom:${name}`, OLD.parseImportSheetMultiRoom(aoa), NEW.parseImportSheetMultiRoom(aoa));
}

// ===== 2) progress =====
const mkSnap = (docs) => ({ size: docs.length, docs: docs.map(([id, data]) => ({ id, data: () => data })) });
const oldProgress = (studentsSnap, scoresSnap, assessmentIds) => {   // verbatim logic from courses.js / picker-pages.js (original)
  const totalCells = studentsSnap.size * assessmentIds.length;
  let filledCells = 0;
  if (totalCells > 0) scoresSnap.docs.forEach(d => { const data = d.data(); assessmentIds.forEach(aid => { if (data[aid] !== undefined && data[aid] !== null && data[aid] !== '') filledCells++; }); });
  return totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
};
const cases = [
  [mkSnap([['a',{}],['b',{}],['c',{}]]), mkSnap([['a',{x:5,y:0}],['b',{x:'',y:null}],['c',{x:3}]]), ['x','y']],
  [mkSnap([]), mkSnap([]), ['x']],
  [mkSnap([['a',{}]]), mkSnap([]), []],
  [mkSnap([['a',{}],['b',{}]]), mkSnap([['a',{x:1,y:2,z:3}],['b',{x:1,y:2,z:3}]]), ['x','y','z']],
  [mkSnap([['a',{}],['b',{}],['c',{}]]), mkSnap([['a',{x:1}]]), ['x','y','z']],       // 1/9 -> rounding
  [mkSnap([['a',{}],['b',{}],['c',{}]]), mkSnap([['a',{x:1,y:1}],['b',{x:1}]]), ['x','y','z']],
  [mkSnap([['a',{}]]), mkSnap([['a',{x:0}]]), ['x']],                                  // 0 counts as filled
  [mkSnap([['a',{}],['b',{}],['c',{}]]), mkSnap([['a',{x:1}],['b',{x:1}]]), ['x']],            // 2/3 = 66.7 -> must round UP to 67
  [mkSnap([['a',{}],['b',{}],['c',{}],['d',{}],['e',{}],['f',{}],['g',{}]]), mkSnap([['a',{x:1}],['b',{x:1}],['c',{x:1}],['d',{x:1}],['e',{x:1}]]), ['x']], // 5/7 = 71.4
  [mkSnap([['a',{}],['b',{}],['c',{}],['d',{}],['e',{}],['f',{}],['g',{}],['h',{}]]), mkSnap([['a',{x:1}]]), ['x']], // 1/8 = 12.5 -> 13
];
cases.forEach(([s, sc, ids], i) => eq(`progress#${i}`, oldProgress(s, sc, ids), NEW.calcSectionProgress(s, sc, ids)));

// ===== 3) level-group HTML =====
const courses = [
  { id:'1', code:'ค21101', name:'คณิต', level:'ม.1', roomCount:3, semester:'1', year:'2569' },
  { id:'2', code:'ว31101', name:'ฟิสิกส์', level:'ม.4', archived:false, roomCount:2 },
  { id:'3', code:'', name:'ชุมนุม', level:'', roomCount:1 },
  { id:'4', code:'ท22101', name:'ภาษาไทย', level:'ม.2', archived:true, roomCount:4 },
  { id:'5', code:'อ21101', name:'อังกฤษ', level:'ม.1', roomCount:2 },
  { id:'6', code:'x', name:'ระดับแปลก', level:'ป.6', roomCount:1 },
];
const sect = (id, room) => ({ section: { id, room }, studentCount: 30, progress: 40 });
const cards = courses.map((c, i) => ({ course: c, sections: i % 3 === 0 ? [] : [sect('s'+i, '1'), sect('t'+i, '2')] }));
eq('courseListGroupsHtml', ws(OLD.courseListGroupsHtml(courses)), ws(NEW.courseListGroupsHtml(courses)));
eq('renderStructureGroupsHtml', ws(OLD.renderStructureGroupsHtml(courses)), ws(NEW.renderStructureGroupsHtml(courses)));
eq('scoresPickerGroupsHtml', ws(OLD.scoresPickerGroupsHtml(cards)), ws(NEW.scoresPickerGroupsHtml(cards)));
eq('courseListGroupsHtml(empty)', ws(OLD.courseListGroupsHtml([])), ws(NEW.courseListGroupsHtml([])));
if (OLD.reportRoomRowHtml) {
  const rcards = cards.map(c => ({ ...c, sections: c.sections.map(s => ({ ...s, grading: {}, gradeStats: {} })) }));
  try { eq('reportPageBodyHtml', ws(OLD.reportPageBodyHtml(rcards)), ws(NEW.reportPageBodyHtml(rcards))); eq('reportPageBodyHtml(empty)', ws(OLD.reportPageBodyHtml([])), ws(NEW.reportPageBodyHtml([]))); }
  catch (e) { console.log('reportPageBodyHtml threw:', e.message); fail++; }
} else { console.log('reportRoomRowHtml not loadable'); fail++; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
