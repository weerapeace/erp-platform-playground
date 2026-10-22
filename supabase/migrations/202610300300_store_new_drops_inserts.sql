-- 🖼 รูปแทรกในตารางสินค้าของ "ชุดมาใหม่" (รายชุด) — เจ้าของขอ 2026-10-22
-- ค่า = ListingInsert[] ของกลางเดียวกับรูปแทรกหน้ารายการสินค้า (lib/website-listing · ทำความสะอาดที่ API ด้วย normalizeListingInserts)
-- ค่าเริ่ม = [] → ชุดเดิมทุกชุดหน้าตาเหมือนเดิม · ตารางนี้มีอยู่แล้ว (add column if not exists — ไม่ใช่ create table)
alter table public.store_new_drops
  add column if not exists inserts jsonb not null default '[]'::jsonb;

comment on column public.store_new_drops.inserts is 'รูปแทรกในตารางสินค้าของชุด (ListingInsert[] — ของกลางรูปแทรกหน้ารายการสินค้า)';
