-- ⭐ สมาชิก M4: สรุปต่อสมาชิกคิดใน DB (แต้มคงเหลือ · ยอดซื้อ 12 เดือนที่นับเลื่อนระดับ · จำนวน/ยอดออเดอร์)
-- ทำไมไม่รวมในแอป: ดึงทีละแถวผ่าน API ติดเพดาน 1,000 แถว → สมาชิกเยอะ/ออเดอร์เยอะแล้วยอดเพี้ยนเงียบ ๆ
-- ยอดเลื่อนระดับ = ยอดสินค้าหลังส่วนลด+แต้ม (ไม่รวมค่าส่ง) ของออเดอร์ "สำเร็จ" ย้อนหลัง 365 วัน (ตรงกับ lib/member-points-db spend12m)
-- เรียกได้เฉพาะ service role

create or replace function public.store_member_stats(p_customers uuid[])
returns table (customer_id uuid, balance integer, spend_12m numeric, order_count integer, order_total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce((select sum(l.delta) from store_point_ledger l where l.customer_id = c.id), 0)::integer,
         coalesce((select sum(greatest(0, o.subtotal - o.discount - o.points_discount)) from store_orders o
                    where o.customer_id = c.id and o.status = 'completed' and o.created_at >= now() - interval '365 days'), 0),
         (select count(*) from store_orders o where o.customer_id = c.id and o.status <> 'cancelled')::integer,
         coalesce((select sum(o.grand_total) from store_orders o where o.customer_id = c.id and o.status <> 'cancelled'), 0)
    from unnest(p_customers) as c(id);
$$;

revoke all on function public.store_member_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.store_member_stats(uuid[]) to service_role;
