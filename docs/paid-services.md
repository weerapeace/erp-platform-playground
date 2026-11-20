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

## โควตาต่อคนต่อเดือน (2026-11-15 · หน่วยครั้ง/บาท 2026-11-16)

- เก็บใน budget `count_quota` = { "<service key>": { unit: "count"|"thb", per_user_default, per_user: { <user_id>: ค่า | null } } } (ui_config เดิม · ไม่มีตารางใหม่ · ไม่มี unit = ครั้ง)
- นับเฉพาะครั้งที่ AI ตอบสำเร็จ (มีค่าใช้จ่าย) ของคนที่กด เดือนนี้ (เวลาไทย) · หน่วยบาท = รวมค่าใช้จ่ายของคนนั้นในฟีเจอร์นั้น · ครบ = ฟีเจอร์นั้นหยุดสำหรับคนนั้น (BudgetExceededError) จนวันที่ 1 — ไม่ขึ้นกับ over_action · ข้อความไม่บอกตัวเงิน
- ตั้งได้ทุกฟีเจอร์ GPT ที่หน้า /admin/paid-services ส่วน "จำกัดการใช้ต่อคนต่อเดือน" (ค่าเริ่มของทุกคน + ตั้งเฉพาะคน · ไม่จำกัด / ใช้ค่าเริ่ม · สลับ "จำนวนครั้ง / บาท" — สลับแล้วระบบแปลงค่าเดิมตามราคาต่อครั้ง)
- API: PATCH `{ count_quota: { key, limit } }` · `{ count_quota: { key, user_id, limit } }` (limit "default" = กลับไปใช้ค่าเริ่ม · null/"unlimited" = ไม่จำกัด) · `{ count_quota: { key, unit } }` เปลี่ยนหน่วย · GET คืน count_usage (ครั้ง) + count_usage_thb (บาท) + count_users
- **พนักงานเห็นเป็น "ใช้ได้อีก N ครั้ง" เสมอ** (เจ้าของสั่ง 2026-11-16 "ไม่ต้องเห็นว่าใช้เท่าไหร่"): `usageAllowance(key, { request }, ราคาต่อครั้ง)` ใน lib/paid-services-server → { used, limit, remaining } เป็นครั้ง
  รวมทุกขีดจำกัดแล้วเอาตัวที่น้อยสุด: โควตาฟีเจอร์ (ครั้ง หรือ บาท÷ราคาต่อครั้ง) · งบรายคน / รายฟีเจอร์ / รวม (เฉพาะแบบ "หยุด") — รุ่นและราคาต่อครั้งส่งให้หน้าจอเฉพาะคนที่มีสิทธิ์ admin.paid_services
- ใช้ครั้งแรกกับ `ai.desc_highlights` (AI ดูรูปเสนอจุดเด่นสินค้า · ป๊อปแทรก Description)

## ราคาต่อครั้งของแต่ละรุ่น (2026-11-16)

- ตัวเลือกโมเดลในศูนย์ AI โชว์ "~฿x/ครั้ง" ทุกรุ่น + ใต้ช่อง "กดครั้งละ ~฿x (เฉลี่ยจากใช้จริง N ครั้ง / ประมาณการ)"
- คิดจาก `callCostThb(model, จำนวนคำต่อครั้ง)` (lib/paid-services · รุ่นที่ต้องคิดนานบวกคำตอบ +600)
- จำนวนคำต่อครั้ง = เฉลี่ยจาก paid_service_usage ที่สำเร็จ 90 วัน (`avgCallTokens` / `callTokensFor` แคช 10 นาที) → ยังไม่เคยใช้ = `costProfile` ในทะเบียน → ค่ากลาง `DEFAULT_CALL_TOKENS` (3,000 / 400)
- ฟีเจอร์ใหม่ที่ใช้รูปเยอะ/ข้อความยาว ควรใส่ `costProfile` ในทะเบียนให้ราคาก่อนใช้จริงใกล้ความจริง

## ใครใช้ได้ รายฟีเจอร์ (2026-11-16)

- ui_config `paid_services_access` = { "<service key>": { mode: "custom", roles: [key ของ erp_roles], users: [user id] } } · ไม่มีรายการ = ทุกคนที่มีสิทธิ์ใช้ฟีเจอร์นั้นอยู่แล้ว (ค่าเริ่ม — ขึ้นเว็บแล้วไม่มีใครเสียสิทธิ์)
- บังคับที่ด่านกลาง `guardedGpt` (aiChat / aiWebSearch) → `AccessDeniedError` · `aiAvailable` คืน false (ฟีเจอร์ที่มีทางฟรีจะใช้ทางฟรีแทน เช่น แปลภาษา) (code "access_denied" · API ควรตอบ 403) · ผู้ดูแลระบบ (บทบาท admin) ใช้ได้เสมอ · งานอัตโนมัติ (ไม่มีคนกด) ไม่ถูกกั้น
- บทบาทของคน = user_profiles.role + user_roles (แคช 60 วิ) · ค่าตั้งแคช 30 วิ
- หน้าจอซ่อนปุ่ม: `serviceAccess(key, { request })`
- **ด่านเข้าฟีเจอร์ `featureAccess(key, ctx, basePerm)`** (เจ้าของเจอ 2026-11-16: ใส่ชื่อพนักงานแล้วยังไม่เห็นปุ่ม เพราะไม่มีสิทธิ์ ai.caption) — ตั้ง "เฉพาะที่เลือก" = รายชื่อตัดสิน ไม่ต้องมีสิทธิ์พื้นฐาน · "ทุกคน" = ต้องมี basePerm เหมือนเดิม · ใช้ที่ /api/ai/desc-highlights (+ ?check=1 ให้ป๊อปแทรกโชว์/ซ่อนแท็บ AI) และ /api/ai/desc-memory · ฟีเจอร์ใหม่ที่อยากให้ศูนย์ AI เป็นตัวตัดสินใครใช้ได้ → ใช้ตัวนี้แทน apiCan อย่างเดียว
- ตั้งที่ /admin/paid-services ปุ่ม "ใครใช้ได้" ในแถวฟีเจอร์ GPT (ทุกคนที่มีสิทธิ์ / เฉพาะบทบาท + รายคน) · PATCH `{ access: { key, mode, roles, users } }` · audit entity paid_service_access

## ผู้ให้บริการที่เลือกได้ (2026-11-06)
- ทะเบียน `providerChoices` (ตัวแรก = ค่าเริ่ม) · ค่าที่เลือก `paid_service_settings.provider`
- อ่านรูป (สลิป / ใบเสร็จ): `readImageText(key, …)` — GPT (ค่าเริ่ม) หรือ Cloudflare · ตัวที่เลือกยังไม่ตั้งรหัส = ลองอีกตัวให้เอง
  (Cloudflare บน Vercel ต้องมี env `CF_ACCOUNT_ID` + `CF_AI_API_TOKEN` — ยังไม่ได้ตั้ง)
- อีเมล: อัตโนมัติ / Resend / Gmail

## AI เขียนแคปชั่นแบบเลือกได้ (2026-11-20)

- ป๊อปใน drawer โพสต์ = `app/tasks/content/ai-caption-studio.tsx` · API `/api/ai/caption-options` (key `ai.caption` · place `options`)
- พนักงานเห็นแค่ "ใช้ได้อีก N ครั้ง" (usageAllowance) · ผู้ดูแล (admin.paid_services) เห็นราคาต่อรุ่น + เลือกรุ่นเองได้ครั้งนั้น → `aiChat(..., { forceModel })` (ชนะค่าที่ตั้งในศูนย์ · route ต้องเช็กสิทธิ์ + รุ่นอยู่ใน AI_MODEL_CHOICES)
- ความจำ AI แคปชั่น = `/api/ai/desc-memory?kind=caption` (ui_config `caption_ai_memory`) · แผงของกลาง `components/ai-memory`
- คำสั่งประจำ = `/api/ai/caption-presets` (ui_config `caption_prompt_presets` · lib/caption-presets)
