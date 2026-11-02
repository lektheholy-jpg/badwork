// ทดสอบระดับชั้น ป.1-ป.6 + ม.1-ม.6 (js/utils.js · js/sar.js): ตัวเลือก · สี · การจัดกลุ่ม · ชื่อห้องเต็ม
// วิธีรัน: node tests/levels.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
const ctx = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number, RegExp };
vm.createContext(ctx);
// utils.js แตะ DOM ตอนโหลด จึงให้ jsdom — ที่นี่ใช้เฉพาะฟังก์ชันล้วนๆ
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8') + '\n;this.__u = { LEVEL_OPTIONS, getLevelColor, LEVEL_COLOR_FALLBACK, levelSelectOptionsHtml, groupsByLevelHtml, extractRoomFromClassLabel };', ctx, { filename: 'js/utils.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/sar.js'), 'utf8') + '\n;this.__s = { sarRoomLabel, sarRoomKey };', ctx, { filename: 'js/sar.js' });
const u = ctx.__u, s = ctx.__s;
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };

console.log('A · ตัวเลือกระดับชั้น');
ok(u.LEVEL_OPTIONS.join() === 'ป.1,ป.2,ป.3,ป.4,ป.5,ป.6,ม.1,ม.2,ม.3,ม.4,ม.5,ม.6', 'มี ป.1-ป.6 แล้วตามด้วย ม.1-ม.6 (12 ระดับ): ' + u.LEVEL_OPTIONS.join(' '));
const html = u.levelSelectOptionsHtml('ป.3');
ok(u.LEVEL_OPTIONS.every(l => html.includes(`value="${l}"`)), 'ช่องเลือกระดับชั้นมีครบทุกระดับ');
ok(/value="ป\.3"\s+selected/.test(html), 'เลือกค่าเดิม ป.3 ไว้ถูกต้อง');

console.log('B · สีประจำระดับชั้น');
const cols = u.LEVEL_OPTIONS.map(l => u.getLevelColor(l).strong);
ok(cols.every(c => /^var\(--viz-[a-z]+\)$/.test(c)), 'ทุกระดับอ้างตัวแปร --viz-* (โหมดมืดทำงาน)');
ok(new Set(cols).size === 12, 'ไม่มีสีซ้ำกันระหว่าง 12 ระดับ');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const need = [...new Set(cols.map(c => c.slice(4, -1)))];
ok(need.every(v => (css.match(new RegExp(v + '\\s*:', 'g')) || []).length >= 2), 'ทุกตัวแปรสีมีค่าทั้งโหมดสว่างและมืดใน style.css');
ok(u.getLevelColor('ป.9') === u.LEVEL_COLOR_FALLBACK, 'ระดับที่ไม่รู้จักใช้สีสำรอง');

console.log('C · จัดกลุ่มวิชาตามระดับชั้น');
{
  const items = [{ n: 'a', level: 'ม.2' }, { n: 'b', level: 'ป.4' }, { n: 'c', level: 'ป.1' }, { n: 'd', level: '' }];
  const out = u.groupsByLevelHtml(items, { levelOf: x => x.level, listClass: 'x', rowFn: x => `<i>${x.n}</i>` });
  const order = [...out.matchAll(/struct-group-title">([^<]+)</g)].map(m => m[1]);
  ok(order.join() === 'ป.1,ป.4,ม.2,ไม่ระบุระดับชั้น', 'ลำดับกลุ่ม ป.1 → ป.4 → ม.2 → ไม่ระบุ: ' + order.join());
}

console.log('D · ชื่อห้องเต็ม / ห้องของ SAR');
ok(s.sarRoomLabel({ level: 'ป.4' }, '2') === 'ป.4/2', 'ป.4 + ห้อง 2 → ป.4/2');
ok(s.sarRoomLabel({ level: 'ป.4' }, 'ป.4/2') === 'ป.4/2', 'ห้องที่เขียนเต็มมาแล้ว (ป.4/2) ไม่ต่อซ้ำ');
ok(s.sarRoomLabel({ level: 'ป.4' }, 'ป.2') === 'ป.2', 'ห้องขึ้นต้น ป. ใช้ตามที่พิมพ์ (เหมือน ม.)');
ok(s.sarRoomKey('ป.4/2') === s.sarRoomKey('4/2') && s.sarRoomKey('ม.4/2') === s.sarRoomKey('4/2'), 'คีย์ห้อง ป.4/2 = ม.4/2 = 4/2 (จับคู่กับตารางสอนได้)');
ok(u.extractRoomFromClassLabel('ประถมศึกษาปีที่ 5/3') === '3' && u.extractRoomFromClassLabel('ป.6/10') === '10', 'ดึงเลขห้องจาก "ประถมศึกษาปีที่ 5/3" และ "ป.6/10"');

console.log(fail ? `\nไม่ผ่าน ${fail} ข้อ` : '\nผ่านทุกข้อ');
process.exit(fail ? 1 : 0);
