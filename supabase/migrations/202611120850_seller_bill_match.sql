-- บิลจากร้านจีน (送货单) → AI อ่าน + จับคู่กับบรรทัดใบสั่งซื้อของร้านเดียวกัน (ใบสำคัญรับ)
-- 1) ใช้ตารางใบส่งของเดิม purchase_delivery_bills เก็บบิลร้านด้วย แยกด้วยช่อง kind
--    carrier = ใบส่งของบริษัทขนส่ง (EK-…, กก./คิว) ของเดิมทั้งหมด · seller = บิลจากร้าน (ชื่อสินค้า/จำนวน/ราคา ¥)
alter table public.purchase_delivery_bills add column if not exists kind text not null default 'carrier';
alter table public.purchase_delivery_bills add column if not exists bill_no text;        -- เลขที่บิลของร้าน
alter table public.purchase_delivery_bills add column if not exists seller_text text;    -- ชื่อร้านที่พิมพ์ในบิล
alter table public.purchase_delivery_bills add column if not exists total_amount numeric; -- ยอดรวมในบิล (สกุลของใบ)
alter table public.purchase_delivery_bills add column if not exists currency text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_delivery_bills_kind_check') then
    alter table public.purchase_delivery_bills add constraint purchase_delivery_bills_kind_check check (kind in ('carrier', 'seller'));
  end if;
end $$;
create index if not exists purchase_delivery_bills_voucher_kind_idx on public.purchase_delivery_bills (voucher_id, kind);

-- 2) จำคู่ "ชื่อสินค้าในบิลร้าน (จีน)" ↔ สินค้าของเรา แยกตามร้าน — ครั้งหน้าจับให้เอง
--    แยกตามร้านเพราะชื่อจีนเดียวกันคนละร้านอาจเป็นคนละของ · บรรทัด PO ที่ไม่ผูกรหัสสินค้า จำเป็นชื่อบรรทัด (item_name)
create table if not exists public.supplier_item_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references public.partners_v2(id) on delete cascade,
  alias_key text not null,                 -- ชื่อจีน+สเปกที่ตัดช่องว่าง/ตัวพิมพ์แล้ว (lib/seller-bill-match aliasKey)
  name_cn text,
  spec_cn text,
  name_th text,                            -- คำแปลไทยตอนจับคู่ (ไว้โชว์)
  item_sku_id uuid references public.skus_v2(id) on delete cascade,
  item_name text,                          -- ชื่อบรรทัด PO (ใช้เมื่อบรรทัดไม่มีรหัสสินค้า)
  last_unit_price numeric,
  currency text,
  times_used integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_by text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_item_aliases_target_check check (item_sku_id is not null or coalesce(item_name, '') <> '')
);
create unique index if not exists supplier_item_aliases_partner_key_uidx on public.supplier_item_aliases (supplier_partner_id, alias_key);
create index if not exists supplier_item_aliases_sku_idx on public.supplier_item_aliases (item_sku_id);

-- อ่าน/เขียนผ่าน API ฝั่ง server (service role) เท่านั้น
alter table public.supplier_item_aliases enable row level security;
revoke all on public.supplier_item_aliases from anon, authenticated;
