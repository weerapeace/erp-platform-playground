# ตัวเชื่อม TikTok Shop (ร้านของเราเอง)

> สถานะ 2026-11-12: เชื่อมร้าน Louis Montini แล้ว (แอป "Louis Montini ERP" · shop THLCLMWWSC) · **ขั้น 2 = ดึงสินค้าเข้าหน้าสินค้าบนแพลตฟอร์ม (อ่านอย่างเดียว)** · ยังไม่แก้อะไรบนร้าน
> ร้านเดียวผูกได้แบรนด์เดียว (callback บล็อก open_id ซ้ำ) · ชื่อร้านไม่ตรงแบรนด์ = เตือนแดง

## ใช้ทำอะไร
- ให้ ERP คุยกับร้าน TikTok Shop ผ่าน Open API ทางการ (แอปแบบ Seller Developer / Custom App: 1 แอป = 1 ร้าน)
- แบบเดียวกับตัวเชื่อม Lazada (`docs/lazada-connector.md`) — เก็บกุญแจใน `platform_credentials` (แบรนด์ × `tiktok`) เข้ารหัสด้วย `PLATFORM_SECRET_KEY`

## ส่วนประกอบ
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/tiktok-shop.ts` | เซ็นคำขอ (HMAC-SHA256) · ขอ/ต่ออายุกุญแจ · `ttsApi()` เรียก API · `ttsGetAuthorizedShops()` · ข้อความ error ภาษาคน |
| `app/api/tiktok-shop/shared.ts` | อ่าน/เก็บการเชื่อมต่อ · `ttsTokenOrReason()` (ต่ออายุเองเมื่อเหลือ < 1 ชม.) · ใช้ state/baseUrl/getPlatformId ตัวเดียวกับ Lazada |
| `/api/tiktok-shop/oauth/start` | คืนลิงก์อนุญาต (guard `products.platforms.manage_accounts`) |
| `/api/tiktok-shop/callback` | TikTok เรียกกลับ → แลกกุญแจ → ดึงรายชื่อร้าน (shop cipher) → เก็บ + audit |
| `/api/tiktok-shop/status` | สถานะ (ไม่คืนกุญแจ/cipher) · `&check=1` = ลองกับ TikTok จริง |
| `/api/tiktok-shop/disconnect` | ลบกุญแจ + audit |
| หน้า `/admin/platform-accounts` › TikTok | ปุ่มเชื่อมต่อ / ตรวจการเชื่อมต่อ / ตัดการเชื่อมต่อ |
| `/api/tiktok-shop/sync-products` | ดึงสินค้าทั้งร้าน (`/product/202502/products/search` status=ALL ทีละ 50 · `page_token`) + รายละเอียดเฉพาะตัวใหม่/แก้ไข (`/product/202309/products/{id}` → รูปแรก/หมวด/ชื่อตัวเลือก) → `upsertCatalogListings` · จบครบ = ติดป้ายตัวที่ร้านลบ · audit `tiktok_api` (ครั้งแรกเก็บตัวอย่างคำตอบ `sample`) |
| หน้า `/master/platform-catalog` › TikTok › ตั้งค่า | ปุ่ม "ดึงสินค้าจาก TikTok" (เรียกต่อเองจนครบ · ค้างแล้วกดอีกครั้ง = ต่อจากหน้าที่ค้าง ภายใน 25 นาที) |
| `raw.tiktok` | ข้อมูลย่อ `{ id, title, status, skus[{ id, seller_sku, price, stock, status, label }], image, category, update_time }` — ไม่เก็บคำบรรยาย · สรุปสถานะด้วย `summarizeListing("tiktok")` · อ่านผ่านฟังก์ชัน DB `platform_listings_slim` (คอลัมน์ `tiktok` — migration 202612040300 ลงฐานข้อมูลจริงแล้ว 2026-11-12) |

## ค่าตั้ง (Vercel env — เจ้าของใส่เองแล้ว 2026-11-11)
`TIKTOK_SHOP_APP_KEY` · `TIKTOK_SHOP_APP_SECRET` · `TIKTOK_SHOP_SERVICE_ID` (= ตัวเลข "ID:" ใต้ชื่อแอปใน Partner Center)
Redirect URL ในแอป: `https://erp-platform-playground.vercel.app/api/tiktok-shop/callback`

## กติกาจากเอกสารทางการ (partner.tiktokshop.com)
- sign = HMAC-SHA256(app_secret, `secret + path + เรียง query {key}{value} (ไม่รวม sign, access_token) + body + secret`) → hex
- API 202309+: กุญแจอยู่ใน header `x-tts-access-token` (ไม่นำไปเซ็น) · `timestamp` วินาที 10 หลัก (ช่วง −5 นาที … +30 วิ)
- โฮสต์ API `https://open-api.tiktokglobalshop.com` · ขอกุญแจ `https://auth.tiktok-shops.com/api/v2/token/get` (`grant_type=authorized_code`)
- access_token ~7 วัน · refresh_token อายุเท่าที่ร้านเลือกตอนอนุญาต · ค่า `*_expire_in` = เวลาหมดอายุ (unix วินาที) — `ttsExpiryMs` รับได้ทุกแบบกันเอกสารไม่ตรง
- คำสั่งระดับร้าน (สินค้า/ออเดอร์) ต้องส่ง `shop_cipher` จาก `/authorization/202309/shops`
- แอปที่ยังเป็น **ฉบับร่าง** ร้านจริงกดอนุญาตไม่ได้ → ต้องผ่าน "การตรวจสอบการลงทะเบียนพาร์ทเนอร์" แล้วกด **เผยแพร่** ก่อน (ทดสอบก่อนได้ด้วย Development Shop ใน Partner Center)
- ร้านยกเลิกสิทธิ์เองได้ที่ Seller Center › App Store › My apps
- **สิทธิ์ต้องเปิดที่ "ตัวแอป" ด้วย** (เจอจริง 2026-11-12): กุญแจของร้านได้ `granted_scopes` ครบ 132 ตัว แต่แอปยังไม่ได้เปิดสิทธิ์ → ทุกคำสั่งตอบ `105005 Access denied ... access scope` → เปิดที่ Partner Center › App & Service › แอป › จัดการ API → กด "เผยแพร่การเปลี่ยนแปลง" → ตัดการเชื่อมต่อแล้วเชื่อมใหม่ (ได้กุญแจใหม่)
  - ใช้ตอนนี้: Shop Authorized Information (`seller.authorization.info`) · ขั้นอ่านถัดไป: Product Basic · Order Information · Logistics Basic (+Finance Information ถ้าจะกระทบยอด)
  - `ttsApi(…, { scope })` ใส่ชื่อสิทธิ์ไว้ → `ttsErrorText` บอกเจ้าของว่าต้องเปิดตัวไหน · รหัส 36009004 ใช้ซ้ำหลายสาเหตุ แยกด้วยข้อความ

## ห้ามใช้เมื่อไหร่ / ข้อควรระวัง
- ห้ามส่งสต๊อกขึ้น TikTok ขณะที่ BigSeller ยังซิงค์สต๊อกร้านเดียวกัน
- ทุกคำสั่งที่เขียนลงร้าน (ขั้น 2+) ต้องขออนุญาตเจ้าของทีละเฟส + ทดสอบ 1 สินค้าก่อน + เขียน audit

## ข้อควรรู้เรื่องราคา/สถานะ
- ราคา = `price.tax_exclusive_price` (ร้านไทย local = ราคาแสดงก่อนส่วนลด) · ร้านข้ามแดนใช้ `sale_price` · **ไม่มีราคาลด** ใน API สินค้า (โปร/แฟลชเซลอยู่ Promotion API)
- สถานะ ACTIVATE = เปิดขาย · SELLER_DEACTIVATED / PLATFORM_DEACTIVATED / FREEZE / DELETED = ปิด · DRAFT / PENDING / FAILED = รอตรวจ
- ⚠️ ตัวแปลงเขียนจากเอกสาร (api_meta) — หลังดึงครั้งแรกให้เทียบกับ `audit_logs.metadata.sample` ของจริง

## ออเดอร์ (ขั้น 3 · อ่านอย่างเดียว · 2026-11-12)
- `/api/tiktok-shop/sync-orders` POST `{ brand_id?, days? (30, ≤90), page_token? }` (`platform_orders.manage`) — `/order/202309/orders/search` ทีละ 50 ใหม่สุดก่อน
- หัว: upsert `platform_orders` (unique platform×external_order_id) `source = "tiktok_api"` · สถานะในระบบ `tiktokToInternal` · บนร้าน `platform_status` · ยอด `payment.total_amount` · กำหนดส่ง `rts_sla_time` · COD → `cod_amount`
- รายการ: เฉพาะใบใหม่ · 1 line_item = 1 ชิ้น → รวมตาม sku_id · จับคู่ `seller_sku` = รหัส SKU ลูก (`skus_v2.code`) · ของแถมราคา 0
- **ไม่เก็บที่อยู่/เบอร์ผู้รับ** (ยังจัดส่งบนร้าน) · ชื่อผู้รับที่ TikTok ปิดบังบางส่วนเก็บเป็น `customer_name`
- `isShopManaged("tiktok_api")` → นับในการ์ด "ต้องจัดส่ง" แต่เปลี่ยนสถานะ/ตัดสต๊อก/จองขนส่ง SHIPPOP ไม่ได้ (ยังจัดส่งผ่าน TikTok Seller Center / BigSeller) · ON_HOLD ยังไม่นับงาน
- ปุ่ม "ดึงออเดอร์ TikTok" หน้า `/master/platform-orders` (ไม่เลือกแบรนด์ = แบรนด์เดียวที่เชื่อม TikTok) · audit `platform_orders` source `tiktok_api` (ครั้งแรกเก็บ `sample` ไม่มีที่อยู่)
- ตัวบันทึกกลาง `app/api/tiktok-shop/orders-sync.ts` (`syncTiktokOrders`) — ปุ่ม + ตัวดึงอัตโนมัติใช้ตัวเดียวกัน
- `cod_amount` ในฐานข้อมูลห้ามว่าง → ไม่ใช่ COD = 0 (เคยพังตอนกดครั้งแรก)

## ดึงออเดอร์อัตโนมัติ (2026-11-12)
- `/api/cron/tiktok-orders` — ทุกแบรนด์ที่เชื่อม TikTok · ดึงออเดอร์ที่ **เปลี่ยนสถานะ** ใน 1 ชม.ล่าสุด (`update_time_ge` · เรียงตาม update_time) · รอบละ 15 นาที (เจ้าของเลือก) ซ้อนกันได้ (upsert ไม่ซ้ำใบ)
- เข้าได้ด้วย x-cron-token (Vault `tiktok_orders_cron` ผ่าน `erp_cron_token_ok`) / Bearer CRON_SECRET / คนมีสิทธิ์ = โหมดดู
- ตั้งเวลา: migration `202612050100_tiktok_orders_cron.sql` (pg_cron `tiktok-orders-every-15min` (ลงแล้ว 2026-11-12 · jobid 5) — เรียกเว็บเฉพาะตอนมีแบรนด์เชื่อม TikTok) · ยกเลิก `select cron.unschedule('tiktok-orders-every-15min')`
- ผลรอบ = `recordWorkerRun("tiktok-orders")` · audit เฉพาะรอบที่มีออเดอร์ใหม่/มีปัญหา (actor `tiktok_orders_cron`)
- ⚠️ ยังไม่อยู่ในออฟฟิศทีม AI (`lib/ai-office`) — ฉากพิกเซลโต๊ะเต็ม 20/20 ต้องตัดสินใจขยายก่อน

## แก้บนร้าน เฟส A: ชื่อ + เปิด/ปิดขาย (2026-11-12 · เจ้าของเลือก "เฟส A ชื่อ/เปิดปิด")
- ที่ไหน: หน้าสินค้าบนแพลตฟอร์ม › กดสินค้า TikTok › ลิ้นชัก (`components/platform-catalog/tiktok-listing-panels.tsx` เสียบใน `listing-drawer`) — ข้อมูลสดจาก TikTok ทุกครั้งที่เปิด
- กฎกลาง `lib/tiktok-listing-edit.ts` (pure + เทสต์ `lib/__tests__/tiktok-listing-edit.test.ts` · **ห้าม import lib/tiktok-shop** เพราะมีโค้ดเซ็น): `tiktokListingView` · `planTiktokTitle` (ไทย 25–255 ตัวอักษร) · `planTiktokDisplay` · `tiktokDisplayErrors`
- `GET/POST /api/tiktok-shop/listing-detail` — ดึงสด (POST = อัปเดตสำเนาย่อด้วย) · กำลังตรวจอยู่ → ดึงฉบับรอตรวจ (`return_under_review_version=true`) มาโชว์ "ชื่อใหม่รอ TikTok ตรวจ"
- `POST /api/tiktok-shop/listing-edit {listing_id, before_title, title}` (products.platforms.publish) — ดึงสดก่อน ชื่อบนร้านเปลี่ยน = **409 ไม่ส่งทับ** → Partial Edit 202509 ส่งแค่ `title` (+ `category_version: v2` ตามเอกสาร SEA) → ดึงกลับ → สำเนาย่อ → audit `tiktok_listing_edit`
  - ⚠️ แก้ชื่อ = TikTok ส่งไปตรวจใหม่ ระหว่างตรวจร้านยังขายชื่อเดิม · ตรวจไม่ผ่าน = ชื่อเดิมอยู่ต่อ · อาจมีโควตาส่งตรวจต่อวัน
- `POST /api/tiktok-shop/listing-display {listing_id, open}` (products.platforms.publish) — ทั้งสินค้า (TikTok ไม่มีทีละตัวเลือกใน API นี้) · ปิด = Deactivate ซ่อนทันที · เปิด = Activate → **PENDING รอตรวจ** แล้วค่อยกลับมาเปิด · เช็ก `data.errors[]` แม้ code 0 · audit `tiktok_listing_display`
- เปิด/ปิดได้เฉพาะ `product_status` ACTIVATE / SELLER_DEACTIVATED / PLATFORM_DEACTIVATED (สถานะอื่นบอกให้ไปจัดการใน Seller Center)
- ยังดูอย่างเดียว: รายละเอียด (HTML มีรูปที่ฝากกับ TikTok) · รูป · ราคา · สต๊อก (BigSeller ยังซิงค์สต๊อก)
- ใช้ scope `seller.product.write` (ร้าน Louis Montini ได้แล้ว)

## ขั้นต่อไป (ยังไม่ทำ)
2. ~~ดึงหมวดหมู่ TikTok~~ (ทำแล้ว c51b1adf — รอเจ้าของกดดึง แล้วร่างจับคู่ 10 หมวดกลาง)
4. เฟส B ราคา · C รูป/กล่อง · D ลงสินค้าใหม่ (ต้องมีหมวด) · E สต๊อก (หลังเลิกซิงค์ BigSeller) — ทีละเฟสตามที่เจ้าของอนุมัติ
