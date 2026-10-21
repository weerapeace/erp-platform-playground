# ตัวตรวจโค้ดอัตโนมัติ (ESLint)

ติดตั้งแล้ว (2026-10-21, audit แอปจัดการงานข้อ Y3): `eslint@8` + `eslint-config-next@15` ใน devDependencies · กฎอยู่ที่ `.eslintrc.json`
(ก่อนหน้านี้มีแค่ไฟล์กฎแต่ไม่ได้ติดตั้งตัวตรวจ → กฎ "ห้ามทำตาราง `<table>` เองในหน้า admin" ไม่เคยทำงาน)

## วิธีรัน
```
npm run lint                         # ทั้งโปรเจกต์ (next lint)
npx next lint --dir app/tasks        # เฉพาะโฟลเดอร์
```

## กติกา
- **build ไม่ล้มเพราะ lint** — `next.config.ts` ตั้ง `eslint.ignoreDuringBuilds: true` ไว้ (มีคำเตือนเก่าค้างทั้งระบบ) → ให้รันเองก่อน push
- งานใหม่ในโฟลเดอร์ที่แก้: **error ต้องเป็น 0** · warning ค่อย ๆ ลด
- แอปจัดการงาน (`app/tasks`, `components/design-dashboard`) ณ วันติดตั้ง: error 0 · warning ~53 (ส่วนใหญ่ `<img>` และ dependency ของ hook)
- ลิงก์ภายในเว็บใช้ `<Link>` จาก `next/link` แทน `<a href="/...">` (เปลี่ยนหน้าไม่รีโหลดทั้งเว็บ · คลิกกลาง/Ctrl+คลิก เปิดแท็บใหม่ได้เหมือนเดิม)

## ข้อจำกัด
- `node_modules` ของ worktree ที่ใช้ junction ร่วมกัน อาจยังไม่มีแพ็กเกจ eslint จนกว่าจะ `npm install` ที่ต้นทาง — Vercel ติดตั้งให้เองตอน build
