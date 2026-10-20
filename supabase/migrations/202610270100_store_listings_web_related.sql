-- 🔗 สินค้าที่เกี่ยวข้อง "เลือกเองรายรุ่น" (2026-10-20 · เจ้าของเลือก)
-- store_listings.web_related = รหัส Parent SKU (ตัวพิมพ์ใหญ่) ที่อยากให้ขึ้นใน "สินค้าที่เกี่ยวข้อง" ของรุ่นนี้ (เรียงตามที่เลือก · ≤ 12)
-- null = ไม่ได้เลือก → ใช้กฎกลางในแท็บ 🔗 แนะนำสินค้า ของหน้าดีไซน์ · ตั้งในแท็บ 🛍 เว็บไซต์ ของสินค้า (lib/website-listing-patch webRelated)
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.store_listings add column if not exists web_related text[];

comment on column public.store_listings.web_related is 'สินค้าที่เกี่ยวข้องที่เลือกเองรายรุ่น (รหัส Parent SKU ตัวพิมพ์ใหญ่ เรียงตามที่เลือก) · null = ใช้กฎกลางของธีม';
