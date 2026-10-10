#!/usr/bin/env node
// สร้างระบบเอกสารใหม่ (เหมือน PA / ID-Plan) ด้วยคำสั่งเดียว
//   node tools/new-doc-system.js <id> "<ชื่อระบบ>" [--dry-run]
//   ตัวอย่าง: node tools/new-doc-system.js tra "แผนการอบรม"
//
// ทำอะไร
//   1) สร้างไฟล์จาก tools/templates/ (ลอกรูปแบบจาก idp-*.js)
//        js/<id>-config.js · js/<id>.js · js/<id>-ai.js · tests/<id>.test.js
//   2) แก้ไฟล์เดิม 5 จุด (README ของหัวข้อ "เพิ่มระบบเอกสารใหม่")
//        js/utils.js    LAZY_MODULES · LAZY_BUNDLES · docConfigs
//        js/app.js      ROUTE_MODULES · renderRoute · ไทล์เมนู "เพิ่มเติม" บนมือถือ
//        index.html     ปุ่มเมนูข้าง (ต่อท้ายกลุ่มระบบเอกสาร)
//        sw.js          PRECACHE + เลข VERSION
//        firestore.rules  collection <id>_docs ใต้ users/{uid}/
//        (+ package.json เพิ่มสคริปต์ test:<id>)
//   3) รัน node --check กับไฟล์ที่สร้าง แล้ว check-sw + check-inline เอง
//
// ปลอดภัย: คำนวณผลทุกไฟล์ในหน่วยความจำก่อน — ถ้าหาจุดแก้ไม่เจอ/ชื่อชนกับของเดิม จะหยุดโดยยังไม่เขียนอะไรเลย
// เทสต์ jsdom (tests/<id>.test.js) ต้องมี node_modules → npm install && npm run test:<id>
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const abs = f => path.join(root, f);
const read = f => fs.readFileSync(abs(f), 'utf8');
const die = msg => { console.error('✗ ' + msg); process.exit(1); };

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pos = args.filter(a => !a.startsWith('--'));
if (pos.length !== 2) {
  console.error('ใช้: node tools/new-doc-system.js <id> "<ชื่อระบบ>" [--dry-run]\n  id = ตัวพิมพ์เล็ก/ตัวเลข 2–12 ตัว ขึ้นต้นด้วยตัวอักษร (เช่น tra)\n  ชื่อ = ชื่อที่แสดงในหน้า/เมนู (ห้ามมี \' " ` \\ $ < > & { })');
  process.exit(1);
}
const [id, title] = pos;
if (!/^[a-z][a-z0-9]{1,11}$/.test(id)) die(`id "${id}" ไม่ถูกต้อง — ใช้ a–z และ 0–9 ยาว 2–12 ตัว ขึ้นต้นด้วยตัวอักษร (id นี้เป็นทั้งชื่อไฟล์ ชื่อฟังก์ชัน ${id}RenderFormView และ route ${id}-page)`);
if (!title.trim() || /['"`\\$<>&{}\r\n]/.test(title)) die('ชื่อระบบว่าง หรือมีอักขระที่ใส่ในโค้ดไม่ได้ (\' " ` \\ $ < > & { } หรือขึ้นบรรทัดใหม่)');
const UPPER = id.toUpperCase();
const COLLECTION = `${id}_docs`;

// ---------------------------------------------------------------- อ่านสภาพปัจจุบัน
const utils = read('js/utils.js');
const app = read('js/app.js');
const html = read('index.html');
const sw = read('sw.js');
const rules = read('firestore.rules');
const pkgText = read('package.json');

const jsFiles = fs.readdirSync(abs('js')).filter(n => n.endsWith('.js'));
const allJs = jsFiles.map(n => [n, read('js/' + n)]);

// ระบบที่มีอยู่แล้ว = ทุก renderDocPage('<x>') ใน app.js
const existingIds = [...app.matchAll(/renderDocPage\('([a-z0-9]+)'\)/g)].map(m => m[1]);
if (!existingIds.length) die('ไม่พบ renderDocPage(...) ใน js/app.js — โครงโปรเจกต์ไม่ตรงกับที่สคริปต์คาดไว้');
const docRoutes = existingIds.map(x => `${x}-page`);

// ---------------------------------------------------------------- ตรวจชนกับของเดิม (ก่อนแตะไฟล์ใด ๆ)
const problems = [];
const newFiles = {
  [`js/${id}-config.js`]: 'config.js.tpl',
  [`js/${id}.js`]: 'ui.js.tpl',
  [`js/${id}-ai.js`]: 'ai.js.tpl',
  [`tests/${id}.test.js`]: 'test.js.tpl',
};
for (const f of Object.keys(newFiles)) if (fs.existsSync(abs(f))) problems.push(`มีไฟล์ ${f} อยู่แล้ว`);
if (existingIds.includes(id)) problems.push(`มีระบบ "${id}" อยู่แล้ว (renderDocPage('${id}') ใน js/app.js)`);
// ชื่อ global ที่ขึ้นต้นด้วย id (เช่น idRenderListView) ต้องไม่ชนของเดิม — id สั้น/ชื่อซ้ำ prefix เช่น doc, pa จะชน
const declRe = new RegExp(`^(?:async\\s+)?(?:function|const|let|var)\\s+(${id}(?:[A-Z_][A-Za-z0-9_]*)?)\\b`, 'gm');
for (const [n, src] of allJs) for (const m of src.matchAll(declRe)) problems.push(`js/${n} มีชื่อ global "${m[1]}" ที่จะชนกับฟังก์ชันของระบบใหม่ (ขึ้นต้น ${id}…) — เลือก id อื่น`);
if (new RegExp(`['"]${id}-page['"]`).test(app + html)) problems.push(`route "${id}-page" ถูกใช้แล้ว`);
if (new RegExp(`['"]?${id}['"]?\\s*:\\s*\\[?\\s*'(?:js/|doc-system)`).test(utils) || utils.includes(`'${id}-config'`)) problems.push(`js/utils.js มีโมดูล/กลุ่ม "${id}" อยู่แล้ว`);
const cfgAll = allJs.filter(([n]) => n.endsWith('-config.js')).map(([, s]) => s).join('\n');
for (const key of [`'${id}-ctx-'`, `'${id}-ai-ctx-v1'`]) if (cfgAll.includes(key)) problems.push(`${key} ถูกใช้แล้วใน config ของระบบอื่น`);
if (rules.includes(`/${COLLECTION}/`)) problems.push(`firestore.rules มี collection ${COLLECTION} แล้ว`);
if (pkgText.includes(`"test:${id}"`)) problems.push(`package.json มีสคริปต์ test:${id} แล้ว`);
if (problems.length) die('สร้างไม่ได้ — ยังไม่ได้แก้อะไร:\n  - ' + problems.join('\n  - '));

// สีของไอคอน/แถวรายการ: หมุนตามจำนวนระบบที่มี (PA = violet · ID-Plan = teal ใช้ไปแล้ว)
const HUES = ['violet', 'teal', 'orange', 'pink', 'amber', 'blue'];
const hue = HUES[existingIds.length % HUES.length];

// ---------------------------------------------------------------- เติมค่าใน template (split/join — ไม่ตีความ $ ในชื่อ)
// ลำดับสำคัญ: __UPPER__ ก่อน (เช่น __UPPER___CONFIG → TRA_CONFIG)
const fill = text => text
  .split('__UPPER__').join(UPPER)
  .split('__COLLECTION__').join(COLLECTION)
  .split('__TITLE__').join(title)
  .split('__HUE__').join(hue)
  .split('__ID__').join(id);

const out = {};   // path → เนื้อหาใหม่ (ทั้งไฟล์ที่สร้างและไฟล์ที่แก้)
const notes = []; // สรุปการแก้ไฟล์เดิมไว้แสดง

for (const [f, tpl] of Object.entries(newFiles)) {
  const p = path.join(__dirname, 'templates', tpl);
  if (!fs.existsSync(p)) die(`ไม่พบ template tools/templates/${tpl}`);
  const text = fill(fs.readFileSync(p, 'utf8'));
  const left = text.match(/__(?:ID|UPPER|TITLE|COLLECTION|HUE)__/);
  if (left) die(`template ${tpl} ยังมีตัวแทนค่าที่ไม่ได้เติม: ${left[0]}`);
  out[f] = text;
}

// ---------------------------------------------------------------- ตัวช่วยแก้ไฟล์เดิม: หาจุดไม่เจอ = หยุดทั้งหมด
function must(cond, f, what) { if (!cond) die(`หาจุดแก้ใน ${f} ไม่เจอ: ${what}\n  (โครงไฟล์เปลี่ยนไปจากที่สคริปต์คาดไว้ — ยังไม่ได้แก้อะไร · แก้มือตามหัวข้อ "เพิ่มระบบเอกสารใหม่" ใน README)`); }

// 1) js/utils.js ------------------------------------------------
{
  let s = utils;
  // LAZY_MODULES: ต่อท้ายก่อนปิด }
  const lm = s.match(/const LAZY_MODULES = \{[\s\S]*?\n\};/);
  must(lm, 'js/utils.js', 'const LAZY_MODULES = { … };');
  const lmNew = lm[0].replace(/\n\};$/,
    `\n  // กลุ่ม ${title} (${id}) — สร้างโดย tools/new-doc-system.js · ใช้ doc-system/doc-shell ร่วมกับ PA · ใช้ loadModules(LAZY_BUNDLES.${id})\n` +
    `  '${id}-config': 'js/${id}-config.js',\n` +
    `  ${id}: 'js/${id}.js',\n` +
    `  '${id}-ai': 'js/${id}-ai.js', // ตัวต่อผู้ช่วย AI ของ ${title} (registerDocAi) — แกน AI ใช้ร่วมกับระบบอื่น\n};`);
  s = s.replace(lm[0], () => lmNew);

  // LAZY_BUNDLES: แทรกกลุ่มใหม่ก่อนบล็อก docConfigs (พร้อมคอมเมนต์ที่อยู่เหนือมัน)
  const lb = s.match(/const LAZY_BUNDLES = \{[\s\S]*?\n\};/);
  must(lb, 'js/utils.js', 'const LAZY_BUNDLES = { … };');
  const dcRe = /((?:  \/\/[^\n]*\n)*)(  docConfigs: \[([^\]]*)\],?\n)/;
  const dc = lb[0].match(dcRe);
  must(dc, 'js/utils.js', 'docConfigs: [ … ] ใน LAZY_BUNDLES');
  const bundle = `  ${id}: ['doc-system', 'doc-shell', '${id}-config', '${id}', 'badwork-ai-config', 'badwork-ai', '${id}-ai'],\n`;
  const dcLine = dc[2].replace(/\]/, `, '${id}-config']`);
  const lbNew = lb[0].replace(dcRe, () => bundle + dc[1] + dcLine);
  s = s.replace(lb[0], () => lbNew);
  must(s.includes(`docConfigs: [${dc[3]}, '${id}-config']`), 'js/utils.js', 'แทรก docConfigs');
  out['js/utils.js'] = s;
  notes.push(`js/utils.js        LAZY_MODULES +3 · LAZY_BUNDLES.${id} · docConfigs +'${id}-config'`);
}

// 2) js/app.js --------------------------------------------------
{
  let s = app;
  // ROUTE_MODULES: ต่อท้ายก่อนปิด }
  const rm = s.match(/(const ROUTE_MODULES = \{[^}]*?)(\s*)\};/);
  must(rm, 'js/app.js', 'const ROUTE_MODULES = { … };');
  s = s.replace(rm[0], () => `${rm[1]}, '${id}-page': LAZY_BUNDLES.${id}${rm[2]}};`);

  // renderRoute: ต่อท้ายบรรทัด renderDocPage ตัวสุดท้าย (ต้อง return)
  const lines = s.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^\s*else if \(route === '[a-z0-9]+-page'\) return renderDocPage\('[a-z0-9]+'\);\s*$/.test(l)) last = i; });
  must(last >= 0, 'js/app.js', "else if (route === '…-page') return renderDocPage('…');");
  const indent = lines[last].match(/^\s*/)[0];
  lines.splice(last + 1, 0, `${indent}else if (route === '${id}-page') return renderDocPage('${id}');`);
  s = lines.join('\n');

  // ไทล์เมนู "เพิ่มเติม" บนมือถือ: ต่อท้ายหลังเส้นทางระบบเอกสารตัวสุดท้ายในอาร์เรย์
  const tile = s.match(/\[((?:'[a-z0-9-]+',\s*)*'pa-page'(?:,\s*'[a-z0-9-]+')*)\]\.forEach\(addTile\);/);
  must(tile, 'js/app.js', "[ 'pa-page', … ].forEach(addTile)");
  const names = tile[1].split(',').map(x => x.trim());
  let at = -1;
  names.forEach((n, i) => { if (docRoutes.includes(n.replace(/'/g, ''))) at = i; });
  must(at >= 0, 'js/app.js', 'ไทล์ของระบบเอกสารในอาร์เรย์ addTile');
  names.splice(at + 1, 0, `'${id}-page'`);
  s = s.replace(tile[0], () => `[${names.join(', ')}].forEach(addTile);`);
  out['js/app.js'] = s;
  notes.push(`js/app.js          ROUTE_MODULES · renderRoute (return) · ไทล์เมนูมือถือ`);
}

// 3) index.html -------------------------------------------------
{
  // ต่อท้ายปุ่มของระบบเอกสารตัวสุดท้าย (อยู่กลุ่มเมนูเดียวกับ pa-page / idp-page)
  let endAt = -1;
  for (const r of docRoutes) {
    const m = html.match(new RegExp(`<button class="nav-item" data-route="${r}"[\\s\\S]*?</button>\\n`));
    if (m) endAt = Math.max(endAt, m.index + m[0].length);
  }
  must(endAt >= 0, 'index.html', 'ปุ่ม <button class="nav-item" data-route="…-page"> ของ PA/ID-Plan');
  const btn = `\n      <button class="nav-item" data-route="${id}-page" data-tip="${title}">\n` +
    `        <span class="nav-icon" style="--w:var(--hue-${hue})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" stroke="none"><path opacity=".55" d="M7 2.5h7l5.5 5.5v11A2.5 2.5 0 0 1 17 21.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5Z"/><rect x="8" y="9" width="8" height="1.5" rx=".75"/><rect x="8" y="12" width="8" height="1.5" rx=".75"/><rect x="8" y="15" width="5" height="1.5" rx=".75"/></g></svg></span>\n` +
    `        <span class="nav-label">${title}</span>\n      </button>\n`;
  out['index.html'] = html.slice(0, endAt) + btn + html.slice(endAt);
  notes.push(`index.html         ปุ่มเมนู ${id}-page (สี ${hue}) ต่อท้ายกลุ่มระบบเอกสาร — เปลี่ยนไอคอนได้ตามต้องการ`);
}

// 4) sw.js ------------------------------------------------------
{
  const pre = sw.match(/const PRECACHE = \[[\s\S]*?\];/);
  must(pre, 'sw.js', 'const PRECACHE = [ … ];');
  // ต่อท้ายหลังไฟล์ -ai.js ตัวสุดท้ายของระบบเอกสาร
  const aiRe = /^(\s*)'js\/[a-z0-9]+-ai\.js',\n/gm;
  let m, lastAi = null;
  while ((m = aiRe.exec(pre[0]))) lastAi = m;
  must(lastAi, 'sw.js', "'js/<ระบบ>-ai.js', ใน PRECACHE");
  const ind = lastAi[1];
  const add = `${ind}'js/${id}-config.js',\n${ind}'js/${id}.js',\n${ind}'js/${id}-ai.js',\n`;
  const at = lastAi.index + lastAi[0].length;
  const preNew = pre[0].slice(0, at) + add + pre[0].slice(at);
  let s = sw.replace(pre[0], () => preNew);

  // เลข VERSION: วันเดียวกัน = +1 · คนละวัน = วันนี้.1  (รูปแบบ YYYY-MM-DD.N)
  const v = s.match(/const VERSION = '(\d{4}-\d{2}-\d{2})\.(\d+)';/);
  must(v, 'sw.js', "const VERSION = 'YYYY-MM-DD.N';");
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const next = v[1] === today ? `${today}.${Number(v[2]) + 1}` : (today > v[1] ? `${today}.1` : `${v[1]}.${Number(v[2]) + 1}`); // วันที่ย้อนหลัง (นาฬิกาเครื่องผิด) = เพิ่มเลขท้ายของวันเดิม ไม่ให้เวอร์ชันถอย
  s = s.replace(v[0], () => `const VERSION = '${next}';`);
  out['sw.js'] = s;
  notes.push(`sw.js              PRECACHE +3 ไฟล์ · VERSION ${v[1]}.${v[2]} → ${next}`);
}

// 5) firestore.rules -------------------------------------------
{
  const anchor = /^( *)match \/courses\/\{courseId\} \{/m;
  const a = rules.match(anchor);
  must(a, 'firestore.rules', 'match /courses/{courseId} {');
  const ind = a[1];
  const block =
    `${ind}// ${title} → users/{uid}/${COLLECTION}/{docId} · ฟิลด์ดูที่ js/${id}.js (สร้างโดย tools/new-doc-system.js)\n` +
    `${ind}match /${COLLECTION}/{docId} {\n` +
    `${ind}  allow read, delete: if isOwner(uid);\n` +
    `${ind}  allow create, update: if isOwner(uid) && validDoc(30);\n` +
    `${ind}}\n\n`;
  out['firestore.rules'] = rules.slice(0, a.index) + block + rules.slice(a.index);
  notes.push(`firestore.rules   match /${COLLECTION}/{docId} (isOwner · validDoc(30))`);
}

// 6) package.json: สคริปต์ test:<id> ----------------------------
{
  const end = pkgText.match(/(\n    "[^"\n]+": "[^"\n]*")(\n  \},\n  "devDependencies")/);
  must(end, 'package.json', 'ท้ายบล็อก "scripts"');
  const next = pkgText.replace(end[0], () => `${end[1]},\n    "test:${id}": "node tests/${id}.test.js"${end[2]}`);
  try { JSON.parse(next); } catch (e) { die('package.json ที่แก้แล้วไม่ใช่ JSON ถูกต้อง: ' + e.message); }
  out['package.json'] = next;
  notes.push(`package.json       scripts."test:${id}"`);
}

// ---------------------------------------------------------------- dry-run หรือเขียนจริง
const created = Object.keys(newFiles);
if (dryRun) {
  console.log(`(dry-run) จะสร้างระบบ "${title}" id=${id} collection=${COLLECTION}\n`);
  console.log('สร้างไฟล์ใหม่:\n  ' + created.join('\n  '));
  console.log('\nแก้ไฟล์เดิม:\n  ' + notes.join('\n  '));
  console.log('\nยังไม่ได้เขียนไฟล์ใด ๆ');
  process.exit(0);
}
for (const [f, text] of Object.entries(out)) fs.writeFileSync(abs(f), text);
console.log(`✓ สร้างระบบ "${title}" (id=${id} · collection=${COLLECTION})\n`);
console.log('สร้างไฟล์ใหม่:\n  ' + created.join('\n  '));
console.log('\nแก้ไฟล์เดิม:\n  ' + notes.join('\n  '));

// ---------------------------------------------------------------- ตรวจต่ออัตโนมัติ
console.log('\nตรวจ…');
let bad = 0;
const run = (label, argv) => {
  const r = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8' });
  const msg = ((r.stdout || '') + (r.stderr || '')).trim();
  console.log(`${r.status === 0 ? '  ✓' : '  ✗'} ${label}${msg && r.status !== 0 ? '\n' + msg.split('\n').map(l => '      ' + l).join('\n') : (msg ? '  — ' + msg.split('\n')[0] : '')}`);
  if (r.status !== 0) bad++;
};
for (const f of created) run(`node --check ${f}`, ['--check', abs(f)]);
run('check-sw     (PRECACHE ครบ · ไฟล์มีจริง)', ['tools/check-sw.js']);
run('check-inline (ไม่มี inline style/!important ผิดกฎ)', ['tools/check-inline.js']);
if (bad) {
  console.error('\n✗ มีรายการตรวจไม่ผ่าน — แก้ตามข้อความด้านบน (ไฟล์ถูกสร้างแล้ว ดูการเปลี่ยนแปลงด้วย git diff)');
  process.exit(1);
}
console.log(`\nเสร็จ — ต่อไป:\n  1) npm install && npm run test:${id}        (เทสต์ jsdom ของระบบนี้ · ต้องมี node_modules)\n  2) แก้ js/${id}.js ให้เป็นฟอร์ม/หน้าพิมพ์จริงของเอกสาร + prompts ใน js/${id}-config.js\n  3) npm run test:pa เพื่อยืนยันว่าระบบเดิมไม่กระทบ`);
