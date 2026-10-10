// ==========================================================================
// Service Worker — ให้เปิดแอปได้ตอนไม่มีอินเทอร์เน็ต (แอปเชลล์ออฟไลน์)
//
// หน้าที่: เก็บไฟล์ของแอป (HTML/CSS/JS/ฟอนต์/ไอคอน/Firebase SDK) ไว้ในเครื่อง
//   ส่วน "ข้อมูลคะแนน" ไม่เกี่ยวกับไฟล์นี้ — Firestore เก็บเองใน IndexedDB (js/firebase-config.js)
//
// กลยุทธ์
//   - ไฟล์ของแอป (same-origin)     : เน็ตก่อน แล้วถอยไปแคช → ออนไลน์ได้ของใหม่เสมอ ออฟไลน์ได้ของที่เคยโหลด
//                                    (ไฟล์ไม่มี hash ในชื่อ จึงไม่ใช้ cache-first กันเวอร์ชันค้าง)
//   - รูปใน assets/                 : แคชก่อน แล้วอัปเดตเบื้องหลัง (รูปหนักและแทบไม่เปลี่ยน)
//   - Firebase SDK (ระบุเวอร์ชันใน URL) / ไฟล์ฟอนต์ : แคชก่อน
//   - CSS ของ Google Fonts          : แคชก่อน แล้วอัปเดตเบื้องหลัง
//   - ที่เหลือ (Firestore, Auth, สภาพอากาศ, Google Sign-In ฯลฯ) : ไม่แตะ ปล่อยให้เบราว์เซอร์/SDK จัดการเอง
//
// เมื่อแก้รายการ PRECACHE ให้เพิ่มเลข VERSION ด้านล่าง · รัน `npm run check:sw` ตรวจว่ารายการครบ
// ตัวหน้าเว็บ (js/pwa.js) จะแจ้ง "มีเวอร์ชันใหม่" ให้กดอัปเดตเอง ไม่รีโหลดกลางคันตอนครูกำลังกรอกคะแนน
// ==========================================================================

const VERSION = '2026-10-10.23';
const CORE = `myscore-core-${VERSION}`; // ไฟล์แอป (เปลี่ยนเวอร์ชัน = ทิ้งของเก่า)
const RUNTIME = 'myscore-rt';           // รูป/ไฟล์ที่แคชตอนใช้งาน (คงอยู่ข้ามเวอร์ชัน)

// เส้นทางเทียบกับตำแหน่งของ sw.js (ใช้ได้ทั้งโดเมนรากและโฟลเดอร์ย่อย เช่น GitHub Pages /badwork/)
const SCOPE = self.registration.scope;
const abs = p => new URL(p, SCOPE).href;
const INDEX = abs('index.html');

// ไฟล์ที่ "ต้อง" แคชได้ครบ ไม่งั้นติดตั้งไม่ผ่าน (กันได้แอปที่โหลดมาครึ่งเดียว)
const PRECACHE = [
  'index.html',
  'manifest.json',
  'css/style.min.css',
  // สคริปต์ที่ index.html โหลดตั้งแต่เปิดหน้า
  'js/theme.js',
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
  'js/doc-system.js',
  'js/doc-shell.js',
  'js/pa-config.js',
  'js/pa.js',
  'js/badwork-ai-config.js',
  'js/badwork-ai.js',
  'js/pa-ai.js',
  'js/pa-report.js',
  'js/pa-rpt.js',
  'js/idp-config.js',
  'js/idp.js',
  'js/idp-ai.js',
  'js/app.js',
  'js/pwa.js',
  // โมดูล lazy (LAZY_MODULES ใน js/utils.js) — ต้องมีไว้ ไม่งั้นเปิดหน้ารายงาน/เครื่องมือ/ข้อมูลส่วนตัวตอนออฟไลน์ไม่ได้
  'js/report.js',
  'js/privacy.js',
  'js/tools.js',
  'js/profile.js',
  'js/timetable.js',
  'js/records.js',
  'js/vendor/xlsx.mini.min.js',
  // ไอคอน + รูปขนาดเล็ก (รูปเต็มแคชตอนใช้งานจริง)
  'assets/icons/android-chrome-192x192.png',
  'assets/icons/logo-128.webp',
  'assets/icons/android-chrome-512x512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32x32.png',
  'assets/icons/favicon-16x16.png',
  'assets/icons/favicon.ico',
  'assets/head-cat-still.webp',
  'assets/head-cat-sm.webp',
  // ฟอนต์สำรองสำหรับพิมพ์ PA 1 (Sarabun, OFL)
  'assets/fonts/sarabun-thai-400-normal.woff2',
  'assets/fonts/sarabun-thai-700-normal.woff2',
  'assets/fonts/sarabun-thai-400-italic.woff2',
  'assets/fonts/sarabun-latin-400-normal.woff2',
  'assets/fonts/sarabun-latin-700-normal.woff2',
];

// ไฟล์ข้ามโดเมน: ถ้าโหลดไม่ได้ตอนติดตั้งก็ไม่เป็นไร (จะแคชตอนใช้งานจริงแทน) — ต้องตรงกับ index.html
const PRECACHE_CROSS = [
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js',
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap';

const NETWORK_TIMEOUT = 4000; // ออนไลน์แต่ช้าเกินนี้ → ใช้ของในแคชไปก่อน (ของใหม่ยังโหลดต่อเบื้องหลังเพื่ออัปเดตแคช)

// ---------- ติดตั้ง ----------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);

    // ไฟล์ของแอป: ขอใหม่จากเซิร์ฟเวอร์เสมอ (ไม่ใช้ HTTP cache เก่า) · พลาดไฟล์ไหน = ติดตั้งไม่ผ่าน รอบหน้าลองใหม่
    await Promise.all(PRECACHE.map(async (p) => {
      const url = abs(p);
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`precache ${p}: ${res.status}`);
      await cache.put(url, res);
      if (p === 'index.html') await cache.put(abs('./'), (await cache.match(url)).clone());
    }));

    // ไฟล์ข้ามโดเมน + ฟอนต์ (ลองเต็มที่ ไม่บังคับ)
    await Promise.all(PRECACHE_CROSS.map(u => cache.add(u).catch(() => {})));
    try {
      const cssRes = await fetch(FONT_CSS);
      if (cssRes.ok) {
        await cache.put(FONT_CSS, cssRes.clone());
        const css = await cssRes.text();
        const fontUrls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
        await Promise.all(fontUrls.map(u => cache.add(u).catch(() => {})));
      }
    } catch (e) { /* ไม่มีฟอนต์ตอนติดตั้ง: ข้าม จะแคชตอนใช้งานจริง */ }
    // ไม่เรียก skipWaiting() เอง — รอให้ผู้ใช้กดอัปเดต (ดู js/pwa.js) จะได้ไม่เปลี่ยนไฟล์กลางคันตอนกรอกคะแนน
  })());
});

// ---------- เปิดใช้งาน: ลบแคชเวอร์ชันเก่า ----------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CORE, RUNTIME]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('myscore-') && !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim(); // ให้หน้าที่เปิดอยู่ใช้ SW ทันที (ติดตั้งครั้งแรกแล้วรีเฟรชตอนออฟไลน์ได้เลย)
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---------- ดึงไฟล์ ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // ตัวช่วยล็อกอินของ Firebase Hosting (/__/auth/…, /__/firebase/…) ต้องไม่ผ่านแคช
    if (url.pathname.includes('/__/')) return;
    if (req.mode === 'navigate') return event.respondWith(networkFirst(event, req, INDEX));
    if (url.pathname.includes('/assets/') && !url.pathname.includes('/assets/icons/')) return event.respondWith(staleWhileRevalidate(event, req));
    return event.respondWith(networkFirst(event, req));
  }

  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) return event.respondWith(cacheFirst(req));
  if (url.hostname === 'fonts.gstatic.com') return event.respondWith(cacheFirst(req));
  if (url.hostname === 'fonts.googleapis.com') return event.respondWith(staleWhileRevalidate(event, req));
  // อย่างอื่น (firestore.googleapis.com, identitytoolkit, api.open-meteo.com, accounts.google.com ฯลฯ): ไม่แตะ
});

// เก็บของใหม่ลงแคชเฉพาะคำตอบปกติ (ไม่เก็บ 404/500 ทับของดี)
async function store(cacheName, key, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  try { await (await caches.open(cacheName)).put(key, res.clone()); } catch (e) { /* โควตาเต็ม ฯลฯ ข้าม */ }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  store(RUNTIME, req, res);
  return res;
}

async function staleWhileRevalidate(event, req) {
  const hit = await caches.match(req);
  const update = fetch(req).then((res) => { store(RUNTIME, req, res); return res; });
  if (hit) { event.waitUntil(update.catch(() => {})); return hit; }
  return update;
}

// เน็ตก่อน: ได้ของใหม่เสมอเมื่อออนไลน์ · ออฟไลน์/ช้า/พลาด → ของในแคช · navigate ที่ไม่เจอเลย → index.html
async function networkFirst(event, req, fallbackKey) {
  const key = fallbackKey || req;
  // ignoreSearch: ไฟล์แอปบางตัวโหลดพร้อม ?v=… (เช่น xlsx.mini.min.js?v=0.20.3) แต่ในแคชเก็บแบบไม่มี query
  const fromCache = async () => (await caches.match(key, { ignoreSearch: true })) || (fallbackKey ? await caches.match(abs('./')) : undefined);

  // รู้อยู่แล้วว่าออฟไลน์: ไม่ต้องรอเน็ต
  if (self.navigator && self.navigator.onLine === false) {
    const hit = await fromCache();
    if (hit) return hit;
  }

  const net = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) store(CORE, key, res); // ครั้งนี้ผ่านแล้ว อัปเดตแคชไว้ใช้รอบออฟไลน์
    return res;
  });

  const TIMEOUT = Symbol('timeout');
  try {
    const first = await Promise.race([net, new Promise(r => setTimeout(() => r(TIMEOUT), NETWORK_TIMEOUT))]);
    if (first !== TIMEOUT) return first;
    // ช้าเกิน: ใช้แคชไปก่อน ถ้าไม่มีแคชก็รอเน็ตต่อ · ของใหม่ยังโหลดต่อเบื้องหลังเพื่ออัปเดตแคช
    const hit = await fromCache();
    if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
    return await net;
  } catch (err) {
    const hit = await fromCache();
    if (hit) return hit;
    throw err; // ไม่มีทั้งเน็ตและแคช: ให้เบราว์เซอร์แสดงหน้าผิดพลาดตามปกติ
  }
}
