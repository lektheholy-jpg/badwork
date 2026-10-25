// ทดสอบสื่อ/ใบงานที่แนบกับรายการคะแนน (js/structure.js): ตรวจลิงก์ · จำแนกประเภท · ทำความสะอาดก่อนบันทึก
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { AppState: { user: { uid: 'u1' } }, console, URL, uid4: (() => { let n = 0; return () => 'id' + (++n); })() };
vm.createContext(ctx);
// ตัวช่วยที่ใช้ร่วมอยู่ใน js/utils.js ระหว่างเครื่องหมาย @att-helpers (utils.js ทั้งไฟล์แตะ DOM จึงโหลดเฉพาะส่วนนี้)
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const block = utilsSrc.slice(utilsSrc.indexOf('// @att-helpers begin'), utilsSrc.indexOf('// @att-helpers end'));
assert.ok(block.includes('function attSafeUrl'), 'ไม่พบบล็อก @att-helpers ใน utils.js');
vm.runInContext(block.replace(/^const /gm, 'var '), ctx);

const safe = ctx.attSafeUrl;
assert.strictEqual(safe('https://forms.gle/abc'), 'https://forms.gle/abc');
assert.strictEqual(safe('forms.gle/abc'), 'https://forms.gle/abc', 'พิมพ์ไม่มี https:// ได้');
assert.strictEqual(safe('  http://example.com/x  '), 'http://example.com/x');
for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'ftp://x.com/a', 'file:///etc/passwd', '', '   ', 'abc', 'http://']) {
  assert.strictEqual(safe(bad), '', 'ต้องปฏิเสธ: ' + bad);
}

const kind = (url, extra = {}) => ctx.attKind({ kind: 'link', url, ...extra });
assert.strictEqual(kind('https://forms.gle/x'), 'Google Form');
assert.strictEqual(kind('https://docs.google.com/forms/d/1/viewform'), 'Google Form');
assert.strictEqual(kind('https://docs.google.com/document/d/1'), 'Google Docs');
assert.strictEqual(kind('https://drive.google.com/file/d/1'), 'Google Drive');
assert.strictEqual(kind('https://www.youtube.com/watch?v=1'), 'YouTube');
assert.strictEqual(kind('https://youtu.be/1'), 'YouTube');
assert.strictEqual(kind('https://example.com'), 'ลิงก์');
assert.strictEqual(ctx.attKind({ kind: 'file', type: 'application/pdf', url: 'https://x' }), 'ไฟล์ PDF');
assert.strictEqual(ctx.attKind({ kind: 'file', type: 'image/png', url: 'https://x' }), 'รูปภาพ');

const cleaned = ctx.cleanAttachments([
  { id: 'a', kind: 'link', title: '  แบบทดสอบ  ', url: 'forms.gle/q' },
  { id: 'b', kind: 'link', title: 'อันตราย', url: 'javascript:alert(1)' },
  { id: 'c', kind: 'file', title: 'ใบงาน.pdf', url: 'https://firebasestorage.googleapis.com/x', path: 'users/u1/attachments/t/1.pdf', size: 10, type: 'application/pdf' },
  { id: 'd', kind: 'file', title: 'ไม่มี url', url: '' },
  null,
]);
assert.deepStrictEqual(cleaned.map(a => a.id), ['a', 'c'], 'ตัดอันที่ไม่ถูกต้องออก');
assert.strictEqual(cleaned[0].title, 'แบบทดสอบ');
assert.strictEqual(cleaned[0].url, 'https://forms.gle/q');
assert.strictEqual(cleaned[1].path, 'users/u1/attachments/t/1.pdf');
assert.strictEqual(ctx.cleanAttachments(undefined).length, 0);
assert.strictEqual(ctx.cleanAttachments(Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, kind: 'link', url: 'https://a.com/' + i }))).length, 10, 'สูงสุด 10 อัน');

// ชื่อในหัวคอลัมน์/รายการต้องถูก escape (กัน XSS จากชื่อไฟล์/ชื่อลิงก์)
ctx.escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
ctx.icon = () => '';
const html = ctx.attListHtml([{ id: 'z', kind: 'link', title: '<img src=x onerror=alert(1)>', url: 'https://a.com/?q="x"' }], { removable: true });
assert.ok(!html.includes('<img'), 'ชื่อสื่อต้องถูก escape');
assert.ok(!html.includes('q="x"'), 'url ต้องถูก escape ใน attribute');
assert.ok(html.includes('rel="noopener noreferrer"'));
assert.strictEqual(ctx.attChipHtml({ id: 'k' }), '', 'ไม่มีสื่อ = ไม่แสดงไอคอน');
assert.ok(ctx.attChipHtml({ id: 'k', attachments: [{}, {}] }).includes('>2</button>'));
console.log('attachments: ALL PASS');
