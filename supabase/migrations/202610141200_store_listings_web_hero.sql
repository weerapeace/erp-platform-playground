-- 🎬 รูปเปิดหน้าสินค้า (Hero) ต่อรุ่นต่อร้าน — ภาพ/วิดีโอแรกของแกลเลอรี เต็มพื้นที่แบบ Gucci
-- { "desktop": {kind: image|video, key, posterKey}|null, "mobile": {...}|null } — ดู lib/website-hero.ts
-- null = ไม่ได้ตั้ง → หน้าสินค้าใช้รูปสินค้าตามเดิม · เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.store_listings add column if not exists web_hero jsonb;
comment on column public.store_listings.web_hero is 'รูปเปิดหน้าสินค้า {desktop, mobile} — ดู lib/website-hero.ts';
