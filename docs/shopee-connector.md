# ตัวเชื่อม Shopee Open Platform (ร้าน Louis Montini)

> สถานะ 2026-11-14: **เฟส 1 = เชื่อมร้าน** (8234e37d) · **เฟส 2 = ดึงสินค้า อ่านอย่างเดียว** (efe2e02a) — ยังไม่แก้อะไรบนร้าน
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

## ⚠️ วันที่เปลี่ยนโดเมนเว็บ
ลิงก์อนุญาต/ยกเลิกสิทธิ์ต้องพากลับโดเมนที่ลงทะเบียนไว้ — ร้านที่เชื่อมแล้ว**ไม่หลุด** (ดึงข้อมูล/ต่ออายุไม่ผ่านช่องนี้) แต่**กดเชื่อมใหม่จะ error** ถ้าไม่แก้ วันที่เปลี่ยน `NEXT_PUBLIC_APP_URL` ต้องแก้พร้อมกันครบ 3 เจ้า:
- Shopee Open Platform › App List › แอป › Edit › Test + Live Redirect URL Domain
- Lazada Open Platform › App › Callback URL (`/api/lazada/callback`)
- TikTok Shop Partner Center › App › Redirect URL (`/api/tiktok-shop/callback`)

## ห้ามทำ / ข้อจำกัด
- **ห้ามส่งสต๊อกขึ้น Shopee** ตราบที่ BigSeller ยังซิงค์สต๊อกร้านนี้อยู่ (ส่ง 2 ทาง = ทับกันไปมา)
- ทุกคำสั่งที่เขียนขึ้นร้านจริง (เฟส 4) ต้องให้เจ้าของอนุมัติทีละครั้ง + ลงประวัติ
- ⚠️ ออเดอร์ Shopee ของ Louis Montini **เข้าทางอีเมลอยู่แล้ว** (`platform_orders.source = 'email'` · เลขออเดอร์ = order_sn ตัวเดียวกับ API · unique `(platform_id, external_order_id)`) → เฟส 3 ต้องตัดสินกับเจ้าของก่อนว่าออเดอร์จาก API ทับแถวจากอีเมลแบบไหน
- ⚠️ เฟส 2: ฟังก์ชันฐานข้อมูล `platform_listings_slim` ยังไม่มีคอลัมน์ `shopee` (มี `tiktok` แล้ว) → ต้องขออนุญาตปรับฐานข้อมูล 1 จุด · ก๊อปตัวฟังก์ชันจาก `pg_get_functiondef` ของจริงเท่านั้น
- PII ปิดอยู่ → ชื่อ/เบอร์/ที่อยู่ผู้ซื้อถูกปิดบัง (ระบบไม่เก็บอยู่แล้ว) · ถ้าจะพิมพ์ใบปะหน้า/ใบกำกับจากระบบต้องเปิดใน Shopee (อาจถูกตรวจใหม่)
- ยังไม่ทำ: ลิงก์ยกเลิกสิทธิ์ฝั่ง Shopee (`/api/v2/shop/cancel_auth_partner`) — ตอนนี้ตัดการเชื่อมแค่ฝั่งระบบ
