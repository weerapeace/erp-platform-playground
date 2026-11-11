# ทะเบียนรายการที่ผูกกับรุ่นสินค้า (Parent SKU)

ของกลาง `lib/parent-links-registry.ts` → ตัวอ่าน `lib/parent-links-server.ts` → `GET /api/parent-skus/[id]/links` → หน้าจอ `components/parent-linked-records.tsx` (แท็บ "ภาพรวม" ของ Parent SKU)

## ใช้ทำอะไร
รวม "ทุกเอกสาร/งาน/ไฟล์ที่ผูกกับรุ่นนี้" ไว้ที่เดียว แบ่งหมวด (ครีเอทีฟ · ออกแบบ · ผลิต · ขาย · เว็บร้าน · การตลาด · จัดซื้อ) กดไปที่รายการนั้นได้ งานครีเอทีฟ/คอนเทนต์/คลังรูปโชว์เป็นรูป

## เพิ่มแหล่งใหม่ (ไม่ต้องแก้หน้าจอ/API)
ใส่ 1 ก้อนใน `PARENT_LINK_SOURCES`: `table` · `select` (ต้องมี id) · `match` (วิธีผูก) · `toItem` (ชื่อ/รูป/ลิงก์)
วิธีผูก: `parent_id` · `parent_code` · `parent_codes` (jsonb array) · `sku_ids` · `sku_codes` (ผ่าน SKU ลูก) · `via` (ตารางเชื่อม)
เปิดเป็นป๊อปของกลาง: `open: { kind: "listing" | "mo" }` · ไปหน้าอื่น: `href` (เปิดแท็บใหม่)

## กันลืม (เจ้าของขอ "บางทีลืม")
เทสต์ `lib/__tests__/parent-links-registry.test.ts` อ่าน `supabase/migrations` ทุกไฟล์ → ตารางที่มีคอลัมน์ `parent_sku*` ต้องอยู่ในทะเบียน หรือใน `PARENT_LINK_IGNORED` พร้อมเหตุผล ไม่งั้นเทสต์ไม่ผ่าน

## ข้อจำกัด
- โชว์สูงสุด 60 แถวต่อแหล่ง (เกิน = "60+")
- เอกสารขาย/ซื้อที่เก็บ SKU เป็นข้อความในบรรทัด (ใบเสนอราคา/ใบสั่งขาย/PO) ยังไม่รวม — เพิ่มเป็นแหล่ง `sku_codes` ได้
- ตารางเก่าที่ไม่ได้สร้างผ่าน migration (เช่น skus_v2, store_listings) เทสต์จับไม่ได้ ต้องเพิ่มเอง
