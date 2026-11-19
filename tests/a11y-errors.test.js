// ทดสอบ aria-label ของช่องกรอกคะแนน + ตัวจับ error ทั่วแอป
// วิธีรัน: node tests/a11y-errors.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

console.log('ช่องกรอกคะแนนมี aria-label');
{
  const ctx = { escapeHtml, isCounted: () => true, roundScore: n => n, calcGrade: () => '4', console };
  vm.createContext(ctx);
  vm.runInContext(read('js/scores.js'), ctx);
  const items = [{ id: 'a1', name: 'งาน "1"', max: 10, category: 'collect' }];
  const html = vm.runInContext(`renderScoreRow({id:'s1',no:'1',code:'101',firstName:'สมชาย',lastName:'ใจดี'}, ${JSON.stringify(items)}, [], [], {}, 10, 10, [], null)`, ctx);
  const doc = new JSDOM('<table><tbody>' + html + '</tbody></table>').window.document;
  const inp = doc.querySelector('.score-input');
  ok(inp && inp.getAttribute('aria-label') === 'สมชาย ใจดี – งาน "1"', 'aria-label = "ชื่อนักเรียน – ชื่อรายการ" (escape ถูกต้อง)', inp && inp.getAttribute('aria-label'));
}

console.log('ตัวจับ error ทั่วแอป');
{
  const dom = new JSDOM('<!doctype html><body></body>');
  const toasts = [];
  const errs = [];
  const ctx = { window: dom.window, console: { error: (...a) => errs.push(a), log() {}, warn() {} }, showToast: (m, k) => toasts.push({ m, k }), Date: class extends Date { static now() { return ctx._t; } }, _t: 1000000 };
  vm.createContext(ctx);
  const src = read('js/app.js');
  const i = src.indexOf('(function installGlobalErrorCatcher()');
  ok(i > -1, 'พบตัวจับ error ใน app.js');
  vm.runInContext(src.slice(i), ctx);
  const fire = (type, props) => { const ev = new dom.window.Event(type); Object.assign(ev, props); dom.window.dispatchEvent(ev); };

  fire('error', { error: new Error('boom'), message: 'boom' });
  ok(toasts.length === 1 && toasts[0].k === 'error', 'error ทั่วไป → แสดงข้อความเตือน');
  fire('unhandledrejection', { reason: new Error('x') });
  ok(toasts.length === 1, 'error ซ้ำภายใน 15 วินาที → ไม่รัวข้อความ');
  ctx._t += 16000;
  fire('unhandledrejection', { reason: new Error('x') });
  ok(toasts.length === 2, 'ผ่าน 15 วินาที → แสดงอีกครั้งได้');
  ctx._t += 16000;
  fire('error', { message: 'ResizeObserver loop limit exceeded' });
  ok(toasts.length === 2, 'ข้าม error ที่ไม่ใช่ปัญหาจริง (ResizeObserver)');
  ok(errs.length >= 3, 'ยังเก็บลง console.error ตามเดิม');
}

console.log('\nผลรวม: ผ่าน ' + pass + ', ไม่ผ่าน ' + fail);
process.exit(fail ? 1 : 0);
