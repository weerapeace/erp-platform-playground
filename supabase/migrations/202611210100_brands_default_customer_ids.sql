-- ลูกค้าประจำแบรนด์ "หลายราย" (เจ้าของขอ 2026-11-07: "บางทีมีหลายสาขา")
-- เดิม brands.default_customer_id เก็บได้รายเดียว → เพิ่มรายการ default_customer_ids (เรียงตามที่ตั้ง)
-- default_customer_id ยังอยู่ = รายแรกของรายการ (API เขียนให้ตรงกันทุกครั้ง) กันของเดิมที่อ่านช่องนี้พัง
-- (applied บน prod 2026-11-07 ชื่อ brands_default_customer_ids)
alter table public.brands add column if not exists default_customer_ids uuid[] not null default '{}';
update public.brands set default_customer_ids = array[default_customer_id]
  where default_customer_id is not null and cardinality(default_customer_ids) = 0;
comment on column public.brands.default_customer_ids is 'ลูกค้าประจำแบรนด์ (หลายสาขาได้ เรียงตามที่ตั้ง) — ป๊อปสร้างใบสั่งผลิต/ลงออเดอร์ใช้กรองและให้เลือก · รายแรก = default_customer_id';
