// หน้าตาแอปตามบัญชี Google: theme.js (getAppearance / setAppearance / resetAppearance + เหตุการณ์ myscore:appearance)
//   + appearanceSync ใน js/auth.js (ดึงตอนล็อกอิน · ส่งขึ้นแบบหน่วงเวลา · เครื่องที่ใช้ร่วมกัน) + firestore.rules ต้องยอมรับฟิลด์ appearance
// วิธีรัน: npm run test:appearance
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 1) theme.js ----------
function themeEnv() {
  const dom = new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#fff"></head><body></body></html>', { url: 'https://example.test/', runScripts: 'outside-only', virtualConsole: new (require('jsdom').VirtualConsole)().sendTo(console, { omitJSDOMErrors: true }) });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.eval(read('js/theme.js'));
  return w;
}

(function themeTests() {
  console.log('theme.js');
  const w = themeEnv();
  const ids = [].concat(...Object.values(w.BG_OPTIONS)).map(x => x[0]);
  ok(ids.length === new Set(ids).size, 'ชื่อชุดพื้นหลังทุกชุดไม่ซ้ำกัน');
  ['uimint', 'uipeach', 'uilavender', 'uirose', 'uisage', 'uisand', 'uisky', 'uigraphite', 'midnight', 'forest', 'berry', 'sunsetpop', 'oceandeep', 'lagoon']
    .forEach(id => ok(ids.includes(id) && !!w.bgPresetCss(id), 'ชุดสี ' + id + ' มีใน BG_OPTIONS และสร้าง CSS ได้'));

  // พื้นหลังรูปภาพ: ใช้ assets/bg/<id>.webp บนชั้น body::before (--page-img) · คำนวณสีตัวหนังสือจากสีเฉลี่ยของรูป
  ['imgcliff', 'imgpine', 'imgblue', 'imgteal'].forEach(id => {
    ok(ids.includes(id) && /assets\/bg\/.+-t\.webp/.test(w.bgPresetCss(id)), 'รูป ' + id + ' อยู่ใน BG_OPTIONS และมีภาพย่อ');
    ok(fs.existsSync(path.join(root, 'assets/bg/' + id + '.webp')) && fs.existsSync(path.join(root, 'assets/bg/' + id + '-t.webp')), 'ไฟล์รูป + ภาพย่อของ ' + id + ' มีอยู่จริง');
  });
  (function () {
    const w4 = themeEnv(), el = w4.document.documentElement;
    let f4 = 0; w4.document.addEventListener('myscore:appearance', () => f4++);
    w4.setBgPref('imgcliff');
    ok(f4 === 1 && w4.getBgPref() === 'imgcliff', 'เลือกรูปภาพ → บันทึกค่า + ส่งเหตุการณ์ 1 ครั้ง');
    ok(el.dataset.bgimg === '1' && /assets\/bg\/imgcliff\.webp/.test(el.style.getPropertyValue('--page-img')), 'ตั้ง --page-img และ data-bgimg');
    ok(el.dataset.bg === 'custom' && /linear-gradient/.test(el.style.getPropertyValue('--page-bg')), 'มีพื้นสีไล่เฉดสำรอง และใช้ระบบคำนวณโทนตัวหนังสือ');
    ok(/rgb/.test(el.style.getPropertyValue('--card-glass')), 'รูปภาพเพิ่มความทึบการ์ด (--card-glass)');
    ok(w4.getAppearance().bg === 'imgcliff', 'getAppearance เก็บเป็นชื่อรูป (ซิงค์ขึ้นบัญชีได้)');
    w4.setBgPref('sky');
    ok(el.dataset.bgimg === undefined && el.style.getPropertyValue('--page-img') === '', 'เปลี่ยนไปชุดอื่น → ล้าง --page-img และ data-bgimg');
    w4.setBgPref('imgpine'); w4.resetAppearance();
    ok(el.dataset.bgimg === undefined && w4.getBgPref() === 'default', 'resetAppearance ล้างพื้นหลังรูปภาพ');
    const w5 = themeEnv();
    w5.setAppearance({ theme: 'light', bg: 'imgteal', look: {}, presets: '[]' });
    ok(w5.getBgPref() === 'imgteal' && w5.document.documentElement.dataset.bgimg === '1', 'รับค่ารูปภาพจากคลาวด์ได้');
    w5.setAppearance({ theme: 'light', bg: 'imgfake', look: {}, presets: '[]' });
    ok(w5.getBgPref() === 'default' && w5.document.documentElement.dataset.bgimg === undefined, 'ชื่อรูปที่ไม่รู้จักจากคลาวด์ → ค่าเริ่มต้น');
    w4.setBgPref('imgblue'); w4.saveLookPreset('ชุดรูป');
    ok(w4.getLookPresets()[0].bg === 'imgblue' && /assets\/bg\//.test(w4.presetBgCss('imgblue')), 'ชุดตั้งค่าของฉันจำรูปภาพได้');
  })();

  let fired = 0;
  w.document.addEventListener('myscore:appearance', () => fired++);
  w.setBgPref('uimint');
  ok(fired === 1 && w.getBgPref() === 'uimint', 'เลือกชุดสี → ส่งเหตุการณ์ 1 ครั้ง และบันทึกค่า');
  ok(w.document.documentElement.dataset.bg === 'custom' && /linear-gradient/.test(w.document.documentElement.style.getPropertyValue('--page-bg')), 'ชุดสีใหม่ใช้พื้นหลังไล่เฉดผ่านระบบคำนวณโทนเดิม');
  w.setLookPref({ pc: '#7b52e6', card: 40 });
  w.setThemePref('dark');
  ok(fired === 3, 'ปรับสีหลัก/ธีม → ส่งเหตุการณ์ทุกครั้ง', fired);
  w.saveLookPreset('ชุดทดสอบ');
  ok(fired === 4 && w.getLookPresets().length === 1, 'บันทึกชุดตั้งค่า → ส่งเหตุการณ์');

  const a = w.getAppearance();
  ok(a.theme === 'dark' && a.bg === 'uimint' && a.look.pc === '#7b52e6' && a.look.card === 40, 'getAppearance คืนค่าปัจจุบันครบ', a);
  ok(typeof a.presets === 'string' && JSON.parse(a.presets).length === 1, 'presets เก็บเป็นสตริง JSON');

  // นำค่าไปใช้บนเครื่องใหม่ (localStorage ว่าง) → เหมือนเดิมและไม่ส่งเหตุการณ์ (กันวนส่งกลับคลาวด์)
  const w2 = themeEnv();
  let fired2 = 0;
  w2.document.addEventListener('myscore:appearance', () => fired2++);
  ok(w2.setAppearance(JSON.parse(JSON.stringify(a))) === true, 'setAppearance รับค่าจากคลาวด์');
  const b = w2.getAppearance();
  ok(JSON.stringify(b) === JSON.stringify(a), 'ค่าที่นำไปใช้ตรงกับต้นทางทุกส่วน');
  ok(fired2 === 0, 'setAppearance ไม่ส่งเหตุการณ์');
  ok(w2.document.documentElement.dataset.theme === 'dark', 'ธีมมืดถูกนำไปใช้กับหน้า');

  // ค่าเสียจากคลาวด์ต้องถูกกรอง ไม่ทำให้แอปพัง
  const w3 = themeEnv();
  w3.setAppearance({ theme: 'neon', bg: '{"t":"solid","c":["javascript:alert(1)"]}', look: { pc: 'red', card: 999, menu: -5, blur: 'x' }, presets: '[{"name":"<img>","bg":"zzz"},"x",null]' });
  const c = w3.getAppearance();
  ok(c.theme === 'auto', 'theme ที่ไม่รู้จัก → auto', c.theme);
  ok(c.bg === 'default', 'พื้นหลังที่ไม่ถูกต้อง → ค่าเริ่มต้น', c.bg);
  ok(c.look.pc === null && c.look.card === 90 && c.look.menu === 0, 'สี/ความโปร่งใสที่เกินช่วงถูกจำกัด', c.look);
  ok(JSON.parse(c.presets).length === 1 && JSON.parse(c.presets)[0].bg === 'default', 'ชุดตั้งค่าที่เสียถูกกรอง/แก้เป็นค่าปลอดภัย');
  ok(w3.setAppearance(null) === false && w3.setAppearance('x') === false, 'ข้อมูลที่ไม่ใช่ object ถูกปฏิเสธ');

  w2.resetAppearance();
  const d = w2.getAppearance();
  ok(d.theme === 'auto' && d.bg === 'default' && d.look.pc === null && d.presets === '[]', 'resetAppearance กลับค่าเริ่มต้นทั้งหมด', d);
  ok(fired2 === 0, 'resetAppearance ไม่ส่งเหตุการณ์');
})();

// ---------- 2) appearanceSync ใน auth.js ----------
// สร้างสภาพแวดล้อมจำลอง Firebase แล้วรัน js/auth.js จริง · docs = { uid: ข้อมูลเอกสาร users/{uid} }
async function syncEnv({ docs = {}, local = {}, failGet = false, failSet = null }) {
  const dom = new JSDOM(`<!doctype html><html><head><meta name="theme-color" content="#fff"></head><body>
    <button id="google-signin-btn"></button><button id="logout-btn"></button>
    <div id="login-screen"></div><div id="app" class="hidden"></div><div id="auth-loading"></div>
    <span id="user-name"></span><span id="user-email"></span><img id="user-photo"></body></html>`, { url: 'https://example.test/', runScripts: 'outside-only', virtualConsole: new (require('jsdom').VirtualConsole)().sendTo(console, { omitJSDOMErrors: true }) });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  Object.entries(local).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.eval(read('js/theme.js'));

  const sets = [], toasts = [];
  let authCb = null, renders = 0;
  w.firebase = { firestore: { FieldValue: { serverTimestamp: () => '__TS__' } } };
  w.auth = { onAuthStateChanged: (cb) => { authCb = cb; }, getRedirectResult: () => Promise.resolve(null), signInWithPopup() {}, signOut: async () => {} };
  w.googleProvider = {};
  w.db = {
    waitForPendingWrites: () => Promise.resolve(), terminate: async () => {}, clearPersistence: async () => {},
    collection: () => ({ doc: (uid) => ({
      get: async () => { if (failGet) throw Object.assign(new Error('offline'), { code: 'unavailable' }); return { exists: uid in docs, get: (f) => (docs[uid] || {})[f] }; },
      set: async (data, opt) => { if (failSet && data.appearance) throw Object.assign(new Error('denied'), { code: failSet }); sets.push({ uid, data, opt }); },
    }) }),
  };
  w.showToast = (m) => { toasts.push(m); }; w.safePhotoUrl = () => ''; w.navigate = () => {}; w.closeMobileNav = () => {};
  w.renderSettings = () => { renders++; };
  w.eval(read('js/auth.js') + '\nwindow.__AppState = AppState;');
  const login = async (uid) => {
    await authCb({ uid, displayName: 'ครู', email: uid + '@x.test', photoURL: null });
    await sleep(20);
  };
  const logout = async () => { w.document.getElementById('logout-btn').click(); await sleep(40); };
  const storage = () => Object.fromEntries(Object.keys(w.localStorage).map(k => [k, w.localStorage.getItem(k)]));
  return { w, sets, toasts, login, logout, storage, renders: () => renders };
}
const appearanceSets = (e) => e.sets.filter(s => s.data.appearance);
const lsOf = (e, k) => e.w.localStorage.getItem(k);

(async function syncTests() {
  console.log('appearanceSync (auth.js)');

  // A) มีค่าบนคลาวด์ → ใช้ค่าบนคลาวด์ ไม่อัปโหลดทับ
  let e = await syncEnv({ docs: { u1: { appearance: { theme: 'dark', bg: 'berry', look: { pc: '#e83e7a', card: 20, menu: null, blur: null }, presets: '[]' } } } });
  await e.login('u1');
  ok(e.w.getAppearance().bg === 'berry' && e.w.getAppearance().theme === 'dark' && e.w.getAppearance().look.pc === '#e83e7a', 'A: ล็อกอิน → นำค่าจากบัญชีมาใช้');
  ok(appearanceSets(e).length === 0, 'A: ไม่อัปโหลดทับค่าบนคลาวด์');
  ok(lsOf(e, 'myscore-appearance-owner') === 'u1', 'A: จำเจ้าของค่าในเครื่องเป็นบัญชีนี้');

  // B) ยังไม่มีบนคลาวด์ + เครื่องยังไม่มีเจ้าของ → อัปโหลดค่าในเครื่อง
  e = await syncEnv({ docs: { u1: { displayName: 'x' } }, local: { 'myscore-bg': 'uisky', 'myscore-theme': 'light' } });
  await e.login('u1');
  let up = appearanceSets(e);
  ok(up.length === 1 && up[0].uid === 'u1' && up[0].opt.merge === true, 'B: อัปโหลดค่าในเครื่องขึ้นบัญชี (merge ไม่ลบฟิลด์อื่น)');
  ok(up[0] && up[0].data.appearance.bg === 'uisky' && up[0].data.appearance.theme === 'light' && up[0].data.appearance.updatedAt === '__TS__', 'B: ข้อมูลที่ส่งตรงกับค่าในเครื่อง');
  ok(up[0] && Object.keys(up[0].data.appearance).sort().join() === 'bg,look,presets,theme,updatedAt', 'B: ฟิลด์ที่ส่งตรงกับที่ firestore.rules อนุญาต');

  // C) เครื่องเป็นของบัญชีอื่น + บัญชีนี้ยังไม่มีค่า → กลับค่าเริ่มต้น ไม่อัปโหลด
  e = await syncEnv({ docs: { u2: {} }, local: { 'myscore-bg': 'uisky', 'myscore-appearance-owner': 'u1' } });
  await e.login('u2');
  ok(e.w.getAppearance().bg === 'default', 'C: ไม่เอาพื้นหลังของบัญชีก่อนหน้ามาใช้');
  ok(appearanceSets(e).length === 0, 'C: ไม่อัปโหลดหน้าตาของคนอื่นขึ้นบัญชีนี้');
  ok(lsOf(e, 'myscore-appearance-owner') === 'u2', 'C: เจ้าของค่าในเครื่องเปลี่ยนเป็นบัญชีนี้');

  // D) ค่าในเครื่องแก้ไว้แต่ยังไม่ขึ้นคลาวด์ (DIRTY) → ส่งค่าในเครื่องขึ้น ไม่ถูกค่าเก่าบนคลาวด์ทับ
  e = await syncEnv({ docs: { u1: { appearance: { theme: 'auto', bg: 'berry', look: {}, presets: '[]' } } },
    local: { 'myscore-bg': 'uigraphite', 'myscore-appearance-owner': 'u1', 'myscore-appearance-dirty': '1' } });
  await e.login('u1');
  up = appearanceSets(e);
  ok(e.w.getAppearance().bg === 'uigraphite' && up.length === 1 && up[0].data.appearance.bg === 'uigraphite', 'D: ค่าที่แก้ค้างไว้ในเครื่องชนะค่าเก่าบนคลาวด์');
  await sleep(20);
  ok(lsOf(e, 'myscore-appearance-dirty') === null, 'D: ส่งสำเร็จแล้วเคลียร์สถานะค้าง');

  // E) แก้หลังล็อกอิน → หน่วงเวลาแล้วส่งครั้งเดียว (แถบเลื่อนปรับรัว ๆ)
  e = await syncEnv({ docs: { u1: { appearance: { theme: 'auto', bg: 'default', look: {}, presets: '[]' } } } });
  await e.login('u1');
  e.w.setLookPref({ card: 10 }); e.w.setLookPref({ card: 20 }); e.w.setLookPref({ card: 30 });
  ok(appearanceSets(e).length === 0 && lsOf(e, 'myscore-appearance-dirty') === 'u1', 'E: ยังไม่ส่งทันที และทำเครื่องหมายค้าง');
  await sleep(1000);
  up = appearanceSets(e);
  ok(up.length === 1 && up[0].data.appearance.look.card === 30, 'E: ส่งครั้งเดียวด้วยค่าสุดท้าย', up.length);
  ok(lsOf(e, 'myscore-appearance-dirty') === null, 'E: ส่งสำเร็จแล้วเคลียร์สถานะค้าง');

  // F) ดึงจากบัญชีไม่ได้ (ออฟไลน์) → ใช้ค่าในเครื่องต่อ และไม่เขียนทับคลาวด์
  e = await syncEnv({ docs: {}, failGet: true, local: { 'myscore-bg': 'uisand' } });
  await e.login('u1');
  e.w.setBgPref('uirose');
  await sleep(1000);
  ok(e.w.getAppearance().bg === 'uirose', 'F: ออฟไลน์ → ใช้ค่าในเครื่องได้ตามปกติ');
  ok(appearanceSets(e).length === 0, 'F: ยังไม่รู้สถานะคลาวด์ → ไม่เขียนทับ');

  // G) เปิดหน้าตั้งค่าค้างอยู่ตอนค่าจากคลาวด์มาถึง → วาดหน้าใหม่
  e = await syncEnv({ docs: { u1: { appearance: { theme: 'auto', bg: 'forest', look: {}, presets: '[]' } } } });
  e.w.__AppState.currentRoute = 'settings';
  await e.login('u1');
  ok(e.renders() === 1, 'G: วาดหน้าตั้งค่าใหม่ให้ตรงกับค่าที่ซิงค์');

  // H) ออกจากระบบโดยไม่ได้แก้อะไร → ห้ามส่งค่าในเครื่องไปทับคลาวด์ (เครื่องอื่นอาจเพิ่งแก้ใหม่กว่า)
  const docH = { u1: { appearance: { theme: 'auto', bg: 'berry', look: {}, presets: '[]' } } };
  e = await syncEnv({ docs: docH });
  await e.login('u1');
  docH.u1.appearance.bg = 'uigraphite'; // เครื่องอื่นแก้ค่าบนคลาวด์ระหว่างที่เครื่องนี้เปิดค้างไว้
  await e.logout();
  ok(appearanceSets(e).length === 0, 'H: ออกจากระบบโดยไม่ได้แก้ → ไม่เขียนทับคลาวด์', appearanceSets(e).map(x => x.data.appearance.bg));
  // H2) แก้แล้วยังรอส่งแล้วกดออกจากระบบ → ต้องส่งก่อนออก
  e = await syncEnv({ docs: { u1: { appearance: { theme: 'auto', bg: 'default', look: {}, presets: '[]' } } } });
  await e.login('u1');
  e.w.setBgPref('uimint');
  await e.logout();
  ok(appearanceSets(e).length === 1 && appearanceSets(e)[0].data.appearance.bg === 'uimint', 'H2: แก้ค้างอยู่แล้วออกจากระบบ → ส่งขึ้นก่อนออก');

  // I) ธงค้างของบัญชีอื่นต้องไม่ถูกบัญชีนี้ใช้ต่อ (ไม่งั้นครั้งถัดไปจะส่งค่าเก่าทับค่าใหม่บนคลาวด์)
  const docI = { uB: { appearance: { theme: 'auto', bg: 'berry', look: {}, presets: '[]' } } };
  e = await syncEnv({ docs: docI, local: { 'myscore-bg': 'uisky', 'myscore-appearance-owner': 'uA', 'myscore-appearance-dirty': 'uA' } });
  await e.login('uB');
  ok(e.w.getAppearance().bg === 'berry' && lsOf(e, 'myscore-appearance-dirty') === null, 'I: เปลี่ยนบัญชี → ใช้ค่าของบัญชีใหม่ และล้างธงค้างของบัญชีเดิม');
  docI.uB.appearance.bg = 'forest'; // เครื่องอื่นแก้ค่าของ B
  const e2 = await syncEnv({ docs: docI, local: e.storage() }); // เปิดแอปใหม่ในเครื่องเดิม
  await e2.login('uB');
  ok(e2.w.getAppearance().bg === 'forest' && appearanceSets(e2).length === 0, 'I: ล็อกอินครั้งถัดไปได้ค่าล่าสุดจากคลาวด์ ไม่ถูกค่าเก่าทับ', e2.w.getAppearance().bg);

  // J) เขียนขึ้นบัญชีไม่ผ่าน (rules ยังไม่ deploy) → แจ้งผู้ใช้ครั้งเดียว ไม่เงียบ
  e = await syncEnv({ docs: { u1: { displayName: 'x' } }, failSet: 'permission-denied', local: { 'myscore-bg': 'uisky' } });
  await e.login('u1');
  e.w.setBgPref('uirose'); await sleep(1000); e.w.setBgPref('uisand'); await sleep(1000);
  ok(e.toasts.filter(m => /ซิงค์หน้าตา/.test(m)).length === 1, 'J: permission-denied → แจ้งเตือนครั้งเดียว', e.toasts);
  ok(e.w.getAppearance().bg === 'uisand', 'J: ค่ายังใช้ได้ในเครื่อง');

  // ---------- 3) firestore.rules ----------
  console.log('firestore.rules');
  const rules = read('firestore.rules');
  const prof = rules.match(/function validProfile\(\)[\s\S]*?\n    }\n/);
  ok(!!prof && /hasOnly\(\[[^\]]*'appearance'[^\]]*\]\)/.test(prof[0]) && /validAppearance\(d\.get\('appearance', null\)\)/.test(prof[0]), 'validProfile ยอมรับและตรวจฟิลด์ appearance');
  const va = rules.match(/function validAppearance\(a\)[\s\S]*?\n    }\n/);
  const keys = va ? [...va[0].matchAll(/hasOnly\(\[([^\]]*)\]\)/g)].map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])) : [];
  ok(keys.length === 2 && keys[0].sort().join() === 'bg,look,presets,theme,updatedAt' && keys[1].sort().join() === 'blur,card,glass,menu,pc', 'ฟิลด์ใน rules ตรงกับที่ appearanceSync ส่ง', keys);

  console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
