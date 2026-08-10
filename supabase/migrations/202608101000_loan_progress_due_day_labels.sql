-- Loan & OD — ความคืบหน้าการผ่อน + วันครบกำหนดชำระ + ป้ายไทยของตัวเลือก (2026-08-10)
-- additive only: เพิ่มคอลัมน์/ฟิลด์ทะเบียน + ใส่ป้ายไทยให้ dropdown · ไม่ลบข้อมูลเดิม
--   1) คอลัมน์ใหม่ใน loan_contracts (วันครบกำหนด + ยอด/งวดที่ผ่อนไปแล้ว + งวดถัดไป)
--   2) loan_contract_recompute() คิดความคืบหน้าให้อัตโนมัติ (rebuild-from-source ห้ามกรอกมือ)
--   3) trigger งวดผ่อน → อัปเดตสัญญา
--   4) loan_schedule_generate() ใช้ "วันที่ต้องชำระ" ของสัญญาเป็นวันครบกำหนดทุกงวด
--   5) ทะเบียน field: ป้ายไทยของตัวเลือก (options.labels) + คำอธิบาย + สกุลเงินเป็น dropdown

-- ============================================================
-- 1) คอลัมน์ใหม่
-- ============================================================
alter table public.loan_contracts
  add column if not exists payment_due_day          smallint,
  add column if not exists total_paid_amount        numeric(18,2) not null default 0,
  add column if not exists interest_paid_amount     numeric(18,2) not null default 0,
  add column if not exists paid_installment_count   integer       not null default 0,
  add column if not exists total_installment_count  integer       not null default 0,
  add column if not exists next_due_date            date,
  add column if not exists next_due_amount          numeric(18,2) not null default 0;

alter table public.loan_contracts drop constraint if exists loan_contracts_payment_due_day_chk;
alter table public.loan_contracts add constraint loan_contracts_payment_due_day_chk
  check (payment_due_day is null or (payment_due_day >= 1 and payment_due_day <= 31));

comment on column public.loan_contracts.payment_due_day is 'ต้องชำระทุกวันที่เท่าไหร่ของเดือน (1-31) — ใช้ตั้งวันครบกำหนดตอนสร้างตารางผ่อน';
comment on column public.loan_contracts.total_paid_amount is 'ผ่อนไปแล้วรวม (เงินต้น+ดอกเบี้ย) จากใบจ่ายที่ยืนยันแล้ว — ระบบคิดให้ ห้ามกรอกมือ';
comment on column public.loan_contracts.paid_installment_count is 'จำนวนงวดที่จ่ายครบแล้ว — ระบบคิดให้ ห้ามกรอกมือ';

-- ============================================================
-- 2) recompute — เพิ่มความคืบหน้าการผ่อน (ของเดิมคงไว้ครบ)
-- ============================================================
create or replace function public.loan_contract_recompute(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_ver uuid;
begin
  if p_id is null then return; end if;

  -- (เดิม) เบิกสะสม / เงินต้นคงเหลือ / สถานะการเบิก
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

  -- (ใหม่) ผ่อนไปแล้วเท่าไหร่ / กี่งวด / งวดถัดไปครบกำหนดเมื่อไหร่
  update public.loan_contracts c
  set total_paid_amount       = pay.paid,
      interest_paid_amount    = ins.int_paid,
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
           coalesce(sum(n.interest_paid),0)                        as int_paid,
           min(n.due_date) filter (where n.payment_status <> 'paid') as next_due,
           (array_agg(greatest(n.total_due - n.total_paid, 0) order by n.due_date nulls last, n.installment_no)
              filter (where n.payment_status <> 'paid'))[1]        as next_amt
    from public.loan_installments n
    where n.loan_contract_id = p_id and n.schedule_version_id = v_ver and n.is_active = true
  ) ins
  where c.id = p_id;
end $$;

-- ============================================================
-- 3) งวดผ่อนเปลี่ยน → อัปเดตความคืบหน้าในสัญญาด้วย
-- ============================================================
create or replace function public.loan_installments_rollup() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public.loan_schedule_version_recompute(old.schedule_version_id);
    perform public.loan_contract_recompute(old.loan_contract_id);
    return old;
  end if;
  perform public.loan_schedule_version_recompute(new.schedule_version_id);
  if tg_op = 'UPDATE' and old.schedule_version_id is distinct from new.schedule_version_id then
    perform public.loan_schedule_version_recompute(old.schedule_version_id);
  end if;
  perform public.loan_contract_recompute(new.loan_contract_id);
  return new;
end $$;

-- ============================================================
-- 4) สร้างตารางผ่อน — ใช้ "ชำระทุกวันที่" ของสัญญา (ถ้าตั้งไว้)
--    เดือนที่ไม่มีวันที่นั้น (เช่น 31 ก.พ.) ใช้วันสุดท้ายของเดือน
-- ============================================================
create or replace function public.loan_schedule_generate(
  p_contract_id uuid, p_method text, p_start_date date, p_num int, p_reason text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_principal numeric(18,2); v_r double precision; v_pay numeric(18,2);
  v_version_id uuid; v_version_no int;
  v_open numeric(18,2); v_pri numeric(18,2); v_int numeric(18,2); v_close numeric(18,2);
  v_pri_each numeric(18,2); v_due date; v_dim int; i int;
begin
  select * into v_c from public.loan_contracts where id = p_contract_id;
  if not found then raise exception 'ไม่พบสัญญาเงินกู้'; end if;
  if p_num is null or p_num < 1 then raise exception 'จำนวนงวดต้องมากกว่า 0'; end if;

  v_principal := case when v_c.contracted_principal > 0 then v_c.contracted_principal else v_c.approved_limit end;
  v_r := coalesce(v_c.interest_rate,0)::double precision / 100.0 / 12.0;

  update public.loan_schedule_versions set status = 'superseded'
   where loan_contract_id = p_contract_id and status = 'active';

  select coalesce(max(version_no),0) + 1 into v_version_no
   from public.loan_schedule_versions where loan_contract_id = p_contract_id;

  insert into public.loan_schedule_versions
    (loan_contract_id, version_no, effective_date, calculation_method, source, reason, status)
  values (p_contract_id, v_version_no, coalesce(p_start_date, current_date), p_method, 'system_calculated', p_reason, 'active')
  returning id into v_version_id;

  v_open := v_principal;
  if p_method = 'equal_installment' then
    if v_r > 0 then
      v_pay := round((v_principal::double precision * v_r / (1 - power(1 + v_r, -p_num::double precision)))::numeric, 2);
    else
      v_pay := round(v_principal / p_num, 2);
    end if;
  elsif p_method = 'equal_principal' then
    v_pri_each := round(v_principal / p_num, 2);
  end if;

  for i in 1..p_num loop
    v_due := (coalesce(p_start_date, current_date) + (i || ' month')::interval)::date;
    -- ตั้งวันครบกำหนดตาม "ชำระทุกวันที่" ของสัญญา
    if v_c.payment_due_day is not null then
      v_dim  := extract(day from (date_trunc('month', v_due::timestamp) + interval '1 month' - interval '1 day'))::int;
      v_due  := (date_trunc('month', v_due::timestamp))::date + (least(v_c.payment_due_day, v_dim) - 1);
    end if;
    v_int := round((v_open::double precision * v_r)::numeric, 2);
    if p_method = 'interest_only' then
      v_pri := case when i = p_num then v_open else 0 end;
    elsif p_method = 'equal_principal' then
      v_pri := case when i = p_num then v_open else v_pri_each end;
    else
      v_pri := case when i = p_num then v_open else round(v_pay - v_int, 2) end;
    end if;
    if v_pri > v_open then v_pri := v_open; end if;
    if v_pri < 0 then v_pri := 0; end if;
    v_close := round(v_open - v_pri, 2);
    insert into public.loan_installments
      (schedule_version_id, loan_contract_id, installment_no, due_date,
       opening_principal, principal_due, interest_due, total_due, closing_principal, payment_status)
    values (v_version_id, p_contract_id, i, v_due,
       v_open, v_pri, v_int, round(v_pri + v_int, 2), v_close, 'unpaid');
    v_open := v_close;
  end loop;

  return v_version_id;
end $$;

-- ============================================================
-- 5) ทะเบียน field
-- ============================================================

-- 5.1 ฟิลด์ใหม่ของสัญญาเงินกู้
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text, placeholder)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, false, v.edit, false, v.filt, v.srt, v.form, v.span, v.ord, '{}'::jsonb, '{}'::jsonb, v.help, v.ph
from public.erp_modules m
cross join (values
  ('payment_due_day',        'ชำระทุกวันที่',      'number',  'integer','period',   true,  true,  true,  true,  true, 1, 155,
     'วันที่ของเดือนที่ต้องจ่าย (1-31) · ใส่ไว้แล้วตอนสร้างตารางผ่อน ระบบจะตั้งวันครบกำหนดเป็นวันที่นี้ทุกงวด (เดือนที่ไม่มีวันนั้น ใช้วันสุดท้ายของเดือน)', 'เช่น 5'),
  ('total_paid_amount',      'ผ่อนไปแล้ว (รวม)',   'currency','numeric','progress', true,  false, true,  true,  true, 1, 300,
     'ยอดเงินที่จ่ายจริงสะสม (เงินต้น+ดอกเบี้ย) จากใบจ่ายที่ยืนยันแล้ว — ระบบคิดให้อัตโนมัติ', null),
  ('paid_installment_count', 'ผ่อนไปแล้ว (งวด)',   'number',  'integer','progress', true,  false, true,  true,  true, 1, 310,
     'จำนวนงวดที่จ่ายครบแล้ว จากตารางผ่อนที่ใช้อยู่ — ระบบคิดให้อัตโนมัติ', null),
  ('total_installment_count','จำนวนงวดทั้งหมด',    'number',  'integer','progress', true,  false, true,  true,  true, 1, 320,
     'จำนวนงวดในตารางผ่อนที่ใช้อยู่ (ยังไม่มีตารางผ่อน = 0)', null),
  ('interest_paid_amount',   'ดอกเบี้ยที่จ่ายแล้ว','currency','numeric','progress', false, false, true,  true,  true, 1, 330,
     'ส่วนที่เป็นดอกเบี้ยจากยอดที่ผ่อนไปแล้ว — ระบบคิดให้อัตโนมัติ', null),
  ('next_due_date',          'งวดถัดไปครบกำหนด',  'date',    'date',   'progress', true,  false, true,  true,  true, 1, 340,
     'วันครบกำหนดของงวดแรกที่ยังจ่ายไม่ครบ', null),
  ('next_due_amount',        'ยอดงวดถัดไป',       'currency','numeric','progress', true,  false, true,  true,  true, 1, 350,
     'ยอดที่ต้องจ่ายของงวดถัดไป (หักส่วนที่จ่ายไปแล้วของงวดนั้น)', null)
) as v(fk,lbl,ui,dt,gk,vis,edit,form,filt,srt,span,ord,help,ph)
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 5.2 ย้ายฟิลด์ยอดสะสมเดิมเข้าหมวด "ความคืบหน้าการผ่อน" + โชว์ในฟอร์ม (อ่านอย่างเดียว)
update public.erp_module_fields f
set group_key = 'progress', show_in_form = true, is_editable = false, is_visible = true,
    display_order = case f.column_name when 'principal_paid_amount' then 305 else 360 end,
    field_label = case f.column_name when 'principal_paid_amount' then 'เงินต้นที่ชำระแล้ว' else 'เงินต้นคงเหลือ' end,
    help_text = case f.column_name
      when 'principal_paid_amount' then 'ส่วนที่เป็นเงินต้นจากยอดที่ผ่อนไปแล้ว — ระบบคิดให้อัตโนมัติ'
      else 'เงินต้นที่ยังค้างอยู่ = ยอดเบิกสะสม − เงินต้นที่ชำระแล้ว' end
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts'
  and f.column_name in ('principal_paid_amount','outstanding_principal');

-- 5.3 ป้ายไทยของตัวเลือก + คำอธิบาย (สัญญาเงินกู้)
update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('term','revolving','leasing','director','vehicle','machine','short_term'),
      'labels', jsonb_build_object(
        'term','เงินกู้มีกำหนดระยะเวลา (Term)', 'revolving','วงเงินหมุนเวียน (Revolving)',
        'leasing','ลีสซิ่ง/เช่าซื้อ (Leasing)', 'director','เงินกู้กรรมการ (Director)',
        'vehicle','สินเชื่อรถ (Vehicle)', 'machine','สินเชื่อเครื่องจักร (Machine)',
        'short_term','เงินกู้ระยะสั้น (Short-term)')),
    help_text = 'ประเภทของสัญญา — ใช้จัดกลุ่มรายงานและแยกวิธีคิดดอกเบี้ย'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'loan_type';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('fixed','floating'),
      'labels', jsonb_build_object('fixed','อัตราคงที่ (Fixed)','floating','อัตราลอยตัว (Floating)')),
    help_text = 'อัตราคงที่ = ดอกเบี้ยเท่าเดิมตลอดสัญญา · อัตราลอยตัว = ขึ้นลงตามอัตราอ้างอิงของธนาคาร (กรอกตัวอ้างอิง เช่น MLR/MRR ในช่อง "อ้างอิงอัตรา")'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'interest_rate_type';

update public.erp_module_fields f
set help_text = 'อัตราที่ธนาคารใช้อ้างอิงเวลาปรับดอกเบี้ย เช่น MLR, MRR, MLR-1.5% (ใช้กับอัตราลอยตัว)'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'interest_rate_reference';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('equal_installment','equal_principal','interest_only','custom'),
      'labels', jsonb_build_object(
        'equal_installment','ผ่อนเท่ากันทุกงวด (Equal Installment)',
        'equal_principal','ตัดเงินต้นเท่ากันทุกงวด (Equal Principal)',
        'interest_only','จ่ายดอกอย่างเดียว ปิดต้นงวดสุดท้าย (Interest Only)',
        'custom','กำหนดเอง (Custom)')),
    help_text = 'ผ่อนเท่ากันทุกงวด = จ่ายเท่ากันทุกเดือน (ช่วงแรกเป็นดอกเบี้ยมากกว่า) · ตัดเงินต้นเท่ากัน = ตัดต้นเท่ากันทุกงวด ยอดจ่ายลดลงเรื่อย ๆ · จ่ายดอกอย่างเดียว = ระหว่างทางจ่ายแต่ดอกเบี้ย แล้วปิดเงินต้นทั้งก้อนงวดสุดท้าย'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'repayment_method';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('monthly','quarterly','yearly','custom'),
      'labels', jsonb_build_object('monthly','รายเดือน','quarterly','ราย 3 เดือน','yearly','รายปี','custom','กำหนดเอง')),
    help_text = 'ความถี่ที่ต้องจ่ายตามสัญญา · หมายเหตุ: ตัวสร้างตารางผ่อนอัตโนมัติยังคิดเป็นรายเดือน — ถ้าไม่ใช่รายเดือน ต้องแก้วันครบกำหนดในตารางผ่อนเอง'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'payment_frequency';

-- สกุลเงิน: จากช่องพิมพ์ → dropdown (ค่าเริ่มต้น THB)
update public.erp_module_fields f
set ui_field_type = 'select',
    options = jsonb_build_object('options', jsonb_build_array('THB','USD','CNY','JPY','EUR','VND'),
      'labels', jsonb_build_object('THB','THB — บาท','USD','USD — ดอลลาร์สหรัฐ','CNY','CNY — หยวนจีน',
        'JPY','JPY — เยนญี่ปุ่น','EUR','EUR — ยูโร','VND','VND — ด่งเวียดนาม')),
    default_value = coalesce(f.default_value, 'THB'),
    help_text = 'สกุลเงินของสัญญานี้ (ปกติเป็น THB)'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'currency';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('draft','pending_approval','approved','active','closing_review','closed','cancelled','restructuring'),
      'labels', jsonb_build_object('draft','ร่าง','pending_approval','รออนุมัติ','approved','อนุมัติแล้ว','active','ใช้งานอยู่',
        'closing_review','กำลังตรวจปิด','closed','ปิดแล้ว','cancelled','ยกเลิก','restructuring','ปรับโครงสร้างหนี้'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'lifecycle_status';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('not_drawn','partially_drawn','fully_drawn'),
      'labels', jsonb_build_object('not_drawn','ยังไม่เบิก','partially_drawn','เบิกบางส่วน','fully_drawn','เบิกครบแล้ว'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'drawdown_status';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('current','due','overdue','defaulted'),
      'labels', jsonb_build_object('current','ปกติ','due','ใกล้ครบกำหนด','overdue','เกินกำหนด','defaulted','ผิดนัดชำระ'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'repayment_health';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('not_ready','ready','exported','error'),
      'labels', jsonb_build_object('not_ready','ยังไม่พร้อมลงบัญชี','ready','พร้อมลงบัญชี','exported','ส่งบัญชีแล้ว','error','มีข้อผิดพลาด'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'accounting_status';

-- 5.4 ป้ายไทยของหน้าอื่นในโมดูลเดียวกัน (ตารางผ่อน / งวดผ่อน)
update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('equal_installment','equal_principal','interest_only','custom'),
      'labels', jsonb_build_object(
        'equal_installment','ผ่อนเท่ากันทุกงวด (Equal Installment)',
        'equal_principal','ตัดเงินต้นเท่ากันทุกงวด (Equal Principal)',
        'interest_only','จ่ายดอกอย่างเดียว ปิดต้นงวดสุดท้าย (Interest Only)',
        'custom','กำหนดเอง (Custom)'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-schedule-versions' and f.column_name = 'calculation_method';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('draft','active','superseded'),
      'labels', jsonb_build_object('draft','ร่าง','active','ใช้อยู่','superseded','ถูกแทนที่แล้ว'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-schedule-versions' and f.column_name = 'status';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('system_calculated','bank_file','manual'),
      'labels', jsonb_build_object('system_calculated','ระบบคำนวณให้','bank_file','ไฟล์จากธนาคาร','manual','กรอกเอง'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-schedule-versions' and f.column_name = 'source';

update public.erp_module_fields f
set options = jsonb_build_object('options', jsonb_build_array('unpaid','partial','paid','overdue'),
      'labels', jsonb_build_object('unpaid','ยังไม่จ่าย','partial','จ่ายบางส่วน','paid','จ่ายแล้ว','overdue','เกินกำหนด'))
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-installments' and f.column_name = 'payment_status';

-- ============================================================
-- 6) คิดค่าความคืบหน้าย้อนหลังให้สัญญาที่มีอยู่
-- ============================================================
do $$
declare r record;
begin
  for r in select id from public.loan_contracts loop
    perform public.loan_contract_recompute(r.id);
  end loop;
end $$;
