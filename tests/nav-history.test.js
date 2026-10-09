// ทดสอบ js/nav-history.js (ปุ่ม/ท่าย้อนกลับของระบบ) ด้วย jsdom — ใช้ history จริงของ jsdom + openModal/closeModal จริงจาก utils.js
// วิธีรัน: npm run test:nav
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); };
const J = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TICK = 40; // history.back() ของ jsdom ทำงานแบบอะซิงก์

// openModal/closeModal จริงจาก utils.js (ตัดมาเฉพาะช่วงนั้น)
const utils = J('utils.js');
const modalSrc = utils.slice(utils.indexOf('let _modalLayer'), utils.indexOf('// helper ทั่วไป')).replace(/\/\/ -+\s*$/, '');

function makeEnv() {
  const dom = new JSDOM('<!doctype html><div id="modal-root"></div>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window, log = [];
  w.AppState = { user: { uid: 'u1' }, currentRoute: null, currentCourseId: null, currentSectionId: null, currentTab: null, flushScoreSaves() { log.push('flush'); } };
  // จำลอง navigate / openCourse ของแอป: ตั้ง state แล้ว record เหมือนของจริง
  w.eval(`
    function navigate(route) { AppState.currentRoute = route; AppState.currentCourseId = null; NavHistory.record({ kind: 'route', route }); window.__log.push('navigate:' + route); NavHistory.applyScroll(); }
    function openCourse(courseId, restore) {
      AppState.currentRoute = 'course'; AppState.currentCourseId = courseId;
      AppState.currentSectionId = restore && restore.sectionId || null; AppState.currentTab = restore && restore.tab || 'overview';
      NavHistory.record({ kind: 'course', courseId });
      window.__log.push('openCourse:' + courseId + ':' + AppState.currentTab + ':' + AppState.currentSectionId);
      NavHistory.patch({ courseId, sectionId: AppState.currentSectionId, tab: AppState.currentTab }); // renderCourseShell ทำแบบนี้
      NavHistory.applyScroll(); // วาดเสร็จ → เลื่อนกลับตำแหน่งเดิม (renderCourseShell ทำแบบนี้)
    }
  `);
  w.__log = log;
  // จำลองการเลื่อนหน้าต่าง: __y คือ scrollY ปัจจุบัน
  w.__y = 0;
  Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
  w.scrollTo = (x, y) => { w.__y = y; };
  w.eval(J('nav-history.js') + '\nwindow.NavHistory = NavHistory;');
  w.eval(modalSrc);
  const modalOpen = () => w.document.getElementById('modal-root').innerHTML !== '';
  const st = () => w.history.state;
  return { w, log, modalOpen, st, app: w.AppState, nav: w.NavHistory, len: () => w.history.length };
}

(async () => {
  console.log('หน้าหลัก');
  {
    const e = makeEnv();
    e.w.navigate('dashboard');
    ok(e.st() && e.st().kind === 'route' && e.st().route === 'dashboard', 'หน้าแรกของเซสชัน: replaceState (ไม่ซ้อน entry)');
    const len0 = e.len();
    e.w.navigate('courses'); e.w.navigate('profile');
    ok(e.len() === len0 + 2 && e.st().route === 'profile', 'เปลี่ยนหน้า = push entry');
    e.w.navigate('profile');
    ok(e.len() === len0 + 2, 'กดหน้าเดิมซ้ำ ไม่ push เพิ่ม');
    e.log.length = 0; e.w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'courses' && e.log.join() === 'flush,navigate:courses', 'ย้อนกลับ → วาดหน้าก่อนหน้า (และเซฟคะแนนค้างก่อน)', e.log);
    ok(e.len() === len0 + 2 && e.st().route === 'courses', 'การย้อนกลับไม่เขียน history เพิ่ม');
    e.w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'dashboard', 'ย้อนต่อถึงหน้าแรก');
    e.w.history.forward(); await sleep(TICK);
    ok(e.app.currentRoute === 'courses', 'เดินหน้า (forward) ก็วาดหน้าตาม');
  }

  console.log('รายวิชา');
  {
    const e = makeEnv();
    e.w.navigate('dashboard'); e.w.navigate('courses');
    e.w.openCourse('c1');
    ok(e.st().kind === 'course' && e.st().courseId === 'c1', 'เปิดรายวิชา = push entry แบบ course');
    // ผู้ใช้สลับแท็บ/ห้องในวิชา (renderCourseShell เรียก patch) — ต้องไม่เพิ่ม entry
    const len0 = e.len();
    e.app.currentTab = 'scores'; e.app.currentSectionId = 's2';
    e.nav.patch({ courseId: 'c1', sectionId: 's2', tab: 'scores' });
    ok(e.len() === len0 && e.st().tab === 'scores' && e.st().sectionId === 's2', 'สลับแท็บ/ห้อง: replaceState จำค่าไว้ ไม่เพิ่ม entry');
    e.w.navigate('profile');
    e.log.length = 0; e.w.history.back(); await sleep(TICK);
    ok(e.log.includes('openCourse:c1:scores:s2'), 'ย้อนกลับเข้าวิชา → ได้แท็บ/ห้องเดิม', e.log);
    e.w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'courses', 'ย้อนจากวิชา → รายการวิชา');
    // ปุ่ม "รายวิชาของฉัน" ในหน้าวิชา
    e.w.openCourse('c2');
    const len1 = e.len();
    ok(e.nav.backTo('courses') === true, 'backTo: entry ก่อนหน้าเป็นรายการวิชาพอดี → ถอยจริง');
    await sleep(TICK);
    ok(e.app.currentRoute === 'courses' && e.len() === len1, 'backTo ไม่ซ้อน entry ใหม่', { r: e.app.currentRoute });
    ok(e.nav.backTo('profile') === false, 'backTo: ไม่ใช่หน้าก่อนหน้า → คืน false ให้ผู้เรียกใช้ navigate เอง');
    // รีโหลดแล้วไม่มีประวัติในความจำ
    const e2 = makeEnv(); e2.w.navigate('dashboard');
    ok(e2.nav.backTo('courses') === false, 'ไม่มี entry ก่อนหน้าในความจำ → คืน false');
  }

  console.log('ป๊อปอัป');
  {
    const e = makeEnv();
    e.w.navigate('dashboard'); e.w.navigate('courses');
    const len0 = e.len();
    e.w.openModal('<p>x</p>');
    ok(e.modalOpen() && e.len() === len0 + 1 && e.st().kind === 'layer', 'เปิดป๊อปอัป = push entry ของชั้น');
    e.w.openModal('<p>y</p>');
    ok(e.len() === len0 + 1, 'เปิดป๊อปอัปซ้อน/เปลี่ยนเนื้อหา ไม่ push เพิ่ม');
    e.log.length = 0; e.w.history.back(); await sleep(TICK);
    ok(!e.modalOpen() && e.app.currentRoute === 'courses' && !e.log.some(x => x.startsWith('navigate')), 'กดย้อนกลับขณะมีป๊อปอัป → ปิดป๊อปอัป ไม่เปลี่ยนหน้า', e.log);
    ok(e.st().route === 'courses', 'หลังปิดชั้น entry ปัจจุบันคือหน้าเดิม');

    e.w.openModal('<p>z</p>');
    e.w.closeModal(); await sleep(TICK);
    ok(!e.modalOpen() && e.st().kind === 'route' && e.st().route === 'courses', 'ปิดด้วยปุ่มในหน้า → ถอด entry ของชั้นออกให้');
    e.w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'dashboard', 'ย้อนกลับครั้งแรกหลังปิดป๊อปอัปด้วยปุ่ม ถอยหน้าจริง (ไม่เสียการกดไปเปล่า)');
  }

  console.log('ลำดับงานที่ชนกัน');
  {
    // ยืนยันในป๊อปอัปแล้ว closeModal() ตามด้วย navigate() ทันที (เช่น เก็บวิชาเข้าคลัง)
    const e = makeEnv();
    e.w.navigate('dashboard'); e.w.openCourse('c1');
    e.w.openModal('<p>confirm</p>');
    e.w.closeModal(); e.w.navigate('courses');
    await sleep(TICK * 3);
    ok(e.st().kind === 'route' && e.st().route === 'courses', 'closeModal แล้ว navigate ต่อทันที: entry สุดท้ายเป็นหน้าใหม่', e.st());
    e.w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'course' && e.app.currentCourseId === 'c1', 'ย้อนจากหน้าใหม่ → กลับมาที่วิชาเดิม (ไม่เหลือ entry ของป๊อปอัปค้าง)', { r: e.app.currentRoute });

    // navigate ขณะป๊อปอัปยังเปิด (ไม่ได้ปิดก่อน): entry ของชั้นกลายเป็นของค้าง ต้องถูกข้ามตอนย้อน
    const f = makeEnv();
    f.w.navigate('dashboard'); f.w.openModal('<p>a</p>'); f.w.navigate('profile');
    f.w.history.back(); await sleep(TICK * 3);
    ok(f.app.currentRoute === 'dashboard', 'entry ค้างของป๊อปอัปถูกข้ามอัตโนมัติ', { r: f.app.currentRoute, st: f.st() });
  }


  console.log('ตำแหน่งเลื่อน');
  {
    const e = makeEnv(), w = e.w;
    w.navigate('dashboard'); w.__y = 300;           // เลื่อนหน้าแรกลงมา 300
    w.navigate('courses');
    ok(w.__y === 0, 'เปลี่ยนไปหน้าใหม่ → เริ่มที่บนสุด', w.__y);
    w.__y = 120; w.navigate('profile');
    ok(w.__y === 0, 'หน้าใหม่ถัดไปก็เริ่มที่บนสุด');
    w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'courses' && w.__y === 120, 'ย้อนกลับ → เลื่อนกลับตำแหน่งเดิมของหน้านั้น (120)', w.__y);
    w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'dashboard' && w.__y === 300, 'ย้อนต่อ → หน้าแรกกลับมาที่ 300', w.__y);
    w.history.forward(); await sleep(TICK);
    ok(e.app.currentRoute === 'courses' && w.__y === 120, 'เดินหน้า (forward) ก็เลื่อนกลับตำแหน่งที่จำไว้', w.__y);
    // ไม่มีงานค้าง (เช่นสลับแท็บ) → applyScroll ไม่แตะตำแหน่งเลื่อน
    w.__y = 77; e.nav.applyScroll();
    ok(w.__y === 77, 'applyScroll ตอนไม่มีงานค้าง ไม่ทำอะไร');
  }
  {
    const e = makeEnv(), w = e.w;
    w.navigate('dashboard'); w.navigate('courses'); w.openCourse('c1'); w.__y = 500;
    w.navigate('profile');
    w.history.back(); await sleep(TICK);
    ok(w.__y === 500 && e.log.includes('openCourse:c1:overview:null'), 'ย้อนกลับเข้ารายวิชา → ตำแหน่งเลื่อนเดิม (500) + แท็บเดิม', { y: w.__y, log: e.log });
    // ผู้ใช้ย้อนกลับแล้วไปทางใหม่: entry ข้างหน้าถูกตัด ตำแหน่งเก่าของมันต้องไม่หลงมาใช้กับหน้าใหม่
    w.history.back(); await sleep(TICK);
    w.__y = 40; w.navigate('settings');
    ok(w.__y === 0, 'หน้าใหม่หลังย้อนกลับ เริ่มที่บนสุด ไม่ใช้ตำแหน่งของ entry ที่ถูกตัด');
    w.history.back(); await sleep(TICK);
    ok(w.__y === 40, 'ย้อนกลับจากหน้าใหม่ → ตำแหน่ง 40 ที่จำไว้ของหน้าก่อนหน้า', w.__y);
  }
  {
    const e = makeEnv(), w = e.w;
    w.navigate('dashboard'); w.navigate('courses'); w.__y = 220;
    w.openModal('<p>x</p>'); w.__y = 220;
    w.closeModal(); await sleep(TICK);
    w.navigate('profile');
    w.history.back(); await sleep(TICK);
    ok(w.__y === 220, 'เปิด/ปิดป๊อปอัปคั่นกลาง ไม่ทำให้ตำแหน่งเลื่อนของหน้าเพี้ยน', w.__y);
    if ('scrollRestoration' in w.history) ok(w.history.scrollRestoration === 'manual', 'ตั้ง scrollRestoration = manual (กันเบราว์เซอร์เลื่อนชนกับแอป)');
  }

  console.log('ป๊อปอัปปิดแบบมีอนิเมชัน');
  {
    const fakeMedia = (e, reduce) => { e.w.matchMedia = q => ({ matches: reduce && /reduced-motion/.test(q) }); };
    const bd = e => e.w.document.getElementById('modal-backdrop');
    const CLOSE = 150 + 30 + 60; // MODAL_CLOSE_MS + เผื่อ

    let e = makeEnv(); fakeMedia(e, false);
    e.w.navigate('dashboard'); e.w.navigate('courses'); e.w.openModal('<p>x</p>');
    const len0 = e.len();
    e.w.closeModal();
    ok(bd(e) && bd(e).classList.contains('closing'), 'closeModal → ใส่ .closing ยังไม่ลบทันที');
    ok(e.w.closeModal() === undefined && bd(e).classList.contains('closing'), 'กดปิดซ้ำระหว่างปิด ไม่พัง');
    await sleep(CLOSE);
    ok(!e.modalOpen(), 'ครบเวลาแล้วลบ DOM');
    ok(e.len() === len0 && e.st().kind === 'route' && e.st().route === 'courses', 'ชั้นในประวัติปล่อยทันทีตามเดิม ไม่ขึ้นกับอนิเมชัน', e.st());
    e.w.history.back(); await sleep(TICK);
    ok(e.app.currentRoute === 'dashboard', 'ย้อนกลับครั้งถัดไปถอยหน้าจริง');

    // กดย้อนกลับของระบบขณะมีป๊อปอัป → ก็ปิดแบบมีอนิเมชัน
    e = makeEnv(); fakeMedia(e, false);
    e.w.navigate('dashboard'); e.w.navigate('courses'); e.w.openModal('<p>x</p>');
    e.w.history.back(); await sleep(TICK);
    ok(e.modalOpen() && bd(e).classList.contains('closing') && e.app.currentRoute === 'courses', 'ย้อนกลับของระบบ → ป๊อปอัปจางออก ไม่เปลี่ยนหน้า');
    await sleep(CLOSE);
    ok(!e.modalOpen(), 'แล้วจึงลบ DOM');

    // เปิดป๊อปอัปใหม่ระหว่างที่อันเก่ากำลังปิด → อันใหม่ต้องไม่ถูกลบทิ้งโดยตัวจับเวลาของอันเก่า
    e = makeEnv(); fakeMedia(e, false);
    e.w.navigate('dashboard'); e.w.openModal('<p>old</p>');
    e.w.closeModal(); e.w.openModal('<p id="new-modal">new</p>');
    await sleep(CLOSE + 100);
    ok(e.w.document.getElementById('new-modal') && !bd(e).classList.contains('closing'), 'ป๊อปอัปใหม่ที่เปิดคั่นระหว่างปิด ยังอยู่ครบ');

    // reduced-motion → ลบทันที
    e = makeEnv(); fakeMedia(e, true);
    e.w.navigate('dashboard'); e.w.openModal('<p>x</p>'); e.w.closeModal();
    ok(!e.modalOpen(), 'ผู้ใช้ตั้ง reduced-motion → ลบทันที ไม่หน่วง');
  }

  console.log('กรณีขอบ');
  {
    const e = makeEnv();
    e.w.navigate('dashboard'); e.w.navigate('courses');
    e.app.user = null; // ออกจากระบบ
    e.log.length = 0; e.w.history.back(); await sleep(TICK);
    ok(e.log.length === 0, 'ยังไม่ล็อกอิน: ย้อนกลับไม่วาดหน้าของแอป');
  }

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
