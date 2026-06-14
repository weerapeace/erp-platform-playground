-- โมดูล "ใบปะหน้ากล่อง" (carton labels / shipping marks)
-- 1 แถว = 1 เอกสาร (หลายกล่อง) · รายการกล่องเก็บใน cartons jsonb = [{ "qty": number }, ...]
-- carton_no ตอนพิมพ์ = (index+1)/(จำนวนกล่อง) · เข้าถึงผ่าน API (guardApi) เท่านั้น
create table if not exists public.carton_labels (
  id              uuid primary key default gen_random_uuid(),
  from_text       text not null default 'หจก. ไอ.เอส.จี เทรดดิ้ง',
  to_text         text,                       -- ชื่อผู้รับ/ลูกค้า (แก้ได้)
  customer_id     uuid,                        -- อ้างอิงลูกค้า (ถ้าเลือกจาก picker)
  po_no           text,
  sku_id          uuid,                        -- อ้างอิง SKU (ถ้าเลือกจาก picker)
  style_no        text,                        -- STYLE NO. ที่พิมพ์ (แก้ได้)
  color           text,
  total_qty       numeric not null default 0,
  per_carton      numeric not null default 0,
  cartons         jsonb   not null default '[]'::jsonb,
  note            text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists carton_labels_created_at_idx on public.carton_labels (created_at desc);

-- เข้าถึงผ่าน service-role (API) เท่านั้น — เปิด RLS ไม่มี policy (กันอ่านตรงจาก client)
alter table public.carton_labels enable row level security;
