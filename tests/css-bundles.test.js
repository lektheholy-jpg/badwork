// ทดสอบการแยก CSS (css/style.css → style.min.css + docs.min.css) และตัวโหลดสไตล์แบบ lazy (loadStyle/loadModule ใน js/utils.js)
// วิธีรัน: node tests/css-bundles.test.js   (หรือ npm run test:cssb)
// ตรวจ: กฎครบทั้งสองก้อน ไม่หาย/ไม่ซ้ำ · กฎของหน้าหลักไม่หลุดเข้า bundle · class ของ bundle ถูกใช้เฉพาะในไฟล์ที่โหลดพร้อม doc-shell
//        · ไฟล์ .min ตรงกับต้นทาง · sw.js precache · ตัวโหลดรอสไตล์ + ไม่แทรกสคริปต์ซ้ำเมื่อสไตล์พลาด
const fs=require('fs'),vm=require('vm'),path=require('path');
const {JSDOM}=require('jsdom');const postcss=require('postcss');
const ROOT=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const {split,verify}=require(path.join(ROOT,'tools/split-css.js'));
let fail=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗',m);if(!c)fail++};
const norm=s=>s.replace(/\s+/g,' ').trim();
const ruleKeys=css=>{const a=[];postcss.parse(css).walkRules(r=>{let ctx=[],p=r.parent;while(p&&p.type!=='root'){ctx.unshift(p.name+' '+norm(p.params||''));p=p.parent}a.push(ctx.join('|')+'»'+norm(r.selector)+'{'+norm(r.nodes.map(n=>n.toString()).join(';'))+'}')});return a.sort()};

(async()=>{
 const SRC=read('css/style.css');
 const v=verify(SRC);
 ok(v.problems.length===0,'tools/split-css.js ตรวจผ่าน'+(v.problems.length?' — '+v.problems[0]:''));
 ok(Object.keys(v.bundles).join()==='docs','มี bundle เดียวชื่อ docs');

 // ---- กฎครบ ไม่หาย ไม่ซ้ำ (เทียบทีละกฎ รวม media/supports) ----
 const all=ruleKeys(SRC),parts=[...ruleKeys(v.core),...ruleKeys(v.bundles.docs)].sort();
 ok(all.length===parts.length&&all.every((k,i)=>k===parts[i]),`core + docs = style.css ทุกกฎ (${all.length} กฎ)`);
 ok(ruleKeys(v.bundles.docs).length>=100,'bundle docs มีกฎจริง (ไม่ว่าง)');

 // ---- กฎของหน้าหลักต้องอยู่ใน core ----
 const coreSel=ruleKeys(v.core).join('\n'),docSel=ruleKeys(v.bundles.docs).join('\n');
 ok(/»\.to-top\{/.test(coreSel)&&!/»\.to-top\b/.test(docSel),'.to-top (ปุ่มย้อนขึ้นบน) อยู่ใน core ไม่ใช่ docs');
 ok(/»\.card\{/.test(coreSel)&&/»\.btn\b/.test(coreSel),'.card · .btn อยู่ใน core');
 ok(/»\.doc-ai-/.test(docSel)&&!/»\.doc-ai-/.test(coreSel),'.doc-ai-* อยู่ใน docs ไม่หลุดมา core');

 // ---- class เฉพาะของ docs ต้องถูกใช้เฉพาะในไฟล์ที่โหลดพร้อม doc-shell ----
 const U=read('js/utils.js');
 const lazyMods=eval('('+U.match(/const LAZY_MODULES = (\{[\s\S]*?\n\});/)[1]+')');
 const bundles=eval('('+U.match(/const LAZY_BUNDLES = (\{[\s\S]*?\n\});/)[1]+')');
 const withShell=new Set();Object.values(bundles).forEach(b=>{if(b.includes('doc-shell'))b.forEach(n=>withShell.add(n))});
 const html=read('index.html');
 const eager=[...html.matchAll(/<script[^>]*\ssrc="(js\/[^"]+)"/g)].map(m=>m[1]).concat(['js/timetable.js']);
 const coreText=[html,...new Set(eager)].map(f=>f.endsWith('.html')||f.includes('<')?f:read(f)).join('\n');
 const own=new Set();postcss.parse(v.bundles.docs).walkRules(r=>r.selectors.forEach(s=>[...s.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].forEach(m=>{if(!coreText.includes(m[1]))own.add(m[1])})));
 const strays=[];
 for(const [name,file] of Object.entries(lazyMods)){ if(withShell.has(name))continue; const t=read(file); for(const tk of own){ if(new RegExp('(^|[^\\w-])'+tk.replace(/[-]/g,'\\-')+'($|[^\\w-])').test(t))strays.push(name+':'+tk)} }
 ok(own.size>=60,`class เฉพาะของ docs ${own.size} ตัว`);
 ok(strays.length===0,'ไม่มีโมดูล lazy นอกกลุ่มระบบเอกสารใช้ class ของ docs'+(strays.length?' — '+strays.slice(0,5).join(', '):''));
 ok(['pa','idp','tra','car'].every(k=>bundles[k].includes('doc-shell')),'ทุกระบบเอกสารโหลดผ่าน doc-shell (จึงได้ docs.min.css)');

 // ---- ไฟล์ .min ตรงกับต้นทาง / precache ----
 const csso=require('child_process');
 const tmp=fs.mkdtempSync(path.join(require('os').tmpdir(),'cssb-'));
 csso.execFileSync('node',[path.join(ROOT,'tools/split-css.js'),tmp],{stdio:'pipe'});
 const mini=f=>{const o=f+'.min';csso.execFileSync(path.join(ROOT,'node_modules/.bin/csso'),[f,'--no-restructure','-o',o]);return fs.readFileSync(o,'utf8')};
 ok(mini(path.join(tmp,'core.css'))===read('css/style.min.css'),'css/style.min.css ตรงกับต้นทาง (รัน ./build-css.sh ถ้าไม่ตรง)');
 ok(mini(path.join(tmp,'docs.css'))===read('css/docs.min.css'),'css/docs.min.css ตรงกับต้นทาง');
 ok(read('sw.js').includes("'css/docs.min.css'")&&read('sw.js').includes("'css/style.min.css'"),'sw.js PRECACHE มีทั้งสองไฟล์ CSS');
 ok(!html.includes('docs.min.css'),'index.html ไม่โหลด docs.min.css ตอนเปิดแอป');

 // ---- ตัวโหลดสไตล์ (jsdom) ----
 const dom=new JSDOM('<!doctype html><head></head><body></body>',{url:'http://localhost/'});const w=dom.window,d=w.document;
 const code=U.slice(U.indexOf('const LAZY_MODULES'),U.indexOf('// URL รูปโปรไฟล์'));
 const ctx={document:d,Promise,Error,console};vm.createContext(ctx);vm.runInContext(code,ctx);
 const links=()=>[...d.head.querySelectorAll('link[rel=stylesheet]')],scripts=()=>[...d.head.querySelectorAll('script')];
 let done=false;const p=vm.runInContext(`loadModule('doc-shell')`,ctx).then(()=>{done=true});
 await new Promise(r=>setTimeout(r,10));
 ok(scripts().length===1&&links().length===1&&links()[0].getAttribute('href')==='css/docs.min.css','loadModule(doc-shell) แทรกทั้ง <script> และ <link docs.min.css>');
 scripts()[0].onload();await new Promise(r=>setTimeout(r,10));
 ok(!done,'สคริปต์เสร็จแล้วแต่สไตล์ยังไม่เสร็จ → ยังไม่ resolve (ไม่วาดหน้าไร้สไตล์)');
 links()[0].onload();await p;ok(done,'สไตล์เสร็จ → resolve');
 await vm.runInContext(`loadModule('doc-shell')`,ctx);
 ok(scripts().length===1&&links().length===1,'เรียกซ้ำไม่แทรกซ้ำ');
 const noStyle=vm.runInContext(`loadModule('tools')`,ctx);scripts()[scripts().length-1].onload();await noStyle;
 ok(links().length===1,'โมดูลที่ไม่ผูกสไตล์ (tools) ไม่โหลด docs.min.css');
 // สไตล์พลาด: ลองใหม่เฉพาะสไตล์ ห้ามแทรก doc-system ซ้ำ
 vm.runInContext(`_stylePromises.docs=undefined;delete _stylePromises.docs;delete _modulePromises['doc-shell']`,ctx);
 const d2=new JSDOM('<!doctype html><head></head><body></body>',{url:'http://localhost/'}).window.document;
 const ctx2={document:d2,Promise,Error,console};vm.createContext(ctx2);vm.runInContext(code,ctx2);
 const q=vm.runInContext(`loadModule('doc-shell')`,ctx2);const s1=d2.head.querySelector('script');const l1=d2.head.querySelector('link');
 s1.onload();l1.onerror();let err=null;try{await q}catch(e){err=e}
 ok(!!err,'สไตล์โหลดพลาด → reject พร้อมข้อความให้ลองใหม่');
 const q2=vm.runInContext(`loadModule('doc-shell')`,ctx2);
 ok(d2.head.querySelectorAll('script').length===1&&d2.head.querySelectorAll('link').length===1,'ลองใหม่: แทรก <link> ใหม่เท่านั้น ไม่แทรก <script> ซ้ำ (กันประกาศ const ซ้ำ)');
 d2.head.querySelector('link').onload();await q2;ok(true,'ลองใหม่แล้วสำเร็จ');

 console.log(fail?'FAIL '+fail:'ALL PASS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
