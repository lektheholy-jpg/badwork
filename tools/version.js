#!/usr/bin/env node
// ==========================================================================
// tools/version.js — สร้างเลขเวอร์ชันเว็บรูปแบบ  v<รุ่นใหญ่>.<ฟีเจอร์>.<วันเวลา>
//   ตัวอย่าง: v1.15.26OC201912
//
//   รุ่นใหญ่  = ตัวเลขแรกของ "version" ใน package.json (แก้เอง เมื่อปรับใหญ่)
//   ฟีเจอร์   = จำนวนหน้าในเมนูข้าง (ปุ่ม data-route ใน index.html)
//             + จำนวนระบบเอกสารที่ลงทะเบียน (registerDocSystem ใน js/*-config.js)
//   วันเวลา   = ปี 2 หลัก + รหัสเดือน 2 ตัว + วัน + ชั่วโมง + นาที ตามเวลาไทย (Asia/Bangkok) เวลาตอน build จริง
//             เปลี่ยนเฉพาะเมื่อ "ไฟล์ต้นทาง" เปลี่ยนจริง (เทียบ sha256) ไม่ใช่ทุกครั้งที่สั่ง build
//
// เขียนค่าที่ได้ลง 2 ที่ให้เท่ากัน: APP_INFO.version (js/app.js) และ VERSION (sw.js)
// สถานะล่าสุดเก็บใน tools/version.lock.json (commit ไปกับโค้ด)
//
// ใช้งาน:
//   npm run build:version            — คำนวณ + เขียนไฟล์ (รวมอยู่ใน npm run build แล้ว)
//   npm run build:version -- --check — ตรวจว่าเวอร์ชันในไฟล์ตรงกับต้นทางปัจจุบัน (ใช้ใน CI)
// ==========================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const LOCK = path.join(__dirname, 'version.lock.json');
const CHECK_MODE = process.argv.includes('--check');

const rel = (...p) => path.join(ROOT, ...p);
const read = f => fs.readFileSync(rel(f), 'utf8');

// ---------- ไฟล์ที่ใช้สร้างเลขเวอร์ชัน (ที่ต้องแก้ตอนเปลี่ยนเลข) ----------
const APP_RE = /(const APP_INFO = \{[^}]*?version:\s*')([^']*)(')/;
const SW_RE = /(const VERSION = ')([^']*)(')/;

// ---------- รุ่นใหญ่ ----------
function majorOf() {
  const v = JSON.parse(read('package.json')).version || '';
  const m = /^(\d+)\./.exec(v);
  if (!m) throw new Error(`"version" ใน package.json ต้องขึ้นต้นด้วยเลขรุ่นใหญ่ เช่น "1.0.0" (ได้ "${v}")`);
  return Number(m[1]);
}

// ---------- ฟีเจอร์ (นับจากโค้ด) ----------
function featuresOf() {
  const html = read('index.html');
  // ปุ่มเมนูข้างที่เปิดหน้า = nav-item ที่มี data-route (ปุ่มออกจากระบบไม่มี จึงไม่นับ)
  const pages = [...html.matchAll(/<button[^>]*class="nav-item[^"]*"[^>]*data-route="([^"]+)"/g)].length;
  const docs = fs.readdirSync(rel('js'))
    .filter(f => /-config\.js$/.test(f))
    .map(f => read(path.join('js', f)))
    .reduce((n, src) => n + (src.match(/^\s*registerDocSystem\(/gm) || []).length, 0);
  if (!pages) throw new Error('นับหน้าในเมนูจาก index.html ไม่ได้ (หา <button class="nav-item" data-route="..."> ไม่เจอ)');
  return { pages, docs, total: pages + docs };
}

// ---------- hash ของไฟล์ต้นทาง ----------
function walk(dir, out = []) {
  for (const name of fs.readdirSync(rel(dir)).sort()) {
    const p = path.join(dir, name);
    const st = fs.statSync(rel(p));
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function sourceFiles() {
  const files = ['index.html', 'manifest.json', 'css/style.css', 'sw.js', 'js/app.js'];
  // js/*.js ยกเว้นไฟล์ที่สร้างอัตโนมัติ (core.bundle.js) · รวม js/vendor/ ทั้งโฟลเดอร์
  for (const f of fs.readdirSync(rel('js')).sort()) {
    const p = path.join('js', f);
    if (!fs.statSync(rel(p)).isFile()) continue;
    if (f === 'core.bundle.js' || f === 'app.js' || !f.endsWith('.js')) continue;
    files.push(p);
  }
  walk('js/vendor').forEach(p => files.push(p));
  walk('assets').filter(p => !p.endsWith('.DS_Store')).forEach(p => files.push(p));
  return files.filter((f, i) => files.indexOf(f) === i);
}

function sourceHash() {
  const h = crypto.createHash('sha256');
  for (const f of sourceFiles()) {
    let data = fs.readFileSync(rel(f));
    // เลขเวอร์ชันที่เขียนลง app.js / sw.js เอง ต้องไม่นับ ไม่งั้นเขียนแล้ว hash เปลี่ยนวนไม่จบ
    if (f === 'js/app.js') data = Buffer.from(data.toString('utf8').replace(APP_RE, '$1$3'));
    if (f === 'sw.js') data = Buffer.from(data.toString('utf8').replace(SW_RE, '$1$3'));
    h.update(f.split(path.sep).join('/')).update('\0').update(data).update('\0');
  }
  return h.digest('hex');
}

// ---------- วันเวลาไทย → 26OC201912 (ปี 2 หลัก · เดือน · วัน · ชั่วโมง · นาที) ----------
const MONTH = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'];
function stampNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return `${parts.year.slice(-2)}${MONTH[Number(parts.month) - 1]}${parts.day}${parts.hour}${parts.minute}`;
}

// ---------- รวมทั้งหมด ----------
const major = majorOf();
const feat = featuresOf();
const hash = sourceHash();
const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : null;

// ต้นทางไม่เปลี่ยน (และรุ่นใหญ่/ฟีเจอร์เท่าเดิม) = ใช้วันเวลาเดิม · เปลี่ยน = วันเวลาตอนนี้
const unchanged = lock && /^\d{2}[A-Z]{2}\d{6}$/.test(lock.stamp || '') && lock.hash === hash && lock.major === major && lock.features === feat.total;
const stamp = unchanged ? lock.stamp : stampNow();
const version = `v${major}.${feat.total}.${stamp}`;

const swSrc = read('sw.js');
const appSrc = read('js/app.js');
const swNow = (swSrc.match(SW_RE) || [])[2];
const appNow = (appSrc.match(APP_RE) || [])[2];
if (swNow === undefined) throw new Error("หา const VERSION = '...' ใน sw.js ไม่เจอ");
if (appNow === undefined) throw new Error("หา version: '...' ใน const APP_INFO ของ js/app.js ไม่เจอ");

if (CHECK_MODE) {
  const errors = [];
  if (!unchanged) errors.push('ไฟล์ต้นทางเปลี่ยนไปจากตอนสร้างเลขเวอร์ชันล่าสุด — รัน npm run build:version แล้ว commit');
  if (swNow !== version) errors.push(`VERSION ใน sw.js ("${swNow}") ไม่ตรงกับที่ควรเป็น ("${version}")`);
  if (appNow !== version) errors.push(`APP_INFO.version ใน js/app.js ("${appNow}") ไม่ตรงกับที่ควรเป็น ("${version}")`);
  if (errors.length) { console.error('❌  version:\n  - ' + errors.join('\n  - ')); process.exit(1); }
  console.log(`✅  เวอร์ชัน ${version} ตรงกับต้นทาง`);
} else {
  const newSw = swSrc.replace(SW_RE, (_, a, __, c) => a + version + c);
  const newApp = appSrc.replace(APP_RE, (_, a, __, c) => a + version + c);
  if (newSw !== swSrc) fs.writeFileSync(rel('sw.js'), newSw, 'utf8');
  if (newApp !== appSrc) fs.writeFileSync(rel('js/app.js'), newApp, 'utf8');
  fs.writeFileSync(LOCK, JSON.stringify({ version, major, features: feat.total, pages: feat.pages, docSystems: feat.docs, stamp, hash }, null, 2) + '\n', 'utf8');
  console.log(`✅  ${version}${unchanged ? ' (ต้นทางไม่เปลี่ยน — คงเลขเดิม)' : ' (อัปเดตแล้ว)'}  · ฟีเจอร์ ${feat.total} = หน้า ${feat.pages} + ระบบเอกสาร ${feat.docs}`);
}
