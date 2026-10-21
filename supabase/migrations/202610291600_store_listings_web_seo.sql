-- 🔎 SEO รายสินค้าบนเว็บร้าน (ชุด 7 · 2026-10-22) — ชื่อ/คำอธิบายที่โชว์ใน Google + ตอนแชร์ (ว่าง = ใช้ชื่อ/คำอธิบายสินค้าตามเดิม)
-- {title, description, title_en, description_en} · ทำความสะอาดที่ lib/website-listing-patch cleanListingSeo
alter table public.store_listings add column if not exists web_seo jsonb;
comment on column public.store_listings.web_seo is 'SEO รายสินค้า {title, description, title_en, description_en} — ว่าง = ใช้ชื่อ/คำอธิบายสินค้า';
