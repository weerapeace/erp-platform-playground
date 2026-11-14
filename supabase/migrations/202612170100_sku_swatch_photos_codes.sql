-- 🎨 Swatch รอบ 6 (เจ้าของอนุมัติ 2026-11-14): หลายรูปต่อแผ่น + รหัสภายในของชิ้น (ยังไม่ต้องเป็น SKU แต่ผูกได้)
-- 1) รูปของแผ่น — รูปแรก (sort_order น้อยสุด) = ปก · API คัดลอกปกไป sku_swatches.image_key ให้หน้าเดิมใช้ต่อได้
create table public.sku_swatch_images (
  id          uuid primary key default gen_random_uuid(),
  swatch_id   uuid not null references public.sku_swatches(id) on delete cascade,
  image_key   text not null,
  image_w     integer,
  image_h     integer,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index sku_swatch_images_swatch_idx on public.sku_swatch_images (swatch_id, sort_order);
alter table public.sku_swatch_images enable row level security;   -- อ่าน/เขียนผ่าน API (service role) เท่านั้น เหมือน sku_swatches

-- 2) รหัสแผ่น SW-0001 (ของกลาง erp_next_number) + ตัวนับเลขชิ้น (เลขที่ออกแล้วไม่ใช้ซ้ำ แม้ลบชิ้น)
alter table public.sku_swatches
  add column if not exists code text,
  add column if not exists next_chip_no integer not null default 1;
create unique index if not exists sku_swatches_code_uq on public.sku_swatches (code) where code is not null;

-- 3) ชิ้นบนแผ่น: อยู่รูปไหน · รหัสภายใน (SW-0001-01) · สีจริง · ชื่อสี · มาจาก AI หรือทำเอง
alter table public.sku_swatch_spots
  add column if not exists image_id  uuid references public.sku_swatch_images(id) on delete cascade,
  add column if not exists code      text,
  add column if not exists color_hex text,
  add column if not exists name      text,
  add column if not exists source    text not null default 'manual';
alter table public.sku_swatch_spots drop constraint if exists sku_swatch_spots_source_chk;
alter table public.sku_swatch_spots add constraint sku_swatch_spots_source_chk check (source in ('manual', 'ai'));
alter table public.sku_swatch_spots drop constraint if exists sku_swatch_spots_color_chk;
alter table public.sku_swatch_spots add constraint sku_swatch_spots_color_chk check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$');
create unique index if not exists sku_swatch_spots_code_uq on public.sku_swatch_spots (code) where code is not null;
create index if not exists sku_swatch_spots_image_idx on public.sku_swatch_spots (image_id);

insert into public.erp_numbering_rules (key, label, pattern, reset_policy, current_value, active, notes)
values ('sku_swatch', 'แผ่น Swatch (แผงผ้า)', 'SW-{0000}', 'never', 0, true, 'รหัสแผ่น · รหัสชิ้น = รหัสแผ่น-01, -02 … (นับใน sku_swatches.next_chip_no)')
on conflict (key) do nothing;

-- 4) ย้ายแผ่นเดิมเข้าโครงใหม่: รูปเดิม = รูปที่ 1 · จุดเดิมอยู่รูปที่ 1 · ออกรหัสแผ่น/ชิ้นตามลำดับที่สร้าง
insert into public.sku_swatch_images (swatch_id, image_key, image_w, image_h, sort_order)
select s.id, s.image_key, s.image_w, s.image_h, 0
from public.sku_swatches s
where s.image_key is not null
  and not exists (select 1 from public.sku_swatch_images i where i.swatch_id = s.id);

update public.sku_swatch_spots p
set image_id = i.id
from public.sku_swatch_images i
where i.swatch_id = p.swatch_id and i.sort_order = 0 and p.image_id is null;

do $$
declare r record;
begin
  for r in select id from public.sku_swatches where code is null order by created_at loop
    update public.sku_swatches set code = public.erp_next_number('sku_swatch', null) where id = r.id;
  end loop;
end $$;

with o as (
  select p.id, s.code, row_number() over (partition by p.swatch_id order by p.sort_order, p.created_at) as n
  from public.sku_swatch_spots p join public.sku_swatches s on s.id = p.swatch_id
  where p.code is null and s.code is not null
)
update public.sku_swatch_spots p set code = o.code || '-' || lpad(o.n::text, 2, '0') from o where o.id = p.id;

update public.sku_swatches s
set next_chip_no = coalesce((select count(*) from public.sku_swatch_spots p where p.swatch_id = s.id), 0) + 1;
