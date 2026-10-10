// ทดสอบระบบเอกสาร "แผนการอบรม" (js/tra-config.js · js/tra.js · js/tra-ai.js) ด้วย jsdom — สร้างโดย tools/new-doc-system.js
// วิธีรัน: node tests/tra.test.js   (หรือ npm run test:tra)
// ตรวจ: ลงทะเบียน/collection · normalize · โครงฟอร์ม (หัว/ท้าย/ปุ่ม) · เก็บค่ากลับ · ตัวต่อ AI (ปุ่ม/ช่อง/บริบท) ·
//        ลงทะเบียนไฟล์ใน utils.js / sw.js / app.js / index.html / firestore.rules ครบ
// เพิ่มเทสต์ของช่อง/ตัวอย่างพิมพ์ของเอกสารจริงต่อท้ายไฟล์นี้ (ดูรูปแบบจาก tests/idp-list.test.js · tests/idp-ai.test.js)
const fs=require('fs'),vm=require('vm'),path=require('path');const {JSDOM}=require('jsdom');
const ROOT=process.env.PA_ROOT?path.resolve(process.env.PA_ROOT):path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const dom=new JSDOM('<!doctype html><body><div id="view"></div></body>',{url:'http://localhost/'});const w=dom.window;
const PROFILE={prefix:'นาย',firstName:'ทดสอบ',lastName:'ตัวอย่าง',position:'ครู',school:'รร.'};
const q=()=>{const o={where:()=>o,orderBy:()=>o,limit:()=>o,get:async()=>({docs:[]})};return o};
const col=()=>({...q(),doc:id=>({id,get:async()=>({exists:false,data:()=>undefined}),set:async()=>{},update:async()=>{},delete:async()=>{}}),add:async()=>({id:'n'})});
const ctx={window:w,document:w.document,console,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{onLine:true},location:{hostname:'x'},
 db:{collection:()=>({doc:()=>({collection:col})})},AppState:{user:{uid:'u1'},teacherProfile:PROFILE},
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>'TS'}},app:()=>({options:{}})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 Promise,JSON,Date,Math,Object,Array,Set,Map,String,Number,Error,RegExp,URL,encodeURIComponent,
 escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 pageHeaderHtml:t=>`<h1>${t}</h1>`,initNavPill(){},clearLoading(){},loaderHtml:()=>'',_loadTimers:new Map(),showToast(){},showLoading(){},islandSave(){},islandUndo(){},
 openModal(){},closeModal(){},confirm:()=>true,requestAnimationFrame:f=>setTimeout(f,0),loadModule:async()=>{},loadModules:async()=>{},loadTeacherProfile:async()=>PROFILE,
 loadTimetable:async()=>({term:1}),ttTermLabel:()=>'ภาคเรียนที่ 1',ttStats:()=>({placed:[]}),navigate(){},getComputedStyle:w.getComputedStyle.bind(w),CSS:{escape:s=>s},Event:w.Event,HTMLElement:w.HTMLElement};
vm.createContext(ctx);
for(const f of ['js/doc-system.js','js/doc-shell.js','js/tra-config.js','js/tra.js','js/badwork-ai-config.js','js/badwork-ai.js','js/tra-ai.js'])vm.runInContext(read(f),ctx,{filename:f});
const settle=()=>new Promise(r=>setTimeout(r,30));
let fail=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗',m);if(!c)fail++};
const R=code=>vm.runInContext(code,ctx);
(async()=>{
 // ---- ลงทะเบียน / config ----
 ok(R(`docSystemIds().includes('tra')`),'ลงทะเบียน tra ใน doc-system แล้ว');
 ok(R(`docSystem('tra').config.collections.docs`)==='tra_docs','collection = tra_docs');
 ok(R(`docSystem('tra').config.aiCtx.idPrefix`)==='tra-ctx-'&&R(`docSystem('tra').config.ai.storageKeys.ctx`)==='tra-ai-ctx-v1','คีย์ AI (idPrefix · storageKeys) เป็นของระบบนี้');
 ok(R(`docSystem('tra').config.tabs[0][0]`)==='form'&&R(`docSystem('tra').state.tab`)==='form','แท็บแรก = form (แท็บเริ่มต้น)');

 // ---- normalize / blank ----
 const blank=JSON.parse(R(`JSON.stringify(traBlankDoc())`));
 ok(blank.status==='draft'&&blank.title===''&&blank.body===''&&blank.semester==='1','แผนเปล่า: ร่าง · ช่องว่าง · ภาคเรียน 1');
 ok(R(`traNormalize({body:'x'}).body`)==='x'&&R(`typeof traNormalize({aiCtx:'bad'}).aiCtx`)==='object','normalize คงค่าเดิม · aiCtx ผิดชนิดถูกแทนด้วยออบเจ็กต์');

 // ---- รายการ (ว่าง) ----
 R(`docActivate('tra'); const s=docSystem('tra'); s.state.tab='form'; s.state.view='list'; traRenderListView();`);
 await settle();
 const d=w.document;
 ok(d.body.innerHTML.includes('ยังไม่มี แผนการอบรม'),'รายการว่างขึ้นข้อความ "ยังไม่มี แผนการอบรม"');

 // ---- ฟอร์ม ----
 R(`const s2=docSystem('tra'); s2.state.view='form'; s2.state.docId='p1'; s2.state.doc=traBlankDoc(); traRenderFormView();`);
 await settle();
 const form=d.getElementById('tra-form'),foot=form&&form.querySelector('.pa-form-footer'),head=d.querySelector('.pa-form-head');
 ok(!!form&&!!foot&&foot===form.lastElementChild&&foot.querySelector('#tra-save-btn')&&foot.querySelector('#tra-cancel-btn'),'ปุ่มบันทึก + ยกเลิกอยู่ใน .pa-form-footer ท้ายฟอร์ม (โครงเดียวกับ PA/ID-Plan)');
 ok(foot.querySelector('#tra-save-btn').textContent.trim()==='บันทึก แผนการอบรม'&&foot.querySelector('#tra-save-btn').classList.contains('btn-primary'),'ปุ่มบันทึกเป็นปุ่มหลัก ข้อความล้วน');
 ok(!!head&&head.nextElementSibling===form&&head.querySelector('#tra-back-btn'),'ปุ่ม "← กลับ" อยู่ที่หัวหน้า (.pa-form-head) ก่อนฟอร์ม');
 ok(!!foot.querySelector('#tra-del-btn')&&foot.firstElementChild.id==='tra-del-btn','เอกสารที่บันทึกแล้ว: ปุ่มลบอยู่ซ้ายสุดของแถวปุ่มท้ายฟอร์ม');

 // ---- เก็บค่ากลับ ----
 d.getElementById('tra-title').value=' เรื่องทดสอบ ';d.getElementById('tra-body').value='1. ข้อแรก';d.getElementById('tra-year').value='2570';
 R(`traCollect()`);
 const got=JSON.parse(R(`JSON.stringify(docSystem('tra').state.doc)`));
 ok(got.title==='เรื่องทดสอบ'&&got.body==='1. ข้อแรก'&&got.year==='2570','Collect: ตัดช่องว่างหัวท้าย · เก็บ title/body/year');

 // ---- ตัวต่อ AI ----
 ok(!!d.querySelector('#tra-form > .doc-ai-top')&&!!d.querySelector('.doc-ai-top [data-doc-ai="all"]'),'การ์ดผู้ช่วย AI + ปุ่มบนสุดขึ้นที่หัวฟอร์ม');
 const specs=R(`traAiSpecs(docSystem('tra')).map(s=>s.el)`);
 ok(specs.length>0&&specs.every(i=>d.getElementById(i)),'ทุกช่องที่ให้ AI เขียน มี textarea id ตรงกับ specs: '+specs);
 ok(d.querySelectorAll('.doc-ai-row [data-doc-ai]').length===specs.length*2,'ปุ่ม AI 2 ปุ่ม (เขียน/ปรับสำนวน) ใต้ป้ายของทุกช่อง');
 ok(!!d.getElementById('tra-ctx-note')&&!d.querySelector('[id^="pa-ctx-"]')&&!d.querySelector('[id^="idp-ctx-"]'),'ช่องบริบท tra-ctx-* ขึ้น ไม่มีช่องของระบบอื่นปน');
 const rs=(act,f)=>R(`(()=>{const s=docSystem('tra');return docAi(s).resolve(s,${JSON.stringify(act)},{dataset:{field:${JSON.stringify(f||'')}}})})()`);
 d.getElementById('tra-body').value='';
 let r=rs('all');
 ok(r&&r.mode==='write'&&r.specs.length===specs.length,'ปุ่มบนสุด: ช่องว่างทุกช่องถูกส่งไปเขียน');
 r=rs('polish',specs[0].replace('tra-',''));
 ok(r&&r.toast&&!r.specs,'ปรับสำนวนช่องที่ว่าง → แจ้งว่ายังไม่มีข้อความ (ไม่เรียก AI)');
 d.getElementById('tra-body').value='ข้อความเดิม';
 r=rs('write',specs[0].replace('tra-',''));
 ok(r&&r.toast&&!r.specs,'เขียนช่องที่มีข้อความแล้ว → ไม่เขียนทับ');
 r=rs('polish',specs[0].replace('tra-',''));
 ok(r&&r.mode==='polish'&&r.specs.length===1,'ปรับสำนวนช่องที่มีข้อความ → ส่งช่องนั้นช่องเดียว');
 ok(rs('unknown')===null,'act ที่ไม่รู้จัก → null');
 const prompt=R(`(()=>{const s=docSystem('tra');return docAi(s).context(s,{},docAi(s).scope(s,traAiSpecs(s)))})()`);
 ok(prompt.includes('ภาคเรียนที่')&&prompt.includes('ตำแหน่ง'),'บริบทที่ส่ง AI มีภาคเรียน/ตำแหน่ง');

 // ---- ลงทะเบียนไฟล์ครบทุกจุด (กันลืมแล้วหน้าเปิดไม่ได้/ออฟไลน์พัง) ----
 const U=read('js/utils.js'),SW=read('sw.js'),APP=read('js/app.js'),HTML=read('index.html'),RULES=read('firestore.rules');
 ok(['tra-config','tra-ai'].every(k=>new RegExp(`['"]?${k}['"]?:\\s*'js/${k}.js'`).test(U))&&/tra:\s*'js\/tra.js'/.test(U),'utils.js: LAZY_MODULES มีไฟล์ของระบบครบ 3 ไฟล์');
 ok(/tra:\s*\['doc-system',\s*'doc-shell',\s*'tra-config',\s*'tra',\s*'badwork-ai-config',\s*'badwork-ai',\s*'tra-ai'\]/.test(U),'utils.js: LAZY_BUNDLES.tra เรียงลำดับ doc-system → doc-shell → config → UI → AI');
 ok(/docConfigs:\s*\[[^\]]*'tra-config'/.test(U),'utils.js: docConfigs มี tra-config (ส่งออก/ลบข้อมูลของระบบนี้ได้)');
 ok(['js/tra-config.js','js/tra.js','js/tra-ai.js'].every(f=>SW.includes(`'${f}'`)),'sw.js PRECACHE มีไฟล์ของระบบครบ');
 ok(APP.includes("'tra-page': LAZY_BUNDLES.tra")&&/return renderDocPage\('tra'\)/.test(APP)&&/\[[^\]]*'tra-page'[^\]]*\]\.forEach\(addTile\)/.test(APP),'app.js: ROUTE_MODULES · renderRoute (return) · ไทล์เมนู "เพิ่มเติม" บนมือถือ');
 ok(HTML.includes('data-route="tra-page"'),'index.html: มีปุ่มเมนู tra-page');
 ok(/match \/tra_docs\/\{docId\}/.test(RULES),'firestore.rules: มี collection tra_docs');

 console.log(fail?'FAIL '+fail:'ALL PASS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
