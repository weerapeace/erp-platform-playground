# 📧 ส่งอีเมลรายงาน (Email Reports) — ของกลาง

ระบบส่ง "อีเมลสรุป" อัตโนมัติตามวัน/เวลา เช่น ตารางใบงานออกแบบที่ค้าง (มีรูป) ทุกจันทร์–เสาร์ 08:00 น.
เจ้าของตั้งเองได้ที่ **ตั้งค่า → ส่งอีเมลรายงาน** (`/admin/email-reports`) ไม่ต้องแก้โค้ด

## สถานะ
- **รอบ 1 (เสร็จ):** ตาราง + หน้าจัดการ (เพิ่ม/แก้/ลบ/เปิด-ปิด) + ดูตัวอย่างอีเมลจากข้อมูลจริง
- **รอบ 2 (เสร็จ):** ส่งผ่าน Gmail ได้ (ดู [email-setup.md](email-setup.md)) · ปุ่ม ✉️ ทดสอบ (ถึงอีเมลคนกด) · 📤 ส่งเดี๋ยวนี้ · ส่งตามเวลา (pg_cron)
- **รอบ 3:** ปรับตามการใช้งานจริง

## ส่งตามเวลา (รอบ 2)
- pg_cron job `email-reports-every-15min` (`*/15 * * * *`) → pg_net POST `/api/cron/email-reports` พร้อม header `x-cron-token`
- โทเคนเก็บเข้ารหัสใน **Supabase Vault** ชื่อ `email_reports_cron` · route ตรวจผ่าน RPC `erp_cron_token_ok` (service_role เท่านั้น) — ไม่ต้องตั้งค่าใน Vercel
- ถึงเวลา = วันตรง + ตั้งแต่เวลาที่ตั้ง ถึง +2 ชม. + วันนี้ยังไม่ส่ง (`isDue` ใน `lib/email-report/send.ts`)
- กันส่งซ้ำ: "จอง" `last_sent_on = วันนี้` ก่อนส่ง (update ... where last_sent_on < today) · ส่งไม่สำเร็จ = ไม่ลองซ้ำวันนั้น (ดูในประวัติ)
- ผู้รับที่เป็นผู้ใช้ = อีเมลล่าสุดจาก `user_profiles` ตอนส่ง · ปิดบัญชี/ไม่มีอีเมล = ข้าม + จดใน `detail.skipped`
- แอดมินเปิด `/api/cron/email-reports` เอง (login) = ดูว่ารายงานไหนถึงเวลา ไม่ส่งจริง (dry run)
- ปิดตัวตั้งเวลา: `select cron.unschedule('email-reports-every-15min');` · หน้าตั้งค่าบอกสถานะผ่าน RPC `erp_email_reports_cron_active`

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่
- ใช้: สรุปรายวัน/รายสัปดาห์ให้คนกลุ่มหนึ่ง (ฉบับเดียวกันทุกคน)
- ไม่ใช้: แจ้งเตือนทันทีตามเหตุการณ์ (ใช้ Notification Rules / LINE ของกลาง `lib/board-notify`) · อีเมลถึงลูกค้าเรื่องออเดอร์ (`lib/order-notify`)

## โครง
| ส่วน | ไฟล์ |
|---|---|
| ชนิดข้อมูล · ชื่อวัน · ตรวจค่า (ใช้ทั้งหน้าจอ+API) | `lib/email-report/shared.ts` |
| แหล่งข้อมูล (ดึงข้อมูลจริง → BuiltReport) | `lib/email-report/sources.ts` |
| แม่แบบอีเมล (ตาราง + รูป, inline style, กว้าง 600px) | `lib/email-report/render.ts` |
| ส่งอีเมล (Resend REST) | `lib/email.ts` (มีอยู่แล้ว) |
| API | `app/api/admin/email-reports/` (GET/POST, `[id]` PATCH/DELETE, `preview` POST) |
| หน้าจัดการ | `app/admin/email-reports/` (page + report-editor + resend-guide) |
| ตาราง | `email_reports`, `email_report_runs` (migration `202610270300_email_reports.sql`) |
| ลิงก์เต็ม (อีเมลต้องใช้ https://) | `lib/app-url.ts` |
| รูปปกใบงาน (ใช้ร่วมกับ /api/design-sheets) | `lib/design-sheet-covers.ts` |

## เพิ่มรายงานแบบใหม่
1. เพิ่มชื่อใน `EMAIL_REPORT_SOURCES` (`shared.ts`)
2. เขียนฟังก์ชันใน `sources.ts` คืน `BuiltReport` (sections → rows: รูป/ชื่อ/บรรทัดรอง/ป้าย/ลิงก์) แล้วใส่ใน `SOURCES`
3. หน้าตาอีเมล + หน้าจัดการ + ดูตัวอย่าง ใช้ได้ทันที (ถ้าแหล่งใหม่มีตัวกรองเฉพาะ ค่อยเพิ่มช่องใน report-editor)

## แหล่งข้อมูลแรก: ใบงานออกแบบที่ค้าง (`design_sheets_pending`)
- ค้าง = สถานะที่ไม่ใช่ "ปิดงาน" ใน Workflow กลาง (`is_terminal`) — เปลี่ยนสถานะที่ /admin/workflows หรือปุ่ม "จัดการสถานะ" แล้วรายงานเปลี่ยนตาม
- กรองได้: กลุ่มแบรนด์ (ทุกแบรนด์ / งานลูกค้า / แบรนด์เรา — กฎกลาง `isOwnBrandJob`) · เฉพาะแบรนด์ · เฉพาะสถานะ
- เรียง: เกินกำหนด → ใกล้กำหนด (≤3 วัน) → ไม่ขยับนานสุด (`updated_at`) — เพราะใบงานส่วนใหญ่ไม่มีกำหนดส่ง
- รูป: รูปปกจากระบบแนบไฟล์ ผ่าน `/api/r2-image?w=160` (เปิดได้โดยไม่ต้อง login)
- ลิงก์ "เปิดใบงาน" → `/master/design-dashboard?open=<id>`

## สิทธิ์ / ประวัติ
- สิทธิ์: `admin.email_reports` (แอดมินได้อัตโนมัติ · ตำแหน่งอื่นติ๊กที่ Roles & Permissions)
- audit: `email_report` create / update (ค่าก่อน-หลัง) / delete
- ลบ = เก็บประวัติ (`is_active=false`) ประวัติการส่งยังอยู่
- ตาราง 2 ตัวเปิด RLS ไม่มี policy → อ่าน/เขียนผ่าน API (supabaseAdmin + guardApi) เท่านั้น

## ข้อจำกัด
- Outlook บางเครื่องถามก่อนโหลดรูป (Gmail โชว์ทันที)
- ส่ง "ฉบับรวม" เท่านั้น (ใบงานออกแบบไม่มีช่องผู้รับผิดชอบ จึงแยกรายคนไม่ได้)
- ผู้รับที่เป็นผู้ใช้ในระบบแต่ไม่มีอีเมล จะถูกข้าม (หน้าจอขึ้นป้ายเตือน)
- ต้องตั้ง Resend ก่อนส่งจริง — คู่มือ: [docs/resend-setup.md](resend-setup.md)
