// ทดสอบตรรกะคะแนน/เกรด/วางข้อมูล/บันทึกซ้ำ ด้วย jsdom (ไม่ต้องใช้ Firebase จริง — จำลองด้วย mock)
// วิธีรัน: npm i jsdom  แล้ว  node tests/score-logic.test.js .   (อย่านำโฟลเดอร์ tests ขึ้น hosting)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const root = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };

async function makeEnv({ nStudents = 4, nAssess = 8, max = 10, seed = {} } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="toast"></div><div id="view"></div></body>`, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const DELETE = { __delete: true };
  const store = {};            // studentId -> {assessmentId: value}
  const writes = [];           // log
  const students = Array.from({ length: nStudents }, (_, i) => ({ id: 's' + (i + 1), no: i + 1, code: '66' + i, firstName: 'ชื่อ' + (i + 1), lastName: 'สกุล' }));
  students.forEach(s => { store[s.id] = { ...(seed[s.id] || {}) }; });
  const assessments = Array.from({ length: nAssess }, (_, i) => ({ id: 'a' + (i + 1), name: 'งาน' + (i + 1), max, category: 'collect', order: i }));
  const env = { w, store, writes, DELETE, setBehavior: null };
  const snap = arr => ({ docs: arr.map(d => ({ id: d.id, data: () => { const { id, ...r } = d; return r; } })), empty: !arr.length, size: arr.length });
  w.firebase = { firestore: { FieldValue: { delete: () => DELETE } } };
  w.AppState = { user: { uid: 'u1' } };
  w.invalidateCourseData = () => {};
  w.sectionRef = () => ({
    collection: (name) => {
      if (name === 'students') return { orderBy: () => ({ get: async () => snap(students) }) };
      if (name === 'scores') return {
        get: async () => ({ docs: Object.entries(store).map(([id, d]) => ({ id, data: () => ({ ...d }) })) }),
        doc: (sid) => ({
          set: async (obj) => {
            if (env.setBehavior) await env.setBehavior(obj);
            const [k, v] = Object.entries(obj)[0];
            writes.push({ sid, k, v: v === DELETE ? 'DELETE' : v });
            if (v === DELETE) delete store[sid][k]; else store[sid][k] = v;
          }
        })
      };
    }
  });
  w.db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ collection: (name) => {
    if (name === 'assessments') return { orderBy: () => ({ get: async () => snap(assessments) }) };
    return { doc: (n) => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
  } }) }) }) }) };
  // เร่งเวลา retry เพื่อทดสอบเร็ว
  const realST = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms) => realST(fn, Math.min(ms, 5));
  const counts = { add: 0, rem: 0 };
  const a = w.addEventListener.bind(w), r = w.removeEventListener.bind(w);
  w.addEventListener = (t, ...x) => { if (t === 'beforeunload') counts.add++; return a(t, ...x); };
  w.removeEventListener = (t, ...x) => { if (t === 'beforeunload') counts.rem++; return r(t, ...x); };
  env.counts = counts;
  w.eval(['utils.js', 'scores.js'].map(f => fs.readFileSync(`${root}/js/${f}`, 'utf8')).join('\n;\n') + '\n;this.__calcGrade = calcGrade; this.__parse = parseDelimitedText; this.renderScoresTab = renderScoresTab;');
  const container = w.document.getElementById('view');
  env.render = async () => { await w.renderScoresTab(container, { id: 'c1' }, { id: 'sec1', room: '1' }); };
  await env.render();
  env.input = (sid, aid) => container.querySelector(`.score-input[data-student-id="${sid}"][data-assessment-id="${aid}"]`);
  env.type = (sid, aid, text) => { const i = env.input(sid, aid); i.value = text; i.dispatchEvent(new w.Event('input', { bubbles: true })); return i; };
  env.cell = (sel) => container.querySelector(sel);
  env.status = () => w.document.getElementById('save-status');
  env.container = container;
  return env;
}

(async () => {
  console.log('\n[1] เกรดที่ขอบเกณฑ์ (ทศนิยมลอยตัว)');
  {
    const e = await makeEnv();
    const vals = [9.9, 8.6, 2.5, 6.2, 3.4, 5.6, 9.5, 4.3]; // รวมจริง = 50.0
    vals.forEach((v, i) => e.type('s1', 'a' + (i + 1), String(v)));
    ok(e.cell('[data-total-for="s1"]').textContent === '50', 'ผลรวมแสดง 50 (ไม่ใช่ 49.99999999999999)', e.cell('[data-total-for="s1"]').textContent);
    ok(e.cell('[data-grade-for="s1"]').textContent.trim() === '1.0', 'เกรดที่ได้ 1.0 (เดิมได้ 0)', e.cell('[data-grade-for="s1"]').textContent);
    // สุ่มซ้ำกับ calcGrade จริง
    let wrong = 0, tried = 0;
    for (let n = 0; n < 300000; n++) {
      const k = 4 + Math.floor(Math.random() * 5); const v = [];
      for (let i = 0; i < k; i++) v.push(Math.round(Math.random() * 100) / 10);
      const ex = v.reduce((s, x) => s + Math.round(x * 10), 0) / 10;
      if (![50, 55, 60, 65, 70, 75, 80].includes(ex)) continue; tried++;
      const g = e.w.__calcGrade(v.reduce((s, x) => s + x, 0));
      if (g !== e.w.__calcGrade(ex)) wrong++;
    }
    ok(wrong === 0, `สุ่ม ${tried} ชุดที่ขอบเกณฑ์: เกรดผิด ${wrong}`);
    ok(e.w.__calcGrade(49.999) === '0' && e.w.__calcGrade(79.9999) === '3.5', 'คะแนนต่ำกว่าเกณฑ์จริง ๆ ยังตกเกรดตามเดิม');
    ok(e.w.__calcGrade(NaN) === '0' && e.w.__calcGrade('') === '0', 'ค่าไม่ใช่ตัวเลขไม่ทำให้พัง');
  }

  console.log('\n[2] ล้างช่อง = ลบฟิลด์ (ไม่ใช่ 0)');
  {
    const e = await makeEnv({ seed: { s1: { a1: 7 } } });
    e.type('s1', 'a1', '');
    await sleep(60);
    ok(e.writes.at(-1)?.v === 'DELETE', 'ล้างช่องแล้วส่งคำสั่งลบฟิลด์', e.writes);
    ok(!('a1' in e.store.s1), 'ฐานข้อมูลไม่มี a1 (ไม่ใช่ 0)', e.store.s1);
    e.type('s1', 'a2', '0'); await sleep(60);
    ok(e.store.s1.a2 === 0, 'พิมพ์ 0 ยังบันทึกเป็น 0 (แยกจาก "ว่าง")');
  }

  console.log('\n[3] พิมพ์ "." ไม่ส่ง NaN');
  {
    const e = await makeEnv();
    e.type('s1', 'a1', '.'); await sleep(60);
    ok(e.writes.length === 0, 'พิมพ์ "." อย่างเดียวไม่บันทึกอะไร', e.writes);
    e.type('s1', 'a1', '.5'); await sleep(60);
    ok(e.store.s1.a1 === 0.5, 'พิมพ์ ".5" บันทึก 0.5', e.store.s1);
    ok(e.writes.every(x => x.v === 'DELETE' || Number.isFinite(x.v)), 'ไม่มีค่า NaN ถูกเขียนเลย');
  }

  console.log('\n[4] คะแนนเกินคะแนนเต็ม');
  {
    const e = await makeEnv({ max: 10 });
    const i = e.type('s1', 'a1', '25'); await sleep(60);
    ok(i.value === '10', 'ช่องถูกปรับเป็น 10', i.value);
    ok(e.store.s1.a1 === 10, 'ฐานข้อมูลได้ 10 ไม่ใช่ 25', e.store.s1);
    ok(/คะแนนเต็ม/.test(e.w.document.getElementById('toast').textContent), 'มีข้อความแจ้งเตือน');
    ok(e.cell('[data-total-for="s1"]').textContent === '10', 'ผลรวมนับ 10');
  }

  console.log('\n[5] วางจาก Excel');
  {
    const e = await makeEnv({ seed: { s2: { a1: 99 } } });
    const paste = (inp, text) => { const ev = new e.w.Event('paste', { bubbles: true, cancelable: true }); ev.clipboardData = { getData: () => text }; inp.dispatchEvent(ev); };
    // นักเรียนคนที่ 2 ขาดสอบ (แถวว่าง) คนที่ 3,4 มีคะแนน — ข้อความแบบที่ Excel ให้ (ลงท้ายด้วย \n)
    paste(e.input('s1', 'a1'), '8\n\n6\n7\n');
    await sleep(80);
    ok(e.store.s1.a1 === 8 && e.store.s3.a1 === 6 && e.store.s4.a1 === 7, 'คนที่ 1,3,4 ได้ 8,6,7 ตรงคน', e.store);
    ok(!('a1' in e.store.s2), 'คนที่ 2 (แถวว่าง) ถูกล้าง ไม่ใช่รับคะแนนของคนอื่น', e.store.s2);
    // ช่วงที่ช่องแรกว่าง: \t5\t6 วางที่คอลัมน์ a1 → a1 ว่าง a2=5 a3=6
    const e2 = await makeEnv();
    const p2 = (inp, text) => { const ev = new e2.w.Event('paste', { bubbles: true, cancelable: true }); ev.clipboardData = { getData: () => text }; inp.dispatchEvent(ev); };
    p2(e2.input('s1', 'a1'), '\t5\t6\n3\t\t4\n'); await sleep(80);
    ok(!('a1' in e2.store.s1) && e2.store.s1.a2 === 5 && e2.store.s1.a3 === 6, 'แท็บหน้าสุดคงตำแหน่ง (a1 ว่าง a2=5 a3=6)', e2.store.s1);
    ok(e2.store.s2.a1 === 3 && !('a2' in e2.store.s2) && e2.store.s2.a3 === 4, 'ช่องว่างกลางแถวไม่เลื่อนคอลัมน์', e2.store.s2);
    // หัวตาราง/ข้อความ ต้องไม่กลายเป็น 0
    const e3 = await makeEnv({ seed: { s1: { a1: 5 } } });
    const p3 = (inp, text) => { const ev = new e3.w.Event('paste', { bubbles: true, cancelable: true }); ev.clipboardData = { getData: () => text }; inp.dispatchEvent(ev); };
    p3(e3.input('s1', 'a1'), 'คะแนน\n9\n'); await sleep(80);
    ok(e3.store.s1.a1 === 5 && e3.store.s2.a1 === 9, 'ข้อความ "คะแนน" ถูกข้าม ไม่ทับค่าเดิม และไม่กลายเป็น 0', e3.store);
    // เกินคะแนนเต็ม
    const e4 = await makeEnv({ max: 10 });
    const p4 = (inp, text) => { const ev = new e4.w.Event('paste', { bubbles: true, cancelable: true }); ev.clipboardData = { getData: () => text }; inp.dispatchEvent(ev); };
    p4(e4.input('s1', 'a1'), '50\n7\n'); await sleep(80);
    ok(e4.store.s1.a1 === 10 && e4.store.s2.a1 === 7, 'วางค่าเกินเต็มถูกปรับเป็น 10', e4.store);
  }

  console.log('\n[6] บันทึกพลาด → retry / แจ้งสถานะ / ลองใหม่');
  {
    const e = await makeEnv();
    let n = 0; e.setBehavior = async () => { if (++n <= 2) throw new Error('network'); };
    e.type('s1', 'a1', '4'); await sleep(200);
    ok(e.store.s1.a1 === 4, 'พลาด 2 ครั้ง แล้วลองซ้ำอัตโนมัติจนสำเร็จ', e.store);
    ok(/บันทึกแล้ว/.test(e.status().textContent), 'สถานะกลับเป็น "บันทึกแล้ว" (เดิมค้างตลอด)', e.status().textContent);

    const e2 = await makeEnv();
    e2.setBehavior = async () => { throw new Error('down'); };
    e2.type('s1', 'a1', '4'); await sleep(250);
    ok(/บันทึกไม่สำเร็จ 1 ช่อง/.test(e2.status().textContent), 'พลาดครบ retry แล้วแสดงจำนวนช่องที่ล้มเหลว', e2.status().textContent);
    e2.setBehavior = null;
    e2.status().click(); await sleep(60);
    ok(e2.store.s1.a1 === 4 && /บันทึกแล้ว/.test(e2.status().textContent), 'กดที่สถานะเพื่อลองใหม่ → สำเร็จ', [e2.store.s1, e2.status().textContent]);

    // ค่าเก่าต้องไม่ทับค่าใหม่
    const e3 = await makeEnv();
    e3.setBehavior = async (obj) => { if (Object.values(obj)[0] === 3) { await sleep(30); throw new Error('slow fail'); } };
    e3.type('s1', 'a1', '3'); await sleep(15);   // 3 กำลังส่ง
    e3.type('s1', 'a1', '4'); await sleep(250);
    ok(e3.store.s1.a1 === 4, 'ค่าเก่า (3) ที่พลาดไม่ทับค่าใหม่ (4)', e3.store.s1);
    ok(/บันทึกแล้ว/.test(e3.status().textContent), 'สถานะไม่ค้าง', e3.status().textContent);
  }

  console.log('\n[7] listener beforeunload ไม่ซ้อน');
  {
    const e = await makeEnv();
    await e.render(); await e.render();
    ok(e.counts.add - e.counts.rem === 1, `เปิดหน้า 3 รอบ เหลือ listener 1 ตัว (add=${e.counts.add}, remove=${e.counts.rem})`);
  }

  console.log('\n[8] ตัวแยกข้อความ (นำเข้า CSV)');
  {
    const e = await makeEnv();
    const P = e.w.__parse;
    let r = P('1,66001,"นายสมชาย, ใจดี",ม.4/1');
    ok(r[0].length === 4 && r[0][2] === 'นายสมชาย, ใจดี', 'ชื่อที่มี comma ในเครื่องหมายคำพูดไม่แยกผิด', r);
    r = P('ลำดับ,ชื่อ\r\n1,"สมศรี ""แจ๋ว"" ดี"\r\n\r\n2,สมหมาย\r\n');
    ok(r.length === 3 && r[1][1] === 'สมศรี "แจ๋ว" ดี' && r[2][1] === 'สมหมาย', 'อ่าน "" ในช่อง, CRLF, ตัดแถวว่างในโหมดนำเข้า', r);
    r = P('เลขที่\tชื่อ\n1\tสมชาย\n');
    ok(r.length === 2 && r[1][1] === 'สมชาย', 'ข้อความแท็บจาก Excel ยังอ่านได้เหมือนเดิม', r);
    r = P('\uFEFFno,name\n1,a');
    ok(r[0][0] === 'no', 'ตัด BOM หน้าไฟล์ CSV');
  }

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
