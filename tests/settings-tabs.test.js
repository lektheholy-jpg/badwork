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


// ---------- ปุ่มติดตั้งแอป (js/pwa.js: PwaInstall · js/app.js: installCardHtml / bindInstallCard) ----------
console.log('ติดตั้งแอป');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
function pwaEnv(userAgent, standalone) {
  const d = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/', runScripts: 'outside-only' });
  Object.defineProperty(d.window.navigator, 'userAgent', { get: () => userAgent });
  d.window.matchMedia = () => ({ matches: !!standalone, addEventListener() {} });
  d.window.eval(read('js/pwa.js'));
  return d.window;
}
function fireInstall(win, outcome) {
  const e = new win.Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { e.called = true; };
  e.userChoice = Promise.resolve({ outcome });
  win.dispatchEvent(e);
  return e;
}
(async () => {
  let p = pwaEnv(DESK); fireInstall(p, 'accepted');
  ok(p.PwaInstall.mode() === 'none', 'คอมพิวเตอร์ → ไม่แสดงปุ่มติดตั้ง (แสดงเฉพาะมือถือ)');
  p = pwaEnv(AND);
  ok(p.PwaInstall.mode() === 'none', 'Android ที่เบราว์เซอร์ยังไม่ส่ง beforeinstallprompt → ไม่แสดง');
  let changed = 0; p.PwaInstall.onChange(() => changed++);
  const ev = fireInstall(p, 'accepted');
  ok(p.PwaInstall.mode() === 'prompt' && changed === 1 && ev.defaultPrevented, 'Android + beforeinstallprompt → mode prompt และแจ้งผู้ฟัง');
  ok((await p.PwaInstall.prompt()) === true && ev.called === true, 'กดติดตั้ง → เรียก prompt() และคืน true เมื่อผู้ใช้ยอมรับ');
  ok(p.PwaInstall.mode() === 'none' && (await p.PwaInstall.prompt()) === false, 'หลังใช้ event แล้วเรียกซ้ำไม่ได้');
  p = pwaEnv(AND); fireInstall(p, 'dismissed');
  ok((await p.PwaInstall.prompt()) === false, 'ผู้ใช้ปฏิเสธ → คืน false');
  p = pwaEnv(AND); fireInstall(p, 'accepted'); p.dispatchEvent(new p.Event('appinstalled'));
  ok(p.PwaInstall.mode() === 'installed', 'appinstalled → installed (ซ่อนการ์ด)');
  p = pwaEnv(IOS);
  ok(p.PwaInstall.mode() === 'ios', 'iPhone (Safari) → mode ios แสดงขั้นตอน');
  p = pwaEnv(IOS, true);
  ok(p.PwaInstall.mode() === 'installed', 'เปิดจากแอปที่ติดตั้งแล้ว (standalone) → installed (ซ่อนการ์ด)');
  p = pwaEnv(AND, true); fireInstall(p, 'accepted');
  ok(p.PwaInstall.mode() === 'installed', 'Android เปิดจากแอปที่ติดตั้งแล้ว → installed');

  // การ์ดในหน้า: ใช้โค้ดจริงจาก app.js
  const cardCode = grab(/function installCardHtml/, /\nfunction settingsAboutHtml/);
  const run = (win, mode) => {
    win.document.body.innerHTML = '<div id="install-slot"></div>';
    win.PwaInstall = { _m: mode, mode() { return this._m; }, subs: [], onChange(fn) { this.subs.push(fn); return () => {}; }, async prompt() { this.asked = true; return true; } };
    win.toasts = []; win.showToast = (m) => win.toasts.push(m);
    win.eval(cardCode + '\nwindow.bindInstallCard = bindInstallCard;');
    win.bindInstallCard(win.document.getElementById('install-slot'));
    return win.document.getElementById('install-slot');
  };
  let slot = run(w, 'none');
  ok(slot.innerHTML === '', 'mode none/installed → ไม่มีการ์ด');
  slot = run(w, 'ios');
  const btn = slot.querySelector('#pwa-install-btn'), steps = slot.querySelector('#pwa-ios-steps');
  ok(!!btn && !!steps && steps.classList.contains('hidden') && btn.getAttribute('aria-expanded') === 'false', 'iPhone: มีปุ่ม "ดูวิธีติดตั้ง" และขั้นตอนซ่อนอยู่');
  btn.click();
  ok(!steps.classList.contains('hidden') && btn.getAttribute('aria-expanded') === 'true' && steps.querySelectorAll('li').length === 3, 'กดแล้วแสดงขั้นตอน 3 ข้อ');
  btn.click();
  ok(steps.classList.contains('hidden'), 'กดอีกครั้งซ่อนขั้นตอน');
  slot = run(w, 'prompt');
  ok(!slot.querySelector('#pwa-ios-steps') && slot.querySelector('#pwa-install-btn').textContent === 'ติดตั้งแอป', 'Android: ปุ่ม "ติดตั้งแอป" ไม่มีขั้นตอน iOS');
  slot.querySelector('#pwa-install-btn').click();
  await new Promise(r => setTimeout(r, 0));
  ok(w.PwaInstall.asked === true && w.toasts.length === 1, 'กดแล้วเรียก PwaInstall.prompt() และแจ้งเมื่อสำเร็จ');

})().then(() => {
console.log('\n' + pass + ' ผ่าน · ' + fail + ' ไม่ผ่าน');
process.exit(fail ? 1 : 0);
});
