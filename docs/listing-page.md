# 🛍 หน้ารายการสินค้า (theme.listing)

ERP: ดีไซน์เว็บ → แท็บ **หน้ารายการสินค้า** · ค่า/ตัวกรองค่า `lib/website-listing.ts` (มิเรอร์ทั้งไฟล์ → storefront `src/lib/listing.ts`)
หน้าจอ ERP: `components/website-listing-panel.tsx` (+ `website-listing-layout.tsx` ส่วนบน) · เว็บร้าน: `ShopClient.tsx` · `ListingInsertTile.tsx` · `ListingPager.tsx`

| ส่วน | ค่า | หมายเหตุ |
|---|---|---|
| 🏷 หัวหน้า | `header.eyebrow/title/subtitle` ("" = ค่าเดิมของร้าน) · `showSearch` · `showCount` | หน้าหมวดใช้ชื่อ/คำอธิบายหมวด · มีคำค้นจากหัวเว็บ = ช่องค้นหาโชว์เสมอ |
| 📐 ต่อแถว | `columns` = `{desktop, desktopRail, tablet, mobile}` หรือ `null` | null = ใช้ "การ์ดสินค้า" ทั้งเว็บ (แถบซ้ายกาง = ลด 1 ช่อง) · desktopRail = ตอนแถบตัวกรองซ้ายกาง |
| 📄 แบ่งหน้า | `paging` all/more/infinite/pages · `pageSize` | เปลี่ยนตัวกรอง/การเรียง/คำค้น → กลับชุดแรก · กลับจากหน้าสินค้า = อยู่ที่เดิม (sessionStorage `sf-pg:<url>`) · รูปแทรกที่รอยต่อ → ต้นชุดถัดไป |
| ↕ การเรียง | `defaultSort` · `sorts` (ว่าง = ซ่อนช่องเรียง) | "ขายดี" โชว์เมื่อมีข้อมูลยอดขาย · รูปแทรกโชว์ตอนยังเรียงแบบเริ่มต้น + ไม่ค้นหา/กรอง |
| 🧭 ตัวกรอง · 🖼 รูปแทรก | `filters` · `inserts` ฯลฯ | ดูคอมเมนต์ใน lib |

- ของกลางที่แก้: `ProductGrid` รับ `columns` (ทับ คอม/แท็บเล็ต/มือถือ) · `ListingInsertTile` รับ `columns` (ช่องกว้างคิดจากคอลัมน์จริง)
- ค่าเริ่มต้นทั้งหมด = หน้าตาเดิม (all · แนะนำ · ค่าการ์ด · หัวหน้าเดิม)
