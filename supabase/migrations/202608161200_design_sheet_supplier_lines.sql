-- 🧮 ตีราคาสินค้าที่ "สั่งจากร้าน" (ไม่ได้ผลิตเอง) — Section ใหม่ในแท็บตีราคาของใบงานออกแบบ
-- ต้นทุนถึงมือ = ราคาสินค้า(บาท) + ค่าส่งเฉลี่ยต่อชิ้น (คิดจากปริมาตรกล่อง × เรตขนส่ง)
create table if not exists public.design_sheet_supplier_lines (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references public.design_sheets(id) on delete cascade,
  parent_code  text,                       -- แท็บไซส์/Parent เดียวกับบรรทัดตีราคา (null = ทั่วไป)
  item_name    text,                       -- 1. รายการ
  supplier_id  uuid references public.partners_v2(id) on delete set null,   -- 2. ร้าน (ทะเบียนคู่ค้า)
  supplier_name text,                      -- ชื่อร้าน (snapshot / กรณีพิมพ์เอง)
  source_url   text,                       -- ลิงก์สินค้าที่ร้าน (เผื่อกลับไปดู)
  price        numeric,                    -- 3. ราคาจากร้าน (ตามสกุล + ตามหน่วยด้านล่าง)
  currency     text not null default 'CNY',-- CNY | THB
  fx_rate      numeric,                    -- เรตหยวน→บาท ที่ใช้จริงตอนตี (snapshot, null = ใช้เรตกลาง)
  price_unit   text not null default 'pcs',-- ราคานี้ต่อ 'pcs' (ชิ้น) หรือ 'pack' (แพ็ค)
  pack_qty     numeric,                    -- ชิ้นต่อแพ็ค (ใช้เมื่อ price_unit='pack')
  qty          numeric,                    -- 5. จำนวนที่สั่ง (ชิ้น)
  offer_price  numeric,                    -- 6. ราคาที่จะเสนอ (ต่อชิ้น)
  -- 11. แผงคำนวณค่าส่ง (ปริมาตรกล่อง)
  box_w_cm     numeric, box_l_cm numeric, box_h_cm numeric,
  ship_mode    text not null default 'ship',  -- truck (รถ) | ship (เรือ)
  ship_rate    numeric,                    -- บาทต่อคิว (null = ใช้เรตกลางตามโหมด)
  freight_total numeric,                   -- snapshot ค่าส่งทั้งรายการ (คำนวณจากหน้าจอ)
  note         text,
  split_json   jsonb not null default '[]'::jsonb,  -- 10. แบ่งกำไรเฉพาะบรรทัดนี้ [{name,type:pct|amt,value,on}]
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_ds_supplier_lines_sheet on public.design_sheet_supplier_lines(sheet_id, sort_order);
comment on table public.design_sheet_supplier_lines is 'ตีราคาสินค้าสั่งจากร้าน (ราคา+ค่าส่งตามคิว→กำไร) ต่อใบงานออกแบบ';

alter table public.design_sheet_supplier_lines enable row level security;
drop policy if exists authenticated_all on public.design_sheet_supplier_lines;
create policy authenticated_all on public.design_sheet_supplier_lines for all to authenticated using (true) with check (true);

-- แบ่งกำไร "ทั้งใบ" เก็บที่ใบงาน (จำนวนน้อย ไม่ต้องแยกตาราง) — [{name,type,value,on}] แยกตามแท็บ Parent ได้
alter table public.design_sheets add column if not exists profit_splits jsonb not null default '{}'::jsonb;
comment on column public.design_sheets.profit_splits is 'แบ่งกำไรทั้งใบ ต่อแท็บ Parent: { "<parent_code|>": [{name,type:pct|amt,value,on}] }';

-- เรตขนส่งกลาง (แก้ได้จากหน้าจอ) — บาทต่อคิว
insert into public.ui_config (key, value)
values ('design_freight_rates', '{"truck": 7000, "ship": 3500}'::jsonb)
on conflict (key) do nothing;
