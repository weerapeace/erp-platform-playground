-- กลุ่มใบสั่งงาน (production batches) — ชุด MO ที่ตั้งชื่อไว้
-- ใช้จัดลำดับเตรียมงาน + พิมพ์วัตถุดิบขอซื้อ/เตรียมตามกลุ่ม
create table if not exists public.mo_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  color text,
  mo_nos jsonb not null default '[]'::jsonb,   -- รายการเลขใบสั่งผลิตในกลุ่ม
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mo_groups is
  'กลุ่มใบสั่งงาน (production batches) — ชุด MO ที่ตั้งชื่อไว้สำหรับจัดลำดับเตรียม/พิมพ์วัตถุดิบตามกลุ่ม. สมาชิกเก็บเป็น mo_nos jsonb array.';
