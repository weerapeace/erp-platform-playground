-- SAMPLE Images: คำค้นของอัลบั้ม (เจ้าของเลือกแบบ C 2026-11-25) — คำที่พิมพ์ค้นแล้วเจออัลบั้มนี้
-- เก็บเป็นรายการคำ (jsonb array ของข้อความ) · ว่าง = ไม่มีคำค้น · คำค้นของรูปใช้ assets.keywords เดิม (ข้อความคั่นด้วย ,)
alter table public.asset_collections add column if not exists keywords jsonb not null default '[]'::jsonb;
comment on column public.asset_collections.keywords is 'คำค้นของอัลบั้ม (SAMPLE Images) — jsonb array ของข้อความ';
