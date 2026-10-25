// Cloudflare Worker: พร็อกซี Gemini สำหรับแอป badwork
//   - เก็บ Google AI Studio key ไว้เป็น secret ฝั่งเซิร์ฟเวอร์ (ไม่อยู่ในหน้าเว็บ)
//   - รับเฉพาะคำขอที่แนบ Firebase ID token ที่ถูกต้องของโปรเจกต์นี้
//   - จำกัดโดเมนที่เรียกได้ (CORS) · จำกัดชื่อรุ่น · จำกัดขนาดคำขอ
// ตัวแปรที่ต้องตั้ง (wrangler.toml / Dashboard):
//   GEMINI_API_KEY      (secret)  คีย์จาก aistudio.google.com/apikey
//   FIREBASE_PROJECT_ID           เช่น mywork-lektheholy
//   ALLOWED_ORIGINS               คั่นด้วย , เช่น https://mywork.example.com,http://localhost:8080
// ตัวแปรเพิ่มเติม (ไม่บังคับ · ไม่ตั้ง = ไม่จำกัดในข้อนั้น) สำหรับคุมค่าใช้จ่าย Gemini:
//   ALLOWED_EMAIL_DOMAINS         คั่นด้วย , เช่น school.ac.th  (ตรวจท้ายอีเมลของผู้ใช้)
//   DAILY_LIMIT_PER_USER          จำนวนคำขอ/คน/วัน   (ต้องมี KV binding ชื่อ QUOTA)
//   DAILY_LIMIT_GLOBAL            จำนวนคำขอรวมทุกคน/วัน (ต้องมี KV binding ชื่อ QUOTA)
// แจ้งเตือนก่อนเริ่มคาบสอน (Web Push · ไม่บังคับ — ไม่ตั้ง = ปิดฟีเจอร์นี้ ส่วน Gemini ทำงานตามเดิม):
//   POST /push/sync          เก็บ/อัปเดต subscription + ตารางสอนของเครื่องนี้ (ต้องแนบ Firebase ID token เหมือนกัน)
//   POST /push/unsubscribe   ลบ subscription ของเครื่องนี้
//   cron (wrangler.toml)     ทุกนาทีช่วง 07:00–17:59 น. จ.–ศ. → ส่ง push ให้คนที่มีคาบเริ่มในอีก N นาที
//   PUSH (KV binding)        เก็บ subscription · VAPID_PUBLIC_KEY / VAPID_SUBJECT (vars) · VAPID_PRIVATE_KEY (secret) — สร้างคีย์ด้วย node tools/gen-vapid.js
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_BODY = 200 * 1024;                 // ไบต์
const MODEL_RE = /^gemini-[a-z0-9.\-]+$/;    // กันการยิงไปปลายทางอื่น
const ALLOWED_KEYS = ['systemInstruction', 'contents', 'generationConfig']; // ส่งต่อเฉพาะฟิลด์เหล่านี้

let jwksCache = { keys: null, exp: 0 };

const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const json = o => JSON.parse(new TextDecoder().decode(o));

async function getJwks() {
  if (jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error('jwks');
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwksCache = { keys: (await r.json()).keys, exp: Date.now() + (m ? +m[1] : 3600) * 1000 };
  return jwksCache.keys;
}

// ตรวจ Firebase ID token (RS256) · คืน payload ถ้าถูกต้อง · throw ถ้าไม่ถูกต้อง
export async function verifyFirebaseToken(token, projectId, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('format');
  const header = json(b64u(parts[0])), payload = json(b64u(parts[1]));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  const jwk = (await getJwks()).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('signature');
  const sec = Math.floor(now / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('claims');
  if (!payload.sub || typeof payload.exp !== 'number' || payload.exp <= sec || payload.iat > sec + 60) throw new Error('expired');
  if (payload.email_verified !== true) throw new Error('unverified');   // ตรงกับ firestore.rules (signedIn)
  return payload;
}

// ---- ตัวคุมค่าใช้จ่าย -------------------------------------------------------------
// อีเมลต้องลงท้ายด้วย @โดเมนที่อนุญาต (ตรวจตรงตัว: "a@x.school.ac.th" ไม่ผ่านถ้าอนุญาตแค่ school.ac.th)
export function emailAllowed(email, list) {
  const doms = String(list || '').split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  if (!doms.length) return true;                       // ไม่ตั้งค่า = ไม่จำกัด
  const m = /^[^@\s]+@([^@\s]+)$/.exec(String(email || '').toLowerCase());
  return !!m && doms.includes(m[1]);
}

// วันตามเวลาไทย (UTC+7) · ใช้เป็นส่วนหนึ่งของคีย์โควตา
export const dayKey = (now = Date.now()) => new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);

// โควตารายวันด้วย KV (binding ชื่อ QUOTA) · คืน true ถ้ายังใช้ได้ (และนับเพิ่มให้)
// หมายเหตุ: KV ไม่ atomic ถ้ามีคำขอพร้อมกันอาจนับขาดเล็กน้อย — เหมาะกับเพดานค่าใช้จ่าย ไม่ใช่การนับเป๊ะ
export async function takeDaily(env, uid, now = Date.now()) {
  if (!env.QUOTA) return true;                         // ไม่มี binding = ข้าม
  const perUser = +env.DAILY_LIMIT_PER_USER || 0, global = +env.DAILY_LIMIT_GLOBAL || 0;
  if (!perUser && !global) return true;
  const day = dayKey(now), ttl = { expirationTtl: 2 * 86400 };
  const keys = [];
  if (perUser) keys.push({ k: `u:${day}:${uid}`, max: perUser });
  if (global) keys.push({ k: `g:${day}`, max: global });
  const cur = await Promise.all(keys.map(x => env.QUOTA.get(x.k)));
  if (keys.some((x, i) => (+cur[i] || 0) >= x.max)) return false;   // เต็มแล้ว: ไม่นับเพิ่ม
  await Promise.all(keys.map((x, i) => env.QUOTA.put(x.k, String((+cur[i] || 0) + 1), ttl)));
  return true;
}

// ---- Web Push: แจ้งเตือนก่อนเริ่มคาบสอน ---------------------------------------------
const MAX_PUSH_BODY = 20 * 1024;
const SUB_TTL = 60 * 86400;   // subscription ที่ไม่ได้ซิงก์เกิน 60 วัน (เลิกใช้แล้ว) ลบเอง
const RESYNC_MS = 7 * 86400e3; // ข้อมูลเดิมที่ซิงก์มาซ้ำ: ไม่เขียน KV (write ฟรีแค่ 1,000 ครั้ง/วัน) ยกเว้นเก่าเกิน 7 วัน → เขียนใหม่เพื่อต่ออายุ SUB_TTL
const IDX_KEY = 'idx';         // ดัชนีนาทีที่ต้องแจ้ง (ไม่ขึ้นต้น s: จึงไม่ปนในผล list ของ subscription)
// ยอมส่งเฉพาะบริการ push ของเบราว์เซอร์จริง (กันผู้ใช้ยัด endpoint แปลกๆ ให้ Worker ยิงไปหา)
const PUSH_HOST_RE = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
const te = new TextEncoder();
const enc64 = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { o.set(x, i); i += x.length; }); return o; };
const pad2 = n => String(n).padStart(2, '0');

export function pushEndpointOk(ep) {
  try {
    const u = new URL(ep);
    return String(ep).length <= 600 && u.protocol === 'https:' && !u.port && PUSH_HOST_RE.test(u.hostname);
  } catch (e) { return false; }
}

// คีย์ KV = s:{uid}:{แฮชของ endpoint} → 1 เครื่อง/เบราว์เซอร์ = 1 คีย์ · uid อยู่ในคีย์ จึงลบ/เขียนได้เฉพาะของตัวเอง
export async function pushKey(uid, endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(endpoint)));
  return `s:${uid}:${[...h.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

// ตรวจ/ล้างข้อมูลที่เครื่องส่งมา → { sub, lead, items:[{day,start,title,cls,room}] } หรือ null
export function cleanSync(b) {
  if (!b || typeof b !== 'object') return null;
  const s = b.subscription;
  if (!s || !pushEndpointOk(s.endpoint) || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') return null;
  try { if (b64u(s.keys.p256dh).length !== 65 || b64u(s.keys.auth).length !== 16) return null; } catch (e) { return null; }
  const lead = Math.min(60, Math.max(1, Math.floor(Number(b.lead)) || 5));
  const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 120).map(i => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(txt(i && i.start, 5));
    const day = Number(i && i.day), title = txt(i && i.title, 100);
    if (!m || +m[1] > 23 || +m[2] > 59 || !Number.isInteger(day) || day < 1 || day > 5 || !title) return null;
    return { day, start: pad2(+m[1]) + ':' + m[2], title, cls: txt(i.cls, 30), room: txt(i.room, 30) };
  }).filter(Boolean);
  return { sub: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, lead, items };
}

// metadata ของ KV (≤1 KB) เก็บเวลาเริ่มคาบไว้ใน list() เลย → cron กรองได้โดยไม่ต้องอ่านค่าเต็มของทุกคนทุกนาที
export function pushMeta(rec) {
  const t = [...new Set(rec.items.map(i => i.day + '@' + i.start))];
  return JSON.stringify({ lead: rec.lead, t }).length <= 900 ? { lead: rec.lead, t } : { lead: rec.lead };
}

// เวลาไทย (UTC+7) ของ ms ที่ให้ → { day: 0=อาทิตย์…6, hm: 'HH:MM' }
export function thaiNow(now) {
  const d = new Date(Math.floor(now / 60000) * 60000 + 7 * 3600 * 1000);
  return { day: d.getUTCDay(), hm: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) };
}
export function addMin(hm, n) {
  const m = +hm.slice(0, 2) * 60 + +hm.slice(3, 5) + n;
  return m < 0 || m >= 1440 ? null : pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}
// วันที่ไทย 'YYYY-MM-DD' ของ ms ที่ให้ — ใช้บอกว่าดัชนีถูกสร้างวันนี้หรือยัง
export function thaiDate(now) {
  return new Date(Math.floor(now / 60000) * 60000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---- ดัชนีนาทีที่ต้องแจ้ง: สแกนตารางทุกเครื่องครั้งเดียว/วัน แล้วเก็บเป็น { d: วันที่สร้าง, f: ['1@08:35', …] } (day@เวลาที่ต้องส่ง = เวลาเริ่มคาบ − lead) ----
// cron ทุกนาทีแค่ get ดัชนี 1 คีย์ (read: โควตา 100,000/วัน) และ list จริงเฉพาะนาทีที่อยู่ในดัชนี (~10–15 ครั้ง/วัน แทน ~660) · list/write/delete ใช้โควตาร่วมกัน 1,000/วัน
const fireKey = (t, lead) => { const [d, st] = String(t).split('@'), f = addMin(st || '', -lead); return f ? d + '@' + f : null; };
export function fireKeys(rec) {
  return [...new Set(rec.items.map(i => fireKey(i.day + '@' + i.start, rec.lead)).filter(Boolean))];
}
export async function rebuildIndex(env, date) {
  const f = new Set();
  let cursor;
  do {
    const page = await env.PUSH.list({ prefix: 's:', cursor, limit: 1000 });
    await Promise.all(page.keys.map(async k => {
      const m = k.metadata;
      if (m && Array.isArray(m.t)) { m.t.forEach(t => { const x = fireKey(t, m.lead || 5); if (x) f.add(x); }); return; }
      const rec = await env.PUSH.get(k.name, 'json');                // ไม่มี metadata (ตารางใหญ่) → อ่านเต็ม
      if (rec && Array.isArray(rec.items)) fireKeys(rec).forEach(x => f.add(x));
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const idx = { d: date, f: [...f].sort() };
  await env.PUSH.put(IDX_KEY, JSON.stringify(idx));                   // 1 write/วัน
  return idx;
}
// เครื่องที่เพิ่งซิงก์: เติมเวลาใหม่เข้าดัชนีที่มีอยู่ (เขียนเฉพาะเมื่อมีเวลาใหม่จริง · ยังไม่มีดัชนี = ไม่ต้องทำ cron สร้างจากทุกเครื่องเอง)
async function indexAdd(env, rec) {
  try {
    const idx = await env.PUSH.get(IDX_KEY, 'json');
    if (!idx || !Array.isArray(idx.f)) return;
    const have = new Set(idx.f), add = fireKeys(rec).filter(x => !have.has(x));
    if (add.length) await env.PUSH.put(IDX_KEY, JSON.stringify({ d: idx.d, f: [...have, ...add].sort() }));
  } catch (e) { console.warn('push index', String(e && e.message || e)); }  // ดัชนีพลาด ≠ ซิงก์พลาด: cron สร้างใหม่ให้ตอนเช้า
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// เข้ารหัสข้อความตาม RFC 8291 (aes128gcm) → ไบต์ที่ส่งเป็นเนื้อหาคำขอ push
export async function pushEncrypt(sub, text) {
  const ua = b64u(sub.keys.p256dh), auth = b64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, secret, concat(te.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(te.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21);                      // salt(16) · record size(4) · key length(1)
  head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length;
  return concat(head, asPub, ct);
}

// ส่วนหัว Authorization แบบ VAPID (RFC 8292) · JWT ES256 — WebCrypto คืนลายเซ็นแบบ r||s ซึ่งตรงกับที่ JWT ต้องการ
export async function vapidAuth(env, endpoint, now = Date.now()) {
  const pub = b64u(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: enc64(pub.slice(1, 33)), y: enc64(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = enc64(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const pl = enc64(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head + '.' + pl)));
  return `vapid t=${head}.${pl}.${enc64(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function sendPush(env, sub, payload) {
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: '240', Urgency: 'high',                      // เกิน 4 นาทีแล้วไม่ต้องส่งต่อ (คาบเริ่มไปแล้ว)
    },
    body: await pushEncrypt(sub, JSON.stringify(payload)),
  });
}

// cron: ทุกนาที → ดูดัชนีก่อน แล้วค่อยหาคนที่มีคาบเริ่มในอีก N นาทีพอดีเพื่อส่ง push (ตรงนาทีเท่านั้น · ไม่เก็บประวัติส่งซ้ำ เพื่อไม่เปลืองโควตาเขียน KV)
export async function runReminders(env, now = Date.now(), send = sendPush) {
  if (!env.PUSH || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0 };
  const { day, hm } = thaiNow(now);
  if (day < 1 || day > 5) return { sent: 0 };
  // ดัชนีนาทีที่ต้องแจ้ง: ไม่ใช่นาทีที่มีใครต้องแจ้ง → จบเลย (ไม่ list) · ยังไม่มี/ไม่ใช่ของวันนี้ → สแกนสร้างใหม่ (วันละครั้ง)
  let idx = await env.PUSH.get(IDX_KEY, 'json').catch(() => null);   // ค่าเสีย/อ่านไม่ได้ = ถือว่ายังไม่มี → สร้างใหม่ (ห้ามทำให้ cron ล้มทุกนาที)
  const today = thaiDate(now);
  if (!idx || idx.d !== today || !Array.isArray(idx.f)) idx = await rebuildIndex(env, today);
  if (!idx.f.includes(day + '@' + hm)) return { sent: 0 };
  let cursor, sent = 0;
  do {
    const page = await env.PUSH.list({ prefix: 's:', cursor, limit: 1000 });
    const due = page.keys.filter(k => {
      const m = k.metadata;
      if (!m || !Array.isArray(m.t)) return true;       // ไม่มี metadata (ตารางใหญ่) → อ่านเต็มเพื่อเช็ค
      const target = addMin(hm, m.lead || 5);
      return !!target && m.t.includes(day + '@' + target);
    });
    await Promise.all(due.map(async k => {
      const rec = await env.PUSH.get(k.name, 'json');
      const target = rec && addMin(hm, rec.lead);
      if (!target) return;
      for (const it of rec.items.filter(i => i.day === day && i.start === target)) {
        try {
          const res = await send(env, rec.sub, {
            t: `อีก ${rec.lead} นาที · ${it.title}`,
            b: [it.cls, it.room, it.start + ' น.'].filter(Boolean).join(' · '),
            tag: `tt-${day}-${it.start}`,
          });
          if (res.status === 404 || res.status === 410) { await env.PUSH.delete(k.name); return; }   // เครื่องนี้เลิกรับแล้ว
          if (res.ok) sent++; else console.warn('push', res.status);
        } catch (e) { console.warn('push error', String(e && e.message || e)); }
      }
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { sent };
}

async function handlePush(req, env, user, path, h) {
  if (!env.PUSH || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return reply(503, { error: { message: 'push not configured' } }, h);
  const raw = await req.text();
  if (raw.length > MAX_PUSH_BODY) return reply(413, { error: { message: 'request too large' } }, h);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return reply(400, { error: { message: 'bad json' } }, h); }
  if (path === '/push/unsubscribe') {
    if (!body || !pushEndpointOk(body.endpoint)) return reply(400, { error: { message: 'bad endpoint' } }, h);
    await env.PUSH.delete(await pushKey(user.sub, body.endpoint));
    return reply(200, { ok: true }, h);
  }
  if (path === '/push/sync') {
    const rec = cleanSync(body);
    if (!rec) return reply(400, { error: { message: 'bad subscription' } }, h);
    const key = await pushKey(user.sub, rec.sub.endpoint), now = Date.now();
    const prev = await env.PUSH.get(key, 'json');   // read (โควตา 100,000/วัน) แลกกับไม่เสีย write (1,000/วัน) เมื่อข้อมูลไม่เปลี่ยน
    const same = prev && prev.ts && now - prev.ts < RESYNC_MS && JSON.stringify([prev.sub, prev.lead, prev.items]) === JSON.stringify([rec.sub, rec.lead, rec.items]);
    if (!same) await env.PUSH.put(key, JSON.stringify({ ...rec, ts: now }), { expirationTtl: SUB_TTL, metadata: pushMeta(rec) });
    await indexAdd(env, rec);
    return reply(200, { ok: true, items: rec.items.length, unchanged: !!same }, h);
  }
  return reply(404, { error: { message: 'not found' } }, h);
}

function cors(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin' };
  if (allowed.includes(origin)) Object.assign(h, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  });
  return { h, allowed: allowed.includes(origin) };
}
const reply = (status, obj, h) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...h } });

export default {
  async fetch(req, env) {
    const { h, allowed } = cors(env, req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: h });
    if (!allowed) return reply(403, { error: { message: 'origin not allowed' } }, h);
    if (req.method !== 'POST') return reply(405, { error: { message: 'method not allowed' } }, h);

    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return reply(401, { error: { message: 'missing token' } }, h);
    let user;
    try { user = await verifyFirebaseToken(auth.slice(7), env.FIREBASE_PROJECT_ID); }
    catch (e) { return reply(401, { error: { message: 'invalid token' } }, h); }

    // จำกัดโดเมนอีเมล (ตั้ง ALLOWED_EMAIL_DOMAINS) · ตรงกับเงื่อนไข schoolUser() ใน firestore.rules ถ้าเลือกใช้
    if (!emailAllowed(user.email, env.ALLOWED_EMAIL_DOMAINS)) return reply(403, { error: { message: 'email domain not allowed' } }, h);

    // จำกัดจำนวนคำขอต่อผู้ใช้ (binding ชื่อ RATE_LIMITER ใน wrangler.toml) · ไม่มี binding = ข้าม (เช่นตอนเทสต์ในเครื่อง)
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: user.sub });
      if (!success) return reply(429, { error: { message: 'too many requests' } }, { 'Retry-After': '60', ...h });
    }

    // แจ้งเตือนคาบสอน (Web Push) — ไม่นับโควตา Gemini
    const path = new URL(req.url).pathname;
    if (path.startsWith('/push/')) return handlePush(req, env, user, path, h);

    // โควตารายวัน (ต่อคน + รวมทั้งระบบ) · เช็คก่อนอ่านเนื้อหา/ก่อนยิง Gemini
    if (!(await takeDaily(env, user.sub))) return reply(429, { error: { message: 'daily quota exceeded' } }, { 'Retry-After': '3600', ...h });

    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(413, { error: { message: 'request too large' } }, h);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return reply(400, { error: { message: 'bad json' } }, h); }
    if (typeof body.model !== 'string' || !MODEL_RE.test(body.model)) return reply(400, { error: { message: 'bad model' } }, h);

    const out = {};
    ALLOWED_KEYS.forEach(k => { if (body[k] !== undefined) out[k] = body[k] });
    const up = await fetch(`${GEMINI}/models/${body.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(out),
    });
    return new Response(up.body, { status: up.status, headers: { 'Content-Type': 'application/json', ...h } });
  },
  // Cron Trigger (wrangler.toml > [triggers]) — ใช้เวลาที่ตั้งไว้ของ cron เอง ไม่ใช่เวลาที่เริ่มรันจริง กันเพี้ยนเมื่อ Worker ช้า
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env, event.scheduledTime));
  },
};
