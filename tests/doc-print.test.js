// ทดสอบตัวช่วยพิมพ์กลางใน js/doc-shell.js (docWaitFonts · docPrintWindow) และการที่ paPrint/parptPrint เรียกใช้ตัวนี้
// วิธีรัน: node tests/doc-print.test.js   (หรือ npm run test:docprint)
// ตรวจ: window.open ถูกเรียกก่อน await · pop-up ถูกบล็อก · รอฟอนต์ก่อนพิมพ์ · ไม่มี font API · html เป็นฟังก์ชัน async ·
//       html พังแล้วปิดหน้าต่างว่าง · paPrint/parptPrint ส่งค่าถูก · ไม่มี window.open/.print() หลุดนอก doc-shell.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const { JSDOM } = require('jsdom');
const ROOT = process.env.PA_ROOT ? path.resolve(process.env.PA_ROOT) : path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }); const w = dom.window;

let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// หน้าต่างจำลองที่ window.open คืนให้ — เก็บลำดับเหตุการณ์ไว้ตรวจ
function fakeWin({ fonts = true, loadMs = 0 } = {}) {
  const log = [];
  const win = {
    log, written: '', closed: false,
    document: {
      write(s) { win.written += s; log.push('write'); }, close() { log.push('docclose'); },
      fonts: fonts ? { load(spec) { log.push('load:' + spec); return sleep(loadMs); } } : undefined,
    },
    focus() { log.push('focus'); }, print() { log.push('print'); }, close() { win.closed = true; log.push('close'); },
  };
  return win;
}

const toasts = [];
let nextWin = null, opened = 0, openedSync = null;
const ctx = {
  window: { open: () => { opened++; return nextWin; } }, document: w.document, console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Object, Array, Set, Map, String, Number, Error, RegExp, URL,
  escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  showToast: m => toasts.push(m),
};
vm.createContext(ctx);
vm.runInContext(read('js/doc-shell.js'), ctx, { filename: 'js/doc-shell.js' });
const run = code => vm.runInContext(code, ctx);

(async () => {
  console.log('docWaitFonts');
  {
    const fw = fakeWin();
    const r = await run('docWaitFonts')(fw.document, ["16pt 'X'", "bold 16pt 'X'"]);
    ok(r === true, 'มี document.fonts → คืน true');
    ok(fw.log.filter(x => x.startsWith('load:')).length === 2, 'โหลดตามจำนวนสเปคที่ส่งมา (2)');
    const t0 = Date.now();
    const slow = fakeWin({ loadMs: 400 });
    await run('docWaitFonts')(slow.document, ["16pt 'X'"], 50);
    ok(Date.now() - t0 < 300, 'ฟอนต์ช้า → หยุดรอเมื่อครบเวลา maxMs (ไม่ค้าง)');
    ok(await run('docWaitFonts')(fakeWin({ fonts: false }).document) === false, 'ไม่มี font API → คืน false');
    ok(await run('docWaitFonts')(null) === false, 'ไม่มีเอกสาร → คืน false ไม่ error');
    const rej = fakeWin(); rej.document.fonts.load = () => Promise.reject(new Error('x'));
    ok(await run('docWaitFonts')(rej.document) === true, 'ฟอนต์โหลดพลาดก็ไม่ reject (ไปต่อด้วยฟอนต์สำรอง)');
  }

  console.log('docPrintWindow');
  {
    const fw = nextWin = fakeWin(); opened = 0;
    const p = run('docPrintWindow')({ title: 'PA1_สมชาย ใจดี_2569', css: '.pa1{color:#000}', html: '<p id="body">เนื้อหา</p>' });
    ok(opened === 1, 'window.open ถูกเรียกทันที (ก่อน await)');
    const w2 = await p;
    ok(w2 === fw, 'คืนหน้าต่างที่เปิด');
    ok(fw.written.includes('<title>PA1_สมชาย ใจดี_2569</title>'), 'ใส่ชื่อเรื่อง');
    ok(fw.written.includes('.pa1{color:#000}'), 'ใส่ css ของแบบ');
    ok(fw.written.includes('@page{size:A4;margin:16mm 14mm}'), 'ใช้ @page A4 ขอบ 16/14 มม. เป็นค่าเริ่มต้น');
    ok(fw.written.includes("font-family:'PA Sarabun'"), 'ฝังฟอนต์สำรอง (docFontCss)');
    ok(fw.written.includes('<p id="body">เนื้อหา</p>'), 'ใส่เนื้อหา');
    ok(!fw.log.includes('print'), 'ยังไม่พิมพ์ทันที (รอ 150ms หลังฟอนต์)');
    await sleep(250);
    const i = n => fw.log.indexOf(n), last = fw.log.map((x, k) => x.startsWith('load:') ? k : -1).filter(k => k >= 0).pop();
    ok(i('print') > last && last > i('write'), 'ลำดับ: เขียนเอกสาร → โหลดฟอนต์ → พิมพ์');
    ok(fw.log.filter(x => x === 'print').length === 1, 'พิมพ์ครั้งเดียว');
  }
  {
    const fw = nextWin = fakeWin();
    await run('docPrintWindow')({ title: 'x', html: 'y', fonts: ["italic 16pt 'PA Sarabun'"] });
    ok(fw.log.filter(x => x.startsWith('load:')).length === 1 && fw.log.includes("load:italic 16pt 'PA Sarabun'"), 'ส่ง fonts เองได้ (ใช้แทนค่าเริ่มต้น)');
  }
  {
    const fw = nextWin = fakeWin(); opened = 0; let openedWhenBuilt = -1;
    await run('docPrintWindow')({ title: 'x', html: async () => { openedWhenBuilt = opened; await sleep(20); return '<b>async</b>'; } });
    ok(openedWhenBuilt === 1, 'html เป็นฟังก์ชัน async: window.open ถูกเรียกแล้วก่อนเริ่มสร้างเนื้อหา');
    ok(fw.written.includes('<b>async</b>'), 'เขียนเนื้อหาที่ได้จากฟังก์ชัน');
  }
  {
    const fw = nextWin = fakeWin(); let err = null;
    try { await run('docPrintWindow')({ title: 'x', html: () => { throw new Error('boom'); } }); } catch (e) { err = e; }
    ok(err && err.message === 'boom', 'html พัง → โยน error ต่อ (ไม่กลืน)');
    ok(fw.closed && fw.written === '', 'html พัง → ปิดหน้าต่างว่าง ไม่เขียน/พิมพ์');
    await sleep(250); ok(!fw.log.includes('print'), 'html พัง → ไม่สั่งพิมพ์');
  }
  {
    nextWin = null; toasts.length = 0;
    const r = await run('docPrintWindow')({ title: 'x', html: 'y' });
    ok(r === null && toasts.length === 1 && /pop-up/.test(toasts[0]), 'pop-up ถูกบล็อก → แจ้งผู้ใช้ + คืน null');
  }
  {
    const fw = nextWin = fakeWin({ fonts: false });
    await run('docPrintWindow')({ title: 'x', html: 'y' });
    await sleep(250); ok(!fw.log.includes('print'), 'ไม่มี font API → รอ 600ms (ยังไม่พิมพ์ที่ 250ms)');
    await sleep(500); ok(fw.log.includes('print'), 'ไม่มี font API → พิมพ์หลัง 600ms');
  }
  {
    const fw = nextWin = fakeWin(); fw.print = () => { throw new Error('no'); };
    let err = null; try { await run('docPrintWindow')({ title: 'x', html: 'y' }); await sleep(250); } catch (e) { err = e; }
    ok(!err, 'print() โยน error → ไม่ล้ม (ผู้ใช้สั่งพิมพ์เองได้)');
  }

  console.log('paPrint / parptPrint ใช้ตัวช่วยกลาง');
  {
    const calls = [];
    const c2 = Object.assign({}, ctx, {
      PA1_CSS: '.pa1{}', paBuildDocHtml: (d, o) => `<pa ${d.fiscalYear}/${o.name}>`,
      parptLoadRecordsForYear: async y => ['rec' + y], parptAppendixHtml: (r, y) => `<app ${r}|${y}>`,
      parptBuildDocHtml: (d, o, a) => `<rpt ${d.fiscalYear}/${o.name}${a}>`,
      docPrintWindow: async o => { calls.push(o); return null; }, DOC_FONT_SPECS: ["16pt 'PA Sarabun'", "bold 16pt 'PA Sarabun'"],
    });
    vm.createContext(c2);
    // pa.js / pa-rpt.js ท้ายไฟล์ลงทะเบียน UI ซึ่งต้องพึ่งไฟล์อื่น — ตัดมาเฉพาะฟังก์ชันพิมพ์เพื่อทดสอบการเรียกตัวช่วย
    const grab = (f, name) => { const s = read(f), a = s.indexOf(name), b = s.indexOf('\n}\n', a) + 3; return s.slice(a, b); };
    vm.runInContext(grab('js/pa.js', 'function paPrint(') + grab('js/pa-rpt.js', 'async function parptPrint('), c2);
    await vm.runInContext("paPrint({ fiscalYear: 2569 }, { name: 'สมชาย ใจดี' })", c2);
    const a = calls[0];
    ok(a.title === 'PA1_สมชาย_ใจดี_2569', 'paPrint: ชื่อไฟล์ PA1_<ชื่อ>_<ปี> (เว้นวรรคเป็น _)');
    ok(a.css === '.pa1{}' && a.html() === '<pa 2569/สมชาย ใจดี>', 'paPrint: css + เนื้อหา');
    ok(a.fonts.length === 3 && a.fonts.some(f => f.startsWith('italic')), 'paPrint: โหลดฟอนต์ปกติ/หนา/เอียง (เหมือนเดิม)');
    await vm.runInContext("parptPrint({ fiscalYear: 2569 }, { name: 'สมชาย' })", c2);
    const b = calls[1];
    ok(b.title === 'PA_Report_สมชาย_2569', 'parptPrint: ชื่อไฟล์ PA_Report_<ชื่อ>_<ปี>');
    ok(b.fonts === undefined, 'parptPrint: ใช้ฟอนต์ค่าเริ่มต้น (ปกติ/หนา — เหมือนเดิม)');
    ok(await b.html() === '<rpt 2569/สมชาย<app rec2569|2569>>', 'parptPrint: โหลดภาคผนวกแล้วใส่ในเอกสาร');
    c2.parptLoadRecordsForYear = async () => { throw new Error('offline'); };
    const quiet = console.error; console.error = () => {};
    const html2 = await b.html(); console.error = quiet;
    ok(html2 === '<rpt 2569/สมชาย>', 'parptPrint: โหลดภาคผนวกไม่ได้ → พิมพ์ต่อโดยไม่มีภาคผนวก (เหมือนเดิม)');
  }

  console.log('กันสำเนากลับมา');
  {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
    const opens = files.filter(f => f !== 'doc-shell.js' && /window\.open\s*\(/.test(strip(read('js/' + f))));
    ok(opens.length === 0, 'ไม่มี window.open( นอก doc-shell.js' + (opens.length ? ' — พบที่: ' + opens.join(', ') : ''));
    const prints = files.filter(f => f !== 'doc-shell.js' && /[\w\]\)]\??\.print\s*\(\s*\)/.test(strip(read('js/' + f))));
    ok(prints.length === 1 && prints[0] === 'idp.js', 'มี .print() เฉพาะ idp.js (พิมพ์ผ่าน iframe — เหตุผลอยู่ที่หัวตัวช่วยใน doc-shell.js) พบที่: ' + prints.join(', '));
    const fontLoads = files.filter(f => f !== 'doc-shell.js' && /fonts\.load\s*\(|fl\.load\s*\(/.test(strip(read('js/' + f))));
    ok(fontLoads.length === 0, 'ไม่มีโค้ดรอฟอนต์เขียนเองนอก doc-shell.js' + (fontLoads.length ? ' — พบที่: ' + fontLoads.join(', ') : ''));
  }

  console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
