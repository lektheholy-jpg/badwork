// ทดสอบแคช "วาดทันทีแล้วรีเฟรชเงียบๆ" ของหน้ารายวิชาของฉัน (renderCoursesList) และหัวหน้าวิชา (renderCourseShell) ด้วย jsdom + Firestore ปลอม
// ใช้ dashboard.js (แคชกลาง) และ courses.js จริง — เฉพาะส่วนวาด/เครือข่ายเป็นตัวปลอม · วิธีรัน: npm run test:cache
const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const R=f=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const ok=(c,m,x)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ ')+m+(!c&&x!==undefined?' '+JSON.stringify(x):''))};

function env(){
  const dom=new JSDOM('<!doctype html><div id="view"></div><div id="modal-root"></div>',{url:'https://x.test/',runScripts:'outside-only'});
  const w=dom.window;
  // fake Firestore: server data mutable, count reads
  const server={courses:[{id:'c1',name:'คณิต',createdAt:2,archived:false},{id:'c2',name:'ไทย',createdAt:1,archived:false}],sections:{c1:[{id:'s1',room:'1',order:1}],c2:[]}};
  const reads={list:0,doc:0,sec:0};
  w.__server=server;w.__reads=reads;w.__delay=0;
  const snap=arr=>({docs:arr.map(x=>({id:x.id,data:()=>{const {id,...r}=x;return {...r}}}))});
  const docSnap=c=>c?{exists:true,id:c.id,data:()=>{const {id,...r}=c;return {...r}}}:{exists:false};
  const courseDoc=cid=>({
    get:async()=>{reads.doc++;await sleep(w.__delay);return docSnap(server.courses.find(x=>x.id===cid))},
    collection:()=>({orderBy:()=>({get:async()=>{reads.sec++;await sleep(w.__delay);return snap(server.sections[cid]||[])}})}),
  });
  const coursesCol={
    orderBy:()=>({get:async()=>{reads.list++;await sleep(w.__delay);return snap([...server.courses].sort((a,b)=>b.createdAt-a.createdAt))}}),
    doc:courseDoc,
  };
  w.db={collection:()=>({doc:()=>({collection:()=>coursesCol})})};
  w.AppState={user:{uid:'u1'},currentRoute:'courses',currentCourseId:null,currentSectionId:null,currentTab:'overview'};
  w.eval(`
    var NavHistory={patch(){},backTo(){return false},applyScroll(){window.__applied=(window.__applied||0)+1},layer(){return{active:true,release(){}}}};
    function showLoading(){window.__loading=(window.__loading||0)+1}
    function pageHeaderHtml(t){return '<h1>'+t+'</h1>'}
    function icon(){return ''}
    function groupsByLevelHtml(list,o){return list.map(o.rowFn).join('')}
    function courseColor(){return '#000'} function getLevelColor(){return {strong:'#000'}}
    function escapeHtml(s){return String(s)}
    function courseHeaderHtml(o){return '<header>'+o.title+'<a id="back-to-courses"></a></header>'}
    function initNavPill(){} function pillSlideNext(){} function playViewEnter(){}
    function navigate(r){window.__nav=r}
    function openCourse(){}
    async function renderStudentsTab(){} async function renderStructureTab(){} async function renderScoresTab(){}
    function markViewPending(){}
  `);
  w.eval(R('dashboard.js').replace(/^const /gm,'var ')); // dashboard.js: ใช้เฉพาะส่วนแคช
  w.eval(R('courses.js').replace(/^const /gm,'var '));
  w.eval("renderCourseOverview=async function(b,c,s){b.innerHTML='ov:'+c.name+':'+s.length}");
  w.scrollTo=()=>{};
  return w;
}
(async()=>{
  console.log('รายการวิชา (SWR)');
  { const w=env(); const v=w.document.getElementById('view');
    await w.renderCoursesList();
    ok(w.__reads.list===1 && v.innerHTML.includes('คณิต') && w.__loading===1,'ครั้งแรก: ไม่มีแคช → โหลดตัวโหลดแล้วอ่านเซิร์ฟเวอร์');
    w.__delay=200; w.__server.courses[0].name='คณิต(แก้)';
    const t0=Date.now(); await w.renderCoursesList(); const dt=Date.now()-t0;
    ok(dt<50 && v.innerHTML.includes('คณิต') && !v.innerHTML.includes('แก้') && w.__loading===1,'ครั้งที่สอง: วาดจากแคชทันที (ไม่รอเซิร์ฟเวอร์ ไม่ขึ้นตัวโหลด)',{dt});
    await sleep(350);
    ok(w.__reads.list===2 && v.innerHTML.includes('คณิต(แก้)'),'แล้วรีเฟรชเงียบๆ → วาดทับเมื่อข้อมูลเปลี่ยน');
    // ข้อมูลเหมือนเดิม → ไม่วาดทับ
    const before=v.innerHTML; let writes=0; const d=Object.getOwnPropertyDescriptor(w.Element.prototype,'innerHTML');
    Object.defineProperty(v,'innerHTML',{get(){return d.get.call(this)},set(x){writes++;d.set.call(this,x)},configurable:true});
    await w.renderCoursesList(); await sleep(350);
    ok(writes===1,'ข้อมูลไม่เปลี่ยน → วาดครั้งเดียว ไม่วาดทับซ้ำ',{writes});
    // ผู้ใช้ไปหน้าอื่นก่อนรีเฟรชเสร็จ → ไม่วาดทับหน้าอื่น
    w.__server.courses[1].name='X'; writes=0;
    await w.renderCoursesList(); w.AppState.currentRoute='dashboard'; v.innerHTML='dash'; writes=0;
    await sleep(350);
    ok(writes===0 && v.innerHTML==='dash','ไปหน้าอื่นระหว่างรอ → ไม่วาดทับ');
    // invalidate → ไม่มีแคช → โหลดปกติ
    w.AppState.currentRoute='courses'; w.invalidateCourseData(); w.__loading=0; w.__delay=0;
    await w.renderCoursesList();
    ok(w.__loading===1 && v.innerHTML.includes('X'),'หลังแก้ข้อมูล (invalidate) → โหลดใหม่ ไม่ใช้แคชเก่า');
  }
  console.log('หัววิชา (cc.shell)');
  { const w=env(); const v=w.document.getElementById('view'); w.AppState.currentRoute='course'; w.AppState.currentCourseId='c1';
    await w.renderCourseShell();
    ok(w.__reads.doc===1 && w.__reads.sec===1 && v.innerHTML.includes('ov:คณิต:1'),'ครั้งแรก: อ่าน 2 รอบ แล้ววาด');
    ok(w.__applied===1,'วาดเสร็จ → เรียก NavHistory.applyScroll');
    w.__delay=200; const t0=Date.now(); const p=w.renderCourseShell();
    await sleep(30);
    ok(v.innerHTML.includes('<header>') ,'ครั้งที่สอง: วาดหัวทันทีจากแคช (ไม่รอ Firestore)');
    await p; ok(Date.now()-t0<120,'และทั้งฟังก์ชันจบเร็ว',{ms:Date.now()-t0});
    ok(w.__reads.doc===1,'ภายใน 15 วิ ไม่ถามเซิร์ฟเวอร์ซ้ำ (สลับแท็บรัวๆ ไม่ยิงซ้ำ)');
    // แคชเก่า > 15 วิ + ข้อมูลเปลี่ยน → รีเฟรชเงียบๆ แล้ววาดทับ
    w.__delay=0; w.__server.sections.c1.push({id:'s2',room:'2',order:2});
    w.eval("getCourseDataCache().shell.get('c1').at -= 20000");
    await w.renderCourseShell(); await sleep(100);
    ok(w.__reads.doc===2 && v.innerHTML.includes('ov:คณิต:2'),'แคชเก่า+ข้อมูลเปลี่ยน → รีเฟรชเงียบๆ แล้ววาดทับ (2 ห้อง)', v.innerHTML);
    // ผู้ใช้กำลังพิมพ์ → ไม่วาดทับ แต่แคชอัปเดต
    w.__server.sections.c1.push({id:'s3',room:'3',order:3});
    w.eval("getCourseDataCache().shell.get('c1').at -= 20000");
    w.__delay=60; // ให้การถามเซิร์ฟเวอร์เงียบๆ ช้าพอที่จะใส่ช่องพิมพ์ทันก่อนผลมาถึง
    await w.renderCourseShell();
    const inp=w.document.createElement('input'); v.appendChild(inp); inp.focus();
    await sleep(250); w.__delay=0;
    ok(!v.innerHTML.includes('ov:คณิต:3') && w.eval("getCourseDataCache().shell.get('c1').sections.length")===3,'กำลังพิมพ์ → ไม่วาดทับ แต่แคชได้ของใหม่แล้ว');
    // invalidate(courseId) ล้างแคชหัววิชานั้น
    w.eval("invalidateCourseData('c1')");
    ok(w.eval("getCourseDataCache().shell.has('c1')")===false,'invalidateCourseData(courseId) ล้างแคชหัววิชา');
    // แก้ AppState.sections ไม่กระทบแคช
    w.document.activeElement.blur?.(); await w.renderCourseShell();
    w.AppState.sections.push({id:'zz'}); w.AppState.currentCourse.name='แก้ในแอป';
    ok(w.eval("getCourseDataCache().shell.get('c1').sections.length")===3 && w.eval("getCourseDataCache().shell.get('c1').course.name")==='คณิต','แก้ AppState ไม่ทำให้แคชเพี้ยน (เก็บสำเนา)');
    // วิชาถูกลบ → navigate('courses')
    w.__server.courses=w.__server.courses.filter(c=>c.id!=='c1'); w.eval("invalidateCourseData()");
    await w.renderCourseShell();
    ok(w.__nav==='courses','วิชาไม่มีอยู่แล้ว → กลับรายการวิชา เหมือนเดิม');
  }
  console.log(`\nผลรวม: ผ่าน ${pass}, ไม่ผ่าน ${fail}`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
