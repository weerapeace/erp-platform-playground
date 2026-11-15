# ห้องแชทรวม (Unified Chat Inbox) — `/chat`

เจ้าของอนุมัติเริ่มเฟส 0+1 (2026-11-15) · เป้าหมาย: ตอบแชทลูกค้าทุกช่องทางจากที่เดียวใน ERP แทน BigSeller

> ⚠️ ระหว่างที่ยังใช้ BigSeller อยู่ — **ให้พนักงานตอบแชทจากที่เดียว** (ร้านไหนย้ายมา ERP แล้ว ให้เลิกตอบร้านนั้นใน BigSeller)
> ไม่งั้นลูกค้าได้คำตอบซ้ำ/ขัดกัน และสถานะ "ตอบแล้ว/ยังไม่ตอบ" สองระบบไม่ตรงกัน

## เฟส

| เฟส | อะไร | สถานะ |
|---|---|---|
| 0 | ตรวจคู่มือ API แชทของทุกแพลตฟอร์ม + หา LINE OA ของร้าน + เช็กลิสต์ให้เจ้าของ | เอกสารนี้ |
| 1 | หน้าแชท 3 ช่อง + LINE (รับ/ตอบ/แจ้งเตือน) | รอเจ้าของอนุมัติรายการไฟล์ |
| 2 | Lazada · TikTok · Shopee ทีละร้าน (เมื่อได้สิทธิ์) | ยังไม่เริ่ม |
| 3 | แผงข้าง: ออเดอร์ · สต็อก · การ์ดสินค้า · ข้อความสำเร็จรูป · มอบหมาย (ครบชุด) | ยังไม่เริ่ม |
| 4 | Facebook / Instagram (รอ Meta App Review) + AI ร่างคำตอบ | ยังไม่เริ่ม |

---

## เฟส 0 — ผลตรวจ

### 0.1 LINE ที่ต่อกับ ERP อยู่ตอนนี้ (ตรวจ 2026-11-15 จาก DB + Vercel env — ดูแค่ชื่อค่า ไม่เปิดรหัสลับ)

- **บอท LINE ใน ERP มีตัวเดียว** = "บอทหลัก" ใน `china_app_settings.line_config` (ไม่มีบอทเสริมใน `bots`)
  - ใช้ส่ง/รับในกลุ่มพนักงาน 8 กลุ่ม: test · bills · creative · transfers · design_idea · design_intake · purchase_capture · purchase_request
  - เป็นบอทภายใน **ไม่ใช่ OA ร้านที่ลูกค้าทักมา**
  - ⚠️ บอทหลักยังไม่ได้ตั้ง Channel secret (ทั้งใน DB และ env `LINE_CHANNEL_SECRET`) → ตัวรับ webhook ไม่ได้ตรวจลายเซ็นของบอทหลัก
    (ระบบกลุ่มเดิมกันของปลอมด้วยการถามกลับไปที่ LINE แทน) — **แชทลูกค้าจะบังคับต้องมี Channel secret เสมอ**
- **LINE OA ของร้านเว็บ** (`LINE_OA_TOKEN_<SLUG>` ใน `lib/webshop-line.ts`) — **ยังไม่ได้ตั้งเลยสักร้าน** (Vercel production ไม่มี env ชื่อ `LINE_OA_TOKEN_*`)
  - `store_settings.line_notify_enabled` = 0 (IG International, Pixiedustie) · Louis Montini ไม่มีค่า
- ร้าน LINE SHOPPING ที่บันทึกใน `platform_accounts` (code `line_shopping`):
  - Louis Montini → `https://shop.line.me/@louismontini`
  - IG International → `https://shop.line.me/@iginternational`
  - → น่าจะเป็น OA `@louismontini` และ `@iginternational` (ต้องให้เจ้าของยืนยัน)
- สรุป: **OA ร้านที่รับแชท LINE SHOPPING ยังไม่ได้ต่อเข้า ERP** → เจ้าของต้องบอกว่าแบรนด์ไหนใช้ OA ไหน แล้วเพิ่มเป็น "บอทเสริม" ในศูนย์ LINE (ใส่ token + Channel secret เอง)
- **Webhook ของ OA ร้านตอนนี้ชี้ไปไหน — ยังตรวจไม่ได้** (ต้องมีโทเคนของ OA นั้นก่อน) → หลังเพิ่มบอทแล้ว หน้าตั้งค่าแชทจะมีปุ่ม "ดู webhook ตอนนี้" (อ่านอย่างเดียว ไม่เปลี่ยนอะไร)

### 0.2 คู่มือ API แชทของแต่ละแพลตฟอร์ม

ตรวจจากคู่มือทางการ 2026-11-15 · [ยังยืนยันไม่ได้] = หน้าคู่มือต้องล็อกอิน/ไม่ได้เขียนไว้

| | LINE | Lazada | Shopee | TikTok Shop | Facebook / IG |
|---|---|---|---|---|---|
| ชื่อ API | Messaging API | IM (Instant Messaging) | `v2.sellerchat.*` | Customer Service API | Messenger Platform / Instagram Messaging |
| ต้องมีอะไร | Channel access token + Channel secret ของ OA | แอปหมวด **"In-house IM Chat"** (ผู้ขายทำเอง) — คนละหมวดกับแอปสินค้า/ออเดอร์ · ยื่นใน App Console รีวิว ~1 วัน | แอปชนิด **Seller In-house System** เท่านั้น (ชนิด ERP System = "ทุก API ยกเว้น Chat") | scope `seller.customer_service` (จำกัด ต้องขออนุมัติ) — ผู้ขายทำเองมีข้อยกเว้น · **ต้องส่งภาพหน้าจอ + คลิป 30–90 วิ ของหน้าแชทที่ทำเสร็จแล้ว** และต้องต่อออเดอร์/คืนสินค้าไว้แล้ว | `pages_messaging` (+`pages_manage_metadata`) · IG `instagram_business_manage_messages` · ต้อง App Review |
| รับข้อความ | webhook (LINE ส่งมาเอง · อาจส่งซ้ำ) | push LPM "IM Send Message" (ต้องตอบ 200 ใน 0.5 วิ · URL ต้องใช้ใบรับรอง **OV/EV** — Vercel เป็น DV ⚠️) หรือดึงเอง `/im/session/list` | push code 10 `webchat_push` (ตอบใน 2 วิ · อาจซ้ำ) — ชนิด ERP System สมัครไม่ได้ | webhook `NEW_MESSAGE` / `NEW_CONVERSATION` | webhook field `messages` |
| ส่ง | reply (ฟรี) / push (นับโควตา) | `/im/message/send` ข้อความ · รูป · วิดีโอ 3–180 วิ · การ์ดสินค้า · การ์ดออเดอร์ · คูปอง | ข้อความ · รูป · การ์ดสินค้า [ยังยืนยันไม่ได้ — หน้าคู่มือต้องล็อกอิน] | ข้อความ · รูป · **วิดีโอได้** · การ์ดสินค้า/ออเดอร์/คืนสินค้า/คูปอง/ขนส่ง | ข้อความ · รูป · วิดีโอ |
| ช่วงเวลาตอบ | โทเคนตอบฟรี **ใช้ได้ 1 นาที** ครั้งเดียว · หลังจากนั้นส่งได้แต่เป็น push นับโควตา (คนที่ไม่ใช่เพื่อน push ได้ 7 วัน) | ไม่ได้เขียนไว้ | ไม่ได้เขียนไว้ | ร้านมี 7 วันก่อนปิดเอง · เริ่มแชทเองได้เฉพาะลูกค้าที่ทักใน 30 วัน / สั่งซื้อใน 60 วัน | **24 ชม.** (แท็ก HUMAN_AGENT = 7 วัน ต้องขอสิทธิ์) · แท็ก POST_PURCHASE_UPDATE ฯลฯ ใช้ไม่ได้แล้วตั้งแต่ 27 เม.ย. 2026 |
| ความยาวข้อความ | 5,000 ตัวอักษร | ไม่ได้เขียนไว้ | ไม่ได้เขียนไว้ | **2,000** ตัวอักษร | IG 1,000 ไบต์ · Messenger ~2,000 [ยังยืนยันไม่ได้] |
| รูป | HTTPS JPEG/PNG ≤10MB · รูปลูกค้าต้องดึงทันที (LINE ลบทีหลัง) | ส่งเป็น URL + กว้าง/สูง | อัปโหลดก่อน | jpg/gif/webp/png ≤10MB อัปโหลดก่อน | IG png/jpeg ≤8MB · วิดีโอ ≤25MB |
| อ่านแล้ว | `markAsRead` ด้วยโทเคนจาก webhook (ต้องเปิดโหมด "แชท") | `/im/session/read` | มี [ยังยืนยันไม่ได้] | `/messages/read` | webhook `message_reads` |

**ข้อสรุปที่ต้องรู้:**

1. **LINE: ตอบช้ากว่า 1 นาที = กินโควตา** — พนักงานส่วนใหญ่ตอบช้ากว่านั้น → คำตอบจาก ERP ส่วนใหญ่จะนับโควตาเดือนของ OA (แพ็กเกจฟรี 300 ข้อความ/เดือน)
   - การตอบในแอป LINE OA เอง (แชท 1:1) โดยทั่วไปไม่นับโควตา [ยังยืนยันไม่ได้ — เช็กแพ็กเกจใน manager.line.biz]
   - คำตอบที่พนักงานพิมพ์ในแอป LINE OA **จะไม่เข้า ERP** (LINE ไม่ส่งสำเนาคำตอบมาที่ webhook) → ห้องใน ERP จะดูเหมือน "ยังไม่ตอบ" → ให้ตอบที่เดียว
   - LINE SHOPPING: แชทผู้ซื้อวิ่งเข้า OA ของร้าน (ข้อมูลภายนอก — คู่มือ LINE SHOPPING เขียนแค่ webhook ออเดอร์) → ต้องทดสอบจริงหลังต่อ OA
2. **ด่านคือ "สิทธิ์" ไม่ใช่เทคนิค**:
   - Lazada ต้องยื่นแอปใหม่หมวด In-house IM Chat (แอป Seller In-house ที่ LM ยื่นไว้เป็นคนละหมวด)
   - Shopee: แอป "Louis Montini ERP" เป็นชนิด **Seller In-house System = มีสิทธิ์ Chat API อยู่แล้ว** ✅ (ต้องเช็กว่าสมัคร push `webchat_push` ได้)
   - TikTok: ต้องมีหน้าแชทที่ใช้งานได้ก่อน แล้วอัดคลิปไปยื่น → ทำเฟส 1 (หน้าแชท + LINE) ก่อน แล้วใช้หน้านั้นยื่น
   - Meta: ต้อง App Review (เฟส 4)
3. **Lazada push ต้องใช้ใบรับรอง OV/EV** — โดเมน Vercel ใช้แบบ DV → push น่าจะสมัครไม่ผ่าน → แผนสำรอง = ดึงข้อความเองทุก 1–2 นาที (cron · `recordWorkerRun`)
4. **ตัวรับ webhook ต้องตอบเร็ว** (Lazada 0.5 วิ · Shopee 2 วิ · LINE ส่งซ้ำได้) → ตอบ 200 ก่อน แล้วค่อยบันทึกใน `after()` · กันข้อความซ้ำด้วยรหัสข้อความ / `webhookEventId`

แหล่งที่อ่าน: developers.line.biz/en/reference/messaging-api · /docs/messaging-api/{mark-as-read,pricing,receiving-messages} ·
open.lazada.com (api /im/message/send, /im/message/list · doc app categories nodeId=10533 · LPM IM push nodeId=29537) ·
open.shopee.com/developer-guide/14 · /push-mechanism/10 ·
partner.tiktokshop.com/docv2/page/{customer-service-api-overview, send-message-202606, get-conversations-202309, upload-image-for-buyer-messages-202309, tts-webhooks-overview, rate-limits} ·
developers.facebook.com/documentation/business-messaging/messenger-platform/{send-messages,policy,webhooks} · instagram-platform messaging-api

---

## เฟส 1 — แบบที่เสนอ (รอเจ้าของอนุมัติ)

### ข้อมูล (ตารางใหม่ 2 ตาราง — แบบเดียวใช้ได้ทุกช่องทาง)

**`chat_conversations`** = ห้องแชท 1 ห้อง ต่อ ลูกค้า 1 คน × บัญชีร้าน 1 บัญชี

| ช่อง | ความหมาย |
|---|---|
| `channel` | ช่องทาง: line · lazada · shopee · tiktok · facebook · instagram |
| `brand_id` | แบรนด์ (จากบัญชีร้านที่รับแชท) |
| `account_ref` | บัญชีที่รับ เช่น คีย์บอท LINE / shop id |
| `external_id` | รหัสห้องฝั่งแพลตฟอร์ม (LINE = userId ของลูกค้า) · ไม่ซ้ำต่อ (channel, account_ref) |
| `customer_name` · `customer_avatar` | ชื่อ/รูปที่ลูกค้าตั้งในแอป |
| `assigned_to` · `assigned_name` | คนรับผิดชอบห้องนี้ |
| `status` | open (ยังเปิด) / done (จบแล้ว) — ลูกค้าทักใหม่ = กลับเป็น open เอง |
| `last_message_at` · `last_preview` · `last_direction` | ข้อความล่าสุด (ไว้เรียงรายการ + รู้ว่า "ยังไม่ตอบ") |
| `unread_count` | ข้อความลูกค้าที่ยังไม่มีใครเปิดอ่าน |
| `reply_until` | ตอบได้ถึงเมื่อไหร่ (กติกาแต่ละช่องทาง) |
| `reply_token` · `reply_token_at` | (LINE) โทเคนตอบกลับฟรีล่าสุด — ไม่ส่งไปหน้าเว็บ |

**`chat_messages`** = ข้อความ 1 ข้อความ

| ช่อง | ความหมาย |
|---|---|
| `conversation_id` | อยู่ห้องไหน |
| `direction` | in (ลูกค้าส่งมา) / out (เราส่งไป) |
| `sender_type` | customer · staff · system |
| `text` | ข้อความ |
| `attachments` | รูป (เก็บเป็นกุญแจไฟล์ R2) / การ์ดสินค้า |
| `external_message_id` | รหัสข้อความฝั่งแพลตฟอร์ม — ไม่ซ้ำในห้อง (กัน LINE ส่งซ้ำ) |
| `sent_by` · `sent_by_name` | พนักงานที่ส่ง |
| `sent_at` | เวลา |
| `send_status` · `send_error` · `send_via` | received / sent / failed · เหตุผลถ้าส่งไม่ได้ · reply (ฟรี) หรือ push (กินโควตา) |

ความปลอดภัย: เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated → อ่าน/เขียนได้ทาง API ฝั่งเซิร์ฟเวอร์เท่านั้น (ตรวจสิทธิ์ `chat.*` ทุกครั้ง) · ไม่มีฟังก์ชัน SECURITY DEFINER ใหม่

### สิทธิ์ใหม่ 4 ตัว

`chat.view` ดูห้องแชท · `chat.reply` ตอบลูกค้า · `chat.assign` มอบหมาย/ปิดห้อง · `chat.settings` ตั้งค่า OA/ข้อความสำเร็จรูป
(ค่าเริ่ม: admin + manager ได้ครบ · ตำแหน่งอื่นเจ้าของติ๊กเองที่หน้าสิทธิ์)

### ตัวต่อช่องทาง (`lib/chat/`)

ทุกช่องทางทำตามแบบเดียว: แปลง webhook → ข้อความกลาง · ดึงประวัติ (ช่องที่ต้องถามเอง) · ส่งข้อความ/รูป · ทำเครื่องหมายอ่านแล้ว
เพิ่มช่องทางใหม่ = เพิ่ม 1 ไฟล์ + 1 บรรทัดในทะเบียน · เฟสนี้ทำเฉพาะ LINE

### LINE

- รับ: ใช้ตัวรับกลางเดิม `app/api/china-pay/line-webhook` — เพิ่มทางแยก "แชท 1:1 จาก OA ที่เปิดรับแชท" (กลุ่มเดิมทำงานเหมือนเดิมทุกอย่าง)
  - บังคับตรวจลายเซ็น (ต้องมี Channel secret) · ข้อความซ้ำจาก LINE ไม่บันทึกซ้ำ · รูปเก็บลง R2 (`chat/line/...`)
- ส่ง: ลูกค้าทักมาไม่เกิน ~50 วินาที (โทเคนตอบฟรีของ LINE ใช้ได้ 1 นาที ครั้งเดียว) = ตอบฟรี · เกินนั้น = ส่งแบบ push (นับโควตาเดือน)
  - หน้าแชทโชว์โควตาที่เหลือ + ป้าย "ข้อความนี้จะนับโควตา" ก่อนกดส่ง · โควตาหมด = บอกเป็นภาษาคน (ตัวส่งกลาง `lineErrorText`)
  - เปิดห้อง = ทำเครื่องหมาย "อ่านแล้ว" ฝั่งลูกค้าด้วย `markAsRead` (โทเคนจาก webhook · ต้องเปิดโหมดแชทใน OA)
- กันซ้ำ: LINE อาจส่ง event ซ้ำ → ไม่บันทึกซ้ำ (รหัสข้อความ)
  - ทุกการส่งของพนักงานลง audit (`chat.send`)
- OA ร้านเพิ่มเป็น "บอทเสริม" ในศูนย์ LINE เดิม (ใส่ token + Channel secret เอง) แล้วติ๊ก "รับแชทลูกค้า" + เลือกแบรนด์ในหน้าตั้งค่าแชท

### หน้า `/chat` (3 ช่อง · มือถือ = ทีละช่อง)

- ซ้าย: รายการห้อง · ป้ายช่องทาง · กรองช่องทาง/แบรนด์ · สวิตช์ "ยังไม่ตอบ" · "ของฉัน"
- กลาง: ข้อความ · กล่องตอบ · แนบรูป · ส่งการ์ดสินค้า (`SkuPicker` / `ParentSkuPicker` เดิม) · ข้อความสำเร็จรูป · ป้ายเตือนหมดเวลาตอบ/จะกินโควตา
- ขวา: ลูกค้า · แบรนด์ · ออเดอร์ล่าสุด (ถ้ารู้ว่าเป็นใคร) · สต็อกสินค้าที่ถาม · มอบหมาย (`UserPicker`) · ปุ่ม "จบแล้ว"
- `?brand=<id>` กรองแบรนด์ (ลิงก์จากหน้าแบรนด์)

### ข้อความสำเร็จรูป

ใช้ตัวแทนค่าตัวแปรเดิมของระบบแคปชั่น (`renderCaption` ใน `lib/caption-template.ts`) แต่เก็บรายการแยก (`ui_config` key `chat_quick_replies` · ค่ากลาง + ต่อแบรนด์)
— ไม่ใส่ปนในตารางแม่แบบแคปชั่น เพราะหน้าคอนเทนต์จะเห็นข้อความแชทปนในรายการแม่แบบ

### แจ้งเตือน

- ลูกค้าทักห้องที่ "ตอบแล้ว/ใหม่" → กระดิ่ง 1 ครั้ง (ไม่เด้งทุกข้อความ) ถึงคนที่รับผิดชอบห้อง · ยังไม่มีคนรับ = คนที่มีสิทธิ์ `chat.reply` (ผ่าน `bellAllowed`)
- กระดิ่ง → web push อัตโนมัติ (ประเภทใหม่ "แชทลูกค้า" ใน `PUSH_CATEGORIES` ปิดเองได้รายคน)
- แท็บ "แชท" ในศูนย์แจ้งเตือน (`CENTER_TABS` + `notify-sources`) = ห้องที่ยังไม่ตอบ กดแล้วเปิดห้องนั้น

### รายการไฟล์ (เฟส 1)

ใหม่:

| ไฟล์ | ทำอะไร |
|---|---|
| `supabase/migrations/2026121802xx_chat_inbox.sql` | 2 ตาราง + RLS + สิทธิ์ 4 ตัว + ให้ admin/manager |
| `lib/chat/types.ts` | แบบข้อมูลกลาง + แบบ "ตัวต่อช่องทาง" |
| `lib/chat/rules.ts` | กติกาล้วน: ตอบฟรีได้ไหม · ยังไม่ตอบไหม · ความยาวข้อความต่อช่องทาง · ข้อความย่อในรายการ |
| `lib/chat/line.ts` | ตัวต่อ LINE (แปลง event · ดึงชื่อ/รูปลูกค้า · ดึงรูปลง R2 · ส่ง reply/push · อ่านแล้ว) |
| `lib/chat/registry.ts` | ทะเบียนช่องทาง (เพิ่มช่องทาง = เพิ่ม 1 บรรทัด) |
| `lib/chat/store.ts` | บันทึกข้อความเข้า/ออก + ส่งกระดิ่ง |
| `lib/chat/settings.ts` | OA ไหนรับแชท + แบรนด์ · ข้อความสำเร็จรูป |
| `app/api/chat/conversations/route.ts` · `[id]/route.ts` · `[id]/send/route.ts` · `summary/route.ts` · `settings/route.ts` | API (ตรวจสิทธิ์ `chat.*` · audit ทุกการส่ง/มอบหมาย/ตั้งค่า) |
| `app/chat/page.tsx` + `components/chat-inbox/*` | หน้า 3 ช่อง (รายการ · ข้อความ+กล่องตอบ · ลูกค้า) + ตั้งค่า |
| `components/work-popup/chat-tab.tsx` | แท็บ "แชท" ในศูนย์แจ้งเตือน |
| `lib/__tests__/chat-rules.test.ts` · `chat-line.test.ts` | เทสต์กติกา + การแปลง event LINE |

แก้:

| ไฟล์ | แก้อะไร |
|---|---|
| `app/api/china-pay/line-webhook/route.ts` | เพิ่มทางแยกแชท 1:1 (กลุ่มเดิมไม่แตะ) |
| `lib/menu-permissions.ts` | กฎเมนู `/chat` → `chat.*` |
| `components/work-popup/float-pref.ts` · `index.tsx` · `lib/notify-sources.ts` · `lib/push-categories.ts` | แท็บ + แหล่งแจ้งเตือน + ประเภท push |
| `lib/brand-hub.ts` · `lib/brand-hub-server.ts` · `components/brand-hub/sections.ts` | การ์ด "แชทยังไม่ตอบ" + ตัวนับ + ลิงก์ `/chat?brand=` |
| `lib/audit-entities.ts` | ชื่อสวยในหน้าประวัติ (ห้องแชท) |
| `lib/shared-parts-registry.ts` | ลงทะเบียนถ้ามีชิ้นใช้ ≥3 จุด |

ไม่แตะ: ระบบกลุ่มไลน์เดิม (คำสั่งซื้อ/งานออกแบบ/ไอเดีย) · การตั้งค่า OA จริง · BigSeller · สต็อก

---

## เช็กลิสต์ให้เจ้าของ (สิ่งที่ระบบทำแทนไม่ได้ — ต้องล็อกอินบัญชีของแพลตฟอร์มเอง)

> ห้ามส่งรหัสลับ/โทเคนทางแชท — ใส่เองในหน้าตั้งค่า ERP หรือ Vercel เท่านั้น

### A. LINE OA ของร้าน (ทำก่อน — เฟส 1 ใช้)

**A1. ดูว่า webhook ของ OA ตอนนี้ชี้ไปไหน (ดูอย่างเดียว ยังไม่ต้องเปลี่ยน)**
1. เข้า https://developers.line.biz/console/ ล็อกอินบัญชี LINE ที่ดูแล OA ร้าน
2. เลือก Provider → เลือก channel ของ OA ร้าน (เช่น Louis Montini) — ถ้าไม่เจอ channel ให้ทำ A2 ข้อ 1–3 ก่อน
3. แท็บ **Messaging API** → เลื่อนถึง **Webhook settings** → ดูช่อง **Webhook URL** และสวิตช์ **Use webhook**
   - ว่าง / ปิดอยู่ = ไม่มีระบบอื่นใช้ → เปลี่ยนมา ERP ได้เลย
   - มี URL ของระบบอื่น (เช่น BigSeller / chatbot / ระบบตอบอัตโนมัติ) = **ถ้าเปลี่ยนเป็น ERP ระบบนั้นจะไม่ได้รับแชทอีก** → บอกผมก่อน
     (ทางเลือก: ให้ ERP รับแล้ว "ส่งต่อ" ให้ระบบเดิมด้วย — LINE ตั้ง webhook ได้แค่ URL เดียว)
4. ทำซ้ำกับ OA ทุกแบรนด์ (Louis Montini · IG International · อื่น ๆ)

**A2. เพิ่ม OA ร้านเข้า ERP (ใส่รหัสเอง)**
1. https://manager.line.biz → เลือก OA ร้าน → **ตั้งค่า** (มุมขวาบน) → **Messaging API**
2. ถ้ายังไม่เปิด → กด **ใช้ Messaging API** → เลือก Provider ที่มีอยู่ (อย่าสร้างใหม่ถ้าไม่จำเป็น)
3. ไป https://developers.line.biz/console/ → channel ของ OA นั้น
   - แท็บ **Basic settings** → **Channel secret** → กดคัดลอก
   - แท็บ **Messaging API** → **Channel access token (long-lived)** → กด **Issue** (ถ้ายังไม่มี) → คัดลอก
4. ERP → หน้า Design Dashboard › กล่องจากไลน์ › ปุ่ม **ศูนย์ LINE** (แอดมิน) → **เพิ่มบอท**
   → ตั้งชื่อเช่น "OA Louis Montini" → วาง token + Channel secret → บันทึก
5. หน้าแชท ERP › ⚙️ ตั้งค่า → ติ๊ก **รับแชทลูกค้า** ที่บอทนั้น + เลือกแบรนด์ (มีหลังเฟส 1 ขึ้นเว็บ)

**A3. ชี้ webhook มาที่ ERP (ทำหลังผมบอกว่าพร้อม + ตกลงเรื่อง A1 แล้วเท่านั้น)**
1. ศูนย์ LINE ใน ERP → คัดลอก Webhook URL ของบอทนั้น (ลงท้าย `?bot=...`)
2. developers.line.biz › channel › แท็บ Messaging API › Webhook URL → **Edit** → วาง → **Update** → **Verify** (ต้องขึ้น Success)
3. เปิดสวิตช์ **Use webhook**
4. manager.line.biz › ตั้งค่า › **การตอบกลับ** (Response settings):
   - **แชท** = เปิด (ยังตอบในแอป LINE OA ได้ตามเดิม)
   - **Webhook** = เปิด
   - ข้อความตอบกลับอัตโนมัติ/คีย์เวิร์ด = ตามเดิม (ไม่กระทบ)

### B. Lazada (เฟส 2)

1. https://open.lazada.com → ล็อกอินบัญชีนักพัฒนาเดิม → **App Console** → **Create App**
2. หมวดแอป (App Category) เลือก **In-house IM Chat** (ผู้ขายใช้เอง) — แอปเดิมของ IG/LM ใช้แชทไม่ได้ เพราะเป็นคนละหมวด
3. กรอกเหตุผล เช่น "ตอบแชทลูกค้าของร้านเราเองจากระบบหลังบ้าน" → ส่ง → รอรีวิว (ปกติ ~1 วัน)
4. อนุมัติแล้ว: บอกผมว่าผ่านแล้ว — ผมจะทำช่องใส่ App Key/Secret ของแอปแชทในหน้า ERP › บัญชีร้าน (แยกจากแอปสินค้า/ออเดอร์เดิม) แล้วเจ้าของใส่เอง — **ห้ามส่งรหัสทางแชท**
5. ไม่ต้องตั้ง Push URL เอง — ผมจะใช้วิธีดึงข้อความเอง (push ของ Lazada ต้องใช้ใบรับรองชนิดพิเศษที่ Vercel ไม่มี)
6. ทำทีละร้าน: Louis Montini ก่อน แล้ว IG International

### C. Shopee (เฟส 2)

1. https://open.shopee.com → **Console** → **App List** → แอป "Louis Montini ERP" (ชนิด Seller In-house System — มีสิทธิ์ Chat อยู่แล้ว)
2. เมนูแอป → **Push Mechanism** / **Push Setting** → ดูว่ามีหัวข้อ **Webchat Push (code 10)** ให้ติ๊กไหม — **ยังไม่ต้องติ๊ก** ถ่ายรูปหน้าจอส่งผมก่อน
3. ถ้าแอปยังไม่ Live → รอ Go Live ที่ยื่นไว้ (11-13) ผ่านก่อน
4. IG International: ถ้าจะใช้แชทด้วย ต้องสร้างแอป Seller In-house ของ IG แยก (หรือใช้แอปเดียวผูก 2 ร้าน — ผมเช็กให้ตอนถึงเฟสนั้น)

### D. TikTok Shop (เฟส 2 — หลังเฟส 1 ขึ้นเว็บ)

1. รอผมทำหน้าแชทเฟส 1 ให้ใช้งานได้ก่อน (TikTok ขอดูหน้าแชทจริง)
2. https://partner.tiktokshop.com → **App & Service** → แอปของเรา → **Manage API / Scopes**
3. หา scope **Customer Service** (`seller.customer_service`) → กด **Apply**
4. แนบ: ภาพหน้าจอหน้าแชท ERP ทุกส่วน + คลิปอัดหน้าจอ 30–90 วินาที (เปิดห้อง → ตอบ → ส่งรูป) — ผมเตรียมขั้นตอนอัดให้
5. เลือกว่าเป็นแอป **ผู้ขายใช้เอง (TikTok Shop Seller / own-dev)** — มีข้อยกเว้นเรื่องจำนวนร้าน 1,000 ร้าน
6. รออนุมัติ → แจ้งผม

### E. Facebook / Instagram (เฟส 4 — ยังไม่ต้องทำ)

ต้องยื่น App Review ขอ `pages_messaging` + `instagram_business_manage_messages` (ต้องมีคลิปสาธิต + นโยบายความเป็นส่วนตัว) · ตอบได้ใน 24 ชม. หลังลูกค้าทักล่าสุด · รายละเอียดตอนถึงเฟส 4
