# ตัวเชื่อม Lazada (Open Platform API)

ร้านเชื่อมแบบ OAuth ต่อแบรนด์ (`platform_credentials` แบรนด์ × lazada · token เข้ารหัสด้วย `PLATFORM_SECRET_KEY`)
env บนโฮสต์: `LAZADA_APP_KEY` + `LAZADA_APP_SECRET` · callback `https://erp-platform-playground.vercel.app/api/lazada/callback`

## แผนทั้งหมด (เจ้าของอนุมัติทีละขั้น)

| ขั้น | ทำอะไร | แตะร้านจริงไหม | สถานะ |
|---|---|---|---|
| 0 | เจ้าของกด "เชื่อมต่อ Lazada" ที่ `/admin/platform-accounts` | — | รอเจ้าของ (หมดอายุตั้งแต่ 5 ส.ค. 2026) |
| 1 | ต่ออายุกุญแจอัตโนมัติ + ดึงสินค้าที่ลงไว้บน Lazada เข้า `/master/platform-catalog` | อ่านอย่างเดียว | ✅ ทำแล้ว |
| 2 | ลงสินค้าใหม่ (ส่งรูป → สร้างสินค้า → เก็บรหัส) จากหน้า 📤 ลงสินค้าบนแพลตฟอร์ม | เขียน | ยังไม่ทำ |
| 3 | ส่งสต๊อก/ราคา (ผ่านระบบซิงค์สต๊อก compare → dry_run → live) | เขียน | ยังไม่ทำ · ต้องมียอดตั้งต้นจริงก่อน |
| 4 | ดึงออเดอร์อัตโนมัติ + จอง/ตัดสต๊อก | — | ภายหลัง |

## กุญแจ (ขั้น 1)

- access_token อยู่ได้ ~7 วัน · refresh_token ~30 วัน (ข้อมูลจริงร้าน IG) → ไม่มีใครต่อ = หลุดเงียบ
- `lib/lazada.ts` `lazConnHealth(meta)` → none / connected / expiring (≤ 7 วัน) / expired · มี test
- `app/api/lazada/shared.ts`: `lazTokenOrReason` (ต่ออายุถ้าใกล้หมด · คืนเหตุผลภาษาคนเมื่อใช้ไม่ได้) · `refreshLazConn` · `ensureLazToken` (แบบเดิม คืน null)
- ตัวต่ออายุ `/api/cron/lazada-token` — Vercel Cron วันละครั้ง (`30 0 * * *` = 07:30 ไทย · vercel.json) · ต่ออายุทุกร้านที่ยังไม่หมด · บันทึกผลใน `audit_logs` (entity_type `platform_credentials`) · คนมีสิทธิ์ `products.platforms.edit` เรียกเองได้ (`?dry=1` = ดูอย่างเดียว)
- `/api/lazada/status` คืน `health` + `days_left` · `connected` = ใช้ได้จริงเท่านั้น (เดิมขึ้น "เชื่อมต่อแล้ว" ทั้งที่หมดอายุ)
- ⚠️ **การต่ออายุไม่ยืดอายุ refresh_token** (วัดจริง 2026-11-13: ตัวต่ออายุทำงานทุกเช้า แต่ IG `refresh_expires_at` ค้างที่ 10 ธ.ค. · days_left 29→28→27) → เจ้าของต้องกดเชื่อมใหม่ทุก ~30 วัน (หน้าตั้งค่า/หน้าสินค้าบนแพลตฟอร์มเตือนล่วงหน้า 7 วัน)
- **ด่าน 1 ร้าน = 1 แบรนด์ ตอนเชื่อมต่อ** (2026-11-13 · `lazShopConflict` ใน `lib/lazada.ts` + `/api/lazada/callback`) — เทียบ seller_id (ไม่มี = short_code) กับแถว `stage=connected` ทุกแบรนด์ · บล็อก 2 แบบ ไม่บันทึก token ใด ๆ + จด audit `blocked`:
  - `shop_connected_to_other_brand` — เลือกแบรนด์ A แต่ล็อกอินร้านที่เชื่อมอยู่กับแบรนด์ B (เช่น เลือก Louis Montini แต่ล็อกอินบัญชี IG)
  - `brand_has_other_shop` — แบรนด์นี้เชื่อมร้านอื่นอยู่ แต่ล็อกอินอีกร้าน (เช่น ต่ออายุ IG แต่เผลอล็อกอินร้าน LM) · ตั้งใจเปลี่ยนร้าน = กด ตัดการเชื่อมต่อ ก่อน
  - เชื่อมไม่สำเร็จก็จด audit (`failed`) แล้ว — ดูย้อนหลังได้ว่าเคยลองแล้วติดอะไร (actor `lazada_oauth`)
  - ⚠️ ระบบรองรับแอป Lazada ได้ตัวเดียว (env `LAZADA_APP_KEY`/`SECRET`) — ถ้า Lazada ไม่ให้แอป IG เชื่อมร้าน Louis Montini ต้องทำ "กุญแจแอปแยกตามแบรนด์" ก่อน

## ดึงสินค้าบนร้าน (ขั้น 1)

- `POST /api/lazada/sync-products {brand_id, offset?, run_started_at?}` (`products.platforms.edit`) — `/products/get` filter=all ทีละ 50
  - **ดึงหลายครั้งต่อกัน** (2026-11-10): Lazada ตอบ ~10 วิต่อหน้า (วัดจริง) → ครั้งหนึ่งไม่เริ่มหน้าใหม่หลัง 30 วิ แล้วคืน `next_offset` · หน้าเว็บเรียกต่อเองจนครบ (`done`) พร้อมแสดงความคืบหน้า
  - Lazada ตอบผิดพลาด → server ลองซ้ำ 1 ครั้ง (ถ้ายังไม่เกิน 20 วิ) · หน้าเว็บลองซ้ำอีก 1 ครั้ง · ยังไม่ได้ = หยุดพร้อม **บอกเหตุผลจาก Lazada** (`stop_reason`) และจำจุดค้าง กดอีกครั้ง = ดึงต่อจากตรงนั้น (ภายใน 25 นาที)
  - 🐛 เดิมเริ่มตัวแรกทุกครั้ง + error หน้า 3 แล้วเงียบ → IG ได้ 100/232 กดซ้ำก็ได้ 100 เดิม
  - ป้าย "ไม่อยู่บนร้านแล้ว": ครั้งสุดท้ายจบครบ + จำนวนที่บันทึกตั้งแต่เริ่มรอบ (`seenSince`) ≥ ยอดที่ Lazada รายงาน → `markMissingSince` (ตัวที่ไม่ถูกบันทึกในรอบนี้) · รอบเก่ากว่า 30 นาที = เริ่มรอบใหม่ (ไม่ติดป้าย)
- แปลงด้วย `lazProductToCatalogItem` (เก็บรหัส/ชื่อ/สถานะ/ราคา/สต๊อกต่อ SKU ใน `raw.lazada` · ไม่เก็บ HTML/รูป)
- บันทึกด้วยของกลาง `lib/platform-catalog-sync.ts` `upsertCatalogListings`: upsert ตาม item_id · จับคู่อัตโนมัติเฉพาะรหัสตรง (SKU ลูก > Parent) · ไม่ทับคู่เดิม · ไม่แตะ "ไม่ต้องจับคู่"
- ที่เหลือให้ตัวเดาคู่ (`lib/platform-match-suggest`) เสนอในหน้า สินค้าบนแพลตฟอร์ม (การ์ด "รอยืนยัน")

## ข้อควรรู้จาก Lazada

- รูปต้องย้ายไปเครื่อง Lazada ก่อนสร้างสินค้า (MigrateImage) · เปลี่ยนราคา ≥ 80% → สินค้ากลับไปรอตรวจ (QC)
- UpdatePriceQuantity ครั้งละ ≤ 50 (แนะนำ 20) · ช่วงแคมเปญใหญ่ (9.9 / 11.11 / 12.12) Lazada มักปิด API ส่งสต๊อก/ราคาชั่วคราว
- หมวดที่จับคู่ไว้ 8 หมวด เป็น leaf ในต้นไม้ API ทั้งหมด (เช็ก 2026-10-28) · 6938 = Fashion Accessories > Accessories > Belts (ใช้ได้ทั้งชาย/หญิง)
- error ของ Lazada → ภาษาคนด้วย `lazErrorText(e)` (lib/lazada · มี test) · `lazApiGet` โยน `LazApiError` (message เดิม + `code`) — ผู้เรียกเก่าอ่าน `.message` ได้เหมือนเดิม

## แก้สินค้าบน Lazada จากลิ้นชักสินค้าบนร้าน (`/master/platform-catalog`)

เจ้าของเลือกจาก widget 2026-11-10: ใช้ลิ้นชักตัวเดียวกับ LINE · เปิดทีละเฟส · เฟสที่แตะร้านจริงทดสอบ 1 สินค้าก่อนเสมอ

| เฟส | ทำอะไร | แตะร้านจริงไหม | สถานะ |
|---|---|---|---|
| 1 | ลิ้นชักโชว์ข้อมูลเต็มจาก Lazada (ชื่อ · แบรนด์ · หมวด · รายละเอียด · จุดเด่น · รูป · ชื่อตัวเลือก · ราคาปกติ/ราคาลด+ช่วงวัน · สต๊อก · สถานะต่อตัวเลือก · กล่อง · เหตุผลที่ถูกปัดตก) + ปุ่ม "ดึงตัวนี้จาก Lazada" | อ่านอย่างเดียว | ✅ 2026-11-10 |
| 2 | แก้ชื่อ/รายละเอียด/จุดเด่น (`/product/update`) + เปิด/ปิดขาย ทั้งสินค้าหรือทีละตัวเลือก (`/product/deactivate` · เปิดกลับ = update `Status active`) | เขียน | ✅ deploy be5b647b + c1aea79b · **ทดสอบกับร้านจริงผ่าน 2026-11-10** (แก้ชื่อ TWD · ปิด→เปิด LB-01) |
| 3 | ราคา/ราคาลดต่อตัวเลือก (`/product/price_quantity/update` ชุดละ 20 · **ไม่ส่ง Quantity**) · ไม่ยอมส่งราคาที่ขยับ ≥ 80% | เขียน | ✅ deploy 7ca6125a · **ราคาปกติทดสอบกับร้านจริงผ่าน 2026-11-10** (LB-01 36→37 · ราคาลด 19 คงเดิม) · ราคาลด “ไม่มีกำหนด” ผ่าน (LB-01 ลด 19→20) · ราคาลดแบบมีวันยังไม่ทดสอบ |
| 4 | รูปสินค้า/รูปตัวเลือก (`/image/migrate` → update) + น้ำหนัก/ขนาดกล่อง | เขียน | ✅ deploy 1e020eaf · **ทดสอบกับร้านจริงผ่านบางส่วน 2026-11-10** (LB-01 เปลี่ยนปก · น้ำหนัก 0.1→0.11 · เพิ่มรูปจากระบบ · ลบรูป) · รูปตัวเลือก ยังไม่ทดสอบ |
| — | สต๊อก (รอเลิก BigSeller) · เพิ่ม/ลบตัวเลือก · เปลี่ยนหมวด/แบรนด์ | — | ยังไม่ทำ |

**เฟส 1 (ดูอย่างเดียว):**
- `GET /api/lazada/listing-detail?listing_id=` (`products.platforms.view`) → ดึงสด `/product/item/get` (`lazGetItem`) ไม่บันทึกอะไร · `POST {listing_id}` (`products.platforms.edit`) = ปุ่ม "ดึงตัวนี้จาก Lazada" → อัปเดตสำเนาย่อ (`raw.lazada` · ชื่อ · ราคา · สถานะ · ล้างป้าย "ไม่อยู่บนร้านแล้ว" ถ้าเจอ) ด้วยตัวแปลงเดียวกับตอนดึงทั้งร้าน
- กฎแปลง `lib/lazada-listing-edit.ts` (pure + test · ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน — **ห้าม import lib/lazada** เพราะมีโค้ดเซ็นคำขอ): `lazadaListingView` · `lazSkuLabel` (ชื่อตัวเลือกจาก saleProp เช่น "สี: Black") · `lazImageList` (รูปเป็น array หรือข้อความ JSON) · `lazDateText` · `lazStatusBadge`
- ข้อมูลเต็ม (รูป/HTML) **ไม่เก็บในระบบ** → ดึงสดทุกครั้งที่เปิด · สำเนาย่อเพิ่มช่อง `label` ต่อ SKU (ดึงทั้งร้านครั้งถัดไปก็ได้) → ตาราง "ตัวเลือกบนร้าน ↔ SKU" โชว์สี/ไซซ์แทนรหัส
- UI: `components/platform-catalog/lazada-listing-panels.tsx` (แท็บข้อมูล/รูป/ตัวเลือก + ป้ายสถานะหัวลิ้นชัก) · หัว/แท็บจับคู่/ประวัติ ใช้ร่วมกับ LINE ใน `listing-drawer` · HTML รายละเอียดผ่าน `sanitizeRichHtml`

**เฟส 2 (แก้ร้านจริง · ถามก่อนเสมอ · สิทธิ์ `products.platforms.publish`):**
- แท็บข้อมูล: ชื่อ (≤ 255) · จุดเด่น = textarea บรรทัดละข้อ (`highlightsToLines` ↔ `linesToHighlights` → `<ul><li>`) · รายละเอียด = RichTextEditor (รูปต้องเป็นโดเมน Lazada `slatic.net/lazcdn.com/alicdn.com` ไม่งั้นไม่ให้ส่ง) → แถบท้าย "บันทึกขึ้น Lazada" → ป๊อปก่อน → หลัง
- `POST /api/lazada/listing-edit {listing_id, before, edit}`: ดึงสดก่อน → ร้านต่างจาก `before` = **409 ไม่ส่งทับ** (คืนข้อมูลล่าสุดให้ฟอร์มเริ่มใหม่) → `planLazadaEdit` → `lazUpdateProductXml` (SKU ครบตามลำดับเดิม + **สถานะเดิมทุกตัว** · ชื่อ escape · HTML ใน CDATA) → ดึงกลับตรวจชื่อ/สถานะ SKU/Pending QC → สำเนาย่อ → audit `lazada_listing_edit`
- `POST /api/lazada/listing-display {listing_id, open, sku_ids?}`: `planLazadaDisplay` ข้ามตัวที่อยู่สถานะนั้นแล้ว · ปิดทั้งสินค้า = deactivate ระบุแค่ ItemId · ปิดบางตัว = ระบุ SkuId · เปิด = update ตั้ง active เฉพาะตัวที่สั่ง ตัวอื่นคงเดิม → ดึงกลับตรวจ → audit `lazada_listing_display`
- UI: สวิตช์หัวลิ้นชัก = ทั้งสินค้า · ปุ่ม "เปิด/ปิด" ต่อแถวในแท็บตัวเลือก · ปุ่มดึงตัวนี้ปิดไว้ระหว่างมีที่แก้ค้าง · ราคา/รูป ยังดูอย่างเดียว
- `lazApiPost` แบบ SDK ทางการ: พารามิเตอร์ระบบ + sign ใน URL · payload ในเนื้อคำขอ · ลายเซ็นคิดจากทั้งหมด · ไม่มี `code` ในคำตอบ = ถือว่าไม่สำเร็จ
- ✅ ยืนยันกับร้านจริง 2026-11-10 (เจ้าของกดเอง):
  - แก้ชื่อ TWD #5470525337 → XML update ผ่าน · ไม่โดนรอตรวจ · 7 SKU ราคา/สต๊อก/สถานะคงเดิม (ส่ง SkuId+SellerSku+Status ไม่ล้างช่องอื่น)
  - ปิด→เปิด LB-01 #5470445358 → deactivate (ระบุแค่ ItemId) ผ่าน · update Status active ผ่าน (ดึงสดยืนยัน Active · ราคา 36/19 คงเดิม)
  - 🐛 กดปิดแล้วเปิดติดกัน (~5 วิ) → Lazada รับ แต่ดึงกลับไม่ได้ → เดิมโชว์ "ปิดขาย" ค้าง · แก้ c1aea79b: `refetchLazItem` ลองซ้ำ 0.8/2 วิ + log เหตุผล · ไม่ได้ = แสดง/เก็บตามที่สั่ง (`lazViewAfterWrite` / `lazRawAfterStatus`) + เตือนให้กด "ดึงตัวนี้จาก Lazada" · audit `optimistic: true`
- ยังไม่มีใครลอง: แก้รายละเอียด HTML / จุดเด่น · ปิด/เปิดทีละตัวเลือก (deactivate ระบุ SkuId)

**เฟส 3 ราคา (แก้ร้านจริง · ถามก่อนเสมอ):**
- แท็บตัวเลือก & ราคา: MoneyInput ราคาปกติ/ราคาลด + DateInput ช่วงวันต่อแถว (กรอบม่วง = แก้แล้ว) · แถบแก้หลายตัว `applyLazadaBulkPrice` (ราคา · ราคาลด · ลด % · ช่วงวัน · ติ๊กบางตัว/ทุกตัว) · ปุ่ม "บันทึกขึ้น Lazada" เดียวกับข้อมูลสินค้า (ส่งข้อมูลก่อน แล้วราคา · ป๊อปรวมทั้งสองส่วน)
- `POST /api/lazada/listing-prices {listing_id, before, edit}`: ดึงสด → ตัวที่แก้ถ้าราคาบนร้านต่างจาก before = 409 · ตัวที่ไม่ได้แก้ใช้ค่าบนร้าน (ไม่ย้อนของคนอื่น) → `planLazadaPrices` → `lazPriceQuantityXml` ชุดละ 20 → ดึงกลับตรวจ → สำเนาย่อ → audit `lazada_listing_prices` (sent/planned/error) · ชุดพลาดบางชุด = 207
- กฎ: ราคาขยับ ≥ 80% ไม่ส่ง · ≥ 50% เตือน · ราคาลดต้อง < ราคาปกติ · ลดไม่เกิน 80% · ต้องมีช่วงวัน · วันจบยังไม่ผ่าน · ล้างราคาลด = ยังไม่รองรับ (ไม่รู้วิธีที่ Lazada รับ) · ราคาปกติใหม่ต่ำกว่าราคาลดเดิม = ไม่ผ่าน
- รูปแบบส่ง: ส่ง `Price` คู่ `SalePrice` เสมอ (ตัวอย่างทางการ) · วันที่ `YYYY-MM-DD HH:mm` (เริ่ม 00:00 / จบ 23:59 · วันเดิม = เวลาเดิมจาก Lazada) — คู่มือรุ่นเก่า: เวลาปัดทีละ 15 นาที · ไม่มี Quantity เลย
- ✅ 2026-11-10 16:43 เจ้าของแก้ LB-01 ราคาปกติ 36→37: ส่งแค่ Price ผ่าน · ราคาลด 19 คงเดิม · สต๊อก/สถานะไม่เปลี่ยน · ดึงกลับยืนยันทันที
- ✅ 2026-11-10 17:02 ราคาลด “ไม่มีกำหนด” (เจ้าของขอ · ราคาลด LB-01 บนร้านไม่มีวัน): ส่ง SalePrice 20 + แท็กวันว่าง + Price คู่ → ผ่าน ดึงกลับยืนยัน 20 · ช่วงวันไม่บังคับแล้ว (ว่าง = ไม่มีกำหนด · มีแต่วันเริ่ม = ไม่มีวันจบ · มีแต่วันจบ = เริ่มวันนี้) · ปุ่ม “ตั้งเป็นไม่มีกำหนด” + ติ๊กในแถบแก้หลายตัว
- ⚠️ ยังไม่ยืนยัน: ราคาลดแบบมีวัน (`YYYY-MM-DD HH:mm`) · เปลี่ยนราคาลดที่มีวันให้เป็นไม่มีกำหนด (ล้างวันเดิมจริงไหม — ระบบเตือนไว้)

**เฟส 4 รูป + กล่อง (แก้ร้านจริง · ถามก่อนเสมอ):**
- ของกลางใหม่ `components/platform-catalog/listing-images` (ลงทะเบียน listing-images): `ListingImageGrid` (ลากเรียง/ปก/ลบ/เพิ่มจากระบบ) + `ListingImagePicker` + `useSystemImages` — ลิ้นชัก LINE ย้ายมาใช้ตัวเดียวกัน (หน้าตาเดิม)
- แท็บรูป Lazada แก้ได้ ≤ 8 รูป · แท็บตัวเลือก โหมด "รูป · น้ำหนัก · กล่อง": เปลี่ยนรูปแรกของตัวเลือก + น้ำหนัก (กก.) / ยาว·กว้าง·สูง (ซม.)
- กฎ (`planLazadaEdit` images + `planLazadaSkuMedia`): รูป 1–8 · ลิงก์ต้องเป็น Lazada (`slatic.net/lazcdn.com/alicdn.com`) หรือ `r2:` · ลบรูป = เตือน (คู่มือ: แทนได้ ลบไม่ได้) · รูปตัวเลือกต้องครบทุกตัว → ส่งรูปของทุกตัว · กล่อง > 0 และ ≤ 300
- `POST /api/lazada/listing-edit` รับ `sku_before/sku_edit` เพิ่ม · รูป `r2:<key>` → ฝาก `/image/migrate` (ลิงก์ `/api/r2-image?key=…&w=1500&sq=1` = JPG 1500×1500 พื้นขาว · วัดจริง 188KB 1.7 วิ) ทีละรูป · ฝากไม่ผ่าน = หยุด ไม่แก้สินค้า → update (`<Images>` นอก Skus · `<Images>`/`package_*` ใน Sku) → ดึงกลับเทียบจำนวนรูป → audit (`migrated`)
- ✅ 2026-11-10 17:39 เจ้าของทดสอบ LB-01: เปลี่ยนปก (4 รูป เรียงใหม่) ผ่าน · น้ำหนัก 0.1→0.11 (`package_weight` ใน Sku) ผ่าน · ดึงกลับยืนยันทั้งคู่ · หลังจากนี้ route เทียบลำดับรูป + ค่ากล่องที่ส่งด้วย (เดิมนับแค่จำนวนรูป)
- ✅ 2026-11-10 19:09 เพิ่มรูปจากระบบ 1 รูปที่ LB-01: ฝาก `/image/migrate` ผ่าน (migrated 1) → update 4→5 รูป ผ่าน · ดึงกลับครั้งแรกโดน "Api access frequency exceeds the limit (ban 1 วิ)" → `refetchLazItem` ลองซ้ำแล้วได้ → ยืนยัน 5 รูป
- ✅ 2026-11-10 19:16 ลบรูป LB-01 5→4: ส่งชุดที่สั้นลง → ดึงกลับเห็น 4 รูปตรงลำดับ = **Lazada ลบรูปได้** (คู่มือที่ว่า "แทนได้ ลบไม่ได้" ไม่ตรงกับของจริง) → เลิกเตือนก่อนส่ง (route ยังเทียบจำนวน/ลำดับหลังส่ง)
- ⚠️ ยังไม่ยืนยัน: รูปตัวเลือก

**เฟส A (เจ้าของขอ 2026-11-10 · widget 4 เรื่อง → เลือก A ก่อน) — รูปส่งเสริม + รูปตัวเลือกหลายรูป · deploy e3d09ba2 · ยังไม่ทดสอบกับร้านจริง:**
- รูปส่งเสริม = `attributes.promotion_square_image` (1:1 · ≥ 330 แนะนำ 1000 · พื้นขาว/โปร่งใส · array ≤ 1) + `promotion_long_image` (3:4 · ≥ 750×1000) — ไม่ใช่ `promotion_whitebkg_image` (ไม่มีในคู่มือ) · ต้องเป็นลิงก์ Lazada · สัดส่วนผิด = Lazada ทิ้งเงียบ ๆ แต่ update สำเร็จ
  - แท็บรูป: กล่อง "รูปภาพส่งเสริมการขาย" (จัตุรัส: รูปบนร้าน/ระบบ · แนวตั้ง: ระบบเท่านั้น) → ฝากด้วย `/api/r2-image?key=…&w=1000&sq=1` / `&w=750&pad=34` (pad=34 ใหม่ = 3:4 พื้นขาว JPEG) · ล้าง = ยังไม่รองรับ
  - XML: `<promotion_square_image>ลิงก์</promotion_square_image>` ใน Attributes (คู่มือเขียนแบบ JSON array ไม่บอกรูปแบบ XML) → route ดึงกลับเช็ก `view.promoSquare/promoLong` ไม่เห็น = เตือน (ถ้าไม่ติดเลย ให้ลองส่งแบบ JSON payload)
- รูปตัวเลือก ≤ 8 รูป: แท็บตัวเลือก → โหมดรูป → กดรูปในแถว → ป๊อป `ListingImageGrid` + `ListingImagePicker` (showShop) · "ใช้รูปชุดนี้กับทุกตัวเลือกสีเดียวกัน" (`lazApplyImagesToGroup` · ค่าชั้นแรกจาก saleProp = `LazadaSkuView.groupValue`)
  - กฎ: ใส่รูปได้เฉพาะชั้นตัวเลือกแรก (Variation1) ที่ไม่ใช่ไซซ์ (`view.imageVariation.isSize`) · รูปครบทุกตัว · ส่งแล้วเทียบจำนวนรูปต่อตัวเลือก
- ถัดไป (รอเจ้าของ): เฟส B ข้อมูลเฉพาะ (`/category/attributes/get` · ส่ง `en_name` · ช่องจำเป็นขาด = Lazada ไม่ให้แก้สินค้า · brand_id ดูอย่างเดียว) + ประกัน (`warranty_type` / `warranty` / `product_warranty`) + ห่อของขวัญ (`gift_wrapping` Yes/No · Lazada เปิดให้เฉพาะร้านที่อนุญาต) · เฟส C ให้ AI เลือก (ลงทะเบียน `ai.platform_attrs` ในศูนย์ AI)

**เฟส B — แท็บ "ข้อมูลเฉพาะ" + ประกัน + ห่อของขวัญ (เจ้าของสั่ง 2026-11-10) · deploy f9da76a4 · ยังไม่ทดสอบกับร้านจริง:**
- รายการช่อง = `/category/attributes/get` ของหมวดสินค้า (ดึงสดเมื่อเปิดแท็บ · `GET /api/lazada/category-attributes` เดิม) → `lazAttributeFromApi` เพิ่ม `choices{name,en}` / `attribute_type` / `is_key_prop` (`options` เดิมคงไว้ให้ /admin/lazada-categories)
- แสดงเฉพาะช่องระดับสินค้าที่ไม่ใช่ตัวเลือกขาย/ชื่อ/รายละเอียด/ยี่ห้อ/รูป (`lazAttrEditable`) · กลุ่ม: ข้อมูลเฉพาะ / การรับประกัน (`warranty_type` `warranty` `product_warranty`) / ห่อของขวัญ (`gift_wrapping` Yes/No — หมวดไม่ส่งมา = เติมให้ `lazAttrDefsWithExtras`)
- ค่า: ส่ง **en_name** (`lazNormAttr` รับชื่อไทย/อังกฤษ) · โชว์ชื่อไทย (`lazAttrDisplay`) · เลือกนอกรายการ (select) = ไม่ผ่าน · ล้างค่า = ยังไม่รองรับ · ช่องจำเป็นว่าง = เตือน + กรอบแดง (Lazada ไม่ให้แก้สินค้าที่ช่องจำเป็นไม่ครบ) · ยี่ห้อดูอย่างเดียว
- ส่งทาง `POST /api/lazada/listing-edit` (`attrs_before`/`attrs_edit` · เฉพาะช่องที่แก้ · ร้านเปลี่ยน = 409) → `<Attributes><ชื่อช่อง>…` → ดึงกลับเทียบค่า (ไม่ตรง = เตือน เช่น ห่อของขวัญไม่ได้รับอนุญาต)
- ⚠️ ยังไม่ยืนยัน: Lazada รับ en_name ผ่าน XML · multiSelect คั่น "," · gift_wrapping ร้านเราได้รับอนุญาตไหม
- ถัดไป: เฟส C ให้ AI เลือก (ลงทะเบียน `ai.platform_attrs` ในศูนย์ AI · เลือกได้เฉพาะในรายการ · โชว์ เดิม → แนะนำ ให้กดใช้)

**กติกา Lazada ที่ต้องระวังตอนทำเฟส 2–4** (สำรวจจาก JSON ของคู่มือ open.lazada.com 2026-11-10):
- `/product/item/get` ใช้ `item_id` เท่านั้น (seller_sku เลิกรองรับแล้ว)
- `/product/update`: ต้องมี `SkuId` ทุก SKU · ⚠️ คู่มือบอกสถานะ SKU "ค่าเริ่ม = active" → **ต้องส่งสถานะเดิมของทุก SKU ไปด้วยเสมอ** (ไม่งั้นตัวเลือกที่ปิดอยู่อาจเปิดเอง — IG ปิดอยู่ 48 ตัว) · ส่ง SKU ครบตามลำดับเดิม (ส่งสลับ Lazada เรียงตัวเลือกใหม่) · รูปลบไม่ได้ ทำได้แค่แทน · ล้างช่องด้วย `d_description`/`d_short_description` · คำตอบอาจได้ `item_status = Pending QC` (ตรวจภายใน 24 ชม.) · Lazada แนะนำห้ามใช้ตัวนี้แก้ราคา/สต๊อก/ปิดขาย
- `/product/price_quantity/update`: ≤ 50 SKU/ครั้ง (แนะนำ 20) · `Quantity` = สต๊อกรวม → ไม่ส่ง (BigSeller ซิงค์อยู่) · ราคาลดมี `SaleStartDate/SaleEndDate`
- รูป: jpg/png · ≤ 3MB · ด้านละ 330–5000px · ≤ 8 รูป/ชุด · ต้องเป็นลิงก์ของ Lazada (error 4138 = รูปภายนอก) → ฝากด้วย `/images/migrate` (≤ 8 · ได้ `batch_id` → `/image/response/get`) · รูปในระบบอาจเป็น webp ต้องแปลงก่อน · "No White Background" เป็นเหตุผลปัดตก QC
- ช่วงแคมเปญ: ประกาศ 11.11 (2026-10-30) ปิด update/ราคา/รูป **10 พ.ย. 19:30–20:30 และ 23:30–00:30 (เวลาไทย)** · error 998 = ปิดระบบ · 501 `THD_IC_ERR_F_IC_ABILITY_PG_00x` = ตัวเลือกร่วมแคมเปญ แก้ไม่ได้ · 12.12 น่าจะมีประกาศแบบเดียวกัน
- ราคาเปลี่ยน ≥ 80% → QC: อยู่ในคู่มือรุ่นเก่า (lazada-sellercenter.readme.io) ไม่มีในคู่มือปัจจุบัน — ยังถือเป็นกฎไว้ก่อน
- เพดานเรียก: แอป Online 10 ล้านครั้ง/วัน · เกิน = ถูกแบน ~14 ชม. · ApiCallLimit = รอแล้วลองใหม่ (1→2→4→8 วิ)

## สร้างสินค้าใหม่บน Lazada + ลงทุกร้านในครั้งเดียว (เฟส A+B · 2026-11-10)

เจ้าของขอ "เพิ่มสินค้าใหม่ทุกที่ทีเดียว" → เฟส A (ตัวสร้าง Lazada · ดูก่อนส่ง) + B (ตัวช่วยลงหลายร้านพร้อมกัน) · ไม่แตะร้าน · เฟส C = เปิดลงจริง (หลัง Lazada เลิกปิดการสร้างสินค้าช่วงแคมเปญ)

- **รูปแบบคำขอ** (อ่านคู่มือทางการ 2026-11-10: API `/product/create` + "Create a product" + "Custom sales attributes"):
  - payload JSON `{Request:{Product:{PrimaryCategory, Images{Image[]}, variation{variation1..2{name,hasImage,customize,options{option[]}}}, Attributes{name,description,short_description,brand,...}, Skus{Sku[{SellerSku,quantity,price,special_price,package_*,saleProp{...},Images}]}}}}`
  - ชั้นตัวเลือก = ช่อง `is_sale_prop` ของหมวด (color_family / size) หรือกำหนดเอง (`customize:true` ชื่อ ≤ 15) · ≤ 2 ชั้น · ค่า ≤ 20 ตัวอักษร · ≤ 50 ค่า · ซ้ำไม่ได้ (4112) · รูปต่อตัวเลือกเฉพาะชั้น 1 ที่ไม่ใช่ size และต้องครบทุก SKU
  - รูป ≤ 8 ต้องเป็นของ Lazada (4138) · รายละเอียดใส่รูปได้เฉพาะลิงก์ Lazada · พัสดุบังคับ (ทศนิยม ≤ 2 · ≤ 40 กก. · กว้าง+ยาว+สูง ≤ 300) · `brand` (เก่า) / `brand_id` — ร้าน IG ใช้ "No Brand" ทุกรายการ
  - ตอบกลับ `{item_id, sku_list[{seller_sku, sku_id, shop_sku}], item_status}` · ไม่มีช่องสร้างแบบปิดขาย → สร้างแล้ว `/product/deactivate` (ค่าเริ่ม "ปิดไว้ก่อน")
- **ตัวประกอบข้อมูลตัวเดียว** `lib/lazada-create-plan.ts` (`planLazadaCreate` · pure + เทสต์ `lib/__tests__/lazada-create-plan.test.ts`) — ใช้ทั้งดูก่อนส่งและลงจริง (ห้ามประกอบที่อื่น) · ตัวโหลด `app/api/lazada/create-product/load.ts` (ช่องของหมวดดึงสด `lazGetCategoryAttributes`)
  - ร่าง Lazada: `title/description/category_path` + extra `lazada_images` (ref `r2:<key>`/ลิงก์) · `lazada_highlights` (บรรทัดละจุดเด่น) · `lazada_weight` · `lazada_variation {color|option|code: {name, customize}}` · `lazada_attrs`
  - ราคา = ราคาเต็ม + ราคาลด (ราคาขาย) · ไม่มีราคาเต็ม = ราคาขายเป็นราคาปกติ · ตัวขายไม่มี → ตัวสี · สต๊อก 0
- **API** `GET /api/lazada/create-product?parent_sku_id=` (ดูก่อนส่ง) · `POST {parent_sku_id, display}` **ปิดไว้** (`LAZADA_CREATE_LIVE=false` ใน `lib/platform-create-registry`) — ลำดับเมื่อเปิด: กันซ้ำ → ล็อก 3 นาที → `/image/migrate` ทีละรูป (`r2:` = `/api/r2-image?…&w=1500&sq=1`) → `lazCreateProduct` → รหัสในร่าง + รายการบนร้าน (จับคู่) → ปิดขาย → audit `lazada_create`
- **หน้าจอ** `components/platform-listing/lazada-create-preview.tsx` (แท็บ Lazada ในตัวช่วยลงสินค้า) — ใช้ของกลาง `ListingImageGrid/ListingImagePicker` · `LazadaAttrField` (export จาก lazada-listing-panels) + `useLazadaAttrDefs` · `PlatformCategoryPicker`
- **ทะเบียนตัวสร้าง** `lib/platform-create-registry.ts` — LINE live · Lazada ดูก่อนส่ง · ร้านใหม่ (Shopee/TikTok/Amaze) = เพิ่มแถว + หน้าดูก่อนส่งของร้านนั้น
- **ตัวช่วยลงสินค้า**: ขั้น 1 ร้านลงจริงได้ / ดูก่อนส่งได้ (บอกเหตุผล) / ร้านอื่น · ขั้น 2 แท็บต่อร้าน · ขั้น 3 ลงทุกร้านรอบเดียว (ร้านที่ยังไม่ live = บันทึกร่าง) · ทางเข้าใหม่: แท็บแพลตฟอร์มของ Parent SKU ปุ่ม "ลงทุกร้าน" + ติ๊กหลายรุ่นในหน้า Parent SKU (ติ๊กทุกร้านที่มีตัวสร้างให้)
- **เฟส C (ยังไม่ทำ · แตะร้าน):** เปลี่ยน `LAZADA_CREATE_LIVE = true` หลังพ้นแคมเปญ → ทดสอบ 1 ตัว (ปิดขาย) · ⚠️ ยังไม่เคยส่ง `/product/create` จริง — JSON payload / variation block / ปิดขายหลังสร้าง ต้องยืนยันกับร้าน
  - แบรนด์: คู่มือบอก `brand` จะเลิกใช้ ให้ใช้ `brand_id` (GetBrandByPages) — ถ้า Lazada ไม่รับ "No Brand" ตอนทดสอบ ต้องหา brand_id ของ No Brand ก่อน · ฝากรูป/ดึงกลับใช้ `lazWithRetry` (ตัวสร้างสินค้าไม่ลองซ้ำเอง กันสร้างซ้ำ)
