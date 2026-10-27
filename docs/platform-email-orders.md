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
GET /api/platform-sales/report  →  /master/platform-sales (ตารางกลาง SoldProductsTable)
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
| `lib/platform-email/apps-script.ts` | สร้างสคริปต์ Gmail (ฝัง URL + กุญแจ + ความถี่ + ย้อนหลัง + คำค้น) |
| `app/api/platform-email/inbound` | รับเมลจากสคริปต์ (กุญแจ ไม่ใช่การล็อกอิน) |
| `app/api/platform-email/settings` | GET/PATCH ตั้งค่า (`platform_orders.manage`) · POST rotate_key/script (`admin.users`) |
| `app/api/platform-email/inbox` | รายการเมล · กลุ่มสินค้ารอยืนยัน · อ่านใหม่ / ปิดเรื่อง / ยืนยัน SKU |
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

ราคาในเมล Shopee: เทียบผลรวมกับ "ยอดรวมค่าสินค้า" → ถ้าเป็นราคารวมบรรทัดจะแปลงเป็นต่อชิ้นเอง (ยังไม่เห็นเมลจริงที่จำนวน ≥2)

## กติกาการบันทึก (server.ts)

1. ไม่ใช่ Shopee/Lazada หรือ kind=other → `ignored`
2. อ่านไม่ครบ (ไม่มีเลขออเดอร์ / ชำระเงินแต่ไม่มีสินค้า) → `unreadable`
3. คำขอคืนเงิน → `done` + note (ลองหาออเดอร์ที่เลขตรง ถ้าเจอผูก order_id) · ไม่หักยอด
4. ชื่อร้านในเมลไม่อยู่ใน `shops` (contains, ไม่สนตัวพิมพ์) → `attention` (กันเมลตอนเราเป็นผู้ซื้อ)
5. ยกเลิก: มีออเดอร์ → cancelled (ถ้า `stock_deducted` → `attention` ให้คนกดในหน้าออเดอร์เพื่อคืนสต๊อก) · ไม่มี → สร้างเป็น cancelled
6. ชำระเงิน/ใหม่: มีออเดอร์พร้อมสินค้าแล้ว → ไม่ซ้ำ · ไม่มี → สร้าง status `new` (**ไม่ตัดสต๊อก**)
7. จับคู่: rule > exact (`รุ่น-เลขในวงเล็บ` หรือรหัสเต็มในเมล) > single (รุ่นมี SKU เดียว สีไม่ขัด) → ผูกเลย · guess (สีตรงตัวเดียว) / none → `matched_sku_id = null` รอแท็บยืนยัน

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
