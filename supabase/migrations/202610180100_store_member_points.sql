-- ⭐ สมาชิก M4: แต้มสะสม + ระดับสมาชิก (ตั้งค่าต่อร้าน · ปิดอยู่จนกว่าเจ้าของเปิดในแท็บข้อมูลร้าน)
--
-- store_point_ledger  = สมุดแต้ม (บวก/ลบทีละรายการ ห้ามแก้ย้อนหลัง) · ยอดคงเหลือ = รวม delta
--   earn   = ได้แต้มเมื่อออเดอร์ "สำเร็จ"        revoke = เรียกคืนเมื่อออเดอร์ถอยจากสำเร็จ/ยกเลิก
--   redeem = ใช้แต้มลดราคาตอนสั่ง             refund = คืนแต้มที่ใช้เมื่อออเดอร์ยกเลิก
--   adjust = พนักงานปรับเอง (ต้องมีเหตุผล + audit)   expire = สำรองไว้ (ยังไม่ใช้)
-- store_member_tiers  = ระดับสมาชิกต่อร้าน (ยอดซื้อ 12 เดือน ≥ min_spend → ได้แต้มคูณ earn_multiplier)
-- store_orders.points_used / points_discount / points_earned = คอลัมน์ใหม่ ค่าเริ่ม 0 (ไม่แตะออเดอร์เดิม)
--
-- ฟังก์ชันล็อกแถวกันทำซ้อน (สั่ง 2 ออเดอร์พร้อมกันแล้วใช้แต้มก้อนเดียวกัน / เปลี่ยนสถานะซ้อน)
-- เรียกได้เฉพาะ service role (API ฝั่งเซิร์ฟเวอร์) — ถอนสิทธิ์ anon/authenticated
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น → เปิด RLS ไม่ตั้ง policy

create table if not exists public.store_point_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.store_customers(id) on delete cascade,
  delta integer not null check (delta <> 0),
  kind text not null check (kind in ('earn', 'redeem', 'refund', 'revoke', 'adjust', 'expire')),
  order_id uuid references public.store_orders(id) on delete set null,
  note text,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists store_point_ledger_customer_idx on public.store_point_ledger (customer_id, created_at desc);
create index if not exists store_point_ledger_order_idx on public.store_point_ledger (order_id) where order_id is not null;

create table if not exists public.store_member_tiers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  key text not null,
  name text not null,
  min_spend numeric(12, 2) not null default 0 check (min_spend >= 0),
  earn_multiplier numeric(5, 2) not null default 1 check (earn_multiplier >= 1 and earn_multiplier <= 10),
  color text not null default '#9CA3AF',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, key)
);

alter table public.store_orders add column if not exists points_used integer not null default 0;
alter table public.store_orders add column if not exists points_discount numeric(12, 2) not null default 0;
alter table public.store_orders add column if not exists points_earned integer not null default 0;

alter table public.store_point_ledger enable row level security;
alter table public.store_member_tiers enable row level security;
comment on table public.store_point_ledger is 'สมุดแต้มสมาชิกเว็บร้าน (ยอดคงเหลือ = sum(delta)) · เขียนผ่านฟังก์ชัน store_points_* เท่านั้น';
comment on table public.store_member_tiers is 'ระดับสมาชิกเว็บร้านต่อร้าน (ยอดซื้อย้อนหลัง 12 เดือน)';

-- ใช้แต้มตอนสั่ง: ล็อกแถวสมาชิก → ยอดคงเหลือพอไหม → ตัดแต้ม (false = แต้มไม่พอ ให้ยกเลิกออเดอร์ที่เพิ่งสร้าง)
create or replace function public.store_points_redeem(p_customer uuid, p_order uuid, p_points integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_bal integer;
begin
  if p_points is null or p_points <= 0 then return true; end if;
  select shop_id into v_shop from store_customers where id = p_customer and status = 'active' for update;
  if v_shop is null then return false; end if;
  select coalesce(sum(delta), 0) into v_bal from store_point_ledger where customer_id = p_customer;
  if v_bal < p_points then return false; end if;
  insert into store_point_ledger (shop_id, customer_id, delta, kind, order_id, note, actor)
  values (v_shop, p_customer, -p_points, 'redeem', p_order, 'ใช้แต้มตอนสั่งซื้อ', 'customer');
  return true;
end;
$$;

-- ปรับแต้มของออเดอร์ตามสถานะ: แอปคิดรายการมา (lib/member-points pointsSyncRows) จากยอดที่อ่านได้
-- ฟังก์ชันล็อกออเดอร์แล้วเช็กว่ายอดตอนนี้ยังตรงกับที่แอปเห็น — ไม่ตรง (มีคนทำซ้อน) = ไม่เขียน คืน false ให้คิดใหม่
create or replace function public.store_points_apply(p_order uuid, p_earn_now integer, p_redeem_now integer, p_rows jsonb, p_earned integer, p_actor text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_customer uuid;
  v_earn integer;
  v_redeem integer;
begin
  select shop_id, customer_id into v_shop, v_customer from store_orders where id = p_order for update;
  if v_customer is null then return true; end if;
  select coalesce(sum(delta) filter (where kind in ('earn', 'revoke')), 0),
         coalesce(sum(delta) filter (where kind in ('redeem', 'refund')), 0)
    into v_earn, v_redeem
    from store_point_ledger where order_id = p_order;
  if v_earn <> p_earn_now or v_redeem <> p_redeem_now then return false; end if;
  insert into store_point_ledger (shop_id, customer_id, delta, kind, order_id, note, actor)
  select v_shop, v_customer, x.delta, x.kind, p_order,
         case x.kind when 'earn' then 'ได้แต้มจากออเดอร์' when 'revoke' then 'เรียกแต้มคืน (ออเดอร์เปลี่ยนสถานะ)'
                     when 'refund' then 'คืนแต้มที่ใช้ (ออเดอร์ยกเลิก)' else 'ใช้แต้มตอนสั่งซื้อ' end,
         p_actor
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(kind text, delta integer)
   where x.delta <> 0;
  update store_orders set points_earned = greatest(0, p_earned) where id = p_order;
  return true;
end;
$$;

-- พนักงานปรับแต้มเอง: ล็อกแถวสมาชิก · ห้ามหักจนติดลบ · คืนยอดใหม่ (null = หักเกินที่มี)
create or replace function public.store_points_adjust(p_customer uuid, p_delta integer, p_note text, p_actor text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_bal integer;
begin
  select shop_id into v_shop from store_customers where id = p_customer for update;
  if v_shop is null or p_delta is null or p_delta = 0 then return null; end if;
  select coalesce(sum(delta), 0) into v_bal from store_point_ledger where customer_id = p_customer;
  if v_bal + p_delta < 0 then return null; end if;
  insert into store_point_ledger (shop_id, customer_id, delta, kind, note, actor)
  values (v_shop, p_customer, p_delta, 'adjust', p_note, p_actor);
  return v_bal + p_delta;
end;
$$;

revoke all on function public.store_points_redeem(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.store_points_apply(uuid, integer, integer, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.store_points_adjust(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.store_points_redeem(uuid, uuid, integer) to service_role;
grant execute on function public.store_points_apply(uuid, integer, integer, jsonb, integer, text) to service_role;
grant execute on function public.store_points_adjust(uuid, integer, text, text) to service_role;
