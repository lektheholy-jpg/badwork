#!/usr/bin/env node
// แยก css/style.css ตามเครื่องหมาย bundle ก่อนย่อ (แหล่งเดียว: style.css — ห้ามแก้ไฟล์ที่ได้ออกมาด้วยมือ)
//
//   /* @bundle docs … */  กฎของหน้าระบบเอกสาร  /* @endbundle */   →  css/docs.min.css (โหลดตอนเปิดหน้าระบบเอกสาร)
//   ส่วนที่เหลือ                                                     →  css/style.min.css (โหลดตอนเปิดแอป)
//
// ใช้: node tools/split-css.js <outDir>   → เขียน <outDir>/core.css และ <outDir>/<ชื่อ bundle>.css
//       node tools/split-css.js --verify  → ตรวจอย่างเดียว (ไม่เขียนไฟล์) exit 1 ถ้าพบ
//
// ตรวจให้ทุกครั้ง (กันกฎของหน้าหลักหลุดไปอยู่ใน bundle แล้วหน้าหลักเพี้ยน):
//   1) มี @bundle/@endbundle เป็นคู่ ไม่ซ้อนกัน และ bundle ไม่ว่าง
//   2) ทุก selector ในกฎของ bundle ต้องมี class/id อย่างน้อย 1 ตัวที่ "ไม่ปรากฏ" ใน index.html หรือ JS ที่โหลดตอนเปิดแอป
//      (ถ้าไม่ผ่าน = กฎนั้นอาจมีผลกับหน้าหลัก ให้ย้ายออกไปไว้นอกบล็อก)
//   3) ไม่มีกฎของหน้าหลักที่อยู่ถัดจาก bundle (bundle โหลดทีหลัง ลำดับการทับกันต้องเท่าเดิม → bundle ต้องอยู่ท้ายไฟล์)
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// ไฟล์ที่โหลดตอนเปิดแอป = ใน index.html (<script src="js/…">) + theme.js · ต้องตรงกับ README หัวข้อ "โหลดสคริปต์แบบ lazy"
function coreSources() {
  const html = read('index.html');
  const js = [...html.matchAll(/<script[^>]*\ssrc="(js\/[^"]+)"/g)].map(m => m[1]);
  // timetable.js ถูกโหลดตอนเปิดหน้าแรก (วิดเจ็ต) จึงนับเป็นของหน้าหลักด้วย
  return [html, ...[...new Set([...js, 'js/timetable.js'])].map(read)].join('\n');
}

const BEGIN = /\/\*\s*@bundle\s+([\w-]+)/;
const END = /\/\*\s*@endbundle\s*\*\//;

function split(css) {
  const problems = [];
  const out = { core: [], bundles: {} };
  let cur = null;
  css.split('\n').forEach((line, i) => {
    const b = BEGIN.exec(line);
    if (b) {
      if (cur) problems.push(`บรรทัด ${i + 1}: @bundle ซ้อนกัน (ยังไม่ปิด ${cur})`);
      cur = b[1]; out.bundles[cur] = out.bundles[cur] || []; out.bundles[cur].push(line); return;
    }
    if (END.test(line)) {
      if (!cur) problems.push(`บรรทัด ${i + 1}: @endbundle ที่ไม่มี @bundle`);
      else out.bundles[cur].push(line); cur = null; return;
    }
    (cur ? out.bundles[cur] : out.core).push(line);
  });
  if (cur) problems.push(`@bundle ${cur} ไม่มี @endbundle`);
  return { core: out.core.join('\n'), bundles: Object.fromEntries(Object.entries(out.bundles).map(([k, v]) => [k, v.join('\n')])), problems };
}

function verify(css) {
  const { core, bundles, problems } = split(css);
  const names = Object.keys(bundles);
  const coreText = coreSources();
  const tokens = sel => [...sel.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].map(m => m[1]);
  for (const name of names) {
    const root = postcss.parse(bundles[name]);
    let rules = 0;
    root.walkRules(r => {
      const top = (() => { let p = r; while (p.parent && p.parent.type !== 'root') p = p.parent; return p; })();
      if (top.type === 'atrule' && /keyframes|font-face/.test(top.name)) return;
      rules++;
      for (const sel of r.selectors) {
        const own = tokens(sel).filter(t => !coreText.includes(t));
        if (!own.length) problems.push(`bundle ${name}: "${sel.replace(/\s+/g, ' ').trim()}" ไม่มี class/id ที่เป็นของหน้าระบบเอกสารโดยเฉพาะ (ทุกตัวถูกใช้ในหน้าหลัก)`);
      }
    });
    if (!rules) problems.push(`bundle ${name} ว่าง`);
    // ลำดับ: ไม่มีกฎของหน้าหลักหลังจบ bundle
    const idx = css.lastIndexOf('@endbundle');
    const rest = postcss.parse(css.slice(idx).replace(/^[^\n]*\n?/, '')); // ตัดบรรทัด @endbundle ทิ้ง
    let tail = 0; rest.walkRules(() => tail++);
    if (tail) problems.push(`มีกฎของหน้าหลัก ${tail} ข้อ อยู่หลัง bundle ${name} — ย้ายขึ้นไปก่อนเครื่องหมาย @bundle`);
  }
  return { core, bundles, problems };
}

if (require.main === module) {
  const arg = process.argv[2];
  const css = read('css/style.css');
  const r = verify(css);
  if (r.problems.length) { console.error('✗ ตรวจ bundle ของ CSS ไม่ผ่าน:\n  - ' + r.problems.join('\n  - ')); process.exit(1); }
  if (arg && arg !== '--verify') {
    fs.mkdirSync(arg, { recursive: true });
    fs.writeFileSync(path.join(arg, 'core.css'), r.core);
    for (const [k, v] of Object.entries(r.bundles)) fs.writeFileSync(path.join(arg, k + '.css'), v);
  }
  console.log(`✓ bundle CSS: ${Object.keys(r.bundles).map(k => k + ' ' + postcss.parse(r.bundles[k]).nodes.length + ' nodes').join(' · ')}`);
}
module.exports = { split, verify };
