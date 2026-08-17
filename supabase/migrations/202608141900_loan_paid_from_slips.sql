-- ============================================================
-- Loan & OD — "เงินต้นที่ชำระแล้ว / ดอกเบี้ยที่จ่ายแล้ว" ต้องขึ้นแม้ยังไม่มีตารางผ่อน
-- ------------------------------------------------------------
-- เจ้าของแจ้ง (ชี้ที่หมวดความคืบหน้าการผ่อน): "ตรงนี้ไม่แก้ให้"
--   ผ่อนไปแล้ว (รวม) = ฿1,057,811.46  แต่ เงินต้นที่ชำระแล้ว = ฿0 · ดอกเบี้ยที่จ่ายแล้ว = ฿0
--
-- สาเหตุ: สูตรเดิมดึง 2 ค่านี้จาก "งวดผ่อน" (loan_installments) อย่างเดียว
--         สัญญาที่ยังไม่ได้สร้างตารางผ่อน จึงเป็น 0 เสมอ ทั้งที่ใบจ่ายแยกยอดไว้ครบแล้ว
--
-- แก้: ยึด "ใบจ่าย" เป็นต้นทางของ 2 ค่านี้
--   • ใบที่แยกยอดไว้ (เงินต้น/ดอกเบี้ย/…) → ใช้ตัวเลขในใบนั้นตรง ๆ (เป็นความจริงที่สุด)
--   • ใบที่ไม่ได้แยก → ใช้ยอดที่ระบบตัดเข้างวดให้ (ต้องมีตารางผ่อนถึงจะตัดได้)
--   → ไม่นับซ้ำ เพราะเลือกทางใดทางหนึ่งต่อใบ
--
-- ผลพลอยได้: "เงินต้นคงเหลือ" (เบิกสะสม − เงินต้นที่ชำระแล้ว) ลดลงถูกต้องทันที
-- หมายเหตุ: จำนวนงวด/งวดถัดไป ยังต้องมีตารางผ่อนถึงจะคิดได้ (เป็นเรื่องของงวด ไม่ใช่ยอดเงิน)
-- ============================================================
create or replace function public.loan_contract_recompute(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_ver uuid;
begin
  if p_id is null then return; end if;

  -- 1) เงินต้น/ดอกเบี้ยที่จ่ายไปแล้ว — จากใบจ่าย (แยกยอดเอง) หรือจากที่ระบบตัดเข้างวด
  update public.loan_contracts c
  set principal_paid_amount = t.pri,
      interest_paid_amount  = t.int_amt
  from (
    select
      coalesce(sum(case when p.split_sum > 0 then p.principal_amount else coalesce(al.pri, 0) end), 0) as pri,
      coalesce(sum(case when p.split_sum > 0 then p.interest_amount  else coalesce(al.int_amt, 0) end), 0) as int_amt
    from (
      select x.*,
             coalesce(x.principal_amount,0) + coalesce(x.interest_amount,0) + coalesce(x.penalty_amount,0)
             + coalesce(x.fee_amount,0) + coalesce(x.other_amount,0) as split_sum
      from public.loan_payments x
      where x.loan_contract_id = p_id and x.status = 'verified' and x.is_active = true
    ) p
    left join lateral (
      select sum(a.principal_amount) as pri, sum(a.interest_amount) as int_amt
      from public.loan_payment_allocations a
      where a.payment_id = p.id
    ) al on true
  ) t
  where c.id = p_id;

  -- 2) (เดิม) เบิกสะสม / เงินต้นคงเหลือ / สถานะการเบิก — อ่านค่าเงินต้นที่ชำระแล้วจากข้อ 1
  update public.loan_contracts c
  set total_drawn_amount   = t.drawn,
      outstanding_principal = t.drawn - c.principal_paid_amount,
      drawdown_status = case
        when t.drawn <= 0 then 'not_drawn'
        when t.ref > 0 and t.drawn >= t.ref then 'fully_drawn'
        else 'partially_drawn' end
  from (
    select coalesce(sum(d.gross_amount),0) as drawn,
           case when c2.contracted_principal > 0 then c2.contracted_principal else c2.approved_limit end as ref
    from public.loan_contracts c2
    left join public.loan_drawdowns d
      on d.loan_contract_id = c2.id and d.status = 'confirmed' and d.is_active = true
    where c2.id = p_id
    group by c2.id, c2.contracted_principal, c2.approved_limit
  ) t
  where c.id = p_id;

  -- ตารางผ่อนที่ใช้อยู่ (เวอร์ชัน active ล่าสุด)
  select id into v_ver from public.loan_schedule_versions
   where loan_contract_id = p_id and status = 'active'
   order by version_no desc limit 1;

  -- 3) ผ่อนไปแล้วรวม + ความคืบหน้าเชิง "งวด" (ต้องมีตารางผ่อนถึงจะมีค่า)
  update public.loan_contracts c
  set total_paid_amount       = pay.paid,
      paid_installment_count  = ins.paid_cnt,
      total_installment_count = ins.cnt,
      next_due_date           = ins.next_due,
      next_due_amount         = coalesce(ins.next_amt, 0)
  from (
    select coalesce(sum(x.total_paid),0) as paid
    from public.loan_payments x
    where x.loan_contract_id = p_id and x.status = 'verified' and x.is_active = true
  ) pay,
  (
    select count(*)                                                as cnt,
           count(*) filter (where n.payment_status = 'paid')       as paid_cnt,
           min(n.due_date) filter (where n.payment_status <> 'paid') as next_due,
           (array_agg(greatest(n.total_due - n.total_paid, 0) order by n.due_date nulls last, n.installment_no)
              filter (where n.payment_status <> 'paid'))[1]        as next_amt
    from public.loan_installments n
    where n.loan_contract_id = p_id and n.schedule_version_id = v_ver and n.is_active = true
  ) ins
  where c.id = p_id;
end $$;

-- ============================================================
-- reallocate: ไม่ต้องตั้ง principal_paid_amount เองแล้ว (recompute เป็นเจ้าของค่านี้)
-- ============================================================
create or replace function public.loan_contract_reallocate(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; pay record; inst record;
  v_split boolean;
  r_int numeric(18,2); r_pri numeric(18,2); r_fee numeric(18,2); r_pen numeric(18,2); r_pool numeric(18,2);
  a_int numeric(18,2); a_pri numeric(18,2); a_fee numeric(18,2); a_pen numeric(18,2);
  v_newpaid numeric(18,2);
begin
  if p_id is null then return; end if;

  delete from public.loan_payment_allocations where loan_contract_id = p_id;
  update public.loan_installments
    set principal_paid = 0, interest_paid = 0, fee_paid = 0, penalty_paid = 0,
        total_paid = 0, payment_status = 'unpaid'
    where loan_contract_id = p_id;

  select id into v_ver from public.loan_schedule_versions
    where loan_contract_id = p_id and status = 'active' order by version_no desc limit 1;
  if v_ver is null then
    perform public.loan_contract_recompute(p_id);   -- ไม่มีตารางผ่อน → ยอดเงินยังคิดจากใบจ่ายได้
    return;
  end if;

  for pay in
    select * from public.loan_payments
    where loan_contract_id = p_id and status = 'verified' and is_active = true
    order by payment_date nulls last, payment_no
  loop
    v_split := (coalesce(pay.principal_amount,0) + coalesce(pay.interest_amount,0)
                + coalesce(pay.fee_amount,0) + coalesce(pay.penalty_amount,0)) > 0;

    if v_split then
      r_int := coalesce(pay.interest_amount,0);
      r_pri := coalesce(pay.principal_amount,0);
      r_fee := coalesce(pay.fee_amount,0);
      r_pen := coalesce(pay.penalty_amount,0);
      r_pool := 0;
    else
      r_int := 0; r_pri := 0; r_fee := 0; r_pen := 0;
      r_pool := coalesce(pay.total_paid, 0);
    end if;

    for inst in
      select * from public.loan_installments
      where schedule_version_id = v_ver and is_active = true
      order by installment_no
    loop
      exit when (r_int + r_pri + r_fee + r_pen + r_pool) <= 0;

      if v_split then
        a_int := least(greatest(inst.interest_due  - inst.interest_paid,  0), r_int); r_int := r_int - a_int;
        a_pri := least(greatest(inst.principal_due - inst.principal_paid, 0), r_pri); r_pri := r_pri - a_pri;
        a_fee := least(greatest(inst.fee_due       - inst.fee_paid,       0), r_fee); r_fee := r_fee - a_fee;
        a_pen := least(greatest(inst.penalty_due   - inst.penalty_paid,   0), r_pen); r_pen := r_pen - a_pen;
      else
        a_int := least(greatest(inst.interest_due - inst.interest_paid, 0), r_pool); r_pool := r_pool - a_int;
        a_pri := least(greatest(inst.principal_due - inst.principal_paid, 0), r_pool); r_pool := r_pool - a_pri;
        a_fee := 0; a_pen := 0;
      end if;

      if a_int + a_pri + a_fee + a_pen > 0 then
        insert into public.loan_payment_allocations
          (payment_id, installment_id, loan_contract_id, principal_amount, interest_amount,
           fee_amount, penalty_amount, total_allocated)
        values (pay.id, inst.id, p_id, a_pri, a_int, a_fee, a_pen, a_pri + a_int + a_fee + a_pen);

        v_newpaid := inst.total_paid + a_int + a_pri + a_fee + a_pen;
        update public.loan_installments
          set interest_paid  = inst.interest_paid  + a_int,
              principal_paid = inst.principal_paid + a_pri,
              fee_paid       = inst.fee_paid       + a_fee,
              penalty_paid   = inst.penalty_paid   + a_pen,
              total_paid     = v_newpaid,
              payment_status = case
                when v_newpaid >= inst.total_due - 0.005 then 'paid'
                when v_newpaid > 0 then 'partial' else 'unpaid' end
          where id = inst.id;
      end if;
    end loop;
  end loop;

  perform public.loan_contract_recompute(p_id);
end $$;

-- คิดใหม่ให้สัญญาที่มีอยู่ทั้งหมด (ตัวเลขเก่าที่ค้างเป็น 0 จะขึ้นทันที)
do $$
declare r record;
begin
  for r in select id from public.loan_contracts loop
    perform public.loan_contract_recompute(r.id);
  end loop;
end $$;
