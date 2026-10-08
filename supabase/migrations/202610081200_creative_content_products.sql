-- สินค้าหลายตัวต่อ 1 คอนเทนต์ (เจ้าของอนุมัติ 2026-10-08: "1 โพสต์โปรโมทหลายสินค้า")
-- ตัวหลัก (is_primary) ยังสะท้อนลง erp_creative_content.sku_id / parent_sku_id เหมือนเดิม → ปฏิทิน/รายงาน/แคปชั่นของเดิมใช้ต่อได้
-- โค้ดฝั่ง API ทนต่อการที่ตารางนี้ยังไม่มี (อ่าน/เขียนไม่สำเร็จ = ถือว่าไม่มีสินค้าเพิ่มเติม) จึง deploy ก่อนหรือหลัง migration ก็ได้
create table if not exists public.erp_creative_content_products (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.erp_creative_content(id) on delete cascade,
  parent_sku_id uuid references public.parent_skus_v2(id) on delete set null,
  sku_id        uuid references public.skus_v2(id) on delete set null,
  sort_order    integer not null default 0,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ccp_content on public.erp_creative_content_products(content_id, sort_order);
create index if not exists idx_ccp_parent  on public.erp_creative_content_products(parent_sku_id);
create index if not exists idx_ccp_sku     on public.erp_creative_content_products(sku_id);
-- ไม่มี policy = เข้าถึงผ่าน service role (API) เท่านั้น — แบบเดียวกับ erp_creative_content_captions
alter table public.erp_creative_content_products enable row level security;
comment on table public.erp_creative_content_products is 'รายการสินค้าในคอนเทนต์ (หลายตัวต่อโพสต์) — ตัวหลัก is_primary สะท้อนลงคอลัมน์ sku_id/parent_sku_id ของ erp_creative_content';

-- เติมข้อมูลเดิม: คอนเทนต์ที่มีสินค้าอยู่แล้ว → 1 แถว เป็นตัวหลัก
insert into public.erp_creative_content_products (content_id, parent_sku_id, sku_id, sort_order, is_primary)
select c.id, c.parent_sku_id, c.sku_id, 0, true
from public.erp_creative_content c
where (c.parent_sku_id is not null or c.sku_id is not null)
  and not exists (select 1 from public.erp_creative_content_products p where p.content_id = c.id);
