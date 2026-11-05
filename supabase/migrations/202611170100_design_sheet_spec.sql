-- รายละเอียดงาน (Spec) ในใบงานออกแบบ — รอบ 1 (เจ้าของขอ 2026-11-05)
-- รูปหลายหน้า + สิ่งที่วาดบนรูป (สี่เหลี่ยม/วงกลม/ข้อความ/เส้น) + หมุดวัตถุดิบผูก SKU
-- พิกัดทุกตัว = % ของรูป (0-100) เหมือน sku_swatch_spots · อ่าน/เขียนผ่าน API (service role) เท่านั้น

create table public.design_sheet_spec_pages (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references public.design_sheets(id) on delete cascade,
  title       text,
  image_key   text,                                  -- R2 key ของรูป (จากรูปในใบงาน)
  image_url   text not null,                         -- url ที่ใช้แสดง
  image_w     integer,
  image_h     integer,
  shapes      jsonb not null default '[]'::jsonb,    -- สิ่งที่วาด (lib/image-markup cleanMarkupShapes)
  sort_order  integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index design_sheet_spec_pages_sheet_idx on public.design_sheet_spec_pages (sheet_id, sort_order);

create table public.design_sheet_spec_pins (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references public.design_sheets(id) on delete cascade,
  page_id     uuid not null references public.design_sheet_spec_pages(id) on delete cascade,
  no          integer not null,                      -- เลขหมุด (เรียงทั้งใบ)
  x           numeric not null check (x >= 0 and x <= 100),
  y           numeric not null check (y >= 0 and y <= 100),
  part_name   text,                                  -- ส่วนประกอบ เช่น ตัวกระเป๋า / หูหิ้ว
  sku_id      uuid references public.skus_v2(id) on delete set null,
  sku_code    text,                                  -- snapshot ไว้โชว์แม้ SKU ถูกลบ
  sku_name    text,
  qty         numeric,
  uom         text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index design_sheet_spec_pins_sheet_idx on public.design_sheet_spec_pins (sheet_id, no);
create index design_sheet_spec_pins_sku_idx on public.design_sheet_spec_pins (sku_id) where sku_id is not null;

-- เหมือนตารางอื่นของใบงาน: เปิด RLS ไม่มี policy (deny-all) — อ่าน/เขียนผ่าน API เท่านั้น
alter table public.design_sheet_spec_pages enable row level security;
alter table public.design_sheet_spec_pins enable row level security;
revoke all on public.design_sheet_spec_pages from anon;
revoke all on public.design_sheet_spec_pins from anon;
