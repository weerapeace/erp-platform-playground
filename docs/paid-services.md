# ศูนย์ AI และ API ที่เสียเงิน (ของกลาง)

หน้า **⚙️ Settings → AI / API ที่เสียเงิน** (`/admin/paid-services`) — สิทธิ์ `admin.paid_services`

## ใช้ทำอะไร
- ดูว่าระบบใช้ AI / บริการเสียเงินตรงไหนบ้าง (GPT, Cloudflare AI, EasySlip, LINE, อีเมล, Shippop)
- เปิด-ปิดรายฟีเจอร์ · เปลี่ยนโมเดล GPT รายฟีเจอร์ · ดูยอดใช้/เงินประมาณเดือนนี้
- ทุกการเปลี่ยนเขียน `audit_logs` (entity `paid_service_settings`)

## ส่วนประกอบ
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/paid-services.ts` | **ทะเบียนกลาง** (pure) — ทุกจุดที่ใช้บริการเสียเงิน: key · ชื่อ · ใช้ที่หน้าไหน · ถ้าปิดเกิดอะไร · ไฟล์ที่เรียก |
| `lib/paid-services-server.ts` | **ด่านกลาง** — `aiChat(key, …)` (GPT) · `aiWebSearch(key, …)` (GPT ค้นเว็บก่อนตอบ) · `getAiFor(key)` (Cloudflare AI) · `serviceOn(key)` + `logServiceUse(key, …)` (บริการอื่น) |
| `lib/ai-caption-models.ts` | โมเดล GPT ที่เลือกได้ + ราคา (ใช้ร่วมหน้ารายละเอียดสินค้า) |
| ตาราง `paid_service_settings` | ค่าที่แอดมินเปลี่ยน (ไม่มีแถว = เปิด · โมเดลเดิม) — แคช 30 วิ |
| ตาราง `paid_service_usage` | บันทึกการใช้ทุกครั้ง (โมเดล · token · เงินประมาณ · สำเร็จไหม) |
| `lib/__tests__/paid-services-guard.test.ts` | **กันลืม** — ไล่ตรวจโค้ดทั้งระบบ |

## เพิ่มฟีเจอร์ใหม่ที่ใช้ AI / บริการเสียเงิน (บังคับ)
1. เพิ่มแถวใน `PAID_SERVICES` (`lib/paid-services.ts`) — key ไม่ซ้ำ · `files` = ไฟล์ที่เรียกจริง
2. เรียกผ่านด่านกลางด้วย key นั้น
   - GPT: `await aiChat("ai.xxx", system, content, maxTokens, model?)` (ห้ามยิง OpenAI ตรง)
   - GPT ค้นเว็บ: `const { text, citations } = await aiWebSearch("ai.xxx", system, prompt, maxTokens, model?, ctx)` — ข้อมูลสด (ราคา/แพ็กเกจ) · คืนข้อความ (แกะ JSON เอง) + ลิงก์อ้างอิง · ค่าใช้จ่าย = คำ + `WEB_SEARCH_CALL_THB` ต่อครั้ง · ตัวอย่าง `lib/subscription-catalog-server.ts`
   - Cloudflare AI: `const ai = await getAiFor("cf.xxx")` (null = ปิด/ยังไม่ตั้งค่า)
   - อื่น ๆ: `if (!(await serviceOn("xxx"))) …` แล้ว `await logServiceUse("xxx", { ok })`
3. รันเทสต์ `paid-services-guard` — เรียกตรง / key ไม่ลงทะเบียน / ไฟล์ในทะเบียนไม่ตรง = ไม่ผ่าน

## ถ้าปิดแล้วเกิดอะไร
- GPT ส่วนใหญ่: ปุ่มขึ้นข้อความ "ผู้ดูแลปิดฟีเจอร์นี้ไว้" (ServiceOffError) — กรอกเองได้ตามปกติ
- แปลภาษา: ยังแปลได้ — สลับไปตัวแปลฟรี (Cloudflare → Google)
- Cloudflare AI (อ่านสลิป/ใบเสร็จ): เหมือนยังไม่ตั้งค่า (กรอกเอง)
- EasySlip: เหมือนไม่ได้ตั้ง (พนักงานตรวจสลิปเอง)
- LINE: หยุด push ทุกระบบ (reply ในแชทไม่ผ่านด่านนี้) · อีเมล: หยุดส่ง (`service-off`)
- Shippop: **ล็อก ปิดไม่ได้** (ลูกค้าเว็บร้านต้องสร้างเลขพัสดุได้)

## ลำดับโมเดล GPT
ที่แอดมินเลือกในศูนย์ → ที่ฟีเจอร์ส่งมา (เช่น ค่าในหน้ารายละเอียดสินค้า `ui_config.ai_product_model` / env `OPENAI_*_MODEL`) → `gpt-4o-mini`

**รุ่น 5.x (2026-11-14 · gpt-5.4-mini / gpt-5.4)** — "คิดก่อนตอบ" เรียก API คนละแบบ: `chatLimitParams` / `responsesLimitParams` ใน `lib/ai-caption-models.ts`
ส่ง `max_completion_tokens` (= เพดาน + 4,000 เผื่อเวลาคิด) + `reasoning_effort: low` แทน `max_tokens` (5.x ไม่รับ) · token เวลาคิดรวมอยู่ใน token ออก → ค่าใช้จ่ายประมาณถูก
เพิ่มรุ่นใหม่ = เพิ่มแถวใน `AI_MODEL_CHOICES` ที่เดียว (ศูนย์ AI + ป๊อป AI รายละเอียดสินค้าอ่านจากรายการนี้) · เทสต์ `lib/__tests__/ai-caption-models.test.ts`

## ข้อจำกัด (เฟส 1)
- เงินเป็นค่าประมาณจาก token × ราคาในรายการ · เริ่มนับวันที่เปิดใช้ศูนย์ (2026-11-06)
- ยังไม่บันทึกว่า "ใคร" เป็นคนกด (user_id ว่าง) — เฟสถัดไป
- เฟส 2: งบต่อเดือน + แจ้งเตือนใกล้เต็ม + เกินงบสลับตัวฟรี/หยุดอัตโนมัติ

## เฟส 2–3 (2026-11-06)
- **งบรวมต่อเดือน** + **งบรายฟีเจอร์** (ui_config `paid_services_budget` · `per_service`) — นับเฉพาะ GPT · แจ้งเตือนที่ % เดียวกัน · ครบงบ = หยุด (เฉพาะฟีเจอร์นั้น / ทุก GPT ถ้าเป็นงบรวม) หรือแจ้งเตือนอย่างเดียว
- **แจ้งเตือน** `erp_notify` `ai_budget.warn` / `ai_budget.over` → ผู้มีสิทธิ์ admin.paid_services · ครั้งเดียวต่อเดือนต่อระดับ (ui_config `paid_services_budget_alerts`)
- **รายที่ (places)** — `places` ในทะเบียน · ค่าตั้ง/ยอด key `"<service>@<place>"` · เปิด-ปิด + เลือกโมเดลรายที่ (ที่ → บริการ → ฟีเจอร์ → ค่าเริ่ม) · ทุกจุดเรียกแปลภาษาต้องส่ง `place` (เทสต์บังคับ)
- **ใครใช้** — ส่ง `{ request }` (หรือ `{ userId }`) เป็นพารามิเตอร์สุดท้ายของ `aiChat` / `getAiFor` · ไม่มีคน = "ระบบ / อัตโนมัติ"
- **กราฟย้อนหลัง** — `GET /api/admin/paid-services?view=history&mode=day|month&key=` · ของกลาง `components/bar-chart` (SimpleBarChart)

## ผู้ให้บริการที่เลือกได้ (2026-11-06)
- ทะเบียน `providerChoices` (ตัวแรก = ค่าเริ่ม) · ค่าที่เลือก `paid_service_settings.provider`
- อ่านรูป (สลิป / ใบเสร็จ): `readImageText(key, …)` — GPT (ค่าเริ่ม) หรือ Cloudflare · ตัวที่เลือกยังไม่ตั้งรหัส = ลองอีกตัวให้เอง
  (Cloudflare บน Vercel ต้องมี env `CF_ACCOUNT_ID` + `CF_AI_API_TOKEN` — ยังไม่ได้ตั้ง)
- อีเมล: อัตโนมัติ / Resend / Gmail
