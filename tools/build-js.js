#!/usr/bin/env node
// ==========================================================================
// tools/build-js.js — รวม + minify JS core ไฟล์ให้เหลือ 1 bundle
//
// ทำไม concat แทน ES module bundle?
//   ไฟล์ทั้งหมดใช้ global variables ข้ามไฟล์ (vanilla JS)
//   esbuild transform ทำได้แค่ minify โดยไม่บังคับ refactor ไปใช้ import/export
//
// ผลลัพธ์: js/core.bundle.js (แทนที่ 14 <script defer> ใน index.html)
//   theme.js       → คงไว้แยกต่างหาก (โหลดใน <head> ไม่มี defer กัน FOUC)
//   js/vendor/*    → คงไว้แยก (โหลด lazy เมื่อต้องการ)
//   lazy modules   → คงไว้แยก (โหลดเมื่อเปิดหน้านั้น ผ่าน loadModule ใน utils.js)
//
// ใช้งาน:
//   npm run build:js          — สร้าง bundle
//   npm run build:js -- --check  — เช็คว่า bundle ตรงกับ source ปัจจุบัน (ใช้ใน CI)
// ==========================================================================

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'js', 'core.bundle.js');

// ลำดับต้องตรงกับ index.html — ไฟล์ที่อ้างอิง global ของไฟล์ก่อนต้องมาทีหลัง
const CORE_FILES = [
  'js/firebase-config.js',
  'js/island.js',
  'js/nav-history.js',
  'js/utils.js',
  'js/auth.js',
  'js/dashboard.js',
  'js/courses.js',
  'js/students.js',
  'js/structure.js',
  'js/scores.js',
  'js/picker-pages.js',
  'js/report-page.js',
  'js/app.js',
  'js/pwa.js',
];

const CHECK_MODE = process.argv.includes('--check');

// รวม source ทุกไฟล์ (คั่นด้วย ; + newline กัน ASI edge case)
const combined = CORE_FILES
  .map(f => {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) throw new Error(`ไม่พบไฟล์: ${f}`);
    return `/* ${f} */\n${fs.readFileSync(full, 'utf8')}`;
  })
  .join('\n;\n');

// minify ด้วย esbuild (เร็วกว่า terser ~10–100×) — target ES2017 รองรับ Chrome 67+ / iOS 12+
const result = esbuild.transformSync(combined, {
  minify: true,
  target: 'es2017',
  sourcemap: false,
  logLevel: 'warning',
});

if (result.warnings.length) {
  result.warnings.forEach(w => console.warn(`⚠️  ${w.text}`));
}

if (CHECK_MODE) {
  // ตรวจว่า bundle ที่มีอยู่ตรงกับ source ปัจจุบัน (ใช้ใน CI / pre-commit)
  if (!fs.existsSync(OUT)) {
    console.error('❌  ไม่พบ js/core.bundle.js — รัน npm run build:js ก่อน');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUT, 'utf8');
  const hashNew = crypto.createHash('sha256').update(result.code).digest('hex');
  const hashOld = crypto.createHash('sha256').update(existing).digest('hex');
  if (hashNew !== hashOld) {
    console.error('❌  js/core.bundle.js ไม่ตรงกับ source — รัน npm run build:js แล้ว commit ใหม่');
    process.exit(1);
  }
  console.log('✅  js/core.bundle.js ตรงกับ source');
} else {
  fs.writeFileSync(OUT, result.code, 'utf8');
  const kb = (result.code.length / 1024).toFixed(1);
  const files = CORE_FILES.length;
  console.log(`✅  js/core.bundle.js (${kb} KB จาก ${files} ไฟล์)`);
}
