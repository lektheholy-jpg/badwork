# Teacher Score

ระบบบันทึกคะแนนส่วนตัวสำหรับครู

## Stack

- Vite
- Vanilla JavaScript
- Firebase Authentication (Google Sign-In)
- Cloud Firestore
- Lucide Icons
- CSS Responsive

## เริ่มใช้งาน

1. สร้าง Firebase Project
2. เปิด Authentication > Sign-in method > Google
3. สร้าง Firestore Database
4. เพิ่ม Web App ใน Firebase Project
5. คัดลอก `.env.example` เป็น `.env`
6. ใส่ Firebase Web Config ลงใน `.env`
7. ตรวจสอบ Authorized domains ใน Firebase Authentication
8. นำ `firestore.rules` ไปใช้กับ Firestore Rules
9. ติดตั้งและรัน

```bash
npm install
npm run dev
```

## โครงสร้างข้อมูลเบื้องต้น

```text
users/{uid}/courses/{courseId}
  code
  name
  level
  term
  year
  credits
  rooms[]
  assessments[]
  createdAt
  updatedAt
```

ใน Phase ถัดไป `assessments` ควรถูกแยกเป็น subcollection เพื่อรองรับ
งานจำนวนมากและการบันทึกคะแนนแยกตามห้อง/นักเรียน

หลักการสำคัญ:
- งาน (assessment) เป็นข้อมูลระดับรายวิชา
- คะแนนเป็นข้อมูลระดับห้อง + นักเรียน
- งานที่สร้างในรายวิชาจะแสดงเหมือนกันทุกห้อง
- ข้อมูลทุกอย่างอยู่ใต้ UID ของ Google Account
