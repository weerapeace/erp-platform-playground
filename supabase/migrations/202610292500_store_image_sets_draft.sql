-- 🖼 ชุดรูปกลาง: ร่าง (2026-10-22) — แก้รูป/จุดสำคัญ = เก็บร่างก่อน (เว็บจริงยังเห็นรูปเดิม) · พรีวิวเห็นร่าง · "ใช้รูปนี้" = ขึ้นเว็บ
alter table public.store_image_sets add column if not exists draft jsonb;
comment on column public.store_image_sets.draft is 'ร่างรูปของชุด {desk, mob, fx, fy, mfx, mfy} ที่ยังไม่ขึ้นเว็บ — null = ไม่มีร่าง';
