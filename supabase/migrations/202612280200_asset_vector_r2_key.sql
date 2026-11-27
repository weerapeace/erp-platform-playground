-- SVG เวกเตอร์คู่กับ PNG ที่แยกจากไฟล์ออกแบบ (เปลี่ยนสีได้ทีหลัง) — เจ้าของเลือกแบบ A 2026-11-27
alter table public.assets add column if not exists vector_r2_key text;
comment on column public.assets.vector_r2_key is 'SVG เวกเตอร์คู่กับ PNG (ตัวแยกชิ้น) — ใช้เปลี่ยนสี · R2 key library/...-vec.svg';
