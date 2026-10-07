// ตรวจว่ารายการไฟล์ใน sw.js (PRECACHE) ครบและตรงกับของจริง — กันลืมเพิ่มไฟล์ใหม่แล้วออฟไลน์พัง
//   node tools/check-sw.js        (รันอัตโนมัติใน ./build-css.sh และ npm run check:sw)
// ตรวจ 4 อย่าง
//   1) ทุกไฟล์ใน PRECACHE มีอยู่จริง
//   2) ทุก <script src>/<link href> แบบ same-origin ใน index.html อยู่ใน PRECACHE
//   3) ทุกโมดูลใน LAZY_MODULES (js/utils.js) อยู่ใน PRECACHE
//   4) ไฟล์ข้ามโดเมน (Firebase SDK, Google Fonts CSS) ใน sw.js ตรงกับ index.html
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const sw = read('sw.js');
const html = read('index.html');
const utils = read('js/utils.js');
const manifest = JSON.parse(read('manifest.json'));

const block = (name) => {
  const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`หา ${name} ใน sw.js ไม่เจอ`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
const precache = new Set(block('PRECACHE'));
const cross = new Set(block('PRECACHE_CROSS'));
const fontCss = (sw.match(/const FONT_CSS = '([^']+)'/) || [])[1];

const errors = [];

// 1) มีอยู่จริง
for (const f of precache) if (!fs.existsSync(path.join(root, f))) errors.push(`PRECACHE มี "${f}" แต่ไม่มีไฟล์นี้`);

// 2) index.html
const local = u => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:') && !u.startsWith('#');
const refs = [
  ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]),
];
for (const r of refs) {
  if (local(r)) { if (!precache.has(r)) errors.push(`index.html ใช้ "${r}" แต่ไม่อยู่ใน PRECACHE`); }
  else if (/gstatic\.com\/firebasejs\//.test(r)) { if (!cross.has(r)) errors.push(`index.html ใช้ ${r} แต่ไม่อยู่ใน PRECACHE_CROSS`); }
  else if (/fonts\.googleapis\.com\/css/.test(r)) { if (r.replace(/&amp;/g, '&') !== fontCss) errors.push('FONT_CSS ใน sw.js ไม่ตรงกับ <link> ฟอนต์ใน index.html'); }
}
for (const c of cross) if (!refs.includes(c)) errors.push(`PRECACHE_CROSS มี ${c} แต่ index.html ไม่ได้ใช้`);

// 3) โมดูล lazy
const lazy = (utils.match(/const LAZY_MODULES = \{([\s\S]*?)\};/) || [])[1] || '';
for (const m of lazy.matchAll(/:\s*'([^']+)'/g)) if (!precache.has(m[1])) errors.push(`LAZY_MODULES ใช้ "${m[1]}" แต่ไม่อยู่ใน PRECACHE`);

// 4) ไฟล์ที่ JS โหลดด้วยตัวเอง (xlsx) และไอคอนใน manifest
if (!precache.has('js/vendor/xlsx.mini.min.js')) errors.push('PRECACHE ไม่มี js/vendor/xlsx.mini.min.js');
for (const i of manifest.icons || []) if (!precache.has(i.src)) errors.push(`manifest.json ใช้ไอคอน "${i.src}" แต่ไม่อยู่ใน PRECACHE`);

if (errors.length) { console.error('✗ sw.js:\n  - ' + errors.join('\n  - ')); process.exit(1); }
console.log(`✓ sw.js ครอบคลุม ${precache.size} ไฟล์ + ${cross.size} ไฟล์ข้ามโดเมน`);
