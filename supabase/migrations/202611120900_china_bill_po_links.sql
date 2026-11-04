-- 💴 ผูก "บิลจีน" (แอปโอนเงินจีน) ↔ "ใบสั่งซื้อ" (purchase_orders_v2) — เจ้าของอนุมัติ 2026-11-04 (widget ลงบิลเลือกใบสั่งซื้อ)
--
-- ทำไมต้องมีตารางใหม่ (ไม่ใช้ช่องเดิม purchase_orders_v2.china_bill_id อย่างเดียว):
--   ช่องเดิมผูกได้ 1 ใบสั่งซื้อ → 1 บิล และไม่เก็บยอด → จ่ายบางส่วน (มัดจำ/ส่งของเป็นรอบ) และ
--   "บิลนี้จ่ายใบไหนเท่าไร" เก็บไม่ได้ · ข้อมูลจริง: ยอดบิลไม่ตรงผลรวมใบสั่งซื้อพอดี (เช่น บิล ¥22,508 กับใบค้าง 49 ใบ)
--   ช่องเดิมยังอยู่ = "บิลล่าสุดที่ผูก" (ระบบตั้งให้เอง) → ป้ายสถานะกลาง lib/po-pay-state ใช้ต่อได้ไม่ต้องรื้อ
--
-- กติกาสถานะจ่ายเงินของใบสั่งซื้อ (ทำที่ DB = ไม่ว่าจะเปลี่ยนสถานะบิลจากหน้าไหน ใบสั่งซื้อตามเสมอ):
--   ยังไม่ผูกบิล                                  → ไม่แตะ (ตามเดิม)
--   ผูกบิลแล้ว แต่บิลยังโอนไม่ครบ                → china_bill_id = บิลรอโอนล่าสุด (ป้าย "ลงบิลแล้ว รอโอน")
--   จ่ายบางส่วน และบิลที่ผูกโอนหมดแล้ว          → china_bill_id ว่าง (ป้ายกลับเป็นค้างจ่าย — ยังเหลือต้องจ่าย)
--   มีรายการที่ "ปิดยอดใบนี้" + ทุกบิลที่ผูกโอนแล้ว → payment_status = paid · paid_date = วันนี้ (เวลาไทย) · paid_via = china_bill
--   ยกเลิก/ลบบิล หรือเอาใบออกจากบิล              → ถ้าเคยถูกตั้งจ่ายแล้วโดยบิลจีน (paid_via) → กลับเป็นยังไม่จ่าย
--   ใบที่คนกด "จ่ายแล้ว" เอง (paid_via ว่าง)     → ระบบไม่ไปเปลี่ยนให้

-- 1) ตารางผูก (1 แถว = บิล 1 ใบ จ่ายใบสั่งซื้อ 1 ใบ เป็นยอดหยวนเท่านี้)
create table public.china_bill_po_links (
  id                 uuid primary key default gen_random_uuid(),
  bill_id            uuid not null references public.china_bills(id) on delete cascade,
  po_id              uuid not null references public.purchase_orders_v2(id) on delete cascade,
  amount_rmb         numeric not null default 0 check (amount_rmb >= 0),
  -- รอบนี้ "ปิดยอดใบนี้" ไหม (จ่ายครบใบ) — ใบหยวนระบบตั้งให้จากยอดที่เหลือ · ใบสกุลบาทผู้ใช้ติ๊กเอง
  settles_po         boolean not null default true,
  -- ใบสั่งซื้อตั้งสกุลเป็นบาท (ร้านจีน) — ผู้ใช้ติ๊กยืนยันเองแล้วว่าจ่ายด้วยบิลหยวนนี้ (ไม่แปลงอัตโนมัติ)
  currency_confirmed boolean not null default false,
  is_active          boolean not null default true,
  note               text,
  created_by         uuid,
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index china_bill_po_links_pair on public.china_bill_po_links (bill_id, po_id);
create index china_bill_po_links_po on public.china_bill_po_links (po_id) where is_active;

alter table public.china_bill_po_links enable row level security;
create policy china_bill_po_links_sel on public.china_bill_po_links for select to authenticated using (true);
-- เขียนผ่าน API (service role) เท่านั้น
revoke all on public.china_bill_po_links from anon;

-- 2) จำว่าใบสั่งซื้อถูกตั้ง "จ่ายแล้ว" โดยบิลจีน (ไว้ถอยกลับเองตอนยกเลิกบิล — ไม่ไปยุ่งใบที่คนกดจ่ายเอง)
alter table public.purchase_orders_v2 add column if not exists paid_via text;

-- 3) ลบบิลจีน → ช่องบิลบนใบสั่งซื้อว่างเอง (เดิมลบบิลที่ใบสั่งซื้อชี้อยู่ไม่ได้ ติด FK)
alter table public.purchase_orders_v2 drop constraint if exists purchase_orders_v2_china_bill_id_fkey;
alter table public.purchase_orders_v2
  add constraint purchase_orders_v2_china_bill_id_fkey foreign key (china_bill_id) references public.china_bills(id) on delete set null;

-- 4) คำนวณสถานะจ่ายเงินของใบสั่งซื้อ 1 ใบ จากบิลที่ผูก
-- SECURITY DEFINER: ทำงานได้แม้คนแก้บิลมาจากช่องทางที่ติด RLS (เขียน audit_logs ได้เสมอ) · ปิดสิทธิ์เรียกตรงจากภายนอกท้ายไฟล์
create or replace function public.china_pay_sync_po(p_po uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_po      record;
  v_n       int;
  v_settle  boolean;
  v_allpaid boolean;
  v_latest  uuid;
  v_pending uuid;
  v_target  uuid;
  v_thb     numeric;
  v_today   date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select id, po_no, payment_status, paid_via, china_bill_id into v_po
    from purchase_orders_v2 where id = p_po for update;
  if not found then return; end if;

  select count(*),
         coalesce(bool_or(l.settles_po), false),
         coalesce(bool_and(b.status = 'โอนแล้ว'), false),
         (array_agg(l.bill_id order by l.created_at desc))[1],
         (array_agg(l.bill_id order by l.created_at desc) filter (where b.status is distinct from 'โอนแล้ว'))[1],
         case when bool_and(coalesce(b.rate, 0) > 0) then round(sum(l.amount_rmb * b.rate), 2) end
    into v_n, v_settle, v_allpaid, v_latest, v_pending, v_thb
    from china_bill_po_links l
    join china_bills b on b.id = l.bill_id
   where l.po_id = p_po and l.is_active
     and b.is_active is not false and coalesce(b.status, '') <> 'ยกเลิก';

  if v_n = 0 then
    -- ไม่มีบิลที่ใช้ได้ผูกอยู่แล้ว
    if v_po.paid_via = 'china_bill' and v_po.payment_status = 'paid' then
      update purchase_orders_v2 set payment_status = 'unpaid', paid_date = null, paid_amount_thb = null, paid_via = null, updated_at = now()
       where id = p_po;
      insert into audit_logs (action, entity_type, entity_id, metadata)
      values ('update', 'purchase_orders_v2', p_po, jsonb_build_object('actor', 'ระบบ (บิลจีน)', 'field', 'payment_status', 'paid', false, 'via', 'china_bill', 'po_no', v_po.po_no, 'reason', 'ยกเลิก/เอาออกจากบิลจีน'));
    end if;
    if v_po.china_bill_id is not null
       and exists (select 1 from china_bill_po_links where po_id = p_po and bill_id = v_po.china_bill_id) then
      update purchase_orders_v2 set china_bill_id = null where id = p_po;
    end if;
    return;
  end if;

  -- china_bill_id = "บิลที่ยังรอโอน" ล่าสุด (ป้ายเหลือง ลงบิลแล้ว รอโอน) · จ่ายครบแล้ว = บิลล่าสุด (ไว้ดูย้อนหลัง)
  -- จ่ายบางส่วนและบิลโอนหมดแล้ว = ว่าง → ป้ายกลับเป็นค้างจ่ายตามเครดิตร้าน (ยังต้องจ่ายส่วนที่เหลือ)
  v_target := case when v_settle and v_allpaid then v_latest else v_pending end;
  if v_po.china_bill_id is distinct from v_target then
    update purchase_orders_v2 set china_bill_id = v_target where id = p_po;
  end if;

  if v_settle and v_allpaid then
    if coalesce(v_po.payment_status, '') <> 'paid' then
      update purchase_orders_v2 set payment_status = 'paid', paid_date = v_today, paid_amount_thb = v_thb, paid_via = 'china_bill', updated_at = now()
       where id = p_po;
      insert into audit_logs (action, entity_type, entity_id, metadata)
      values ('update', 'purchase_orders_v2', p_po, jsonb_build_object('actor', 'ระบบ (บิลจีน)', 'field', 'payment_status', 'paid', true, 'via', 'china_bill', 'po_no', v_po.po_no, 'bill_id', v_latest, 'paid_amount_thb', v_thb));
    elsif v_po.paid_via = 'china_bill' then
      update purchase_orders_v2 set paid_amount_thb = v_thb where id = p_po;   -- เรทบิลเปลี่ยน → ยอดบาทตาม
    end if;
  elsif v_po.paid_via = 'china_bill' and v_po.payment_status = 'paid' then
    -- เคยครบแล้ว แต่บิลถูกถอยสถานะ / เอารายการปิดยอดออก → กลับเป็นยังไม่จ่าย (ยังผูกบิลอยู่ = ลงบิลแล้ว รอโอน)
    update purchase_orders_v2 set payment_status = 'unpaid', paid_date = null, paid_amount_thb = null, paid_via = null, updated_at = now()
     where id = p_po;
    insert into audit_logs (action, entity_type, entity_id, metadata)
    values ('update', 'purchase_orders_v2', p_po, jsonb_build_object('actor', 'ระบบ (บิลจีน)', 'field', 'payment_status', 'paid', false, 'via', 'china_bill', 'po_no', v_po.po_no, 'reason', 'บิลที่ผูกยังโอนไม่ครบ'));
  end if;
end $$;

-- 5) trigger: เปลี่ยนรายการผูก → คำนวณใบนั้นใหม่
create or replace function public.china_pay_links_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform china_pay_sync_po(old.po_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.po_id is distinct from old.po_id) then
    perform china_pay_sync_po(new.po_id);
  end if;
  return null;
end $$;
create trigger trg_china_bill_po_links_sync
  after insert or update or delete on public.china_bill_po_links
  for each row execute function public.china_pay_links_trg();

-- 6) trigger: บิลเปลี่ยนสถานะ/ปิด/เรท → คำนวณทุกใบที่ผูกกับบิลนั้นใหม่
create or replace function public.china_pay_bill_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status is distinct from old.status or new.is_active is distinct from old.is_active or new.rate is distinct from old.rate then
    for r in select distinct po_id from china_bill_po_links where bill_id = new.id loop
      perform china_pay_sync_po(r.po_id);
    end loop;
  end if;
  return null;
end $$;
create trigger trg_china_bills_sync_po
  after update on public.china_bills
  for each row execute function public.china_pay_bill_trg();

revoke all on function public.china_pay_sync_po(uuid) from public, anon, authenticated;
revoke all on function public.china_pay_links_trg() from public, anon, authenticated;
revoke all on function public.china_pay_bill_trg() from public, anon, authenticated;
