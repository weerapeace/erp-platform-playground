# 🚚 Shippop — จองขนส่งหลายเจ้า + ใบปะหน้า + สถานะอัตโนมัติ (เว็บร้าน · ชุด 9)

สเปก API จากคู่มือทางการ (Postman "SHIPPOP API Documentation" · developers.shippop.com) — ดึงมา 2026-10-22

## ตอนนี้ = โหมดจำลอง
ยังไม่มี `SHIPPOP_API_KEY` → ทุกปุ่มทำงานด้วยเลข `SIM…` **ไม่เรียก Shippop จริง ไม่เสียเงิน** · ใบปะหน้ามีลายน้ำ "จำลอง · ห้ามใช้ส่งจริง" · มีปุ่ม 🧪 จำลองสถานะ (ขนส่งรับแล้ว/ส่งถึง) ไว้ลองลำดับ

## เปิดใช้จริง (เจ้าของทำเอง — ค่าเป็นความลับ ห้ามส่งในแชท)
1. ขอ API KEY จาก Shippop (ฟอร์ม https://www.shippop.com/business ติ๊ก "รับ API KEY" — ได้ key ทดสอบ (sandbox) ทางอีเมลก่อน)
2. Vercel โปรเจกต์ ERP › Settings › Environment Variables:
   - `SHIPPOP_API_KEY` = key ที่ได้
   - `SHIPPOP_EMAIL` = อีเมลบัญชี Shippop (ใช้ตอนจอง · COD ต้องเป็นอีเมลที่ยืนยันตัวตน/บัญชีธนาคารแล้ว)
   - `SHIPPOP_ENV` = `prod` เมื่อพร้อมใช้จริง (ไม่ตั้ง = sandbox `mkpservice.shippop.dev`)
   - `SHIPPOP_WEBHOOK_SECRET` = ตั้งรหัสสุ่มยาว ๆ เอง
3. แจ้ง Shippop ให้ตั้ง Webhook URL = `https://erp-platform-playground.vercel.app/api/public/shippop/webhook?k=<SHIPPOP_WEBHOOK_SECRET>`
4. ERP › เว็บไซต์ › ร้าน › 🏪 ข้อมูลร้าน › 🚚 Shippop: เปิด · ขนส่งประจำ · ขนาดกล่อง · น้ำหนักต่อชิ้น · **ที่อยู่ผู้ส่ง (ครบทุกช่อง)**

## ใช้งาน (แท็บ 🧾 ออเดอร์)
- **ทีละใบ**: เปิดออเดอร์ → กล่อง 🚚 Shippop → เลือกขนส่ง (+ น้ำหนักรวมถ้าไม่ใช่ค่าปกติ) → **ดูราคา** (ทุกเจ้า เรียงถูกสุด) → **จอง**
- **หลายใบ**: ติ๊กหลายออเดอร์ → แถบด้านล่าง "🚚 จอง Shippop" → เลือกขนส่ง → จอง (ข้ามใบที่จองแล้ว/ยกเลิก/ที่อยู่ไม่ครบ แล้วบอกชื่อ)
- จองแล้ว: ระบบ **ยืนยันกับขนส่งทันที** → ได้เลขพัสดุ เติมช่องเลขพัสดุให้ลูกค้าเห็นเอง · 🖨 ใบปะหน้า (สติกเกอร์ 4×6 จาก Shippop) · ยกเลิกได้ก่อนขนส่งเข้ารับ
- เก็บเงินปลายทาง (COD) ที่ยังไม่จ่าย = ส่ง `cod_amount` เท่ายอดออเดอร์ให้ขนส่งเก็บ
- **สถานะอัตโนมัติ** (webhook): ขนส่งรับพัสดุ (`shipping`) → ออเดอร์ "จัดส่งแล้ว" · ส่งถึง (`complete`) → "สำเร็จ" (+ วันได้รับของ ใช้นับวันขอคืน/เปลี่ยน) · เดินหน้าอย่างเดียว ไม่แตะออเดอร์ที่ยกเลิก · ปัญหา/ตีกลับ = จดในประวัติ ให้ร้านดูเอง

## ความปลอดภัย
Shippop ไม่เซ็นข้อความ webhook → กัน 2 ชั้น: รหัสลับใน URL (เทียบแบบ timing-safe) + **ถามสถานะซ้ำจาก Shippop เอง** (`/tracking/`) แล้วใช้ค่านั้น · ไม่ตั้งรหัส = เส้นนี้ปิด (503)

## ไฟล์
`lib/shippop.ts` (ขนส่ง/รหัส · ตัวเรียก API · โหมดจำลอง) · `lib/shippop-db.ts` (ผู้ส่ง/ผู้รับ/น้ำหนัก/COD · applyShippopStatus) · `/api/website/orders/shippop` (quote/book/cancel/simulate · GET ใบปะหน้า) · `/api/public/shippop/webhook` · `components/website-shippop-box.tsx` · `app/print/shippop-labels` · migration `202610292200_store_orders_shippop` (`store_orders.shippop` jsonb)
ยังไม่มี: เรียกขนส่งเข้ารับ (`/calltopickup/`) · แก้น้ำหนักหลังจอง (`/update/` เฉพาะ Flash) · รายงานค่าส่งรวมรายเดือน
