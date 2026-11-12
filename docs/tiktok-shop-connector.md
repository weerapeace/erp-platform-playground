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

## แก้บนร้าน เฟส B: ราคาต่อตัวเลือก (2026-11-12 · เจ้าของสั่ง "ทำเฟส B แก้ราคา")
- ที่ไหน: ลิ้นชักสินค้า TikTok › แท็บตัวเลือก & ราคา — ช่องราคาแก้ได้ + แถบแก้หลายตัวพร้อมกัน (ตั้งราคาเดียวกัน / ปรับ % ปัดบาทเต็ม · ติ๊ก = เฉพาะที่ติ๊ก) · ปุ่ม "บันทึกขึ้น TikTok" เดียวกับชื่อ (ส่งราคาก่อน แล้วชื่อ)
- กฎ `planTiktokPrices` (ไทย **30–260,000 บาท** ทศนิยม 2 · ส่งเฉพาะตัวที่เปลี่ยน · เตือนถ้าลดเหลือครึ่ง/ขึ้น 2 เท่า) · `applyTiktokBulkPrice` · `tiktokPriceBlock` (แก้ได้เฉพาะ product_status ACTIVATE)
- `POST /api/tiktok-shop/listing-prices {listing_id, before, edit}` (products.platforms.publish) — ดึงสดก่อน · ราคาบนร้านของตัวที่จะแก้ต่างจาก before = **409** → Update Price 202309 (`price.amount` = ราคาแสดงก่อนส่วนลด, THB) → ดึงกลับเทียบทุกตัว → สำเนาย่อ → audit `tiktok_listing_prices`
- ⚠️ ราคามีผลทันที (ไม่ต้องรอตรวจ) · สินค้าที่อยู่ในโปรโมชัน TikTok จะถูกปฏิเสธ · ส่วนลด/ราคาโปร แก้ใน Seller Center (ยังไม่ทำ)
- ทดสอบร้านจริง 2026-11-12: KR64-01 239→238→249 ผ่าน (ราคาบนร้านตรง · สต๊อกไม่โดน)

## คอลัมน์ "ราคาในระบบ" (2026-11-12 · เจ้าของขอ)
- ลิ้นชัก › แท็บตัวเลือก & ราคา: โชว์ **ราคาขาย (list_price) / ราคาเต็ม (fake_price)** ของ SKU ที่รหัสตรง (ไม่เจอ → รหัสสี) + "×กี่เท่า" ของราคาขาย
- ข้อมูลจริง: ราคาบน TikTok ≈ **2 เท่า** ของราคาขายเกือบทุกตัว (ร้านลดด้วยโปรโมชัน TikTok) → ไม่ถือว่า "ไม่ตรง" · เตือนแค่ **แดง = ต่ำกว่าราคาขาย** · **เหลือง = ไม่ตรงราคาเต็มที่ตั้งไว้** (`tiktokErpPriceCheck`)
- ปุ่ม "ใช้ราคาเต็ม" (ต่อแถว) / "ใช้ราคาเต็มในระบบ (N ตัว)" = เติมช่องราคาอย่างเดียว ยังไม่ส่ง (`applyTiktokErpFull`) — ต้องกดบันทึก + ยืนยันเหมือนเดิม
- ข้อมูลมาจากของกลาง `GET /api/platform-catalog?view=variants` (lib/platform-variant-match — รองรับ TikTok แล้ว · แถวมี `erp_sale`/`erp_full`) → แท็บจับคู่ของ TikTok เห็นตัวเลือก↔SKU ด้วย และแท็บ 💰 ราคา ของ Parent SKU เห็นราคา TikTok ต่อตัวเลือก

## แก้บนร้าน เฟส C: รูปสินค้า + กล่องพัสดุ (2026-11-12 · เจ้าของสั่ง "ทำ 2,3")
- ที่ไหน: แท็บรูป = ของกลาง `ListingImageGrid` / `ListingImagePicker` (./listing-images — ใช้ร่วม LINE/Lazada): เพิ่มจากคลังรูปในระบบ (ต้องจับคู่ Parent SKU) · ลากเรียง · ตั้งปก · ลบ · สูงสุด 9 รูป · แท็บข้อมูล = กล่อง "กล่องพัสดุ" (น้ำหนัก กก. ทศนิยม ≤ 3 · ยาว/กว้าง/สูง ซม. จำนวนเต็ม ใส่ครบ 3 ช่อง)
- ส่งพร้อมชื่อ: `POST /api/tiktok-shop/listing-edit { listing_id, before_title?, title?, media?: { before_uris, before_pkg, images, pkg } }` — Partial Edit ครั้งเดียว (ส่งเฉพาะช่องที่เปลี่ยน) → TikTok ตรวจใหม่ ระหว่างตรวจร้านยังใช้ของเดิม
- รูปในฟอร์มส่ง: รูปเดิม `tts:<uri>` · รูปใหม่ `r2:<key>` → server โหลด `/api/r2-image ...&w=1500&sq=1` (JPG จัตุรัสพื้นขาว) → `ttsUploadImage` (Upload Product Image 202309 · multipart · **เซ็นไม่รวม body** · ไม่ต้อง shop_cipher) ได้ uri — ฝากไม่ผ่าน = หยุด ไม่แก้สินค้า
- กฎ `planTiktokMedia` (1–9 รูป ไม่ซ้ำ · ลบน้ำหนัก/ขนาดที่เคยตั้งไม่ได้ · เตือนปกควรพื้นขาว/หน่วยผิด) · `tiktokMediaBase` = ฐานจากฉบับรอตรวจถ้ามี · 409 เมื่อรูป/กล่องบนร้านเปลี่ยนหลังเปิดลิ้นชัก · ประวัติ audit `tiktok_listing_edit` (changes: รูปสินค้า / น้ำหนักกล่อง / ขนาดกล่อง)
- ยังไม่ทำ: รูปตัวเลือก (sku_img — ต้องส่ง skus ทั้งชุด เสี่ยงลบตัวเลือก) · รายละเอียด (HTML)

## แก้รายละเอียดสินค้า (2026-11-12 · เจ้าของสั่ง "ทำ 2 - 3 ต่อ")
- แท็บข้อมูล › รายละเอียด › "แก้รายละเอียด" = กล่องแก้ข้อความกลาง RichTextEditor · รูป วาง/ลาก/ปุ่มรูป → `POST /api/tiktok-shop/upload-image` (multipart · DESCRIPTION_IMAGE · ยังไม่แก้สินค้า) คืนลิงก์ TikTok + `#tts-w=&tts-h=`
- ส่งพร้อมชื่อ/รูป/กล่อง: `listing-edit { before_description, description }` · 409 ถ้ารายละเอียดบนร้านเปลี่ยน · `planTiktokDescription` + `fixTiktokDescriptionImages` (ทุก <img> ต้องเป็นลิงก์ TikTok + width/height — กล่องแก้ทิ้ง height จึงเติมกลับจากของเดิม/fragment) · ≤ 10,000 ตัวอักษร (รวมโค้ด) · ≤ 30 รูป
- **รูปตัวเลือก (สี) ไม่ทำ:** เอกสาร partial edit บอก "แก้ช่องในอ็อบเจกต์ต้องส่งทุกช่องย่อย ไม่ส่ง = ล้างเป็นว่าง" → แก้ sku_img ต้องส่ง skus ทั้งชุดพร้อม price + inventory = ส่งสต๊อก (ขัดกฎ "ไม่ส่งสต๊อกขณะ BigSeller ซิงค์") → รอเลิก BigSeller
- เตือนกลับไปดูเฟส C: package_weight / package_dimensions เป็นอ็อบเจกต์ → ส่งครบทุกช่องย่อยแล้ว (value+unit · length/width/height+unit) ✓

## เฟส D: ลงสินค้าใหม่บน TikTok เป็น "ฉบับร่าง" (2026-11-12 · เจ้าของเลือก "ลงเป็นร่าง")
- ทางเข้า = ตัวช่วยลงสินค้า/ลงทุกร้านตัวเดิม (AddToPlatformWizard) · ทะเบียน `lib/platform-create-registry` แถว `tiktok` (live: true · mode: "draft" · note)
- กฎประกอบ `lib/tiktok-create-plan` (pure + เทสต์) · `/api/tiktok-shop/create-product` GET ดูก่อนส่ง / POST สร้าง (load.ts ตัวเดียวกัน) · หน้าดูก่อนส่ง `components/platform-listing/tiktok-create-preview`
- **save_mode=AS_DRAFT เสมอ · ไม่ส่ง inventory** — เหตุผล: Create Product บังคับ quantity 1–99,999 ตอนลงขาย = ส่งสต๊อก (ขัดกฎ BigSeller) → เจ้าของตรวจ/กรอกช่องบังคับของหมวด/ใส่สต๊อก แล้วกดเผยแพร่ใน Seller Center
- ราคา = ราคาเต็ม (ไม่มี = ราคาขาย) · ส่วนลดใช้โปรโมชัน TikTok · ชั้นตัวเลือก = ชื่อกำหนดเอง (สี / ตัวเลือก / แบบ) ≤ 20 ตัว · ค่า ≤ 50 · SKU เดียว = ไม่มีชั้น
- รูป = extra.tiktok_images → image_keys → อัตโนมัติ (≤ 9) → `ttsUploadRef` (shared — ใช้ร่วมกับลิ้นชัก) · รายละเอียดตัดรูปที่ไม่ใช่ของ TikTok · น้ำหนัก = extra.tiktok_weight → weight_g · กล่องปัดขึ้นเป็นจำนวนเต็ม (ไม่มีก็ได้)
- แบรนด์ = ค้นชื่อแบรนด์ในระบบด้วย Get Brands (หมวดเดียวกัน) ไม่เจอ/ไม่ได้รับอนุญาต = ไม่ใส่ · ช่องบังคับของหมวด (Get Attributes · `is_requried`) = แสดงให้รู้ ไม่บล็อก · แคช 10 นาที
- หลังสร้าง: ร่าง platform_product_id + status published (กันซ้ำ) · รายการบนร้านสถานะ draft จับคู่ Parent SKU · audit `tiktok_create` (draft: true)
- ⚠️ ยังไม่เคยสร้างจริง — ตัวแรกให้เจ้าของกดเอง แล้วตรวจว่า TikTok รับร่างที่ไม่มี inventory ไหม (ถ้าไม่รับ ต้องหา warehouse_id + ใส่สต๊อก 1 ในร่าง)

## ขั้นต่อไป (ยังไม่ทำ)
2. ~~ดึงหมวดหมู่ TikTok~~ (ทำแล้ว c51b1adf · เจ้าของกดดึงแล้ว 2026-11-12: 1,950 หมวดใบ ใช้ได้ 1,849 — ร่างจับคู่ 10 หมวดกลาง รอเจ้าของอนุมัติ)
4. ~~เฟส B ราคา~~ · ~~C รูป/กล่อง~~ (ทำแล้ว) · ~~D ลงสินค้าใหม่~~ (ทำแล้ว — ลงเป็นฉบับร่าง) · E สต๊อก (หลังเลิกซิงค์ BigSeller) — ทีละเฟสตามที่เจ้าของอนุมัติ
