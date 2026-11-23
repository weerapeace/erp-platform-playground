-- 🎁 Set บรรจุภัณฑ์จาก SKU แท็ก Packaging (เจ้าของเลือก 2026-11-23 รอบ 7 + ข้อเสนอ 1-4)
-- packaging_sets.items = [{ sku_id, qty }] (SKU บรรจุภัณฑ์) · category_ids = หมวดสินค้าที่ใช้ Set นี้เป็นค่าเริ่ม (ข้อ 2 · 1 หมวด = 1 Set ตรวจที่ API)
-- parent_skus_v2.pack_set_id = Set ของรุ่น (ไม่ตั้ง = ใช้ Set ของหมวด) · pack_extra = SKU เสริมนอก Set [{ sku_id, qty }] (ข้อ 1)
-- packing_sessions.packaging = บรรจุภัณฑ์ที่ใช้ตอนแพ็คเสร็จ (สำหรับรายงาน ข้อ 4 · ไม่ตัดสต๊อก)
-- รายการรอบ 6 (packaging_items / pack_items) เลิกใช้ — ยังไม่มีรุ่นไหนตั้ง · เก็บตารางไว้ไม่ลบ
create table if not exists public.packaging_sets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  items         jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  category_ids  uuid[] not null default '{}',
  sort          integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
alter table public.packaging_sets enable row level security;
revoke all on public.packaging_sets from anon, authenticated;
comment on table public.packaging_sets is 'Set บรรจุภัณฑ์ (SKU แท็ก Packaging) — แก้ผ่าน /api/packing/packaging เท่านั้น';

alter table public.parent_skus_v2 add column if not exists pack_set_id uuid references public.packaging_sets(id) on delete set null;
alter table public.parent_skus_v2 add column if not exists pack_extra jsonb not null default '[]'::jsonb;
create index if not exists parent_skus_v2_pack_set_idx on public.parent_skus_v2 (pack_set_id) where pack_set_id is not null;
comment on column public.parent_skus_v2.pack_set_id is 'Set บรรจุภัณฑ์ของรุ่น (ไม่ตั้ง = ใช้ Set ของหมวดสินค้า)';
comment on column public.parent_skus_v2.pack_extra is 'SKU บรรจุภัณฑ์เสริมนอก Set [{sku_id, qty}]';

alter table public.packing_sessions add column if not exists packaging jsonb;
comment on column public.packing_sessions.packaging is 'บรรจุภัณฑ์ที่ใช้ตอนแพ็คเสร็จ [{sku_id, code, name, qty}] — รายงานการใช้ (ไม่ตัดสต๊อก)';

-- แท็ก "Packaging" (ข้อ 3) — ติดให้ SKU เองตอนเพิ่มเข้า Set
insert into public.product_families (name, name_en, sort_order)
select 'Packaging', 'Packaging', 100
where not exists (select 1 from public.product_families where lower(name) = 'packaging');
