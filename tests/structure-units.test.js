// ทดสอบหน้าโครงสร้างคะแนน: หมวดหมู่หลักมาตรฐาน + หน่วยการเรียนรู้ + ชิ้นงาน (js/structure.js)
// รัน: node tests/structure-units.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'structure.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

// ---------- Firestore จำลอง (เก็บเป็น path → ข้อมูล) ----------
function makeDb(store) {
  let auto = 0;
  const ref = (p) => ({
    id: p.split('/').pop(), path: p,
    collection: (n) => colRef(p + '/' + n),
    get: async () => ({ exists: p in store, data: () => store[p], id: p.split('/').pop() }),
  });
  const colRef = (p) => ({
    path: p,
    doc: (id) => ref(p + '/' + (id || 'auto' + (++auto))),
    orderBy: () => colRef(p),
    get: async () => {
      const docs = Object.keys(store).filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'))
        .map(k => ({ id: k.split('/').pop(), ref: ref(k), data: () => store[k] }));
      docs.sort((a, b) => (a.data().order || 0) - (b.data().order || 0));
      return { docs };
    },
  });
  const writes = [];
  return {
    writes,
    collection: (n) => colRef(n),
    batch: () => {
      const ops = [];
      return {
        set: (r, d) => ops.push(['set', r, d]),
        delete: (r) => ops.push(['delete', r]),
        commit: async () => { ops.forEach(([k, r, d]) => { if (k === 'set') { store[r.path] = d; writes.push(r.path); } else delete store[r.path]; }); },
      };
    },
  };
}

async function setup(store, opts, course) {
  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const db = makeDb(store);
  let n = 0;
  Object.assign(w, {
    db, AppState: { user: { uid: 'U' } }, uid4: () => 'x' + (++n),
    escapeHtml: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    icon: () => '', showLoading: () => {}, showToast: () => {}, openModal: () => {}, closeModal: () => {},
    invalidateCourseData: () => {}, offerTemplateSync: () => {}, confirm: () => true,
    cleanAttachments: (a) => a || [], ATT_MAX_PER_ITEM: 5,
    navigate: (r) => { w.__nav = r; }, openAttachmentsViewer: (it) => { w.__viewer = it; },
  });
  w.eval(src + '\nwindow.__render = renderStructureTab; window.__reorder = reorderFromDom;');
  const c = w.document.getElementById('c');
  await w.__render(c, course || { id: 'C1', isTemplate: false }, opts);
  return { w, c, db, store };
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const tick = () => new Promise(r => setTimeout(r, 0));
const groupNames = (c) => [...c.querySelectorAll('input.group-name')].map(i => i.value);

(async () => {
  console.log('วิชาใหม่ (ยังไม่เคยบันทึกโครงสร้าง)');
  {
    const { c } = await setup({});
    ok(JSON.stringify(groupNames(c)) === JSON.stringify(['ก่อนกลางภาค', 'หลังกลางภาค']), 'สร้างหมวด ก่อนกลางภาค / หลังกลางภาค ให้อัตโนมัติ');
  }

  console.log('วิชาเก่าที่เคยบันทึกแล้ว (ไม่แตะข้อมูลเก่า)');
  {
    const base = 'users/U/courses/C1';
    const { c } = await setup({
      [base + '/settings/structure']: { groups: [] },
      [base + '/assessments/a1']: { name: 'งาน 1', max: 10, category: 'collect', order: 0, groupId: null },
    });
    ok(groupNames(c).length === 0, 'groups ว่างที่บันทึกไว้เดิมไม่ถูกเติมหมวดให้เอง');
    ok(c.querySelectorAll('.unit-name').length === 0, 'ไม่มีหน่วยเกิดขึ้นเอง');
    ok(c.querySelector('input.row-name').value === 'งาน 1', 'งานเดิมยังอยู่');
  }

  console.log('สร้างหน่วย + ชิ้นงาน แล้วบันทึก');
  {
    const store = {};
    const { w, c } = await setup(store);
    const gBefore = c.querySelector('button.unit-new'); // ปุ่มของ "ยังไม่จัดหมวด"
    const btns = [...c.querySelectorAll('button.unit-new')];
    ok(btns.length === 3, 'มีปุ่ม + หน่วยการเรียนรู้ ทั้ง "ยังไม่จัดหมวด" และ 2 หมวด');
    click(w, btns[1]); // หมวด ก่อนกลางภาค
    const un = c.querySelector('input.unit-name'); un.value = 'หน่วยที่ 1'; un.dispatchEvent(new w.Event('input', { bubbles: true }));
    click(w, c.querySelector('button.unit-add'));
    click(w, c.querySelector('button.unit-add'));
    const names = c.querySelectorAll('input.row-name'); names[0].value = 'ใบงาน 1'; names[0].dispatchEvent(new w.Event('input', { bubbles: true }));
    names[1].value = 'ใบงาน 2'; names[1].dispatchEvent(new w.Event('input', { bubbles: true }));
    ok(c.querySelector('.unit-stat').textContent.includes('2 ชิ้นงาน'), 'สรุปหน่วยนับ 2 ชิ้นงาน');
    // งานนอกหน่วยในหมวดหลังกลางภาค
    click(w, [...c.querySelectorAll('button.group-add')][2]);
    click(w, c.querySelector('#save-structure-btn')); await tick(); await tick();
    const st = store['users/U/courses/C1/settings/structure'];
    ok(st && st.groups.length === 2 && st.units.length === 1, 'บันทึก groups 2 + units 1');
    ok(st.units[0].groupId === st.groups[0].id && st.units[0].name === 'หน่วยที่ 1', 'หน่วยอยู่ในหมวดก่อนกลางภาค');
    const items = Object.entries(store).filter(([k]) => k.includes('/assessments/')).map(([, v]) => v).filter(v => v.category === 'collect');
    const inUnit = items.filter(v => v.unitId === st.units[0].id);
    ok(inUnit.length === 2 && inUnit.every(v => v.groupId === st.groups[0].id), 'ชิ้นงาน 2 ชิ้นอยู่ในหน่วย และ groupId ตรงกับหมวดของหน่วย');
    ok(items.some(v => v.unitId === null && v.groupId === st.groups[1].id), 'งานนอกหน่วยในหมวดหลังกลางภาคไม่มี unitId');
    ok(items.map(v => v.order).join() === [...items.map(v => v.order)].sort((a, b) => a - b).join(), 'ลำดับ order ต่อเนื่องตามการแสดงผล');

    console.log('ย้ายงานด้วยช่อง "ที่อยู่" / ลากวาง');
    const c2 = (await setup(store)).c; // โหลดจากข้อมูลที่บันทึก
    ok(c2.querySelectorAll('tr[data-type="unit"]').length === 1, 'โหลดกลับมาแล้วเห็นหัวข้อหน่วย 1 หน่วย');
    const w2 = c2.ownerDocument.defaultView;
    const tbody = c2.querySelector('#struct-tbody');
    // ลาก "งานนอกหน่วย" ของหมวดหลังกลางภาคขึ้นไปวางใต้หัวข้อหน่วย (ก่อนชิ้นงานแรกของหน่วย)
    const unitTr = tbody.querySelector('tr[data-type="unit"]');
    const loose = [...tbody.querySelectorAll('tr[data-type="item"]')].find(tr => tr.querySelector('.row-name').value.startsWith('รายการที่')); // ชื่อว่างถูกตั้งชื่อให้ตอนบันทึก
    unitTr.after(loose);
    const itemsArr = [];
    // ดึงอาร์เรย์ items จาก reorder โดยใช้ข้อมูลที่ DOM อ้างถึง
    const probe = [...tbody.querySelectorAll('tr[data-type="item"]')].map(tr => ({ id: tr.dataset.id, groupId: 'z', unitId: 'z' }));
    w2.__reorder(tbody, probe);
    const moved = probe.find(p => p.id === loose.dataset.id);
    ok(moved.unitId === unitTr.dataset.uid && moved.groupId === unitTr.dataset.gid, 'งานที่ลากมาวางใต้หัวข้อหน่วยกลายเป็นชิ้นงานของหน่วยนั้น (หมวดตามหน่วย)');
    const firstGroupHdr = tbody.querySelector('tr[data-type="group"]');
    firstGroupHdr.after(loose);
    const probe2 = [...tbody.querySelectorAll('tr[data-type="item"]')].map(tr => ({ id: tr.dataset.id, groupId: 'z', unitId: 'z' }));
    w2.__reorder(tbody, probe2);
    const m2 = probe2.find(p => p.id === loose.dataset.id);
    ok(m2.unitId === null && m2.groupId === firstGroupHdr.dataset.gid, 'วางใต้หัวข้อหมวดโดยตรง → ไม่อยู่ในหน่วย');

    console.log('ลบหน่วย / ลบหมวด');
    const sel = c2.querySelector('select.row-group');
    const optVals = [...sel.options].map(o => o.value);
    ok(optVals[0] === '' && optVals.some(v => v.startsWith('g:')) && optVals.some(v => v.startsWith('u:')), 'ช่อง "ที่อยู่" มีตัวเลือก ว่าง / หมวด / หน่วย');
    click(w2, c2.querySelector('button.unit-del'));
    ok(c2.querySelectorAll('tr[data-type="unit"]').length === 0 && c2.querySelectorAll('tr[data-type="item"]').length >= 2, 'ลบหน่วยแล้วชิ้นงานไม่หาย');
    click(w2, c2.querySelector('button.group-del'));
    ok(groupNames(c2).length === 1, 'ลบหมวดได้');
  }

  console.log('โหมดอ่านอย่างเดียว (หน้ารายวิชาของฉัน) — แก้ไม่ได้');
  {
    const base = 'users/U/courses/C1';
    const store = {
      [base + '/settings/structure']: { groups: [{ id: 'g1', name: 'ก่อนกลางภาค' }], units: [{ id: 'u1', name: 'หน่วยที่ 1', groupId: 'g1' }] },
      [base + '/assessments/a1']: { name: 'ใบงาน 1', max: 10, category: 'collect', order: 0, groupId: 'g1', unitId: 'u1', attachments: [{ id: 't1', kind: 'link', title: 'ฟอร์ม', url: 'https://forms.gle/x' }] },
      [base + '/assessments/a2']: { name: 'งาน 2', max: 20, category: 'collect', order: 1, groupId: 'g1', unitId: null },
      [base + '/assessments/m']: { name: 'สอบกลางภาค', max: 20, category: 'midterm', order: 2 },
      [base + '/assessments/f']: { name: 'สอบปลายภาค', max: 30, category: 'final', order: 3 },
    };
    const { w, c, db } = await setup(store, { readOnly: true }, { id: 'C1', isTemplate: false, templateId: 'T9' });
    ok(c.textContent.includes('ใบงาน 1') && c.textContent.includes('หน่วยที่ 1') && c.textContent.includes('ก่อนกลางภาค'), 'ยังแสดงหมวด/หน่วย/ชิ้นงานครบ');
    ok(c.textContent.includes('30'), 'ยังแสดงยอดรวมคะแนนเก็บ');
    const editors = 'input.row-name, input.row-detail, input.row-max, input.group-name, input.unit-name, select.row-group, #new-group-name, #add-group-btn, #add-item-btn, #save-structure-btn, .del-item, .group-del, .unit-del, .group-add, .unit-add, .unit-new, .group-up, .group-down, .handle-col, .quick-group';
    ok(c.querySelectorAll(editors).length === 0, 'ไม่มีช่องกรอก/ปุ่มเพิ่ม-ลบ-บันทึก-ลาก-ย้ายใด ๆ เหลืออยู่');
    ok(!c.querySelector('.group-col'), 'ไม่แสดงคอลัมน์ "ที่อยู่ (หมวด / หน่วย)"');
    const nameCell = (id) => c.querySelector(`tr[data-id="${id}"] td:nth-child(2)`);
    ok(nameCell('a1').style.paddingLeft && !nameCell('a2').style.paddingLeft, 'ชิ้นงานในหน่วยเยื้องเข้ามา ส่วนงานนอกหน่วยไม่เยื้อง')
    ok(c.querySelector('#mid-max-input').readOnly && c.querySelector('#final-max-input').readOnly, 'ช่องคะแนนกลางภาค/ปลายภาคเป็น readonly');
    ok(c.querySelectorAll('input:not([readonly])').length === 0, 'ไม่มี input ที่พิมพ์ได้เลย');
    ok(!c.querySelector('.att-btn[data-id="a2"]'), 'งานที่ไม่มีสื่อไม่แสดงปุ่มแนบ');
    click(w, c.querySelector('.att-btn[data-id="a1"]'));
    ok(w.__viewer && w.__viewer.id === 'a1', 'ปุ่มสื่อเปิดหน้าดูอย่างเดียว (ไม่ใช่หน้าแนบ/แก้)');
    click(w, c.querySelector('#struct-ro-edit'));
    ok(w.__nav === 'structure-page' && w.AppState.structureOpenOnce === 'T9' && w.AppState.structureTab === 'score', 'ปุ่ม "ไปแก้ที่ตั้งค่าโครงสร้างวิชา" พาไปแม่แบบของวิชานี้');
    ok(db.writes.length === 0, 'ไม่มีการเขียนลงฐานข้อมูล');
  }

  console.log('โหมดอ่านอย่างเดียว: วิชาเก่าที่ไม่มีแม่แบบ');
  {
    const { c } = await setup({}, { readOnly: true }, { id: 'C1', isTemplate: false });
    ok(!c.querySelector('#struct-ro-edit'), 'ไม่มีปุ่มพาไปแก้ถ้าไม่มี templateId (แต่ยังมีข้อความบอกว่าแก้ที่ไหน)');
    ok(c.textContent.includes('ตั้งค่าโครงสร้างวิชา'), 'ข้อความบอกให้ไปแก้ที่หน้าตั้งค่าโครงสร้างวิชา');
  }

  console.log('หน้าตั้งค่าโครงสร้างวิชา (แม่แบบ) ยังแก้ได้ตามปกติ');
  {
    const { c } = await setup({}, undefined, { id: 'T1', isTemplate: true });
    ok(c.querySelector('#save-structure-btn') && c.querySelector('#add-item-btn') && c.querySelector('#add-group-btn'), 'ยังมีปุ่มบันทึก/เพิ่มแถว/เพิ่มหมวดหมู่');
  }

  console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
