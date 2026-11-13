-- บันทึกผล "คิดผ้าก่อนซื้อ" (หน้า /fabric-calc · เฟส 2 · เจ้าของอนุมัติสร้างตาราง 2026-11-13)
-- 1 แถว = การคำนวณ 1 ชุด (ผ้าเดียว หรือ ทั้งตระกูลแบ่งสี) · payload = ค่าที่กรอกทั้งหมด (เปิดกลับมาคำนวณใหม่ได้) · summary = ตัวเลขสรุปไว้โชว์ในรายการ
-- ไม่แตะข้อมูลเดิม · เขียน/อ่านผ่าน API ฝั่งเซิร์ฟเวอร์ (/api/fabric-buy-calcs · guardApi products.view) เท่านั้น — anon/authenticated เข้าตรงไม่ได้
-- ลบ = is_active false (ลบแบบนุ่ม)

create table if not exists public.fabric_buy_calcs (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  mode             text        not null default 'single' check (mode in ('single', 'family')),
  payload          jsonb       not null default '{}'::jsonb,
  summary          jsonb,
  created_by       uuid,
  created_by_name  text,
  updated_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_active        boolean     not null default true
);
create index if not exists fabric_buy_calcs_active_updated on public.fabric_buy_calcs (is_active, updated_at desc);

alter table public.fabric_buy_calcs enable row level security;   -- ไม่มี policy = เฉพาะ service_role
revoke all on table public.fabric_buy_calcs from anon, authenticated;
grant all on table public.fabric_buy_calcs to service_role;

comment on table public.fabric_buy_calcs is 'บันทึกผลคิดผ้าก่อนซื้อ (/fabric-calc) — payload = ค่าที่กรอก · summary = ตัวเลขสรุป · ลบแบบนุ่ม is_active';
