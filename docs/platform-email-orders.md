# 📧 ออเดอร์จากเมลแพลตฟอร์ม (Shopee / Lazada → ERP)

> เจ้าของขอ 2026-10-27: "อยากได้รายงานสินค้าที่ขายได้ — ปกติ platform ส่งเมลมา อ่านเมลแล้วเทียบกับสินค้าใน ERP แล้วสรุปให้"
> เลือกแบบ **ฟรี**: อ่านด้วยกฎตายตัว (ไม่ใช้ AI) · เมลเข้า **@gmail.com ทั่วไป** → ใช้ Google Apps Script ส่งต่อ

คู่มือภาษาคนสำหรับเจ้าของอยู่ในหน้าเว็บเอง: **/admin/platform-email → แท็บ 📖 คู่มือ / บันทึก** (แก้ระบบแล้วอัปเดตทั้งสองที่)

## ภาพรวม

```txt
Shopee/Lazada ──เมล──▶ Gmail ร้าน
                        │  Google Apps Script (บนเซิร์ฟเวอร์ Google · ทุก 15 นาที · ติดป้าย ERP-sent)
                        ▼
POST /api/platform-email/inbound   (Authorization: Bearer <กุญแจ>)
                        │  lib/platform-email/parse.ts   อ่านด้วยกฎ → ParsedEmail
                        │  lib/platform-email/server.ts  ตรวจร้าน → สร้าง/ยกเลิกออเดอร์ → จับคู่สินค้า (match.ts)
                        ▼
platform_orders + platform_order_items (source = 'email')   ← ตารางเดิม ใช้ร่วมกับไฟล์/API
platform_email_inbox (1 แถว/เมล = ประวัติว่าระบบทำอะไร)
                        ▼
GET /api/platform-sales/report?month= | ?date=  →  /master/platform-sales (รายเดือน / รายวัน · ตารางกลาง SoldProductsTable)
                        │  ตัวนับกลาง lib/platform-sales/server.ts (loadPlatformSales)
                        ▼
รายงานอัตโนมัติ "ยอดขายแพลตฟอร์มรายวัน" → Gmail / LINE / Discord (docs/email-reports.md แหล่งข้อมูลที่ 3)
```

## ทำไมไม่ใช้ปุ่ม "เชื่อม Gmail" (OAuth)

- `gmail.readonly` เป็น restricted scope — แอปที่ยังอยู่โหมด Testing โทเคนหมดทุก 7 วัน (ต้องกดเชื่อมใหม่) · จะ publish ต้องผ่าน security assessment ของ Google
- Service account (ที่ใช้กับ Drive) อ่าน @gmail.com ทั่วไปไม่ได้ (ได้เฉพาะ Workspace + domain-wide delegation)
- Apps Script ทำงานในบัญชีเจ้าของเอง ไม่ต้องผ่านการตรวจ · ฟรี · โควตาบัญชีฟรี: เวลารัน trigger 90 นาที/วัน, UrlFetch 20,000 ครั้ง/วัน (ใช้ไม่ถึง 5%)

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/platform-email/parse.ts` | อ่านเมล (pure) — HTML→บรรทัด, ป้าย→ค่า (บรรทัดเดียวกัน/บรรทัดถัดไป), วันที่ไทย→ISO (Date.UTC −7 ชม.) |
| `lib/platform-email/match.ts` | จับคู่สินค้า (pure) — rule / exact / single / guess / none |
| `lib/platform-email/server.ts` | ตัดสินใจ + เขียน DB (supabaseAdmin) |
| `lib/platform-email/review.ts` | ข้อมูลแท็บในหน้า (server): `pendingPage` สินค้ารอยืนยันทีละหน้า · `inboxPage` เมลทีละหน้า · `bindPending` ผูกรายการที่ค้าง |
| `lib/platform-email/apps-script.ts` | สร้างสคริปต์ Gmail (ฝัง URL + กุญแจ + ความถี่ + ย้อนหลัง + คำค้น) |
| `app/api/platform-email/inbound` | รับเมลจากสคริปต์ (กุญแจ ไม่ใช่การล็อกอิน) |
| `app/api/platform-email/settings` | GET/PATCH ตั้งค่า (`platform_orders.manage`) · POST rotate_key/script (`admin.users`) |
| `app/api/platform-email/inbox` | รายการเมล (ทีละหน้า) · กลุ่มสินค้ารอยืนยัน (ทีละหน้า) · อ่านใหม่ / ปิดเรื่อง / ยืนยัน SKU / ยืนยันหลายการ์ด (`confirm_many` ≤100) |
| `app/api/platform-sales/report` | รายงานรายเดือน (`platform_orders.view`) |
| `app/admin/platform-email/*` | หน้าตั้งค่า 5 แท็บ |
| `app/master/platform-sales/page.tsx` | หน้ารายงาน |
| `supabase/migrations/202611030100_platform_email_orders.sql` | 3 ตาราง + index `platform_orders(ordered_at)` |
| `lib/__tests__/platform-email-*.test.ts` | เทสต์จากเมลจริง 4 ฉบับ |

## ตาราง (RLS เปิด ไม่มี policy + revoke anon/authenticated — อ่าน/เขียนผ่าน API เท่านั้น)

- `platform_email_settings` (แถวเดียว id=1): enabled, inbound_key_enc (secret-box), key_last4, interval_min (5/10/15/30/60), backfill_days, search_query, shops `[{platform, match, brand_id}]`, last_ping_at, last_received_at
- `platform_email_inbox`: message_id (unique), received_at, from_addr, subject, **body_text** (บรรทัดหลังแปลง ≤60k ไว้อ่านซ้ำ), platform_code, kind, external_order_id, ref_no, shop_name, parsed, status (`done|ignored|unreadable|attention`), note (ภาษาคน), order_id
- `platform_email_sku_rules`: (platform_code, item_key) → sku_id — คู่ที่คนยืนยัน
- `platform_order_items.raw` ของรายการจากเมล: `source='email'`, platform_code, variant, item_key, model_code, qty_known, confidence, reason, suggest_sku_id/code

## เมลที่รู้จัก (ตัวอย่างจริง 2026-10-27 ร้าน Louis Montini)

| เมล | kind | ได้อะไร |
|---|---|---|
| Shopee "ได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว" | `order_paid` | เลขออเดอร์ 14 ตัว (`261027QF4YCJA8`) · วันที่ · `1. ชื่อ` + ตัวเลือกสินค้า/จำนวน/ราคา · ยอดรวมค่าสินค้า/ค่าจัดส่ง/ยอดที่ต้องชำระ |
| Shopee "ถูกยกเลิกโดย…" | `order_cancelled` | เหมือนข้างบน แต่ยอด ฿0 · ป้ายมี `"` ติดหน้า |
| Shopee "ได้ยื่นคำขอคืนเงิน/คืนสินค้าหมายเลข …" | `return_requested` | **เลขคำขอ 15 ตัว** (`2610270PUQN7BJ5`) ไม่ใช่เลขออเดอร์ · ไม่มีสินค้า/ยอด · ทักร้านว่า "Louis Montini & Pixie Dustie" |
| Lazada "New Order just arrived!" | `order_new` | Order Number + Order Item List (ชื่อเท่านั้น) · มี 2 ภาษาในฉบับเดียว (อ่านอันแรก) |
| Lazada "คำสั่งซื้อในลาซาด้าถูกยกเลิก" | `order_cancelled` | เลขออเดอร์ + ชื่อสินค้า |

**เพิ่มจากเมลจริงชุดแรก (2026-11-01 · 205 ฉบับ)**

| เมล | kind | หมายเหตุ |
|---|---|---|
| Shopee "คำสั่งซื้อชำระเงินปลายทาง #… ถูกยืนยันแล้ว" | `order_cod` | **เดิมถูกข้ามเป็น other** (41 ฉบับ) · ไม่มีคำว่า "ยืนยันการชำระเงิน" · นับเป็นยอดขาย |
| Shopee "คำสั่งซื้อหมายเลข #… ถูกทำการยกเลิกโดย…" | `order_cancelled` | เลข **"1." อยู่บรรทัดเดียว** ชื่อสินค้าบรรทัดถัดไป (เมลชำระเงินอยู่บรรทัดเดียวกัน) — เดิมอ่านสินค้าไม่ได้ |
| Shopee "คำขอคืนเงิน/คืนสินค้าสำหรับคำสั่งซื้อ #<เลขออเดอร์>" | `return_requested` stage=ข้อพิพาท | มีเลขออเดอร์ 14 ตัว → ผูก order_id ได้ |
| Shopee "ผลการพิจารณาคำขอคืนเงิน/คืนสินค้าหมายเลข <เลขคำขอ>" | `return_requested` stage=ผลการพิจารณา | เลขคำขอเดียวกับตอนยื่น → รายงานนับต่อคำขอ (distinct ref_no/order) |
| Shopee "สินค้า … ของคุณขายหมดแล้ว" · SPX Pickup E-Receipt · พัสดุคืน | `other` | ข้ามถูกต้อง |

ตัวเลือกสินค้าจริงหลายแบบ → `parseVariant` (match.ts): `ดำ | 01` · `ดำ/น้ำตาล (01),L` · `Black#1,L` · `สีดำ-เทา | 236-02,S` · `ม่วงอ่อน-เทาอ่อน 01` · `เขียวขี้ม้า MCT09-08,S` (รหัสเต็ม) · `สีดำ | MGN116,XL` (รุ่นในตัวเลือก ≠ รุ่นท้ายชื่อ) — หลังจุลภาคแรก = ไซซ์/ตัวเลือกพิมพ์ (ERP ไม่แยก SKU ตามไซซ์)
เลขสีแบบ `(04)` `| 04` = เชื่อได้ (ชื่อสีตรงบางคำพอ) · `#1` / เลขท้ายคำ = เชื่อได้น้อย (ชื่อสีต้องตรงทุกคำ) · เลขชี้ SKU แต่ชื่อสีขัดกัน → guess (เช่น "ครีม | 18" แต่ MCT15-18 = กากี)
ผลลองกับข้อมูลจริง: สินค้าค้าง 247 → ผูกเองได้ 132 · เดาให้ยืนยัน 19 · ที่เหลือส่วนใหญ่ PK38/PK09 "คละสี" (รหัสไม่มีใน ERP)

ราคาในเมล Shopee = ราคาต่อชิ้นที่ปัดแล้ว → ผลรวมอาจต่างจาก "ยอดรวมค่าสินค้า" ≤1 บาท/ออเดอร์ (เช่น 9×3=27 แต่ยอดรวม 26) · ถ้าผลรวมเท่ากับราคารวมบรรทัด จะแปลงเป็นต่อชิ้นเอง

## กติกาการบันทึก (server.ts)

1. ไม่ใช่ Shopee/Lazada หรือ kind=other → `ignored`
2. อ่านไม่ครบ (ไม่มีเลขออเดอร์ / ชำระเงินแต่ไม่มีสินค้า) → `unreadable`
3. คำขอคืนเงิน → `done` + note (ลองหาออเดอร์ที่เลขตรง ถ้าเจอผูก order_id) · ไม่หักยอด
4. ชื่อร้านในเมลไม่อยู่ใน `shops` (contains, ไม่สนตัวพิมพ์) → `attention` (กันเมลตอนเราเป็นผู้ซื้อ)
5. ยกเลิก: มีออเดอร์ → cancelled (ถ้า `stock_deducted` → `attention` ให้คนกดในหน้าออเดอร์เพื่อคืนสต๊อก) · ไม่มี → สร้างเป็น cancelled
6. ชำระเงิน/COD/ใหม่: มีออเดอร์พร้อมสินค้าแล้ว → ไม่ซ้ำ · ไม่มี → สร้าง status `new` (**ไม่ตัดสต๊อก**) · ยกเลิกของออเดอร์ที่ยังไม่มีสินค้า → เติมสินค้าให้
7. จับคู่: rule > exact (รหัสเต็ม / เลขสี + ชื่อสีไม่ขัด) > single (รุ่นมี SKU เดียว) → ผูกเลย · guess / none → `matched_sku_id = null` รอแท็บยืนยัน
8. ปรับกฎแล้วใช้ย้อนหลัง: แท็บรอยืนยัน "🔄 ให้ระบบจับคู่ใหม่" (`rematch` → `rematchPendingItems`) · แท็บเมลที่อ่านแล้ว กรองกลุ่ม → "🔄 อ่านใหม่ทั้งกลุ่มนี้" (`reprocess_all` ≤150 ฉบับ เก่า→ใหม่)

## แท็บ "รอยืนยันสินค้า" (2026-11-01)

- **โหลดทีละหน้า** (20/50/100 การ์ด): เซิร์ฟเวอร์รวมกลุ่มรายการที่ค้างทั้งหมด (ดึงเฉพาะช่องที่ใช้ + สถานะออเดอร์ในคำขอเดียว) แล้วกรอง/นับ/ตัดหน้า · ตัวเลือก SKU ดึงเฉพาะการ์ดในหน้าที่เปิด
- **ป้ายแพลตฟอร์มมีสี** = ของกลาง `PlatformBadge` (`components/platform-icon.tsx`) สี/โลโก้จาก `erp_platforms.color/icon_key` (แก้ที่หน้าแพลตฟอร์มที่เดียว) · ไม่มีค่า = สีสำรองตาม code
- **คิวตามสาเหตุ** (`pendingQueueOf` ใน match.ts อ่านจาก raw ที่ตัวจับคู่เขียน): 💡 `guess` ระบบเดาไว้ · 🎨 `multi` หลายสี เลือกจากเมลไม่ได้ · ❓ `not_found` ไม่มีรหัสใน ERP / ชื่อไม่มีรหัส · ⏭ `skipped` ข้ามไว้ก่อน
- ชิปแพลตฟอร์มนับจากทุกคิว · ชิปคิวนับเฉพาะแพลตฟอร์มที่เลือก · ซ่อนการ์ดที่มีแต่ออเดอร์ยกเลิก (ค่าเริ่ม เปิด) · ค้นหา ชื่อ/รหัสรุ่น/ตัวเลือก/เลขออเดอร์
- **ทำทีละหลายการ์ด** (คิว 💡 และ 🎨): ติ๊กทีละใบ / ทั้งหน้า / ทั้งหมดตามตัวกรอง (`select_all`) → แถบล่าง `BulkActionBar` → ConfirmDialog แสดงรายการ (เกิน 50 = พิมพ์ CONFIRM) → 💡 `confirm_many` / 🎨 `confirm_model` ส่งทีละ 100 · audit 1 แถวต่อครั้ง (metadata.groups)
- Lazada + หลายสี → กล่องเตือน "ยืนยันสีเดียว = ทุกออเดอร์ต่อไปนับเป็นสีนั้น" + ปุ่ม 🎨 นับเป็นรุ่น
- คิว ❓ ไม่พบรหัส: ปุ่ม **＋ สร้าง SKU ใหม่** (สิทธิ์ `products.create`) เปิด `SkuWizard` กลาง (ตัวเดียวกับหน้า SKU) กรอกรหัสรุ่น+ชื่อให้ → สร้าง 1 ตัว = ผูกการ์ดนั้นเลย (`confirm_sku`) · หลายตัว = `rematch`
- **⏭ ข้ามไว้ก่อน** ทุกการ์ด (`skip`/`unskip` ≤50 การ์ด): จดใน raw ของรายการ (`skipped_at`/`skipped_by`) ไม่แตะโครง DB · คิว `skipped` ไม่นับในตัวเลขหลัก โชว์เป็นชิปแยก · การ์ดเป็น "ข้ามไว้" ก็ต่อเมื่อ **ทุกรายการ** ถูกข้าม (มีเมลใหม่ = กลับเข้าคิวปกติเอง)

## แท็บ "📌 กฎที่จำไว้" — `/api/platform-email/rules` + `lib/platform-email/rules.ts`

- ดูทีละหน้า (กรองแพลตฟอร์ม / ผูก SKU / นับเป็นรุ่น / ค้นหารหัสรุ่น-ตัวเลือกใน item_key) · โชว์ชื่อสินค้าตัวอย่าง + จำนวนรายการจากเมลที่ใช้กุญแจนั้น + ผู้ยืนยัน (`user_profiles`)
- **แก้** (PATCH `{id, sku_id}` | `{id, parent_sku_id}`): เปลี่ยนเป้าหมาย SKU ↔ รุ่น + ย้ายรายการที่ผูกด้วยกฎนี้ตามไป · audit `update`
- **ลบ** (DELETE `{id, release}`): release = ส่งรายการกลับไปรอยืนยัน แล้ว `rematchPendingItems` · audit `delete`
- ⚠️ ออเดอร์ที่ `stock_deducted = true` **ไม่แตะรายการเลย** (ตัดสีเดิมไปแล้ว ถ้าย้ายรายการ สต๊อกจะเพี้ยน) → แจ้งจำนวน "ไม่แตะ" ให้ผู้ใช้

## 🎨 นับเป็นรุ่น (ไม่แยกสี) — migration `202611101000_platform_email_model_level`

- ใช้เมื่อเมลไม่บอกสี (Lazada ไม่บอกเลย) — กันข้อมูลรายสีผิดจากการเดาสีเดียว
- DB: `platform_email_sku_rules.parent_sku_id` (→ parent_skus_v2 · sku_id กับ parent_sku_id มีได้อย่างเดียว — check constraint) · `platform_order_items.matched_parent_sku_id`
- หารุ่น (`parentsForModels` ใน review.ts): รหัสรุ่นจากกุญแจจำคู่ (`m:BSD07|…` → `modelFromItemKey`) → SKU ที่ใช้งานของรุ่นนั้นชี้รุ่นแม่ตัวเดียว → ใช้ตัวนั้น · ไม่งั้นหา parent_skus_v2 ที่ code ตรง · หาไม่เจอ/กำกวม = ทำไม่ได้ (บอกให้ค้นหา SKU แทน)
- `confirm_model` (≤100 การ์ด): upsert กฎ (sku_id=null, parent_sku_id) + ผูกรายการที่ค้าง `matched_parent_sku_id` + `sku_code`=รหัสรุ่น · audit `match_model`
- ตัวจับคู่: กฎระดับรุ่น → confidence `model` (`matchEmailItem` rule.level="model") → เมลใหม่ผูกรุ่นเอง · `rematchPendingItems` ข้ามรายการที่ผูกรุ่นแล้ว
- ผลที่อื่น: รายงานยอดขาย = แถว "รุ่น X (ไม่แยกสี)" ไม่นับเป็นค้าง · หน้ารุ่น (`/api/parent-skus/[id]/overview`) นับยอดด้วย · ตัดสต๊อกตอนยืนยันออเดอร์ **ข้าม** พร้อมเตือน "นับระดับรุ่น (ไม่รู้สี)" (ไม่รู้ว่าตัดสีไหน)
- จำนวนค้างบนแท็บ/ภาพรวม ไม่นับรายการที่ผูกรุ่นแล้ว

## แท็บ "เมลที่อ่านแล้ว"

- โหลดทีละหน้า 50/100/200 ฉบับ (`count: exact`) · ค้นหา/กรองสถานะ/เรียงคอลัมน์ ทำที่ฐานข้อมูล (เดิมโหลดล่าสุด 300 ฉบับ — เมลเก่ากว่านั้นเปิดไม่ได้)

## ติดตั้ง/ดูแล

- หน้า /admin/platform-email แท็บ ⚙️ → คัดลอกสคริปต์ (admin.users) → script.google.com → วาง → Run `setup` → อนุญาต
- `setup` = ลบ trigger เก่า + ตั้งเวลา + ping + ย้อนหลัง N วัน (เกิน 4.5 นาที → property `backfill_days` ค้างไว้ รอบถัดไปทำต่อ)
- เปลี่ยน interval/backfill/คำค้น/กุญแจ → ต้องวางสคริปต์ใหม่ + Run `setup` อีกครั้ง
- ต้องมี env `PLATFORM_SECRET_KEY` (มีอยู่แล้ว ใช้กับ Lazada/secret-box)

## ปรับกฎเมื่อแพลตฟอร์มเปลี่ยนหน้าตาเมล

1. ขอเมลจริงฉบับใหม่ (Gmail ⋮ → ดาวน์โหลดข้อความ .eml) หรือดู `body_text` ใน `platform_email_inbox`
2. เพิ่มป้าย/คำใน `LABEL` / `shopeeKind` / `lazadaKind` ของ parse.ts + เพิ่มเทสต์ด้วยข้อความจริง
3. deploy → หน้าเว็บ แท็บเมลที่อ่านแล้ว กรอง "อ่านไม่ออก" → ติ๊ก → 🔄 อ่านใหม่

## ยังไม่ทำ / ต่อยอด

- Lazada: ใช้เลขออเดอร์จากเมลไปดึงจำนวน/ราคาผ่าน Lazada API (`lib/lazada.ts lazGetOrderItems`) — ต้องเชื่อม OAuth ร้าน Louis Montini ก่อน (ที่เชื่อมไว้เป็น IG International และหมดอายุ 2026-08-05)
- ผูกคำขอคืนเงินกับออเดอร์ด้วยมือ / หักยอดเมื่อคืนสำเร็จ (ต้องเห็นเมล "คืนเงินสำเร็จ" ก่อน)
- พิมพ์รายงานเป็น A4 (ตอนนี้ดาวน์โหลด Excel ได้)
