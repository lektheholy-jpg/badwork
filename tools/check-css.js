#!/usr/bin/env node
// ตรวจกฎ "แก้ที่ต้นทาง" — 2 การตรวจ:
//
//   CHECK 1 — property ซ้ำ: selector+context เดียวกัน ต้องไม่ประกาศ property เดียวกันซ้ำ
//             (ซ้ำ = มีคนเขียนกฎมาทับแทนแก้ของเดิม)
//
//   CHECK 2 — selector กระจาย: selector+context เดียวกัน ถูก split เป็นหลาย rule block
//             (กระจาย = styles ของ component อยู่หลายที่ หาต้นทางยาก)
//             ข้ามด้วย comment: /* check-css: split-ok */  บนบรรทัดก่อน rule นั้น
//
// ใช้: node tools/check-css.js css/style.css   (exit 1 ถ้าพบ)
const fs = require('fs');
const postcss = require('postcss');

const file = process.argv[2] || 'css/style.css';
const css  = fs.readFileSync(file, 'utf8');
const root = postcss.parse(css, { from: file });
const norm = s => s.replace(/\s+/g, ' ').trim();

// ── helpers ──────────────────────────────────────────────────────────────────

function getCtx(rule) {
  const ctx = []; let p = rule.parent, skip = false;
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') {
      if (/keyframes|font-face/.test(p.name)) skip = true;
      ctx.unshift(`@${p.name} ${norm(p.params)}`);
    }
    p = p.parent;
  }
  return skip ? null : ctx.join(' | ');
}

function hasSplitOkComment(rule) {
  // ยอมรับ comment /* check-css: split-ok */ บนบรรทัดก่อน rule (raws.before)
  return /check-css:\s*split-ok/.test(rule.raws.before || '');
}

// ── CHECK 1: property ซ้ำ ────────────────────────────────────────────────────

const propSeen = new Map();

root.walkRules(rule => {
  const ctx = getCtx(rule);
  if (ctx === null) return;
  const props = new Set();
  rule.each(d => {
    if (d.type !== 'decl') return;
    const prop = d.prop.toLowerCase();
    if (props.has(prop)) return;   // fallback ภายในกฎเดียวไม่นับ
    props.add(prop);
    for (const sel of rule.selectors.map(norm)) {
      const key = `${ctx}\u0000${sel}\u0000${prop}`;
      if (!propSeen.has(key)) propSeen.set(key, []);
      propSeen.get(key).push(rule.source.start.line);
    }
  });
});

const propDups = [...propSeen].filter(([, lines]) => lines.length > 1);

// ── CHECK 2: selector กระจาย ─────────────────────────────────────────────────

const selSeen = new Map();   // key = "ctx\0sel" → [line, ...]

root.walkRules(rule => {
  const ctx = getCtx(rule);
  if (ctx === null) return;
  if (hasSplitOkComment(rule)) return;
  for (const sel of rule.selectors.map(norm)) {
    const key = `${ctx}\u0000${sel}`;
    if (!selSeen.has(key)) selSeen.set(key, []);
    selSeen.get(key).push(rule.source.start.line);
  }
});

const selDups = [...selSeen]
  .filter(([, lines]) => lines.length > 1)
  // กรองออกถ้าเป็น selector ที่ดูตั้งใจแยก (เช่น :root token block + dark theme) — ข้ามถ้า ctx ต่างกัน (ตรวจแยกอยู่แล้ว)
  .filter(([, lines]) => lines.length > 1);

// ── Report ────────────────────────────────────────────────────────────────────

let exitCode = 0;

if (propDups.length) {
  exitCode = 1;
  console.error(`✗ CHECK 1 — property ซ้ำ: พบ ${propDups.length} จุด\n`);
  propDups.slice(0, 40).forEach(([k, lines]) => {
    const [ctx, sel, prop] = k.split('\u0000');
    console.error(`  ${ctx ? ctx + ' → ' : ''}${sel}  { ${prop} }  บรรทัด ${lines.join(', ')}`);
  });
  if (propDups.length > 40) console.error(`  … และอีก ${propDups.length - 40} จุด`);
  console.error('  → แก้ที่กฎเดิมแทนการเขียนทับ\n');
} else {
  console.log('✓ CHECK 1 — ไม่มี property ซ้ำใน selector+context เดียวกัน');
}

if (selDups.length) {
  exitCode = 1;
  console.error(`\n✗ CHECK 2 — selector กระจาย: พบ ${selDups.length} selector ที่แตกเป็นหลาย block\n`);
  selDups.slice(0, 40).forEach(([k, lines]) => {
    const [ctx, sel] = k.split('\u0000');
    console.error(`  ${ctx ? ctx + ' → ' : ''}${sel}  บรรทัด ${lines.join(', ')}`);
  });
  if (selDups.length > 40) console.error(`  … และอีก ${selDups.length - 40} selector`);
  console.error('  → merge properties ให้อยู่ใน block เดียว');
  console.error('  → ถ้าตั้งใจแยก (เช่น progressive enhancement) เพิ่ม /* check-css: split-ok */ ก่อน rule นั้น\n');
} else {
  console.log('✓ CHECK 2 — ไม่มี selector กระจายหลาย block ใน context เดียวกัน');
}

process.exit(exitCode);
