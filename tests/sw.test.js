// ทดสอบตรรกะของ sw.js โดยจำลอง Cache API + เน็ตเปิด/ปิด (ไม่ต้องใช้เบราว์เซอร์)
// วิธีรัน: node tests/sw.test.js   (หรือ npm run test:sw)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ORIGIN = 'https://school.example';
const SCOPE = ORIGIN + '/badwork/';

function makeSW({ online = true, body = {} } = {}) {
  const state = { online, body: { ...body }, fetched: [], hang: false };
  const listeners = {};
  const store = new Map();
  const strip = u => u.split('?')[0];
  const urlOf = k => (typeof k === 'string' ? k : k.url);
  const find = (m, k, o = {}) => {
    const want = urlOf(k);
    for (const [u, r] of m) if (o.ignoreSearch ? strip(u) === strip(want) : u === want) return r.clone();
  };
  const caches = {
    open: async (n) => {
      if (!store.has(n)) store.set(n, new Map());
      const m = store.get(n);
      return {
        put: async (k, r) => { m.set(urlOf(k), r.clone()); },
        match: async (k, o) => find(m, k, o),
        add: async (u) => { const r = await fetchFn(u); if (!r.ok) throw new Error('add ' + u + ' ' + r.status); m.set(urlOf(u), r); },
      };
    },
    match: async (k, o) => { for (const m of store.values()) { const r = find(m, k, o); if (r) return r; } },
    keys: async () => [...store.keys()],
    delete: async (n) => store.delete(n),
  };
  async function fetchFn(req) {
    const url = urlOf(req);
    state.fetched.push(url);
    if (state.hang) return new Promise(() => {});
    if (!state.online) throw new TypeError('Failed to fetch (offline)');
    if (url.startsWith('https://fonts.googleapis.com/')) return new Response('@font-face{src:url(https://fonts.gstatic.com/s/x/a.woff2)}', { status: 200 });
    const key = strip(url) === SCOPE ? SCOPE + 'index.html' : strip(url); // เซิร์ฟเวอร์ส่ง index.html ให้ที่อยู่โฟลเดอร์
    if (key in state.body) return new Response(state.body[key], { status: 200 });
    if (url.startsWith(SCOPE) || url.startsWith('https://www.gstatic.com/') || url.startsWith('https://fonts.gstatic.com/')) return new Response('file:' + key, { status: 200 });
    return new Response('nf', { status: 404 });
  }
  const self = {
    registration: { scope: SCOPE },
    location: { origin: ORIGIN },
    get navigator() { return { onLine: state.online }; },
    clients: { claim: async () => {} },
    skipWaiting: () => { state.skipped = true; },
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  const ctx = vm.createContext({
    self, caches, fetch: fetchFn, Request, Response, URL, Promise, Symbol, console,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 30)), // เร่ง NETWORK_TIMEOUT 4 วินาที → 30 มิลลิวินาที
    clearTimeout,
  });
  vm.runInContext(code + '\n;this.__P = PRECACHE; this.__CORE = CORE;', ctx);

  const waits = [];
  const sw = {
    state, store, ctx,
    install: async () => { const e = { waitUntil: p => waits.push(p) }; listeners.install(e); await Promise.all(waits.splice(0)); },
    activate: async () => { const e = { waitUntil: p => waits.push(p) }; listeners.activate(e); await Promise.all(waits.splice(0)); },
    // คืน undefined ถ้า SW ไม่รับเรื่อง (ปล่อยให้เบราว์เซอร์จัดการเอง)
    fetch: async (url, { method = 'GET', mode = 'cors' } = {}) => {
      let responded;
      const e = { request: { url, method, mode }, respondWith: p => { responded = Promise.resolve(p); }, waitUntil: p => waits.push(p) };
      listeners.fetch(e);
      if (!responded) return undefined;
      const res = await responded;
      // waitUntil ที่เน็ตค้างจะไม่จบ (เบราว์เซอร์มีเพดานเวลาให้) — รอแค่พอให้แคชอัปเดตทัน
      await Promise.race([Promise.all(waits.splice(0).map(p => p.catch(() => {}))), sleep(100)]);
      return res;
    },
    text: async (r) => (r ? r.clone().text() : undefined),
  };
  return sw;
}

(async () => {
  console.log('\n[1] ติดตั้ง');
  {
    const sw = makeSW({ body: { [SCOPE + 'index.html']: '<html>v1</html>' } });
    await sw.install();
    const core = sw.store.get(sw.ctx.__CORE);
    const P = sw.ctx.__P;
    ok(P.every(p => core.has(SCOPE + p)), `แคชครบทุกไฟล์ใน PRECACHE (${P.length} ไฟล์)`);
    ok(core.has(SCOPE), 'เก็บ index.html ไว้ใต้ ./ ด้วย (เปิดแอปจากที่อยู่โฟลเดอร์ได้)');
    ok([...core.keys()].some(k => k.includes('fonts.gstatic.com')), 'แคชไฟล์ฟอนต์ที่อ้างใน CSS');

    const bad = makeSW({ body: {} });
    const orig = bad.state.body;
    // ไฟล์ของแอปหายไปหนึ่งไฟล์ (404) → ติดตั้งต้องไม่ผ่าน
    const realFetch = bad.ctx.fetch;
    bad.ctx.fetch = async (r) => (String(r.url || r).endsWith('js/app.js') ? new Response('', { status: 404 }) : realFetch(r));
    let rejected = false; try { await bad.install(); } catch (e) { rejected = true; }
    ok(rejected, 'ไฟล์ของแอปโหลดไม่ได้ (404) → ติดตั้งไม่ผ่าน ไม่ได้แอปครึ่งเดียว');
  }

  console.log('\n[2] เปิดแอปตอนออฟไลน์');
  {
    const sw = makeSW({ body: { [SCOPE + 'index.html']: '<html>v1</html>', [SCOPE + 'js/app.js']: 'APP-1' } });
    await sw.install(); await sw.activate();
    sw.state.body[SCOPE + 'index.html'] = '<html>v2</html>';
    let r = await sw.fetch(SCOPE, { mode: 'navigate' });
    ok(await sw.text(r) === '<html>v2</html>', 'ออนไลน์ → ได้หน้าใหม่จากเซิร์ฟเวอร์ (ไม่ค้างของเก่า)');
    sw.state.online = false;
    r = await sw.fetch(SCOPE, { mode: 'navigate' });
    ok(await sw.text(r) === '<html>v2</html>', 'ออฟไลน์ → เปิดหน้าล่าสุดที่เคยโหลดจากแคชได้');
    r = await sw.fetch(SCOPE + 'index.html?utm=x', { mode: 'navigate' });
    ok(await sw.text(r) === '<html>v2</html>', 'ออฟไลน์ + URL มี query → ยังได้ index.html');
    r = await sw.fetch(SCOPE + 'js/app.js');
    ok(await sw.text(r) === 'APP-1', 'ออฟไลน์ → สคริปต์ของแอปมาจากแคช', await sw.text(r));
    r = await sw.fetch(SCOPE + 'js/vendor/xlsx.mini.min.js?v=0.20.3');
    ok(r && r.ok, 'ออฟไลน์ → xlsx.mini.min.js?v=… (มี query) หาในแคชเจอ');
    r = await sw.fetch(SCOPE + 'js/report.js');
    ok(r && r.ok, 'ออฟไลน์ → โมดูล lazy (report.js) เปิดได้');
    r = await sw.fetch('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js');
    ok(r && r.ok, 'ออฟไลน์ → Firebase SDK มาจากแคช');
    r = await sw.fetch('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');
    ok(r && r.ok, 'ออฟไลน์ → CSS ฟอนต์มาจากแคช');
  }

  console.log('\n[3] เน็ตช้า/ค้าง → ใช้แคชไปก่อน');
  {
    const sw = makeSW({ body: { [SCOPE + 'index.html']: '<html>v1</html>' } });
    await sw.install(); await sw.activate();
    sw.state.hang = true; // ออนไลน์ตามเบราว์เซอร์ แต่เซิร์ฟเวอร์ไม่ตอบ
    const t0 = Date.now();
    const r = await sw.fetch(SCOPE, { mode: 'navigate' });
    ok(await sw.text(r) === '<html>v1</html>' && Date.now() - t0 < 500, 'เซิร์ฟเวอร์ไม่ตอบ → ได้หน้าจากแคชหลังหมดเวลา ไม่ค้างตลอด');
  }

  console.log('\n[4] ไม่แตะคำขออื่น');
  {
    const sw = makeSW();
    await sw.install(); await sw.activate();
    const hit = async (u, o) => (await sw.fetch(u, o)) !== undefined;
    ok(!(await hit('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?x=1')), 'Firestore ไม่ผ่าน SW');
    ok(!(await hit('https://identitytoolkit.googleapis.com/v1/accounts:lookup')), 'Firebase Auth ไม่ผ่าน SW');
    ok(!(await hit('https://securetoken.googleapis.com/v1/token')), 'Token refresh ไม่ผ่าน SW');
    ok(!(await hit('https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2')), 'API สภาพอากาศไม่ผ่าน SW');
    ok(!(await hit('https://accounts.google.com/o/oauth2/auth')), 'Google Sign-In ไม่ผ่าน SW');
    ok(!(await hit(SCOPE + '__/auth/handler')), 'ตัวช่วยล็อกอิน /__/auth ไม่ผ่าน SW');
    ok(!(await hit(SCOPE + 'js/app.js', { method: 'POST' })), 'คำขอที่ไม่ใช่ GET ไม่ผ่าน SW');
  }

  console.log('\n[5] อัปเดตเวอร์ชัน');
  {
    const sw = makeSW();
    await sw.install();
    sw.store.set('myscore-core-OLD', new Map([[SCOPE + 'x', new Response('old')]]));
    sw.store.set('myscore-rt', new Map());
    sw.store.set('other-app-cache', new Map());
    await sw.activate();
    const names = [...sw.store.keys()];
    ok(!names.includes('myscore-core-OLD'), 'activate ลบแคชแอปเวอร์ชันเก่า');
    ok(names.includes('myscore-rt') && names.includes('other-app-cache'), 'ไม่ลบแคชรูปที่ใช้ร่วม และไม่ลบแคชของเว็บอื่น');
    ok(sw.state.skipped !== true, 'ติดตั้งแล้วไม่ skipWaiting เอง (รอให้ผู้ใช้กดอัปเดต)');
  }

  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
