// หน้าตั้งค่า 2 แท็บ (รูปแบบหน้าเว็บ · เกี่ยวกับ) + รายการพื้นหลังที่คัดให้ไม่ซ้ำโทน (js/app.js: SETTINGS_TABS · BG_SHOWN · bgShownGroupsHtml)
// วิธีรัน: node tests/settings-tabs.test.js
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.test/', runScripts: 'outside-only' });
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {} });
w.eval(read('js/theme.js'));

// ดึงเฉพาะส่วนที่ต้องทดสอบจาก app.js (ไฟล์ทั้งไฟล์ผูกกับ DOM/Firebase)
const src = read('js/app.js');
const grab = (startRe, endRe) => { const a = src.search(startRe); const b = src.slice(a).search(endRe); return src.slice(a, a + b); };
const code = [
  grab(/function bgGroupHtml/, /\/\/ -{10} พื้นหลังกำหนดเอง/),
  grab(/const LOOK_COLORS/, /\nconst LOOK_SLIDERS/),
  grab(/const SETTINGS_TABS/, /\nfunction settingsLookHtml/)
].join('\n');
w.icon = () => '';
w.escapeHtml = s => String(s);
w.eval(code + '\nwindow.__t = { SETTINGS_TABS, BG_SHOWN, bgShownGroupsHtml, LOOK_COLORS };');
const t = w.__t;

console.log('แท็บ');
ok(t.SETTINGS_TABS.length === 2 && t.SETTINGS_TABS.map(x => x[0]).join() === 'look,about', 'มี 2 แท็บ: look (รูปแบบหน้าเว็บ) และ about (เกี่ยวกับ)', t.SETTINGS_TABS);

console.log('พื้นหลังที่โชว์');
const known = new Set(['default']);
Object.values(w.BG_OPTIONS).forEach(g => g.forEach(([id]) => known.add(id)));
const shown = [].concat(...t.BG_SHOWN.map(g => g[1]));
ok(shown.every(id => known.has(id) && (id === 'default' || !!w.presetBgCss(id))), 'ทุกชุดที่โชว์มีใน BG_OPTIONS และสร้าง CSS ได้');
ok(shown.length === new Set(shown).size, 'ไม่มีชุดซ้ำในรายการ');
const total = Object.values(w.BG_OPTIONS).reduce((n, g) => n + g.length, 1);
ok(shown.length < total && shown.length <= 16, 'จำนวนชุดที่โชว์น้อยลงจากเดิม (' + shown.length + ' จาก ' + total + ')');
ok(w.document.createElement('div') && (() => { const d = w.document.createElement('div'); d.innerHTML = t.bgShownGroupsHtml(); return d.querySelectorAll('.bg-opt[data-bg-pref]').length === shown.length; })(), 'วาดช่องครบตามรายการ (ค่าปัจจุบันเป็น default)');

// ผู้ใช้ที่เคยเลือกชุดที่เลิกโชว์ → ยังเห็นช่องของชุดนั้น และค่าไม่หาย
w.setBgPref('lagoon');
const d2 = w.document.createElement('div'); d2.innerHTML = t.bgShownGroupsHtml();
ok(d2.querySelectorAll('.bg-opt[data-bg-pref]').length === shown.length + 1 && !!d2.querySelector('[data-bg-pref="lagoon"]'), 'ชุดเดิมที่เลิกโชว์แต่ผู้ใช้ใช้อยู่ → มีช่องเพิ่มให้เห็น');
ok(w.getBgPref() === 'lagoon' && !!w.bgPresetCss('lagoon'), 'ค่าที่บันทึกไว้ยังใช้งานได้ตามเดิม');

console.log('สีหลัก');
const hexes = t.LOOK_COLORS.map(x => x[0]);
ok(hexes.length === new Set(hexes).size && !hexes.includes('#0381fe'), 'ไม่มีสีน้ำเงินซ้ำกับ "ค่าเริ่มต้น"', hexes);

console.log('\n' + pass + ' ผ่าน · ' + fail + ' ไม่ผ่าน');
process.exit(fail ? 1 : 0);
