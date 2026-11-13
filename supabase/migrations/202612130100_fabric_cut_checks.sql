-- ผลวัดจริงของแบบตัดผ้า (หน้า /fabric-calc · เจ้าของขอ 2026-11-13 "มีสถานะ คาดการณ์ / วัดจริงแล้ว · วางแล้วได้ตรงให้กดว่าพิสูจน์แล้ว" · อนุมัติสร้างตาราง)
-- 1 แถว = วัดจริง 1 ครั้งของ สินค้า (SKU ลูก) + ผ้า · pieces_fp = ลายนิ้วมือขนาดชิ้นตอนวัด (แก้ชิ้นในสูตรทีหลัง → ไม่ตรง → ป้ายกลับเป็น "คาดการณ์" เอง)
-- ไม่แตะข้อมูลเดิม · เขียน/อ่านผ่าน /api/fabric-cut-checks (guardApi) เท่านั้น — anon/authenticated เข้าตรงไม่ได้ · ยกเลิกผล = is_active false

create table if not exists public.fabric_cut_checks (
  id                uuid        primary key default gen_random_uuid(),
  product_sku       text        not null,
  component_sku     text        not null,
  pieces_fp         text        not null,
  unit              text,
  est_per_unit      numeric,
  actual_per_unit   numeric     not null,
  actual_total      numeric,
  actual_qty        integer,
  variance_pct      numeric,
  mo_no             text,
  note              text,
  measured_by       uuid,
  measured_by_name  text,
  measured_at       timestamptz not null default now(),
  is_active         boolean     not null default true
);
create index if not exists fabric_cut_checks_pair on public.fabric_cut_checks (product_sku, component_sku, measured_at desc) where is_active;

alter table public.fabric_cut_checks enable row level security;   -- ไม่มี policy = เฉพาะ service_role
revoke all on table public.fabric_cut_checks from anon, authenticated;
grant all on table public.fabric_cut_checks to service_role;

comment on table public.fabric_cut_checks is 'ผลวัดจริงแบบตัดผ้า (สินค้า+ผ้า) — /fabric-calc · pieces_fp ไม่ตรงชิ้นปัจจุบัน = กลับเป็นคาดการณ์ · ยกเลิก = is_active false';
