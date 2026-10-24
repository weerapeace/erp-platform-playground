-- ============================================================
-- 🔄 ซิงค์สต๊อกหลายช่องทาง — เฟส 1 (ฐานกลาง + เทียบยอด · ยังไม่ส่งอะไรออกไปที่ร้าน)
-- ร้านแรก: IG International × BigSeller (โปรแกรมกลางที่ร้านใช้อยู่ → ERP ส่งยอดผ่านตัวนี้ในเฟส 2)
--
-- 1) เติมช่องในทะเบียนจับคู่ SKU เดิม `marketplace_sku_mappings` (ยังว่าง 0 แถว — ไม่สร้างตารางที่ 3)
--    แถวของปลายทางซิงค์ใช้ platform = provider (เช่น 'bigseller') + channel_id
--    แถวของหน้าการตลาดเดิม (platform=shopee/lazada · ระดับ item) ไม่กระทบ — ช่องใหม่ว่างได้ทั้งหมด
-- 2) ตารางใหม่ `stock_sync_channels` = ปลายทางที่ระบบจะส่งยอดไป (แบรนด์ · โปรแกรม · คลังต้นทาง · ยอดกันไว้ · โหมด)
-- 3) มุมมอง `v_channel_stock_compare` = ยอดพร้อมขาย (คลังต้นทาง − จอง − กันไว้) เทียบยอดที่ปลายทาง
-- 4) ฟังก์ชันจับคู่รหัส → SKU (รหัส ไม่สนตัวพิมพ์/ช่องว่าง → บาร์โค้ด) ให้ API เรียกครั้งเดียวทั้งไฟล์
-- 5) ปิดสิทธิ์ anon ที่ทะเบียนจับคู่ (เดิมใครไม่ล็อกอินก็แก้ได้) · ตาราง/มุมมองใหม่ = เซิร์ฟเวอร์เท่านั้น
-- 6) เมนู "🔄 ซิงค์สต๊อก" ในแอปช่องทางขาย
-- ============================================================

-- ---------- 2) ปลายทางซิงค์ (สร้างก่อน เพราะทะเบียนจับคู่อ้างถึง) ----------
create table public.stock_sync_channels (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands(id),
  provider            text not null check (provider in ('bigseller','zort','lazada','shopee','tiktok','line_shopping','website')),
  label               text not null,
  -- คลังที่ "ขายออนไลน์" — ยอดพร้อมขายคิดจากคลังนี้คลังเดียว (งานผลิตเบิกของจากคลังอื่นไม่กระทบหน้าร้าน)
  warehouse_id        uuid not null references public.erp_playground_warehouses(id),
  -- กันไว้กี่ชิ้น (เหลือเท่านี้ให้ถือว่าหมด) — กันขายเกินตอนออเดอร์เข้าพร้อมกันหลายร้าน
  buffer_qty          numeric not null default 0 check (buffer_qty >= 0),
  -- off = ปิด · compare = เทียบอย่างเดียว · dry_run = คำนวณสิ่งที่จะส่งแต่ไม่ส่ง · live = ส่งจริง (เฟส 2)
  mode                text not null default 'compare' check (mode in ('off','compare','dry_run','live')),
  last_import_at      timestamptz,
  last_import_by      text,
  last_import_summary jsonb,
  note                text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (brand_id, provider)
);
alter table public.stock_sync_channels enable row level security;   -- ไม่มี policy = อ่าน/เขียนผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น
revoke all on public.stock_sync_channels from anon, authenticated;

comment on table public.stock_sync_channels is 'ปลายทางซิงค์สต๊อก (แบรนด์ × โปรแกรม/ร้าน) — คลังต้นทาง ยอดกันไว้ โหมด off/compare/dry_run/live';

-- ---------- 1) เติมช่องทะเบียนจับคู่ SKU ----------
alter table public.marketplace_sku_mappings
  add column if not exists channel_id      uuid references public.stock_sync_channels(id) on delete cascade,
  add column if not exists brand_id        uuid references public.brands(id),
  add column if not exists sku_id          uuid references public.skus_v2(id) on delete set null,
  add column if not exists qty_per_unit    numeric not null default 1 check (qty_per_unit > 0),
  add column if not exists is_combo        boolean not null default false,
  add column if not exists sync_enabled    boolean not null default false,
  add column if not exists external_qty    numeric,
  add column if not exists external_on_hand numeric,
  add column if not exists external_qty_at timestamptz,
  add column if not exists external_warehouse text,
  add column if not exists match_method    text check (match_method in ('code','barcode','manual')),
  add column if not exists source          text;

create index if not exists idx_marketplace_sku_map_channel on public.marketplace_sku_mappings (channel_id);
create index if not exists idx_marketplace_sku_map_sku on public.marketplace_sku_mappings (sku_id);

comment on column public.marketplace_sku_mappings.channel_id is 'ปลายทางซิงค์ (stock_sync_channels) — null = แถวของหน้าการตลาดเดิม';
comment on column public.marketplace_sku_mappings.sync_enabled is 'เปิดส่งยอดของ SKU นี้ (เฟส 2) — ค่าเริ่มต้นปิด กันส่ง 0 ทับร้านก่อนนับสต๊อก';
comment on column public.marketplace_sku_mappings.external_qty is 'ยอดพร้อมขายที่ปลายทาง ณ external_qty_at (จากไฟล์ export / API) — ใช้เทียบกับยอดพร้อมขายของ ERP';
comment on column public.marketplace_sku_mappings.external_on_hand is 'ของในคลังที่ปลายทาง (ก่อนหักที่จองให้ออเดอร์) — ใช้เป็นยอดตั้งต้นของคลัง ERP';

-- 5) เดิม anon (ไม่ล็อกอิน) อ่าน/แก้/ลบได้ทั้งตาราง → ถอน (แอปเข้าผ่านผู้ใช้ที่ล็อกอิน หรือ API ฝั่งเซิร์ฟเวอร์อยู่แล้ว)
revoke all on public.marketplace_sku_mappings from anon;

-- ---------- 3) มุมมองเทียบยอด ----------
create view public.v_channel_stock_compare
with (security_invoker = true) as
with ch as (
  select c.id, c.brand_id, c.provider, c.warehouse_id, c.buffer_qty
  from public.stock_sync_channels c
  where c.is_active
),
mapped as (
  select
    m.id,
    ch.id                               as channel_id,
    ch.brand_id,
    ch.provider,
    m.marketplace_sku                   as external_sku,
    m.listing_name                      as external_name,
    m.sku_id,
    s.code                              as sku_code,
    s.name_th                           as sku_name,
    m.is_combo,
    m.match_method,
    m.sync_enabled,
    coalesce(b.qty_on_hand, 0)          as on_hand,
    coalesce(b.qty_reserved, 0)         as reserved,
    ch.buffer_qty,
    m.external_qty,
    m.external_on_hand,
    m.external_qty_at,
    m.external_warehouse,
    -- SKU เดียวกันถูกจับคู่กับหลายรหัสใน BigSeller (ยอดเดียวจะไปโผล่หลายที่)
    case when m.sku_id is null then 0
         else count(*) over (partition by ch.id, m.sku_id) end as dup_count
  from public.marketplace_sku_mappings m
  join ch on ch.id = m.channel_id
  left join public.skus_v2 s on s.id = m.sku_id
  left join public.erp_playground_stock_balances b
         on b.product_id = m.sku_id and b.warehouse_id = ch.warehouse_id
),
orphan as (
  -- มีของในคลังออนไลน์ของ ERP (แบรนด์นี้) แต่ไม่มีรหัสนี้ในไฟล์ปลายทาง
  select
    md5(ch.id::text || b.product_id::text)::uuid as id,
    ch.id                        as channel_id,
    ch.brand_id                  as brand_id,
    ch.provider                  as provider,
    null::text                   as external_sku,
    null::text                   as external_name,
    b.product_id                 as sku_id,
    s.code                       as sku_code,
    s.name_th                    as sku_name,
    false                        as is_combo,
    null::text                   as match_method,
    false                        as sync_enabled,
    coalesce(b.qty_on_hand, 0)   as on_hand,
    coalesce(b.qty_reserved, 0)  as reserved,
    ch.buffer_qty                as buffer_qty,
    null::numeric                as external_qty,
    null::numeric                as external_on_hand,
    null::timestamptz            as external_qty_at,
    null::text                   as external_warehouse,
    0::bigint                    as dup_count
  from ch
  join public.erp_playground_stock_balances b on b.warehouse_id = ch.warehouse_id
  join public.skus_v2 s on s.id = b.product_id
  join public.parent_skus_v2 p on p.id = s.parent_sku_id and p.brand_id = ch.brand_id
  where (coalesce(b.qty_on_hand, 0) <> 0 or coalesce(b.qty_reserved, 0) <> 0)
    and not exists (
      select 1 from public.marketplace_sku_mappings m2
      where m2.channel_id = ch.id and m2.sku_id = b.product_id
    )
),
unioned as (
  select * from mapped
  union all
  select * from orphan
),
calc as (
  select u.*,
    case when u.sku_id is null or u.is_combo then null
         else greatest(u.on_hand - u.reserved - u.buffer_qty, 0) end as available
  from unioned u
)
select
  c.*,
  case when c.available is null or c.external_qty is null then null
       else c.available - c.external_qty end as diff,
  case
    when c.is_combo                       then 'combo'
    when c.sku_id is null                 then 'unmatched'
    when c.external_sku is null           then 'not_in_channel'
    when c.dup_count > 1                  then 'duplicate'
    when c.external_qty is null           then 'no_data'
    when c.available = c.external_qty     then 'match'
    when c.available > c.external_qty     then 'erp_more'
    else 'erp_less'
  end as status
from calc c;

revoke all on public.v_channel_stock_compare from anon, authenticated;
comment on view public.v_channel_stock_compare is 'ยอดพร้อมขาย (คลังต้นทาง − จอง − กันไว้) เทียบยอดที่ปลายทาง ต่อรหัส — อ่านผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น';

-- ---------- 4) จับคู่รหัส → SKU ทีเดียวทั้งไฟล์ ----------
-- ลำดับ: รหัส SKU (ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย, เฉพาะตัวที่ใช้งาน) → บาร์โค้ด
create or replace function public.erp_stock_sync_find_skus(p_codes text[])
returns table (input_code text, sku_id uuid, sku_code text, matched_by text)
language sql stable
set search_path = public
as $$
  with inp as (
    select distinct c as input_code, upper(btrim(c)) as k
    from unnest(p_codes) c
    where c is not null and btrim(c) <> ''
  ),
  by_code as (
    select i.input_code, s.id as sku_id, s.code as sku_code, 'code'::text as matched_by
    from inp i
    join public.skus_v2 s on upper(btrim(s.code)) = i.k and s.is_active = true
  ),
  by_barcode as (
    select distinct on (i.input_code) i.input_code, s.id, s.code, 'barcode'::text
    from inp i
    join public.skus_v2 s on btrim(s.barcode) = btrim(i.input_code) and s.is_active = true
    where not exists (select 1 from by_code bc where bc.input_code = i.input_code)
    order by i.input_code, s.code
  )
  select * from by_code
  union all
  select * from by_barcode;
$$;
revoke all on function public.erp_stock_sync_find_skus(text[]) from public, anon, authenticated;
grant execute on function public.erp_stock_sync_find_skus(text[]) to service_role;

-- ---------- ปลายทางแรก: IG International × BigSeller × คลังออนไลน์ (โหมดเทียบอย่างเดียว) ----------
insert into public.stock_sync_channels (brand_id, provider, label, warehouse_id, buffer_qty, mode, note)
select b.id, 'bigseller', 'IG International · BigSeller', w.id, 0, 'compare',
       'เฟส 1: เทียบยอดอย่างเดียว ยังไม่ส่งอะไรไป BigSeller'
from public.brands b, public.erp_playground_warehouses w
where b.name = 'IG International' and w.code = 'WH-ONLINE'
on conflict (brand_id, provider) do nothing;

-- ---------- 6) เมนู ----------
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select 'งานขายออนไลน์', 20, 25, '🔄', 'ซิงค์สต๊อก (เทียบยอด)', '/master/stock-sync', true, true, 'products.platforms.view', true, array['marketplace']
where not exists (select 1 from public.erp_menu_items where href = '/master/stock-sync');
