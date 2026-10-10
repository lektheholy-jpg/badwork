// ทดสอบบล็อกรายการส่วนที่ 1 ของ ID-Plan (ตัวสร้างกลาง docLBlockHtml/docLBind/docLRows ใน js/doc-shell.js) ด้วย jsdom
// วิธีรัน: node tests/idp-list.test.js   (หรือ npm run test:idp) — ตรวจ: บล็อกครบ · เพิ่ม/ลบแถว · ยอดรวมสด · เก็บค่ากลับ
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
for(const f of ['js/doc-system.js','js/doc-shell.js','js/idp-config.js','js/idp.js'])vm.runInContext(read(f),ctx,{filename:f});
const settle=()=>new Promise(r=>setTimeout(r,30));
let fail=0;const ok=(c,m)=>{console.log(c?'  ✓':'  ✗',m);if(!c)fail++};
(async()=>{
 vm.runInContext(`docActivate('idp'); const s=docSystem('idp'); s.state.tab='form'; s.state.view='form'; s.state.docId='p1'; s.state.doc=idpNormalize({semester:'1',year:'2569',subjects:[{name:'ค21101',hours:3},{name:'ค22101',hours:2.5}],activities:[{name:'ชุมนุม',hours:1}],education:['ป.ตรี'],specials:['หัวหน้างาน'],comps:{}}); idpRenderFormView();`,ctx);
 await settle();
 const d=w.document;
 const blocks=[...d.querySelectorAll('.doc-lblock')].map(b=>b.querySelector('.doc-lrows').dataset.list);
 ok(JSON.stringify(blocks)==='["education","subjects","activities","specials"]','4 บล็อก: '+blocks);
 ok(d.querySelectorAll('.doc-lblock .doc-l-del').length===5,'ปุ่มลบ 5 แถว (1+2+1+1)');
 ok(d.querySelectorAll('.btn-icon,.btn-text,.pa-lrow,.doc-lrow-del').length===0,'ไม่มีคลาสชุดเก่าเหลือ');
 ok(d.querySelector('.doc-lblock.no-hours .doc-l-hours')===null,'บล็อกวุฒิ/งานพิเศษไม่มีช่องชั่วโมง');
 ok(d.getElementById('idp-total-hours').textContent==='6.5','ยอดรวมเริ่มต้น 6.5 = '+d.getElementById('idp-total-hours').textContent);
 // add row
 d.querySelector('.doc-l-add[data-list="subjects"]').click();
 ok(d.querySelectorAll('.doc-lrows[data-list="subjects"] .doc-lrow').length===3,'เพิ่มรายวิชา → 3 แถว');
 const add=d.querySelector('.doc-l-add[data-list="education"]'); add.click();
 ok(d.querySelectorAll('.doc-lrows[data-list="education"] .doc-lrow').length===2 && !d.querySelector('.doc-lrows[data-list="education"] .doc-l-hours'),'เพิ่มวุฒิ → 2 แถว ไม่มีช่องชั่วโมง');
 // type hours -> total
 const hrs=d.querySelectorAll('.doc-lrows[data-list="subjects"] .doc-l-hours');
 hrs[2].value='4';hrs[2].dispatchEvent(new w.Event('input',{bubbles:true}));
 ok(d.getElementById('idp-total-hours').textContent==='10.5','พิมพ์ 4 ชม. → รวม 10.5 = '+d.getElementById('idp-total-hours').textContent);
 // delete first subject
 d.querySelector('.doc-lrows[data-list="subjects"] .doc-l-del').click();
 ok(d.getElementById('idp-total-hours').textContent==='7.5','ลบแถวแรก (3) → รวม 7.5 = '+d.getElementById('idp-total-hours').textContent);
 // collect
 vm.runInContext(`idpCollect()`,ctx);
 const doc=vm.runInContext(`JSON.stringify(docSystem('idp').state.doc)`,ctx);const o=JSON.parse(doc);
 ok(JSON.stringify(o.subjects)==='[{"name":"ค22101","hours":2.5},{"name":"","hours":4}]','เก็บรายวิชา: '+JSON.stringify(o.subjects));
 ok(JSON.stringify(o.activities)==='[{"name":"ชุมนุม","hours":1}]','เก็บกิจกรรม');
 ok(JSON.stringify(o.education)==='["ป.ตรี"]','เก็บวุฒิ (ตัดแถวว่าง)');
 ok(JSON.stringify(o.specials)==='["หัวหน้างาน"]','เก็บงานพิเศษ');
 console.log(fail?'FAIL '+fail:'ALL PASS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
