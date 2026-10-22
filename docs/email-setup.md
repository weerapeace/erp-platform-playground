# ✉️ ตั้งระบบส่งอีเมล (ของกลาง `lib/email.ts`)

ใช้กับทุกฟีเจอร์ที่ส่งอีเมล: ส่งอีเมลรายงาน (`/admin/email-reports`) · ส่งสรุปงาน (ป๊อป 📋 สรุปงาน) · อีเมลแจ้งลูกค้าออเดอร์/สมาชิกเว็บร้าน
คู่มือฉบับเดียวกันโชว์ในหน้า **ตั้งค่า → ส่งอีเมลรายงาน**

## ทางหลัก: Gmail (เจ้าของเลือก 2026-10-22 — ไม่ต้องแก้ DNS)
1. ใช้ Gmail ที่จะส่ง (แนะนำสมัครใหม่ไว้ให้ระบบโดยเฉพาะ เช่น louismontini.erp@gmail.com) · ส่งได้ ~500 ฉบับ/วัน
2. myaccount.google.com → ความปลอดภัย → เปิด **การยืนยันแบบ 2 ขั้นตอน**
3. myaccount.google.com/apppasswords → ชื่อ `ERP` → คัดลอกรหัส 16 ตัว (⚠ ความลับ ใส่ใน Vercel เองเท่านั้น)
4. Vercel → erp-platform-playground → Settings → Environment Variables (Production):
   - `GMAIL_USER` = Gmail ข้อ 1
   - `GMAIL_APP_PASSWORD` = รหัส 16 ตัว (มีเว้นวรรคได้ ระบบตัดเอง)
5. Deployments → Redeploy · 6. หน้า ส่งอีเมลรายงาน ต้องขึ้นสีเขียว "ส่งผ่าน Gmail" → กด ✉️ ทดสอบ

## ทางเลือก: Resend + โดเมนบริษัท
ดู [resend-setup.md](resend-setup.md) · ตั้ง `RESEND_API_KEY` + `EMAIL_FROM` · ถ้าตั้งครบทั้ง 2 ทาง ระบบใช้ Resend ก่อน

## การทำงาน (สำหรับนักพัฒนา)
- `emailProvider()` = "resend" | "gmail" | null · `emailConfigured()` · `emailSenderAddress()` (โชว์ในหน้าตั้งค่า)
- `sendEmail({ to, subject, html, text, fromName?, replyTo? })` → Gmail ผ่าน nodemailer (smtp.gmail.com:465, ตัวส่งเดียวทั้งเซิร์ฟเวอร์) / Resend REST
- รหัสข้อผิดพลาด → `emailErrorText(code)` ภาษาคน: email-not-configured · auth-failed (รหัสแอปผิด/ถูกยกเลิก) · daily-limit · bad-recipient · send-failed
- dev: `EMAIL_DEV_ECHO=1` = ไม่ส่งจริง พิมพ์ลง console
- route ที่ส่งอีเมลต้องเป็น Node runtime (ห้าม edge) เพราะ nodemailer
