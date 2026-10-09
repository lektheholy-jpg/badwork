// Cloudflare Worker: พร็อกซี Gemini สำหรับแอป badwork
//   - เก็บ Google AI Studio key ไว้เป็น secret ฝั่งเซิร์ฟเวอร์ (ไม่อยู่ในหน้าเว็บ)
//   - รับเฉพาะคำขอที่แนบ Firebase ID token ที่ถูกต้องของโปรเจกต์นี้
//   - จำกัดโดเมนที่เรียกได้ (CORS) · จำกัดชื่อรุ่น · จำกัดขนาดคำขอ
// ตัวแปรที่ต้องตั้ง (wrangler.toml / Dashboard):
//   GEMINI_API_KEY      (secret)  คีย์จาก aistudio.google.com/apikey
//   FIREBASE_PROJECT_ID           เช่น mywork-lektheholy
//   ALLOWED_ORIGINS               คั่นด้วย , เช่น https://mywork.example.com,http://localhost:8080
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
  return payload;
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
    try { await verifyFirebaseToken(auth.slice(7), env.FIREBASE_PROJECT_ID); }
    catch (e) { return reply(401, { error: { message: 'invalid token' } }, h); }

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
};
