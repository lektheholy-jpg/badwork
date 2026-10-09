// ==========================================================================
// DocSystem — "บริบท" (context) ของระบบเอกสารหนึ่งระบบ (เช่น PA · ต่อไปคือ ID-Plan)
//   แทนตัวแปร global เดี่ยว (PAState · PARptState · PA_CONFIG.collections ที่เขียนตรงๆ) ด้วยออบเจ็กต์ที่สร้างจาก config:
//
//     sys.id          รหัสระบบ (= config.id)
//     sys.config      config ของระบบ (รูปเดียวกับ PA_CONFIG ใน js/pa-config.js)
//     sys.state       state ของหน้า + แท็บข้อตกลง (เดิมคือ PAState)
//     sys.rptState    state ของแท็บแบบฟอร์มรายงานผล (เดิมคือ PARptState)
//     sys.col(kind, uid)  อ้าง collection ใต้ users/{uid}/ จากชื่อใน config.collections[kind] — ไม่มีชื่อ collection เขียนตรงในโค้ด
//
//   ทุกระบบมี state เป็นของตัวเอง → สองระบบอยู่ในหน้าเดียวกันได้โดยไม่ชนกัน
//
// การใช้งานในโค้ด
//   • ระบบหนึ่งลงทะเบียนครั้งเดียวท้ายไฟล์ config ของตัวเอง: registerDocSystem(PA_CONFIG)
//   • จุดเข้าของหน้า (เช่น renderPAPage) เรียก docActivate('pa') เพื่อบอกว่าตอนนี้ระบบไหนกำลังแสดงอยู่
//   • ฟังก์ชันอื่นเรียก docSystem() (ไม่ใส่ id = ระบบที่กำลังแสดง) "ครั้งเดียวที่บรรทัดแรก" แล้วใช้ตัวแปร sys ต่อทั้งฟังก์ชัน
//       const sys = docSystem();
//     ห้ามเรียก docSystem() ซ้ำหลัง await — ฟังก์ชัน async ต้องถือ sys ตัวที่จับไว้ตอนเริ่ม ไม่งั้นถ้าผู้ใช้สลับไปอีกระบบกลางคัน
//     ผลที่ค้างอยู่จะไปเขียน state ของอีกระบบ (ดูเหตุผลเดียวกันนี้ที่ paStale ใน js/pa.js)
//   • โค้ดที่อยู่นอกกลุ่มไฟล์ของระบบ (เช่น app.js) อ้างด้วย id ตรงๆ: docSystem('pa')
//   • ระบบแรกที่ลงทะเบียนถูกตั้งเป็น "ระบบที่กำลังแสดง" ให้เองจนกว่าจะมี docActivate ระบบอื่น
//
// โหลดก่อนไฟล์ config ของทุกระบบเสมอ (LAZY_BUNDLES ใน js/utils.js) · เป็น <script> ธรรมดา จึงเป็นฟังก์ชัน global เหมือนไฟล์อื่น
// ==========================================================================

const DOC_SYSTEMS = {};
let _activeDocSystemId = null;

function createDocSystem(config) {
  if (!config || !config.id || !config.collections || !Array.isArray(config.tabs) || !config.tabs.length) {
    throw new Error('config ของระบบเอกสารไม่ครบ (ต้องมี id · collections · tabs)');
  }
  return {
    id: config.id,
    config,
    // state ของหน้า + แท็บข้อตกลง (ค่าเริ่มต้นตรงกับ PAState เดิมทุกตัว · แท็บเริ่มต้น = แท็บแรกใน config.tabs)
    state: {
      tab: config.tabs[0][0], // แท็บที่เปิดอยู่ (รหัสใน config.tabs)
      nextTab: null,    // ผู้เรียกจากนอกหน้า (เช่น navigate('pa-report-page')) ตั้งค่านี้ให้ renderPAPage เปิดแท็บนั้นเลย
      view: 'list',     // มุมมองในแท็บข้อตกลง: 'list' | 'form'
      docId: null,      // null = สร้างใหม่ | string = แก้ไขที่มีอยู่
      doc: null,        // ข้อมูลเอกสารที่กำลังแก้
      list: null,       // แคชรายการ
      previewId: null,  // เอกสารที่เลือกดู/พิมพ์ในแท็บตัวอย่าง
      seq: 0,           // เลขรอบการสลับแท็บ — เรนเดอร์ที่ค้างจากรอบก่อน (A→B→A เร็วๆ) เทียบเลขแล้วไม่วาดทับ
    },
    // state ของแท็บแบบฟอร์มรายงานผล (ค่าเริ่มต้นตรงกับ PARptState เดิม)
    rptState: {
      view: 'list',  // 'list' | 'form'
      docId: null,   // null = สร้างใหม่
      doc: null,
      list: null,
      previewId: null, // เอกสารที่เลือกดู/พิมพ์ในแท็บตัวอย่างรายงานผล
    },
    // collection ใต้ users/{uid}/ — kind คือคีย์ใน config.collections (เช่น 'agreements' · 'reports')
    col(kind, uid) {
      const name = config.collections[kind];
      if (!name) throw new Error(`ระบบ ${config.id} ไม่มี collection ชื่อ "${kind}" ใน config.collections`);
      return db.collection('users').doc(uid).collection(name);
    },
  };
}

function registerDocSystem(config) {
  if (DOC_SYSTEMS[config && config.id]) throw new Error(`ระบบเอกสาร "${config.id}" ลงทะเบียนซ้ำ`);
  const sys = createDocSystem(config);
  DOC_SYSTEMS[sys.id] = sys;
  if (_activeDocSystemId === null) _activeDocSystemId = sys.id;
  return sys;
}

// ไม่ใส่ id = ระบบที่กำลังแสดงอยู่
function docSystem(id) {
  const key = id === undefined ? _activeDocSystemId : id;
  const sys = DOC_SYSTEMS[key];
  if (!sys) throw new Error(key == null ? 'ยังไม่มีระบบเอกสารที่ลงทะเบียน' : `ไม่รู้จักระบบเอกสาร: ${key}`);
  return sys;
}

// ตั้งว่าตอนนี้ระบบไหนกำลังแสดง (เรียกที่จุดเข้าของหน้า) · คืน sys ตัวนั้น
function docActivate(id) {
  const sys = docSystem(id);
  _activeDocSystemId = sys.id;
  return sys;
}
