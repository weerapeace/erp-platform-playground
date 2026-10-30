-- 🖨 ลายรีด DTF/UV บนกระเป๋า (เฟส 1) — เจ้าของอนุญาตเพิ่ม 4 อย่างนี้ในแชต 2026-10-30
-- กฎคิด/ตรวจ = lib/website-print-design.ts (pure + test) · ฝั่งเซิร์ฟเวอร์ = lib/website-print-design-server.ts
-- เพิ่มใหม่ทั้งหมด ไม่แก้/ไม่ลบข้อมูลเดิม · ตาราง/คอลัมน์ที่มีอยู่ใช้ "if not exists" (ดู migration_if_not_exists_trap)

-- 1) ค่าตั้งลายรีดต่อรุ่น (แบบเดียวกับ web_personalize) — null/enabled=false = ไม่เปิด
alter table public.store_listings add column if not exists web_print jsonb;
comment on column public.store_listings.web_print is '🖨 ลายรีดบนกระเป๋า: {enabled, method DTF|UV, prices{S,M,L}, maxPerZone, allowUpload, library[{collectionId,label,extra}], zones[{id,label,imageKey,x,y,w,h(%),widthCm,heightCm}]} — lib/website-print-design';

-- 2) แบบที่ลูกค้าออกแบบ (บันทึกตอนกดใส่ตะกร้า · ราคาคิดฝั่ง ERP)
create table if not exists public.store_print_designs (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id) on delete cascade,
  parent_sku_id     uuid not null,
  option_id         text,                                                        -- สีที่เลือกตอนออกแบบ (sku-xxxxxxxx)
  code              text not null unique,                                        -- รหัสแบบ XXXX-XXXX
  method            text not null default 'DTF' check (method in ('DTF', 'UV')),
  placements        jsonb not null default '[]'::jsonb,                          -- [{zone,kind,assetId|upload{path,w,h,alpha},name,x,y,w,h,rot}] ซม.
  zones             jsonb not null default '[]'::jsonb,                          -- สำเนาส่วนพิมพ์ ณ ตอนออกแบบ (ภาพจำลองในออเดอร์ไม่เพี้ยนเมื่อร้านแก้ค่า)
  extra_price       numeric(12, 2) not null default 0 check (extra_price >= 0),  -- ราคาเพิ่มต่อ 1 ใบ
  has_upload        boolean not null default false,
  status            text not null default 'draft' check (status in ('draft', 'ordered')),
  review_status     text check (review_status in ('pending', 'approved', 'reupload', 'rejected')),
  review_note       text,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  order_ref         text,
  ordered_at        timestamptz,
  uploads_purged_at timestamptz,                                                 -- ลบรูปลูกค้าแล้ว (ครบวันเก็บ)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists store_print_designs_shop_idx on public.store_print_designs (shop_id, status, created_at desc);
create index if not exists store_print_designs_review_idx on public.store_print_designs (shop_id, review_status) where review_status is not null;
comment on table public.store_print_designs is '🖨 ลายรีด: แบบที่ลูกค้าวางบนกระเป๋า · ราคาคิดซ้ำฝั่ง ERP · รูปลูกค้าอยู่ bucket print-uploads (ส่วนตัว)';
alter table public.store_print_designs enable row level security;
revoke all on public.store_print_designs from anon, authenticated;

-- 3) ผูกรายการในออเดอร์กับแบบ (แบบเดียวกับ belt_design_id) — ลบแบบ = ตั้งว่าง ไม่ลบรายการ
alter table public.store_order_items add column if not exists print_design_id uuid references public.store_print_designs(id) on delete set null;
create index if not exists store_order_items_print_design_idx on public.store_order_items (print_design_id) where print_design_id is not null;

-- 4) ที่เก็บรูปลูกค้า: ส่วนตัว (ไม่มีลิงก์สาธารณะ · ดูผ่านลิงก์ชั่วคราว) ≤ 25 MB · PNG/JPG/WebP
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-uploads', 'print-uploads', false, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
