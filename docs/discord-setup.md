# 💬 Discord — ส่งรายงาน + ปุ่มติ๊กเช็กลิสต์ในแชท

รายงานอัตโนมัติ (ระบบเดียวกับ "📧 ส่งอีเมลรายงาน") ส่งเข้าห้อง Discord ได้ด้วย:

1. **ข้อความภาพรวม** — (แท็กบทบาทตามที่ตั้ง) หัวเรื่อง + **รูปรายงาน 1 ใบ** (ตัวเลขสรุป + งานด่วนสุด N งาน มีรูปปก) + ลิงก์ดูทั้งหมด + บอกว่ามีของรอกี่ใบ
2. **การ์ด "ต้องติ๊ก"** — เฉพาะใบงานที่มีเช็กลิสต์ ⏳ รออะไรอยู่ ค้าง · 1 ใบงาน = 1 ข้อความ · แต่ละข้อเป็นปุ่ม ☐ กดแล้วระบบติ๊กให้จริง (บันทึกว่าใครติ๊ก + audit) ปุ่มกลายเป็น ✓ สีเขียว · กดซ้ำ = ยกเลิกติ๊ก · ปุ่ม "เปิดใบงาน"

ทั้งเจ้าของเซิร์ฟเวอร์ Discord ต้องตั้งบอทเอง (Claude ล็อกอิน/กรอกรหัสแทนไม่ได้) — คู่มือทีละขั้นอยู่ในหน้า **ตั้งค่า → ส่งอีเมลรายงาน → 💬 คู่มือตั้งบอท Discord** (`app/admin/email-reports/discord-setup-guide.tsx`)

## ค่าที่ต้องใส่ใน Vercel (Production)
| env | ได้จาก | ใช้ทำ |
|---|---|---|
| `DISCORD_APPLICATION_ID` | Developer Portal → General Information | ทุกอย่าง |
| `DISCORD_PUBLIC_KEY` | General Information | ตรวจลายเซ็นปุ่มที่กด (ไม่มี = การ์ดไม่มีปุ่มติ๊ก มีแค่ปุ่มเปิดใบงาน) |
| `DISCORD_BOT_TOKEN` 🔒 | แท็บ Bot → Reset Token | ส่งข้อความ/รูป/การ์ด · อ่านรายชื่อห้อง/บทบาท |
| `DISCORD_CLIENT_SECRET` 🔒 | แท็บ OAuth2 → Reset Secret | ผูกบัญชี + เซ็น state |

ตั้งใน Developer Portal ด้วย:
- **OAuth2 → Redirects**: `https://erp-platform-playground.vercel.app/api/account/discord-link/callback`
- **General Information → Interactions Endpoint URL**: `https://erp-platform-playground.vercel.app/api/discord/interactions` (บันทึกได้หลัง deploy ที่มี env ครบ — Discord ทดลองยิง PING + ลายเซ็นปลอม)
- เชิญบอท: ลิงก์ในคู่มือ (`discordInviteUrl()` — scope bot · สิทธิ์ View Channel / Send Messages / Embed Links / Attach Files / Mention roles)

## โครง
| ส่วน | ไฟล์ |
|---|---|
| ของกลาง Discord (ส่งข้อความ+ไฟล์ · DM · ห้อง/บทบาท · ตรวจลายเซ็น Ed25519 · OAuth + state) | `lib/discord.ts` |
| การ์ดเช็กลิสต์ + ปุ่ม (ใช้ทั้งตอนโพสต์และตอนกด) | `lib/discord-checklist.ts` |
| ส่งรายงานเข้า Discord | `lib/email-report/discord.ts` (เรียกจาก `runEmailReport` ใน `send.ts`) |
| รูปรายงาน PNG | `lib/email-report/image.ts` |
| รับปุ่มที่กด | `app/api/discord/interactions/route.ts` |
| ผูกบัญชี | `app/account/discord/page.tsx` + `app/api/account/discord-link/{route,start,callback}` · เมนูบัญชี "💬 ผูกบัญชี Discord" |
| ตัวเลือกในหน้าตั้งค่า | `app/api/admin/email-reports/discord` (ห้อง/บทบาท/สถานะ) · กล่อง "💬 ส่งเข้า Discord ด้วย" ใน report-editor |
| DB | migration `202610300600_discord_reports.sql`: `erp_discord_links` · `email_reports.discord` (jsonb) · `erp_can_user(user, perm)` |

## ตั้งค่าต่อรายงาน (`email_reports.discord` · `normalizeReportDiscord`)
`enabled` · `channel_id`/`channel_name` · `role_id`/`role_name` · `mention` (`overdue` แท็กเฉพาะวันที่มีงานเกินกำหนด · `always` · `never`) · `image_rows` (5–25 · ค่าเริ่ม 10) · `max_cards` (0–15 · ค่าเริ่ม 10)
- เปิดส่งอัตโนมัติได้ถ้ามีผู้รับอีเมล **หรือ** เปิด Discord (ส่ง Discord อย่างเดียวได้)
- **✉️ ทดสอบ** = อีเมลถึงคนกด + **DM ใน Discord ของคนกด** (ต้องผูกบัญชี · ไม่รบกวนห้องทีม) · **📤 ส่งเดี๋ยวนี้ / ตามเวลา** = ห้องที่เลือก
- ประวัติการส่ง: แถวเดียวรวมทุกช่องทาง · ผล Discord อยู่ใน `email_report_runs.detail.discord` · error ขึ้นต้น "Discord: …"

## ปุ่มติ๊ก (Interactions)
- Discord POST มาที่ `/api/discord/interactions` พร้อมลายเซ็น → ไม่ผ่าน = 401 · PING = ตอบ type 1
- กดปุ่ม `rt:<task id>` → ตอบ **type 6 ทันที** (Discord ให้เวลา 3 วิ) แล้วทำงานต่อใน `after()`:
  1. หา `erp_discord_links` จาก Discord user → ไม่เจอ = ข้อความเห็นคนเดียว + ปุ่มไป `/account/discord`
  2. สิทธิ์ `products.edit` ผ่าน `erp_can_user` (ตรรกะเดียวกับ `erp_can` — แก้ที่หนึ่งต้องแก้อีกที่ · เรียกได้เฉพาะ service_role)
  3. สลับ open ⇄ resolved (`resolved_by` = ชื่อผู้ใช้ ERP) + audit `record_task` (actorName "ชื่อ (Discord)", via discord)
  4. แก้ข้อความเดิมให้เป็นสถานะล่าสุดของทุกข้อในใบนั้น (`checklistCardUpdate` — เอาเฉพาะช่องที่เราตั้งจากการ์ดเดิม)

## รูปรายงาน
- วาดด้วย **sharp** (มีอยู่แล้ว) — ข้อความผ่าน Pango/HarfBuzz สระ/วรรณยุกต์ไทยซ้อนถูก · **ห้ามใช้ `next/og` / satori กับภาษาไทย** (ทดสอบแล้ว: วรรณยุกต์บนสระ/ใต้สระหาย "ที่" → "ที", "ปุ่น" → "ปุน")
- ฟอนต์ Sarabun 400/600 โหลดจาก Google Fonts ครั้งแรกแล้วเก็บ `/tmp/erp-fonts` · ไม่ใช้อีโมจิ/อักขระพิเศษในรูป (เซิร์ฟเวอร์อาจไม่มีฟอนต์) — จุดสีวาดเป็นรูปทรง
- เลือกงาน = **ด่วนสุดข้ามกลุ่ม** (แดง → ส้ม → อื่น ๆ) ไม่ใช่โควตาตามกลุ่มแบบอีเมล (กลุ่มแรกจะกินที่หมด งานเกินกำหนดกลุ่มหลังหลุด) · ชื่อกลุ่มเป็นจุดสี + ข้อความในบรรทัดรอง
- วาดไม่ได้ → ส่งตัวเลขสรุปเป็นการ์ดแทน (ข้อความยังไป) · ข้อมูลจริง 2026-10-23: ~0.6–1 วิ · ~130KB

## ข้อจำกัด
- ติ๊กในระบบ (ไม่ใช่ใน Discord) → การ์ดเมื่อเช้ายังโชว์ของเดิมจนรายงานรอบถัดไป
- การ์ดสูงสุด 15 ใบ/รอบ · ปุ่มติ๊กสูงสุด 20 ข้อ/ใบ (Discord จำกัด 5 แถว)
- ภาพบน Discord ย่อให้พอดีจอ — กดที่รูปเพื่อดูขนาดเต็ม
- ยังไม่ได้ทดสอบกับ Discord จริง (ต้องมีบอทก่อน) — ทดสอบแล้ว: ลายเซ็นจริง/ปลอม, PING, กดปุ่มของคนที่ยังไม่ผูก (ตอบทันที), รูปจากข้อมูลจริง, การ์ด/การ์ดหลังติ๊ก
