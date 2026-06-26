-- รูปปกของงาน (creative task) — ไม่ใส่ = fallback ใช้รูปจาก Parent SKU
alter table public.erp_creative_tasks add column if not exists cover_image_r2_key text;
comment on column public.erp_creative_tasks.cover_image_r2_key is 'รูปปกของงาน (R2 key) — ไม่ใส่ = fallback ใช้รูปจาก Parent SKU';
