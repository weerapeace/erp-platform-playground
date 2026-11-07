-- ราคากลางค่าใช้จ่ายเพิ่มของใบงานออกแบบ (แท็บตีราคา) — เจ้าของขอ 2026-11-07 · applied ผ่าน Supabase MCP แล้ว
-- 1 แถว = 1 รายการราคากลาง ใช้ร่วมกันทุกใบงาน · แก้แล้วใบที่ใส่ราคาไปแล้วไม่เปลี่ยน (ค่าที่ใส่เก็บอยู่ในใบ design_sheets.cost_extra)
--   kind = labor_cut : ราคากลางค่าแรง (ตัด/ปลอก/วาด) ต่อชิ้น (amount)
--          oh_fixed  : รายการโสหุ้ยต่อชิ้น เช่น QC / ค่าแรงแพ็ก (label + amount)
--          bag       : ถุง — ขนาด w_cm × l_cm + ราคาต่อใบ (amount)
--          box       : กล่อง — w_cm × l_cm × h_cm + ราคาต่อใบ
--          carton    : ลังส่ง — w_cm × l_cm × h_cm + ค่าส่งต่อลัง
--          parcel    : ขนส่งรายชิ้น — น้ำหนักไม่เกิน max_kg + ราคา
--          other     : ต้นทุนอื่นๆ ที่เลือกใส่ได้ (label + amount · mode split = จ่ายครั้งเดียวหารจำนวนสั่ง)
-- โค้ด: lib/design-cost-presets.ts · API /api/design-sheets/cost-presets
create table if not exists public.design_cost_presets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('labor_cut', 'oh_fixed', 'bag', 'box', 'carton', 'parcel', 'other')),
  label text,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  w_cm numeric(8, 2),
  l_cm numeric(8, 2),
  h_cm numeric(8, 2),
  max_kg numeric(8, 3),
  mode text check (mode is null or mode in ('piece', 'split')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_cost_presets_kind_idx on public.design_cost_presets (kind, sort_order) where is_active;
alter table public.design_cost_presets enable row level security;   -- deny-all: อ่าน/เขียนผ่าน API (service role) เท่านั้น
revoke all on table public.design_cost_presets from anon;
comment on table public.design_cost_presets is 'ราคากลางค่าใช้จ่ายเพิ่ม (ค่าแรงตัด / โสหุ้ย / ถุง / กล่อง / ลังส่ง / ขนส่ง / ต้นทุนอื่นๆ) ของแท็บตีราคา — API /api/design-sheets/cost-presets';
