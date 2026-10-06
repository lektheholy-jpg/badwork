#!/usr/bin/env node
// ตรวจกฎ "แก้ที่ต้นทาง": ใน context เดียวกัน (เช่น @media เดียวกัน) selector เดียวกัน
// ต้องไม่ประกาศ property เดียวกันซ้ำในหลายกฎ — ถ้าซ้ำ แปลว่ามีคนเขียนกฎมาทับแทนการแก้ของเดิม
// ใช้: node tools/check-css.js css/style.css   (exit 1 ถ้าพบ)
const fs = require('fs');
const postcss = require('postcss');

const file = process.argv[2] || 'css/style.css';
const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
const norm = s => s.replace(/\s+/g, ' ').trim();
const seen = new Map();

root.walkRules(rule => {
  const ctx = [];
  let p = rule.parent, skip = false;
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') {
      if (/keyframes|font-face/.test(p.name)) skip = true;
      ctx.unshift(`@${p.name} ${norm(p.params)}`);
    }
    p = p.parent;
  }
  if (skip) return;
  const props = new Set();                 // ซ้ำภายในกฎเดียว (เช่น fallback) ไม่นับ
  rule.each(d => {
    if (d.type !== 'decl') return;
    const prop = d.prop.toLowerCase();
    if (props.has(prop)) return;
    props.add(prop);
    for (const sel of rule.selectors.map(norm)) {
      const key = `${ctx.join(' | ')}\u0000${sel}\u0000${prop}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(rule.source.start.line);
    }
  });
});

const dups = [...seen].filter(([, lines]) => lines.length > 1);
if (dups.length) {
  console.error(`✗ ${file}: พบ ${dups.length} จุดที่ประกาศ property ซ้ำใน selector+context เดียวกัน\n`);
  dups.slice(0, 40).forEach(([k, lines]) => {
    const [ctx, sel, prop] = k.split('\u0000');
    console.error(`  ${ctx ? ctx + ' → ' : ''}${sel}  { ${prop} }  บรรทัด ${lines.join(', ')}`);
  });
  if (dups.length > 40) console.error(`  … และอีก ${dups.length - 40} จุด`);
  console.error('\nแก้ที่กฎเดิมแทนการเขียนทับ แล้วรันใหม่');
  process.exit(1);
}
console.log(`✓ ${file}: ไม่มี property ซ้ำใน selector+context เดียวกัน`);
