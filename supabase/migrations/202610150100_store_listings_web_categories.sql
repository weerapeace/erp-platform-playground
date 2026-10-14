-- 📂 หมวดสินค้าบนเว็บ: 1 รุ่นอยู่ได้หลายหมวด (ต่อร้าน)
-- null = ยังไม่เคยจัด → ใช้หมวดแบบเดิม (web_category กรอกทับ / กฎจับคู่หมวด ERP / หมวดตั้งต้น)
-- array (รวมว่าง) = จัดเองแล้ว ใช้ตามนี้ (ตัวแรก = หมวดหลัก ใช้โชว์ป้ายบนการ์ด) · key ที่ไม่มีในรายการหมวดของร้านถูกข้ามตอนอ่าน
alter table public.store_listings add column if not exists web_categories text[];
comment on column public.store_listings.web_categories is 'หมวดบนเว็บ (หลายหมวด) — null = ใช้แบบเดิม (web_category/กฎ) · ตัวแรก = หมวดหลัก';
