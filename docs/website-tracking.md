# 📊 วัดผล & โฆษณา (เว็บร้าน)

ใช้ทำอะไร: นับคนเข้าเว็บ ดูว่าโฆษณาไหนขายได้ และให้ระบบโฆษณา (Google / Facebook-IG / TikTok / LINE) รู้จักสินค้าในร้าน

## ตั้งค่าที่ไหน

ERP › เว็บไซต์ › 🏪 ข้อมูลร้าน › กลุ่ม **📊 วัดผล & โฆษณา**

| ช่อง | ได้จากไหน | หน้าตา |
|---|---|---|
| Google Analytics 4 | analytics.google.com › Admin › Data streams | `G-XXXXXXXXXX` |
| Meta Pixel | Meta Events Manager › Data sources | ตัวเลข 15–16 หลัก |
| TikTok Pixel | TikTok Ads › Assets › Events | ตัวอักษร+ตัวเลข |
| LINE Tag | LINE Ads › Tracking (LINE Tag) | `xxxxxxxx-xxxx-…` |
| 🔒 Meta Conversions API Token | Events Manager › Settings › Conversions API | โทเค็นยาว (ลับ — หน้าจอเห็นแค่ ••••) |

ใส่รหัสผิดรูปแบบ = ระบบไม่เก็บ (กันสคริปต์แปลก ๆ) · ไม่ใส่สักช่อง = เว็บไม่มีแบนเนอร์คุกกี้ ไม่มีสคริปต์ใด ๆ

## ลูกค้าเห็นอะไร (PDPA)

- เปิดเว็บครั้งแรก → แบนเนอร์ 🍪 **ยอมรับทั้งหมด / เฉพาะที่จำเป็น / ตั้งค่าเอง** (วิเคราะห์ = GA4 · การตลาด = Meta/TikTok/LINE)
- ยังไม่กด = ไม่โหลดอะไรเลย · เปลี่ยนใจได้จากลิงก์ "ตั้งค่าคุกกี้" ท้ายเว็บ · ถามใหม่ทุก ~6 เดือน
- พรีวิวใน ERP / หน้าแก้ผืนผ้าใบ ไม่เก็บ (คนจัดหน้าไม่ใช่ลูกค้า)

## เหตุการณ์ที่ส่ง

ดูสินค้า · ใส่ตะกร้า · เริ่มชำระเงิน · ซื้อสำเร็จ · ค้นหา · กดใจ — ราคาเป็นบาท สกุล THB

- รหัสสินค้า = `รหัสรุ่น-8ตัวแรกของSKUสี` (เช่น `ROAR01-0cfd0cfd`) ตรงกับฟีด → โฆษณาสินค้าจับคู่ได้
- ซื้อสำเร็จ: ส่งจากหน้าเว็บ (Pixel) + ส่งซ้ำจากเซิร์ฟเวอร์ ERP (Conversions API · `lib/meta-capi.ts`) ด้วยเลขออเดอร์เดียวกัน Meta ตัดซ้ำเอง
  - ส่งเฉพาะลูกค้าที่ยินยอม "การตลาด" + ร้านใส่ Pixel และโทเค็น · อีเมล/เบอร์ แฮช SHA-256 ก่อนส่ง · ยอดเงินมาจาก ERP เสมอ

## ฟีดสินค้า

ลิงก์อยู่ใต้กลุ่ม 📊 (ต้องตั้งโดเมนร้านก่อน): `<โดเมน>/feeds/google.xml` · `facebook.xml` · `tiktok.xml`

- 1 รายการต่อสี (จับกลุ่มด้วยรหัสรุ่น) · ไม่ใส่สินค้าที่ยังไม่มีราคา · ไม่ใส่ราคาขีดฆ่า (fake price ใส่เป็นราคาลดผิดนโยบาย Google)
- ปิดเว็บชั่วคราว = ฟีดว่าง · อัปเดตเองตาม ERP (แคช ~15 นาที)

### ตรวจฟีด (กล่องใต้ลิงก์ฟีด · `components/website-feed-check.tsx`)

อ่าน `<โดเมน>/feeds/check.json` จากเว็บร้าน (ตัวสร้างฟีดตัวเดียวกับฟีดจริง `feedReport` → ตัวเลขตรงกับที่ Meta ได้เสมอ · เปิด CORS · แคช 1 นาที · ปุ่ม "ตรวจใหม่" ข้ามแคช)

- บอก: เว็บปิดอยู่ไหม (ปิด = Meta ได้ 0 แต่บอกว่า "ถ้าเปิดจะมีกี่รายการ") · รายการในฟีด · หมดสต็อก · ไม่มีคำอธิบาย
- รายการตกหล่นพร้อมเหตุผล (MiniTable จัดกลุ่มตามเหตุผล): ยังไม่มีราคา · ไม่มีรูป · บางสีไม่มีรูป → แก้ที่ Parent SKU แท็บเว็บไซต์
- เว็บร้านรุ่นเก่า (ไม่มี check.json) = ขึ้นว่า "รอเว็บร้านอัปเดต"

## ร้านบน Facebook / Instagram (Meta Shops) — Checkout URL

ตั้งแต่ปี 2025 Meta เลิกให้จ่ายเงินในแอป · ร้านบนเฟซ/ไอจีส่งลูกค้ามาจ่ายที่เว็บร้านผ่าน **Checkout URL** = `<โดเมน>/checkout/meta` (คัดลอกได้ในกล่องตรวจฟีด)

- Meta เปิด `/checkout/meta?products=<รหัสแคตตาล็อก>:<จำนวน>,…&coupon=<โค้ด>` + พารามิเตอร์วัดผล (utm_*, cart_origin, fbclid)
- เว็บร้าน (`src/lib/meta-checkout.ts` + `src/app/checkout/meta/page.tsx` + `src/components/checkout/MetaCartHandoff.tsx`):
  - รหัสแคตตาล็อก → สินค้า + สี ด้วยกติกาเดียวกับฟีด (`catalogIndex`) · รับรหัสรุ่นเปล่า / id สินค้าด้วย
  - เริ่มตะกร้าใหม่ (Meta แนะนำ) → ใส่ของ → ไปหน้าชำระเงินพร้อมพารามิเตอร์วัดผลเดิม
  - ไซส์: สีนั้นมีไซส์เดียว = เลือกให้เอง · หลายไซส์ = ให้ลูกค้าเลือก (ชิ้นเดียว = พาไปหน้าสินค้าเลย · หลายชิ้น = หน้าสรุป + ปุ่มเลือกต่อ)
  - หมด/ไม่มีราคา/ไม่พบ = บอกในหน้าสรุป ไม่ใส่ตะกร้า
  - โค้ดส่วนลด: ตรวจกับ ERP (`/api/public/storefront/coupon`) ด้วยยอดในตะกร้า → ผ่าน = ใช้ให้เลย · ไม่ผ่าน (เช่น คูปองเฉพาะสมาชิก) = เติมโค้ดไว้ในช่อง
- เจ้าของต้องทำเอง (บัญชีจริง): เปิดเว็บ · ยืนยันโดเมนใน Meta Business · สร้างแคตตาล็อกด้วยลิงก์ `facebook.xml` · สร้างร้านแบบชำระเงินบนเว็บไซต์ → วาง Checkout URL → กดตรวจด้วยเครื่องมือของ Meta

## SEO หน้าสินค้า (เว็บร้าน)

canonical (ตัด `?color=`) · รูปแชร์ · ราคาให้ Facebook · JSON-LD Product + Breadcrumb · หน้าแรก WebSite + Organization (`src/lib/seo.ts`)

## ไฟล์

- ERP: `lib/website-site-info.ts` (ช่อง + ตรวจรูปแบบ + ซ่อนโทเค็น) · `lib/meta-capi.ts` · `components/website-info-panel.tsx` (FeedLinks) · `components/website-feed-check.tsx` (ตรวจฟีด + Checkout URL) · `app/api/website/settings` (mask/restore โทเค็น)
- เว็บร้าน: `src/lib/analytics.ts` · `src/components/layout/Tracking.tsx` · `src/lib/catalog-id.ts` · `src/lib/product-feed.ts` (feedItems/feedReport) · `src/app/feeds/[file]/route.ts` (+ check.json) · `src/lib/meta-checkout.ts` · `src/app/checkout/meta/page.tsx` · `src/components/checkout/MetaCartHandoff.tsx` · `src/lib/seo.ts`

## ข้อจำกัด

- ยังไม่มีหน้า Dashboard ใน ERP (ดูผลในเครื่องมือของแต่ละเจ้า) — อยู่ในแผนชุด 8
- ออเดอร์จากสมาชิกส่งผ่านเซิร์ฟเวอร์เว็บร้าน → Conversions API ไม่มี IP ลูกค้า (Meta ยังจับคู่ด้วยอีเมล/เบอร์/คุกกี้ได้)
