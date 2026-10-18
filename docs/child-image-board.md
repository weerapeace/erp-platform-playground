# 🖼 โหมดรูปภาพของตารางลูก (ChildImageBoard)

## ใช้ทำอะไร
ตารางลูกที่มีฟิลด์รูป (เช่น **SKU ลูกในหน้า Parent SKU**) มีปุ่มสลับ **📋 ตาราง / 🖼 รูปภาพ** ที่หัวตาราง (จำต่อผู้ใช้ — `useViewPref relmulti_view:<module>`)
- การ์ดต่อแถว: รหัส + สี + **รูปแกลเลอรีทั้งหมด** · กดรูป = ดูใหญ่ · กดรหัส = เปิดหน้า SKU (ตั้งรูปหลัก/ลบ/เรียง)
- **ลากรูปลงการ์ด** = เพิ่มเข้าแกลเลอรีตัวนั้นทันที (สินค้า: สิทธิ์ products.edit ไม่ต้องกด "แก้ไข") · สูงสุด 9 รูป/ตัว
- **โยนหลายรูปที่ช่องบน** → จับคู่ตามชื่อไฟล์ (`lib/filename-code-match`: MGN194-02_1.jpg → MGN194-02 · ไม่สนตัวพิมพ์ · MGN194-010 ไม่เข้า MGN194-01) → ป๊อปตรวจ/เปลี่ยน/ข้าม → ยืนยันค่อยอัป

## ไฟล์
- `components/relation-multi/image-board.tsx` — `ChildImageBoard` + `uploadImagesToRecord` (ตัวอัปกลาง ใช้ร่วมกับลากวางแบบแถว)
- `GET /api/attachments?entity_type=&entity_ids=a,b,c` — รูปหลายระเบียนทีเดียว (products.view)
- อัปผ่าน `/api/attachments` เดิม (R2 + ทะเบียนรูป · ย่อ 1500px · ตั้งรูปปกถ้ายังว่าง)

## ต่อกับระบบอื่น
- แก้จากในงาน Creative โหมดใหม่ → รูปที่เพิ่มขึ้นใน "สิ่งที่แก้ในงานนี้" อัตโนมัติ ([task-product-direct-mode](task-product-direct-mode.md))
- ลบรูปภายหลัง → เก็บเป็นเวอร์ชัน ย้อนได้ ([record-versions](record-versions.md))
