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
    function navigate(route) { AppState.currentRoute = route; AppState.currentCourseId = null; NavHistory.record({ kind: 'route', route }); window.__log.push('navigate:' + route); }
    function openCourse(courseId, restore) {
      AppState.currentRoute = 'course'; AppState.currentCourseId = courseId;
      AppState.currentSectionId = restore && restore.sectionId || null; AppState.currentTab = restore && restore.tab || 'overview';
      NavHistory.record({ kind: 'course', courseId });
      window.__log.push('openCourse:' + courseId + ':' + AppState.currentTab + ':' + AppState.currentSectionId);
      NavHistory.patch({ courseId, sectionId: AppState.currentSectionId, tab: AppState.currentTab }); // renderCourseShell ทำแบบนี้
    }
  `);
  w.__log = log;
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
