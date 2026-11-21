# ตัวเชื่อม Shopee Open Platform (ร้าน Louis Montini)

> สถานะ 2026-11-15: **เฟส 1 = เชื่อมร้าน** (8234e37d) · **เฟส 2 = ดึงสินค้า อ่านอย่างเดียว** (efe2e02a) · **เฟส 3 = ออเดอร์อัตโนมัติ** (แทนเมล) · **เฟส 4A = แก้ชื่อ/รายละเอียด + เปิด/ปิดขาย จากลิ้นชัก** · **เฟส 4B = แก้ราคาตั้งรายตัวเลือก** · **เฟส 4C = แก้รูปสินค้า** (แก้ร้านจริง · ถามก่อนทุกครั้ง) · **เฟส 5A = ดูก่อนส่ง ลงสินค้าใหม่** · **เฟส 5B = ลงสินค้าใหม่จริง (ปิดขาย + สต๊อก 0)** · ร้านที่เชื่อม: "Louis Montini & Pixie Dustie" (shop_id 9944732)
> แอป "Louis Montini ERP" (Seller In House System) **Go Live ผ่านแล้ว 2026-11-14** · เจ้าของใส่ SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_ENV=live ใน Vercel แล้ว (env ใหม่มีผลหลังขึ้นเว็บรอบถัดไปเท่านั้น — ถ้าไม่มีงานรอขึ้นเว็บ ปุ่ม "ขึ้นเว็บทันที" จะไม่ build ต้องมี commit ใหม่ หรือกด Redeploy ใน Vercel)
> แผนทั้งหมด: เฟส 1 เชื่อมร้าน → เฟส 2 ดึงสินค้า (อ่านอย่างเดียว) → เฟส 3 ดึงออเดอร์ → เฟส 4 แก้ชื่อ/ราคา/รูป (ทีละขั้น · อนุมัติทุกครั้ง)

## ใช้ทำอะไร
ให้ระบบคุยกับร้าน Shopee ของแบรนด์ได้เองผ่าน API ของ Shopee (แทนการนำเข้าไฟล์ / BigSeller) — ล้อแบบตัวเชื่อม Lazada (`docs/lazada-connector.md`) และ TikTok (`docs/tiktok-shop-connector.md`)

**ใช้ได้เฉพาะร้านที่ Shopee อนุญาต:** ไทยเปิดให้เฉพาะร้าน **Mall / Managed Seller** — ร้าน IG International ถูกปฏิเสธ (2026-11-10) · ร้าน Louis Montini สมัครผ่าน (2026-11-13)

## สิ่งที่เจ้าของต้องตั้งเอง (ระบบทำแทนไม่ได้)
1. Shopee Open Platform › Console › App List › สร้างแอป **Seller In House System**
2. Test + Live Redirect URL Domain = `https://erp-platform-playground.vercel.app` (ระบบพากลับที่ `/api/shopee/callback`)
3. กด **Go Live** (Product Brief + ภาพหน้าจอ · PII = ปิด) → รอตรวจ ~24 ชม.
4. ผ่านแล้วใส่ใน Vercel › Settings › Environment Variables (Production):
   | ชื่อ | ค่า |
   |---|---|
   | `SHOPEE_PARTNER_ID` | Live Partner ID (ตัวเลข) |
   | `SHOPEE_PARTNER_KEY` | Live Key |
   | `SHOPEE_ENV` | `live` (กุญแจชุด Test = `sandbox` — ใช้ได้แค่ร้านทดลอง) |
   ⚠️ ห้ามส่งกุญแจในแชต · เปลี่ยน env แล้วต้องรอรอบขึ้นเว็บถัดไปถึงมีผล
5. หน้า **จัดการร้าน/บัญชีแพลตฟอร์ม** (`/admin/platform-accounts`) › เลือกแบรนด์ › Shopee › **เชื่อมต่อ Shopee** → เข้าสู่ระบบด้วย**บัญชีหลักของร้าน** + OTP → เลือกอายุสิทธิ์ **365 วัน** → Confirm

## กติกาของ Shopee ที่โค้ดยึด (อ่านจาก open.shopee.com 2026-10-28)
- ลายเซ็น = HMAC-SHA256 **hex ตัวเล็ก** ของ `partner_id + path + timestamp` (+ `access_token + shop_id` สำหรับคำขอระดับร้าน) · timestamp = วินาที อายุ 5 นาที
- ลิงก์อนุญาต `{host}/api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect` → พากลับพร้อม `code` (ใช้ได้ครั้งเดียว · 10 นาที) + `shop_id`
- กุญแจ `POST /api/v2/auth/token/get` · ต่ออายุ `POST /api/v2/auth/access_token/get`
- access_token อยู่ได้ **4 ชม.** · refresh_token อยู่ได้ **30 วัน และใช้ได้ครั้งเดียว** · สิทธิ์ร้าน ≤ **365 วัน** (`get_shop_info.expire_time`)
- โฮสต์: live `partner.shopeemobile.com` · sandbox `openplatform.sandbox.test-stable.shopee.sg`
- ไม่มีตัวเลขจำกัดความถี่ — เกิน = HTTP 429

## ทำงานอย่างไร
| ส่วน | ไฟล์ |
|---|---|
| เซ็น · ลิงก์อนุญาต · กุญแจ · เรียก API · ข้อความ error ภาษาคน (ไม่แตะฐานข้อมูล · มีเทสต์) | `lib/shopee.ts` · `lib/__tests__/shopee.test.ts` |
| เก็บ/โหลดกุญแจ (เข้ารหัส `lib/secret-box`) · ต่ออายุแบบกันชน · ด่านกันร้านผิดแบรนด์ · ต่ออายุทุกร้าน | `app/api/shopee/shared.ts` |
| เริ่มเชื่อม (คืน `auth_url`) | `app/api/shopee/oauth/start` (สิทธิ์ `products.platforms.manage_accounts`) |
| รับกลับจาก Shopee | `app/api/shopee/callback` (ไม่ guard — Shopee เป็นคนเรียก · brand มาจาก state ที่เราเข้ารหัสเท่านั้น) |
| สถานะ / ตรวจกับ Shopee จริง (`&check=1`) | `app/api/shopee/status` (สิทธิ์ `products.platforms.view`) |
| ตัดการเชื่อม (ล้างกุญแจในระบบ ไม่แตะร้าน) | `app/api/shopee/disconnect` |
| ต่ออายุทุกเช้า 07:30 | `app/api/cron/lazada-token` (ตัวเดียวกับ Lazada · คนในออฟฟิศ AI = "ผู้ต่ออายุกุญแจ Lazada + Shopee") |
| ปุ่ม/สถานะ | `app/admin/platform-accounts/page.tsx` (แถว Shopee อยู่กลุ่ม "เชื่อมได้") |

**เก็บที่ไหน:** `platform_credentials` (แบรนด์ × shopee) — `api_key` = access_token (เข้ารหัส) · `meta` = `{ stage, env, shop_id, shop_name, region, shop_status, refresh_token (เข้ารหัส), expires_at, rt_expires_at, auth_expires_at, refresh_expires_at, connected_at, refreshed_at }`
- `refresh_expires_at` = ตัวที่หมดก่อน ระหว่างตัวต่ออายุ (30 วัน) กับสิทธิ์ร้าน (≤365 วัน) → ใช้กติกาสุขภาพกุญแจเดียวกับ Lazada (`lazConnHealth`: เหลือ ≤ 7 วัน = เตือน) + ศูนย์แบรนด์ (`lib/brand-hub` อ่านค่านี้เอง)
- เชื่อมสำเร็จ → เติม `platform_accounts.external_shop_id` = รหัสร้านตัวเลข (เฉพาะถ้าช่องว่าง) → ลิงก์หน้าสินค้า/หน้าร้าน Shopee ในระบบใช้ได้ (`lib/platform-links`)

**กันต่ออายุชนกัน (สำคัญ):** refresh_token ใช้ได้ครั้งเดียว → ถ้าตัวตั้งเวลากับคนกดปุ่มต่ออายุพร้อมกัน ตัวที่ช้ากว่าจะล้ม
- ตอนเก็บใช้ "อัปเดตเฉพาะถ้าตัวต่ออายุในแถวยังเป็นตัวเดิม" (`.eq("meta->>refresh_token", เดิม)`) — ไม่ทับตัวที่ใหม่กว่า
- ตัวที่ได้ error → อ่านแถวซ้ำ ถ้าอีกงานเก็บกุญแจใหม่แล้วก็ใช้ตัวนั้น
- ได้ตัวใหม่จาก Shopee แล้วบันทึกไม่ได้ → ลองซ้ำ 3 ครั้ง (ตัวเดิมใช้ไม่ได้แล้ว)
- ยังไม่รู้: Shopee มีช่วงผ่อนผันให้ตัวต่ออายุเก่าใช้ซ้ำได้สั้น ๆ ไหม — ถ้าเจอร้านหลุดหลังรอบ 07:30 ให้ดู audit_logs `platform_credentials` (metadata.platform = shopee)

**ด่านตอนเชื่อม (ล้อ TikTok/Lazada):**
- ร้านนี้ต่ออยู่กับแบรนด์อื่น → **บล็อก** · แบรนด์นี้ต่อกับอีกร้านอยู่ → **บล็อก** (ต้องกดตัดการเชื่อมต่อเองก่อน)
- ชื่อร้านไม่ตรงชื่อแบรนด์ → เตือน (ขึ้นแดง "ร้านไม่ตรงแบรนด์") · ร้านเลือกอายุสิทธิ์ < 300 วัน → เตือนให้เชื่อมใหม่แล้วเลือก 365
- ชุดกุญแจใน Vercel (live/sandbox) ไม่ตรงกับตอนเชื่อม → ใช้ไม่ได้จนกว่าจะเชื่อมใหม่

**ประวัติ (audit_logs):** `entity_type = platform_credential` actor `shopee_oauth` (เชื่อม/ถูกบล็อก) · ผู้ใช้ (ตัดการเชื่อม) · `platform_credentials` actor `cron: lazada-token` (ต่ออายุรายวัน · metadata.platform = shopee)

## เฟส 2 — ดึงสินค้า (อ่านอย่างเดียว)
หน้า **สินค้าบนแพลตฟอร์ม** (`/master/platform-catalog`) › เลือก Shopee + แบรนด์ › ปุ่ม **ตั้งค่า** › **ดึงสินค้าจาก Shopee** (สิทธิ์ `products.platforms.edit`)

- `POST /api/shopee/sync-products { brand_id, cursor?, run_started_at? }` — หน้าเว็บเรียกต่อเองจนครบ (ล้อ Lazada)
  - ทีละสถานะ `NORMAL → UNLIST → REVIEWING → BANNED` (ไม่ขอตัวที่ร้านลบแล้ว) · หน้าละ 50 ตัว · cursor = `"ลำดับสถานะ:offset"` · ครั้งละ ~28 วิ
  - ต่อหน้า: `get_item_list` → `get_item_base_info` (50 ตัว = 1 ครั้ง) → `get_model_list` เฉพาะตัวที่มีตัวเลือก และใหม่/`update_time` เปลี่ยน (ตัวเดิมใช้ตัวเลือกที่เก็บไว้) · พร้อมกันทีละ 4 · โดน 429 รอ 1.5/3 วิ แล้วลองใหม่
  - บันทึกทุกหน้าทันทีผ่านของกลาง `upsertCatalogListings` (จับคู่รหัสตรง ไม่ทับคู่เดิม · ไม่แตะตัวที่กด "ไม่ต้องจับคู่")
  - จบครบ: ยอดรวมทุกสถานะจาก Shopee ≤ จำนวนที่บันทึกตั้งแต่เริ่มรอบ → `markMissingSince` ติดป้าย "ไม่อยู่บนร้านแล้ว" (กันพลาด: เกินครึ่งร้านไม่ติด)
  - ประวัติ: audit `platform_catalog` metadata.source = `shopee_api` · ครั้งแรกของรอบเก็บ `sample` (คำตอบจริงย่อ ไม่มีคำอธิบาย) ไว้ตรวจตัวแปลง
- สำเนาย่อ `raw.shopee` (`lib/shopee` `shopeeItemToCatalogItem`): `{ item_id, status, update_time, image, image_count, category_id, item_sku, brand, has_model, price, original_price, stock, weight, tiers[{name, options}], models[{model_id, sku, label "สี: ดำ · ขนาด: M", price, original_price, stock, image, status}] }` — **ไม่เก็บคำอธิบาย**
  - `status` ในตาราง = ตัวเล็ก (`normal` / `unlist` / `reviewing` / `banned`) · `price` = ราคาตั้งต่ำสุด · `sku_code` = รหัสสินค้าหลัก (item_sku) ก่อน แล้วรหัสตัวเลือก
- การ์ดสถานะ/รูป/สต๊อก: `summarizeShopee` ใน `lib/platform-listing-health` (NORMAL = ขายอยู่ · UNLIST/BANNED = ปิด · REVIEWING = รอตรวจ · ราคาลด = current_price ต่ำกว่าราคาตั้ง) — ตัวจากไฟล์ export (ไม่มี raw.shopee) ยัง "ไม่รู้สถานะ" เหมือนเดิม และหน้าไม่ใส่การ์ดให้
  - อ่านผ่านฟังก์ชัน DB `platform_listings_slim` คอลัมน์ `shopee` (migration `202612080100` — ลงฐานข้อมูลจริงแล้ว 2026-11-13)
- ⚠️ ยอดสต๊อกจาก Shopee เก็บไว้ดูเทียบเท่านั้น **ห้ามใช้เป็นยอดตั้งต้น**
- ยังไม่ทำ: มุมมองตัวเลือกเทียบราคาระบบ (`view=variants` ยังอ่านแค่ไฟล์ `raw.sales_info`) · ลิ้นชักสินค้า Shopee (ดูสด/แก้) · ชื่อหมวด (เก็บแค่ category_id)
- ผลดึงครั้งแรก 2026-11-14: 1,204/1,204 (ขายอยู่ 548 · ปิดขาย 656) · ตัวเลือก 7,386 · จับคู่อัตโนมัติ 751 (62%) · ตัวแปลงตรงกับคำตอบจริงทุกช่อง

## เฟส 3 — ออเดอร์ (อ่านอย่างเดียว · สถานะตามร้าน)
**เจ้าของเลือก 2026-11-14: "ไม่ต้องดึงจากเมลแล้ว — ออเดอร์จาก Shopee ตรงกว่า"**
- ทางเข้า: ตัวดึงอัตโนมัติทุก 15 นาที (ต่อท้าย `/api/cron/tiktok-orders` — pg_cron เดิม ไม่เพิ่มงานใน DB) ดึงออเดอร์ที่ **เปลี่ยนสถานะใน 3 ชม.ล่าสุด** · ปุ่ม **ดึงออเดอร์ Shopee** ในศูนย์ออเดอร์ = ย้อนหลัง 30 วัน (`POST /api/shopee/sync-orders` · Shopee ให้ถามทีละ ≤15 วัน → ไล่ช่วง + cursor ส่งจุดต่อ `next` กลับมา)
- ตัวกลาง `app/api/shopee/orders-sync.ts` (`syncShopeeOrders`): `get_order_list` (≤100/หน้า) → `get_order_detail` (≤50 · ไม่ขอที่อยู่ผู้รับ) → `shopeeOrderToPlatformOrder` (lib/shopee)
  - ใบใหม่ = หัว + รายการ (จับคู่ `model_sku` = รหัส SKU ลูก) · ใบเดิม = อัปเดตหัวตามร้าน
  - **ใบที่มาจากเมล (เลขออเดอร์เดียวกัน) → source เป็น `shopee_api`** ได้สถานะจริง (`platform_status` · `ship_by_at` · ขนส่ง · เลขพัสดุ) · `raw.email` เดิมเก็บไว้ + เพิ่ม `raw.shopee` · **รายการสินค้าเดิม (จับคู่/ยืนยันไว้จากเมล) ไม่แตะ** · ใบที่ยังไม่มีรายการ = เติมจาก Shopee
  - ใบที่ตัดสต๊อกไปแล้วใน ERP (stock_deducted) ไม่เปลี่ยนที่มา/สถานะในระบบ (อัปเดตแค่สถานะบนร้าน) — ข้อมูลจริงวันเริ่ม = 0 ใบ
  - ราคา/ชิ้น = `model_discounted_price` (หลังส่วนลดร้าน) · COD → `cod_amount` = ยอดรวม (ช่องห้ามว่าง ไม่ใช่ COD = 0)
- `lib/platform-order-status`: `SHOP_MANAGED_SOURCES` += `shopee_api` (เปลี่ยนสถานะ/ตัดสต๊อกที่ ERP ไม่ได้ · ยังนับงาน "ต้องจัดส่ง" ยกเว้น UNPAID) · `shopManagedName` ใช้ในข้อความ (TikTok/Shopee)
- **เมลหยุดบันทึกออเดอร์ Shopee** ของแบรนด์ที่เชื่อม Shopee อยู่ (`lib/platform-email/server.ts` → กล่องเมลขึ้น "ignored" พร้อมเหตุผล) · เมลคำขอคืนเงินยังนับตามเดิม · ตัดการเชื่อม Shopee = เมลกลับมาบันทึกเอง · Lazada ไม่กระทบ
- ใบจากเมลที่เก่ากว่าช่วงที่ดึง = เก็บเป็นประวัติในแท็บ "ยอดขายจากเมล" · รายงานยอดขาย (lib/platform-sales) นับทุกแหล่ง → ยอดไม่เปลี่ยน
- ประวัติ: audit `platform_orders` metadata.source = `shopee_api` (ปุ่ม: เก็บ `sample` ครั้งแรกของรอบ · อัตโนมัติ: เฉพาะรอบที่มีใบใหม่/มีปัญหา actor `shopee_orders_cron`) · ผลรอบใน recordWorkerRun "tiktok-orders" (ต่อท้าย "· Shopee ใหม่ N อัปเดต M")

## เฟส 4 — แก้สินค้าบนร้านจากลิ้นชัก (แก้ร้านจริง · ทีละขั้น · เจ้าของ "เฟส 4" 2026-11-14)
**4A (ทำแล้ว):** หน้าสินค้าบนแพลตฟอร์ม › กดสินค้า Shopee (เฉพาะที่ดึงผ่าน API — `source = "api"` · ไฟล์ export ใช้แท็บทั่วไปเหมือนเดิม)
- ลิ้นชักดึงสดตอนเปิด `GET /api/shopee/listing-detail` (get_item_base_info + get_model_list + get_item_limit แคช 6 ชม.) · ปุ่ม "ดึงตัวนี้จาก Shopee" = POST (อัปเดตสำเนาย่อ)
- **แก้ชื่อ + รายละเอียด (ข้อความ)** → ปุ่ม "บันทึกขึ้น Shopee" → ถามยืนยัน → `POST /api/shopee/listing-edit` → `v2.product.update_item` (ส่งเฉพาะช่องที่เปลี่ยน · เอกสารยืนยันว่าช่องที่ไม่ส่งคงเดิม)
  - กันทับ: ดึงสดก่อนส่ง ถ้าชื่อ/รายละเอียดบนร้านไม่ตรงกับตอนเปิดลิ้นชัก = 409 (โหลดของล่าสุดให้)
  - ช่วงความยาวตามร้าน (get_item_limit) · รายละเอียดแบบ extended (ร้าน whitelist มีรูปในรายละเอียด) = ดูอย่างเดียว
  - หลังส่ง: ดึงกลับเช็กว่าเปลี่ยนจริง → สำเนาย่อ → audit `shopee_listing_edit` (สำเร็จ/ไม่สำเร็จ)
- **เปิด/ปิดขายทั้งสินค้า** (สวิตช์หัวลิ้นชัก) → ถามยืนยัน → `POST /api/shopee/listing-display` → `v2.product.unlist_item`
  - รอตรวจ/ถูกแบน/ลบ = ทำไม่ได้ · **อยู่ในโปรโมชัน = Shopee ไม่ให้ปิดขาย** (เตือนก่อน + เหตุผลจาก `failure_list`) · audit `shopee_listing_display`
- สิทธิ์: ดู = products.platforms.view · ดึงตัวนี้ = products.platforms.edit · ส่งขึ้นร้าน = products.platforms.publish
- ไฟล์: `lib/shopee-listing-edit.ts` (pure · client-safe · 16 เทสต์) · `components/platform-catalog/shopee-listing-panels.tsx` · `app/api/shopee/listing-{detail,edit,display}` · ของใช้ร่วม `app/api/shopee/shared.ts` (loadShopeeListingLive · saveShopeeSlimCopy · refetchShopeeLive) · ลิ้นชัก `components/platform-catalog/listing-drawer.tsx` (+ `ListingDetail.source`)
- ประวัติในลิ้นชัก: `lib/line-listing-edit` listingHistoryText ("แก้บน Shopee: …" / "ปิดขายบน Shopee")
- ✅ ลองกับร้านจริงแล้ว 2026-11-14 (BCG01-03 แก้ชื่อ + เปิด/ปิดขาย) · ข้อมูลที่ดึงกลับของ Shopee ช้ากว่าคำตอบหลายวินาที–นาที → รอดู ~9 วิ แล้วแสดงตามที่สั่งไว้ก่อน (optimistic) · คำเตือนทั่วไป "size chart" ที่ Shopee ส่งมาทุกครั้งถูกซ่อน (เก็บใน audit)

**4B แก้ราคาตั้ง (ทำแล้ว · เจ้าของ "เริ่ม 4B" 2026-11-14):** แท็บ "ตัวเลือกสินค้า" ในลิ้นชัก
- คอลัมน์ "ราคาตั้ง (แก้ได้)" ต่อตัวเลือก (`original_price` · สินค้าไม่มีตัวเลือก = แถวเดียว `model_id 0`) · มีหลายตัวเลือก = ติ๊กแล้ว "ตั้งราคาเดียว" / "ปรับ ±%" ได้ (ปัดเป็นบาทเต็ม)
- กดปุ่มบันทึกเดียวกับชื่อ/รายละเอียด → ถามยืนยันรวม (ราคาเดิม→ใหม่ทุกตัว) → ส่งราคาก่อน `POST /api/shopee/listing-prices` → `v2.product.update_price` ชุดละ 50 → แล้วค่อยส่งชื่อ/รายละเอียด (ราคาล้ม = หยุด ไม่ส่งต่อ)
- กติกาก่อนส่ง (`planShopeePrices`): ห้ามว่าง/≤0 · **ไทยต้องจำนวนเต็มบาท** · อยู่ในช่วงราคาของร้าน (get_item_limit `price_limit`) · **เปลี่ยน ≥80% (เหลือ ≤20% หรือ ≥5 เท่า) = บล็อก** กันพิมพ์ผิด · ลดเกินครึ่ง/ขึ้นเกิน 2 เท่า = เตือน
- **ราคาที่ลูกค้าจ่ายจริงมาจากโปรโมชัน** (current_price) แก้ตรงนี้ไม่ได้ · ตัวเลือกที่ติดโปรโมชันมีป้าย "โปร" — Shopee มักไม่ยอมให้เปลี่ยนราคา → ตอบไม่ผ่านรายตัวใน `failure_list` (ตัวอื่นยังผ่าน · แสดงเหตุผลรายตัว)
- กันทับ: ดึงสดก่อนส่ง ราคาบนร้านไม่ตรงกับตอนเปิดลิ้นชัก = 409 · หลังส่ง: รอดูราคาใหม่ ~9 วิ ไม่ทัน = แสดงตามที่ส่งสำเร็จ · audit `shopee_listing_prices` (ราคาเดิม→ใหม่รายตัว + ตัวที่ไม่ผ่าน + partial)
- ✅ ลองกับร้านจริงแล้ว (BCG01-03 สินค้าไม่มีตัวเลือก): รอบแรก 2026-11-14 ขึ้นว่า "ไม่สำเร็จ" ผิด ๆ เพราะ Shopee ตอบ `success_list: [{ original_price }]` **ไม่มี model_id** (ราคาเปลี่ยนจริง) → แก้ 81ec0625: สินค้าไม่มีตัวเลือกดูแค่ว่ามีรายการผ่าน/ไม่ผ่าน · ตัวที่ Shopee ไม่บอกผลรายตัว = "รอยืนยัน" แล้วดึงราคาจริงกลับมาตัดสิน · เก็บคำตอบดิบใน audit `shopee_responses` · รอบสอง 2026-11-15 ผ่าน (1,251→1,252→1,250 · ดึงกลับเห็นราคาใหม่ทันที) · **สินค้ามีหลายตัวเลือกยังไม่ได้ลองจริง**
- ไฟล์: `lib/shopee.ts` shopeeUpdatePrice · `lib/shopee-listing-edit.ts` (planShopeePrices · shopeePriceBatches · shopeePriceResult · applyShopeeBulkPrice) · `app/api/shopee/listing-prices/route.ts` · `ShopeeOptionsPanel` + `ShopeeBulkPrice` ใน shopee-listing-panels

**4C แก้รูปสินค้า (ทำแล้ว · เจ้าของ "เริ่ม 4C" 2026-11-15):** แท็บ "รูป" ในลิ้นชัก — แบบเดียวกับ TikTok (ของกลาง `./listing-images`: ListingImageGrid + ListingImagePicker + useSystemImages)
- ลากเรียง · รูปแรก = ปก · ลบ · เพิ่มจากคลังรูปในระบบ (ต้องจับคู่ Parent SKU ก่อน) · จำนวนสูงสุดตามร้าน (get_item_limit `item_image_count_limit` · ไม่รู้ = 9)
- กดปุ่มบันทึกเดียวกับชื่อ/รายละเอียด → ถามยืนยัน (รูป 5 → 6 รูป · ใหม่/เอาออก/เปลี่ยนปก) → ส่งพร้อมชื่อใน `POST /api/shopee/listing-edit` ช่อง `images: { before_ids, refs }` (ราคายังส่งก่อนตามเดิม)
- ref ที่ส่ง: `spi:<image_id>` = รูปเดิมบนร้าน (ไม่ต้องฝากซ้ำ) · `r2:<key>` = รูปใหม่ → API ทำเป็น JPG พื้นขาว 1500px (`/api/r2-image&sq=1` · สินค้าแนวตั้ง 3:4 ใช้ `&pad=34`) → `v2.media_space.upload_image` (Public API: เซ็นแค่ partner ไม่ใช้กุญแจร้าน · JPG/PNG ≤10MB · scene normal) ได้ `image_id` — **ฝากไม่ผ่าน = หยุด ไม่แก้สินค้า**
- แล้ว `v2.product.update_item` ครั้งเดียว: `image: { image_id_list (ทั้งชุด · แทนของเดิม), image_ratio "3:4" เฉพาะสินค้าที่เป็น 3:4 }` + ชื่อ/รายละเอียดถ้าแก้
- กันทับ: รหัสรูปบนร้านไม่ตรงกับตอนเปิดลิ้นชัก = 409 · หลังส่ง: รอดู ~9 วิ (รูปเดิมต้องอยู่ตำแหน่งเดิม + จำนวนเท่ากัน · รูปใหม่ไม่บังคับรหัสตรง) ไม่ทัน = แสดงตามที่ส่ง · audit `shopee_listing_edit` (changes ป้าย "รูปสินค้า" + uploaded + sent_ids + ids_after)
- ไฟล์: `lib/shopee.ts` shopeeUploadImage / shopeeUploadImageOf · `lib/shopee-listing-edit.ts` (shopeeRefsForSend · planShopeeImages · view.imageIds/imageRatio) · `app/api/shopee/shared.ts` shopeeUploadRef · `app/api/shopee/listing-edit/route.ts` · `ShopeeImagesPanel`
- ✅ ลองจริง 2026-11-15 BCG01-03 สลับรูป 1↔2 (เปลี่ยนปก): ผ่าน · ดึงกลับเห็นลำดับใหม่ทันที (ids_after = sent_ids · ไม่ต้อง optimistic) · ⚠️ คำตอบของ update_item (shopee_response.images) ยังเป็น**ลำดับเดิม**ก่อนแก้ — ห้ามใช้คำตอบนั้นตัดสินว่ารูปเปลี่ยนไหม ใช้ผลดึงกลับเท่านั้น
- ✅ ลองจริง 2026-11-15 BPU02-01 เพิ่มรูปใหม่จากระบบ 1 รูป (6 → 7): ผ่าน · ฝากรูปได้ image_id ขึ้นต้น `sg-11134201-…` (คลังกลางของ Shopee — ใช้กับร้านไทยได้) · **Shopee เก็บ image_id ที่ฝากไว้ตามเดิม** (ids_after = sent_ids) · ดึงกลับเห็นทันที · ลิงก์ `cf.shopee.co.th/file/<id>` เปิดได้ (JPG) → **เฟส 4 ใช้ได้ครบกับร้านจริง (ชื่อ/รายละเอียด/เปิด-ปิดขาย/ราคา/รูป)**

**ถัดไป (ยังไม่ทำ):** รูปของตัวเลือก (tier_variation image) · **สต๊อกไม่แก้** ตราบที่ BigSeller ยังซิงค์

## เฟส 5 — ลงสินค้าใหม่บน Shopee จากระบบ (เจ้าของอนุมัติแผน + "เริ่ม 5A" 2026-11-15)
แผน: **5A** ดูก่อนส่ง + บันทึกร่าง (ไม่แตะร้าน) → **5B** ลงจริง 1 ตัว (เจ้าของกด) → **5C** หลายตัว / คัดลอกจาก Lazada-TikTok
**กติกาตายตัว: ลงแบบ "ปิดขาย" (UNLIST) + สต๊อก 0 เสมอ** — BigSeller ยังคุมสต๊อก · เจ้าของตรวจในลิ้นชัก (แก้ได้จากเฟส 4) แล้วค่อยเปิดขาย/ใส่สต๊อก

**5A (ทำแล้ว):** ตัวช่วย "ลงทุกร้าน" มีแท็บ Shopee — `ShopeeCreatePreviewEditor` (components/platform-listing/shopee-create-preview.tsx) ← `GET /api/shopee/create-product?parent_sku_id=`
- ทะเบียน `lib/platform-create-registry` แถว shopee · `SHOPEE_CREATE_LIVE = false` (POST ตอบ 403) · ตัวประกอบ pure `lib/shopee-create-plan.ts` (เทสต์ 12) · ตัวโหลด `app/api/shopee/create-product/load.ts`
- แก้ในหน้าดูก่อนส่ง = เขียนร่าง (PATCH /api/product-platforms): ชื่อ/รายละเอียด/หมวด → ร่าง · `extra.shopee_images` · `extra.shopee_weight` · `extra.shopee_attrs`
- **หมวด** (เจ้าของตั้งหมวดกลางแค่ 7/967 รุ่น LM → ต้องมีตัวช่วย): ร่าง → หมวดกลาง → `v2.product.category_recommend` (ชื่อสินค้า · 3 อันดับ) → หมวดที่สินค้าประเภทเดียวกัน (หมวดสินค้าในระบบ) บนร้านใช้มากสุด · 2 อย่างหลัง = "เดา" → เตือนให้ตรวจ + ปุ่มหมวดอื่นที่น่าจะใช่ + ตัวเลือกหมวดเต็ม (platform_category_options 1,556)
- **สินค้าแบบ** = สินค้าที่ขายอยู่บนร้าน แบรนด์เดียวกัน (raw.shopee.brand ขึ้นต้นด้วยชื่อแบรนด์ในระบบ · หมวดเดียวกันก่อน) → `get_item_base_info` → แบรนด์ (brand_id เช่น LM = 1125513) · ขนส่ง (logistic_info ที่เปิด) · วันส่ง · ค่าช่องบังคับ (เฉพาะหมวดเดียวกัน · เตือนให้ตรวจ) · ไม่มีแบบ = ไม่มีแบรนด์ + ลงไม่ได้ (ไม่รู้ขนส่ง)
- `get_item_limit?category_id` = ช่วงชื่อ/รายละเอียด/รูป/ราคา + ชื่อชั้น/ตัวเลือก + วันส่ง (non_pre_order_days_to_ship) + กล่องบังคับไหม · `get_attribute_tree` (language th) → ช่องแบบเดียวกับ TikTok (ใช้ LazadaAttrField + ttsAttrDef ร่วม)
- ราคาตั้ง = ราคาเต็ม → ราคาขาย (จำนวนเต็มบาท) · ตัวเลือก ≤2 ชั้น ≤50 ตัว (สี / ตัวเลือก / รหัส) · รูปตัวเลือก = ปกตัวสี (ครบทุกสีเท่านั้น)
- payload = `{ add_item, tier }` (รูปยังเป็น ref) · `tier` = standardise_tier_variation (variation_id 0 = ชื่อกำหนดเอง · tier_variation แบบเก่าเลิกใช้ 2025-09-12) + model[{tier_index, original_price, model_sku, seller_stock 0}]
- ข้อมูลจริงตอนทำ: LM ยังไม่มีบน Shopee 309 รุ่น · มีน้ำหนัก 228 (81 ต้องใส่ก่อน) · มีราคา 236 · พร้อมครบ (ราคา+น้ำหนัก+รูป) 166 · ไม่มีขนาดกล่องเลย (Shopee บังคับเฉพาะบางหมวด)
- ✅ เจ้าของลองจริง 2026-11-15 (MGW318): หน้าดูก่อนส่งโหลดได้ (vercel logs 200) · แก้ชื่อลงร่างผ่าน (ชื่อในระบบซ้ำ 2 รอบ)
  - 🐛 "กดแล้วเด้งกลับ" = แท็บแพลตฟอร์มของ Parent SKU ถอดตัวช่วยตอนโหลดซ้ำ → แก้ 5674bc67 (ไม่ใช่ปัญหา Shopee)
  - 🐛 ตัวตรวจความครบของตัวช่วยใช้ชุดทั่วไป (บังคับ "SKU ทุกตัวมีรูป" + หมวดในร่าง) ไม่ตรงกับหน้าดูก่อนส่ง → แก้ e603acc8: `SHOPEE` spec ใน lib/platform-required-fields (ตรง add_item · รูปตัวเลือกไม่บังคับ) + draftImageCount นับ extra.shopee_images + **หมวดที่ระบบเดา = ต้องกด "ใช้หมวดนี้" (บันทึกลงร่าง) ก่อนลง**

**5B (ทำแล้ว · เจ้าของ "เริ่ม 5B" 2026-11-15 · `SHOPEE_CREATE_LIVE = true`):** ตัวช่วยขั้น 1 เลือก Shopee "ลงบนร้านจริง" → ขั้น 3 กดลง → `POST /api/shopee/create-product`
- ตรวจ (preview.missing ต้องว่าง · blockers · กันซ้ำ on_shop) → ล็อก 3 นาที (ร่าง last_sync_status creating · platform_product_id ต้องว่าง)
- ฝากรูปสินค้า (บังคับ · ไม่ผ่าน = หยุด ไม่สร้าง) → รูปตัวเลือก (ไม่บังคับ · ไม่ครบ = ตัดรูปตัวเลือกทั้งชุด) → `shopeeCreateResolve` (ref → image_id)
- `shopeeAddItem` (ไม่ลองซ้ำ — กันสร้างซ้ำ) → เก็บ platform_product_id ในร่างทันที → มีตัวเลือก: รอ 6 วิ → `shopeeInitTierVariation` (ลอง 3 ครั้ง ห่าง 5 วิ)
- ดึงกลับ (รอจนเห็นตัวเลือกครบ) → upsertCatalogListings + จับคู่ Parent SKU → audit `shopee_create` (item_id · steps · คำตอบดิบ add_item/tier)
- ตัวเลือกไม่ผ่าน = สินค้ายังปิดขาย · ร่าง `tier_failed` + ข้อความให้เพิ่มตัวเลือกใน Seller Centre หรือลบแล้วลงใหม่ (ระบบไม่สร้างซ้ำอัตโนมัติ)
- ✅ **ลองจริง 2026-11-15 ผ่าน (MGW318 → #40736773011):** ฝากรูป 6/6 → add_item → รอ 6 วิ → init_tier_variation (สี 2 · ดำ/เงิน 390 · น้ำตาล/เงิน 409 · สต๊อก 0) → ดึงกลับเห็นตัวเลือกทันที → จับคู่ MGW318 · ร่าง created_unlisted
  - รอบแรกไม่ผ่าน 3 ครั้ง (ไม่ได้สร้าง): Shopee "The number of product images must be between 3 and 9" — ร่างมีแค่ปก 2 รูป → แก้ 64a29d00 เติมจากแกลเลอรี + บังคับ ≥ 3 (`SHOPEE_MIN_IMAGES`)
  - ไม่ต้องใส่ `location_id` (ร้านนี้คลังเดียว) · แบรนด์จากสินค้าแบบ (Louis Montini · 1125513) ผ่าน · คำเตือน size chart ทั่วไปมาเหมือนเดิม (ซ่อน)
  - ตัวเลือกไม่มีรูป (MGW318-02 ไม่มีปกในระบบ) → ไม่ใส่รูปตัวเลือกตามกติกา

**5C ลงหลายตัว (เจ้าของ "เริ่ม 5C" 2026-11-15):** ตัวช่วยลงหลายตัวได้อยู่แล้ว (ขั้น 3 ลงต่อกันทีละตัว · ~20–30 วิ/ตัว · เกิน 20 ตัวต้องพิมพ์ "ยืนยัน") — ส่วนที่ติดคือต้องยืนยันหมวดทีละตัว
- แท็บ Shopee ของตัวช่วยมีปุ่ม **"ยืนยันหมวด Shopee ทีละหลายตัว"** → `ShopeeBulkCategoryDialog` (components/platform-listing/shopee-bulk-category.tsx) ← `GET /api/shopee/create-product/categories?parent_sku_ids=` (≤50/ครั้ง · ป๊อปโหลดเป็นชุดเอง)
- ตัวคิดหมวดตัวเดียวกับหน้าดูก่อนส่ง = `shopeeCategoryCandidates` ใน ../load (แยกออกมาใช้ร่วม · ห้ามเขียนตัวเดาที่ 2) · กุญแจร้านถามครั้งเดียวต่อแบรนด์ · ยิง Shopee พร้อมกัน 4 ตัว
- ตาราง: หมวดที่แนะนำ + เหตุผล · เปลี่ยนรายแถว (เลือกจากผู้สมัคร / ค้นหมวดเอง) · "ใช้หมวดเดียวกันกับตัวที่ติ๊ก" · ติ๊กให้เฉพาะตัวที่ยังไม่ยืนยันและยังไม่มีบนร้าน
- บันทึก = PATCH /api/product-platforms { category_path } ทีละตัว (พร้อมกัน 3) → หน้าดูก่อนส่งโหลดใหม่ + ตรวจความครบใหม่ · ไม่ส่งอะไรขึ้นร้าน
**หน้าดูก่อนส่งรอบ 2 (เจ้าของขอ 2026-11-15 ผ่าน session หลัก):**
- **ขนส่งติ๊กได้:** รายการ = ขนส่งของสินค้าแบบ (ชื่อ + ค่าส่งโดยประมาณ `estimated_shipping_fee`) รวมกับขนส่งของร้าน (`v2.logistics.get_channel_list` · แคช 10 นาที · ร้านปิด/ช่องลูก mask = ไม่โชว์) — `shopeeChannelsOf` + `shopeeLogisticOptions`
  - ค่าเริ่ม = ที่สินค้าแบบเปิด **ยกเว้นขนส่งของใหญ่ (Bulky) ปิดไว้จนกว่าเลือกเอง** · ร้านบังคับเปิด = ปิดไม่ได้ · ต้องเลือกขนาด/ตั้งค่าส่งเอง/หนักเกิน = เปิดไม่ได้ (บอกเหตุผล)
  - เลือกเองเก็บร่าง `extra.shopee_logistics = [logistic_id]` → `logistic_info` · ปิดหมด = ลงไม่ได้
- **ช่องของหมวดบอกที่มา:** ร่าง (บันทึกไว้) / สินค้าบนร้านหมวดเดียวกัน (เติมเฉพาะช่องบังคับที่ร่างยังไม่มี · ตรวจก่อน) / แนะนำจากข้อความ / AI เดา — `preview.attrs.sources` · ข้อมูล SKU ในระบบ (`attribute_values`) มีแค่รหัส Odoo ไม่มีค่าอย่างวัสดุ จึงยังเติมจากข้อมูลสินค้าไม่ได้
- **ปุ่มแนะนำ (ของกลาง `components/platform-catalog/attr-suggest-box` · ลงทะเบียนแล้ว):** "แนะนำจากชื่อ/รายละเอียด (ฟรี)" = lib/attr-suggest · "ให้ AI ช่วยเติม" = `POST /api/ai/attr-fill` (ของกลางทุกร้าน · สิทธิ์ ai.caption · ด่านกลาง aiChat **"ai.attr_fill"** ลงทะเบียนในศูนย์ AI ที่เสียเงินแล้ว · ส่งชื่อ + รายละเอียด + รูป ≤ 3) · กติกา pure `lib/attr-ai-fill` (เทสต์) — เติมเฉพาะช่องที่ว่าง · ป้าย "AI เดา · ตรวจก่อน" · คนกดใส่ + บันทึกเอง
- **ตารางขนาด (ยังไม่ทำ · รอบถัดไป):** Shopee เปิดให้ — `v2.product.get_size_chart_list` (category_id · ร้านในประเทศเท่านั้น) + `get_size_chart_detail` (ชื่อ + ตาราง) → `add_item.size_chart_info { size_chart_id }` หรือรูป `{ size_chart: image_id }` (ฝากผ่าน media_space) · สร้างแม่แบบผ่าน API ไม่ได้ · แผน = ปรับ `TiktokSizeChartBox` ให้ใช้ร่วม (แม่แบบ/รูป) แทนการสร้างตัวที่ 2

**หน้าดูก่อนส่งรอบ LY22 (เจ้าของทดสอบ LY22 แล้วเลือกข้อ 1,2,3,4,5,6,8,9,10,11 · 2026-11-20):**
- **ค่าเริ่มต้นของร้าน (ข้อ 1):** ป๊อป "ค่าเริ่มต้นของร้าน" (ของกลาง `AttrDefaultsDialog` · ลงทะเบียนแล้ว) — กติกา "ชื่อช่อง → ค่า" ต่อร้าน×แบรนด์ เก็บ `ui_config` key `listing_attr_defaults_shopee_<brandId>` → `{ rules }` (PATCH /api/ui-config · products.edit · audit setting_change) · ยังไม่ตั้ง = ค่าของระบบ `DEFAULT_ATTR_RULES` (ประเทศ* = ไทย · สภาพ = ใหม่ · ประเภทการประกัน = ประกันจากผู้ผลิต · ระยะเวลารับประกัน = จากสินค้า · ขนาด = จากสินค้า) · กติกา pure `lib/listing-attr-defaults` (เทสต์)
- **ค่าจากข้อมูลสินค้า (ข้อ 2):** ขนาด = `size_length_cm × size_thickness_cm × size_height_cm` ("20 x 9 x 16.5 ซม.") · ระยะรับประกัน = `parent_skus_v2.warranty` · น้ำหนัก (ถ้าตั้งกติกา) — เติมเฉพาะช่องที่ร่างยังว่าง (ทุกช่อง ไม่ใช่แค่บังคับ) · ช่องเลือกอย่างเดียวที่ค่าไม่ตรงตัวเลือก = เว้นว่าง · ที่มา `sources`: draft / default / product / template
- **ค้นได้ทุก dropdown (ข้อ 3):** `LazadaAttrField` (ของกลาง Shopee/TikTok/Lazada) — เลือก 1 ค่า = SearchableSelect ทุกช่อง (เดิมเฉพาะ > 12 ตัวเลือก) + ล้างค่าได้ · ช่องพิมพ์เองได้ (enumInput) = ค้น หรือ "ใช้ค่าที่พิมพ์"
- **ตารางตัวเลือก (ข้อ 4/5/6/9):** ราคาแก้ต่อแถว → `extra.shopee_prices { sku_id: บาท }` · ชื่อสีเริ่มจาก `skus_v2.color_platform_th` ("ดำ (01)") เลือก/พิมพ์ใหม่ → `extra.shopee_option_names { sku_id: ชื่อ }` · รูปประจำสี → `extra.shopee_option_images { ชื่อสี: ref }` (ใช้ทุกแถวสีเดียวกัน) · สต๊อกล็อก 0 · ปุ่มย้อนต่อช่อง + "กลับไปใช้ค่าจากระบบทั้งหมด" · ไม่เขียนกลับระบบ (ข้อ 12 เจ้าของไม่เลือก) · PC ตาราง / มือถือ การ์ด
- **รูปเล็ก + ชี้ดูรูปใหญ่ (ข้อ 8):** `ListingImageGrid` (ของกลางทุกร้าน) ช่อง ~88px เต็มแถวอัตโนมัติ + `HoverPreview` · ปุ่มตั้งปก/ลบเป็นไอคอน
- **รายละเอียดเต็ม (ข้อ 10):** โชว์ทั้งหมด กด "ดูทั้งหมด/ย่อ"
- **รูปในรายละเอียด (ข้อ 11):** Shopee เปิดให้เฉพาะร้านที่ได้สิทธิ์ (`description_type = extended`) · หน้าดูก่อนส่งบอกจากสินค้าแบบ (`preview.description.imagesAllowed`) · สำเนาย่อเก็บ `raw.shopee.desc_type` แล้ว (เต็มหลังดึงสินค้ารอบถัดไป) → เช็กทั้งร้านได้ · ถ้าได้สิทธิ์ค่อยทำปุ่มเลือก/เรียงรูปลงรายละเอียด (`description_info.extended_description`)
- บันทึกลงร่างทุกปุ่ม → แจ้งผลมีปุ่ม "ย้อนกลับ" (คืนร่างก่อนหน้า)
- **รายละเอียดจาก Parent SKU (แก้ 2026-11-20):** ใช้ Platform Description สด (คอลัมน์เป็นค่าเก่า) ผ่าน `pickListingDescription` ตัวเดียวกับ Lazada · หน้า Shopee บอกจำนวนรูป Description ของ Parent (ส่งไม่ได้จนกว่าร้านได้สิทธิ์) — รายละเอียดดู docs/lazada-connector.md
- **รอบ Lazada ตามมา (2026-11-20):** ตารางตัวเลือกย้ายเป็นของกลาง `listing-variant-table` · รายละเอียดใช้กล่องกลาง `listing-description-box` แบบ B (ตัวเดียวกับ Lazada) · สินค้าไม่มีรับประกัน → ประเภทการประกัน = ไม่มีการรับประกัน อัตโนมัติ

- ข้อมูลจริงตอนทำ: LM ยังไม่มีบน Shopee — เข็มขัด 117 (พร้อม 98 · หมวด 100032 ชัด) · เสื้อผ้า 53 (36) · เครื่องประดับ 30 (28) · กระเป๋า 42 (10) · คัดลอกจาก TikTok/Lazada เลื่อนไป (ข้อมูลในระบบครบอยู่แล้วเกือบทั้งหมด)

## ⚠️ วันที่เปลี่ยนโดเมนเว็บ
ลิงก์อนุญาต/ยกเลิกสิทธิ์ต้องพากลับโดเมนที่ลงทะเบียนไว้ — ร้านที่เชื่อมแล้ว**ไม่หลุด** (ดึงข้อมูล/ต่ออายุไม่ผ่านช่องนี้) แต่**กดเชื่อมใหม่จะ error** ถ้าไม่แก้ วันที่เปลี่ยน `NEXT_PUBLIC_APP_URL` ต้องแก้พร้อมกันครบ 3 เจ้า:
- Shopee Open Platform › App List › แอป › Edit › Test + Live Redirect URL Domain
- Lazada Open Platform › App › Callback URL (`/api/lazada/callback`)
- TikTok Shop Partner Center › App › Redirect URL (`/api/tiktok-shop/callback`)

## ห้ามทำ / ข้อจำกัด
- **ห้ามส่งสต๊อกขึ้น Shopee** ตราบที่ BigSeller ยังซิงค์สต๊อกร้านนี้อยู่ (ส่ง 2 ทาง = ทับกันไปมา)
- ทุกคำสั่งที่เขียนขึ้นร้านจริง (เฟส 4) ต้องให้เจ้าของอนุมัติทีละครั้ง + ลงประวัติ
- ออเดอร์ Shopee ของ Louis Montini เดิมเข้าทางอีเมล (`source = 'email'` · เลขออเดอร์ = order_sn ตัวเดียวกับ API · unique `(platform_id, external_order_id)`) → เฟส 3 ตัดสินแล้ว: API ทับใบเดิม (ดูหัวข้อเฟส 3)
- ฟังก์ชันฐานข้อมูล `platform_listings_slim` มีคอลัมน์ `shopee` แล้ว (202612080100) · แก้ครั้งหน้า ก๊อปตัวฟังก์ชันจาก `pg_get_functiondef` ของจริงเท่านั้น
- PII ปิดอยู่ → ชื่อ/เบอร์/ที่อยู่ผู้ซื้อถูกปิดบัง (ระบบไม่เก็บอยู่แล้ว) · ถ้าจะพิมพ์ใบปะหน้า/ใบกำกับจากระบบต้องเปิดใน Shopee (อาจถูกตรวจใหม่)
- ยังไม่ทำ: ลิงก์ยกเลิกสิทธิ์ฝั่ง Shopee (`/api/v2/shop/cancel_auth_partner`) — ตอนนี้ตัดการเชื่อมแค่ฝั่งระบบ

## เปิดขายทันทีหลังลง (เจ้าของเลือก 2026-11-21 · แบบ A + ข้อ 1-4)

- ขั้น 3 "ยืนยัน" ของตัวช่วยลงสินค้า: ทุกร้านที่ลงขายจริงได้ (LINE · Shopee · Lazada) มีตัวเลือก **หลังลงร้านเสร็จ: ปิดไว้ก่อน / เปิดขายทันที** ต่อร้าน (เดิมมีแค่ LINE)
  - Lazada ยังไม่เปิดลงจริง → เลือกเก็บไว้ได้ ใช้เมื่อเปิด · TikTok ลงเป็นร่างเสมอ (ไม่มีตัวเลือก)
- ข้อ 1 จำค่าล่าสุดต่อร้าน ต่อคน (`useUserPref` key `platform_add_after_display`)
- ข้อ 2 Shopee เลือกเปิดขาย → เตือน "สต๊อกยัง 0 ลูกค้าเห็นสินค้าหมดจนกว่า BigSeller ส่งสต๊อก" (ระบบไม่ส่งสต๊อกเอง)
- ข้อ 3 ผลการลง: ปุ่ม "เปิดในหลังร้าน" ทุกร้าน (`listingLinks` ใน lib/platform-links · LINE/TikTok ไม่มีลิงก์ตรง = บอกให้ค้นรหัส)
- ข้อ 4 เปิดขายทันทีเกิน 5 ตัว (`ADD_ONSALE_TYPED_OVER`) ต้องพิมพ์ "ยืนยัน"
- Shopee POST `display: "onsale"` = สร้างแบบปิดขายเหมือนเดิม → `unlist_item unlist=false` ต่อทันที · ไม่ผ่าน = ยังปิดขาย (ขั้น "เปิดขาย" เป็น skip + เหตุผล ไม่นับว่าลงไม่สำเร็จ) · ตัวเลือกพัง = ไม่เปิดขาย
