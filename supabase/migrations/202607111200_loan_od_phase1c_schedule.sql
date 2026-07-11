-- Phase 1c: Repayment Schedule + Versions — additive only
-- ตารางผ่อน (loan_schedule_versions) + งวด (loan_installments)
-- ฟังก์ชัน loan_schedule_generate() คิด amortization 3 วิธี · เก็บเวอร์ชัน (ไม่ทับ) · งวดสุดท้ายปิดยอด 0

-- 1) tables
create table if not exists public.loan_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  loan_contract_id uuid references public.loan_contracts(id) on delete cascade,
  version_no int not null default 1,
  effective_date date,
  calculation_method text not null default 'equal_installment',
  source text not null default 'system_calculated',
  reason text not null default '',
  status text not null default 'active',
  installment_count int not null default 0,
  total_due numeric(18,2) not null default 0,
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loan_sched_ver_contract on public.loan_schedule_versions(loan_contract_id);

create table if not exists public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  schedule_version_id uuid references public.loan_schedule_versions(id) on delete cascade,
  loan_contract_id uuid references public.loan_contracts(id) on delete cascade,
  installment_no int not null default 0,
  due_date date,
  opening_principal numeric(18,2) not null default 0,
  principal_due numeric(18,2) not null default 0,
  interest_due numeric(18,2) not null default 0,
  fee_due numeric(18,2) not null default 0,
  penalty_due numeric(18,2) not null default 0,
  total_due numeric(18,2) not null default 0,
  principal_paid numeric(18,2) not null default 0,
  interest_paid numeric(18,2) not null default 0,
  total_paid numeric(18,2) not null default 0,
  closing_principal numeric(18,2) not null default 0,
  payment_status text not null default 'unpaid',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loan_inst_version on public.loan_installments(schedule_version_id);
create index if not exists idx_loan_inst_contract on public.loan_installments(loan_contract_id);

-- 2) updated_at touch triggers
create or replace function public.loan_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_loan_sched_ver_touch on public.loan_schedule_versions;
create trigger trg_loan_sched_ver_touch before update on public.loan_schedule_versions
for each row execute function public.loan_touch_updated_at();

drop trigger if exists trg_loan_inst_touch on public.loan_installments;
create trigger trg_loan_inst_touch before update on public.loan_installments
for each row execute function public.loan_touch_updated_at();

-- 3) version rollup from installments
create or replace function public.loan_schedule_version_recompute(p_ver uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_ver is null then return; end if;
  update public.loan_schedule_versions v
  set installment_count = t.cnt, total_due = t.tot
  from (
    select count(*) as cnt, coalesce(sum(i.total_due),0) as tot
    from public.loan_installments i
    where i.schedule_version_id = p_ver and i.is_active = true
  ) t
  where v.id = p_ver;
end $$;

create or replace function public.loan_installments_rollup() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then perform public.loan_schedule_version_recompute(old.schedule_version_id); return old; end if;
  perform public.loan_schedule_version_recompute(new.schedule_version_id);
  if tg_op = 'UPDATE' and old.schedule_version_id is distinct from new.schedule_version_id then
    perform public.loan_schedule_version_recompute(old.schedule_version_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_loan_inst_rollup on public.loan_installments;
create trigger trg_loan_inst_rollup after insert or update or delete on public.loan_installments
for each row execute function public.loan_installments_rollup();

-- 4) generate schedule (3 methods)
create or replace function public.loan_schedule_generate(
  p_contract_id uuid, p_method text, p_start_date date, p_num int, p_reason text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_principal numeric(18,2); v_r double precision; v_pay numeric(18,2);
  v_version_id uuid; v_version_no int;
  v_open numeric(18,2); v_pri numeric(18,2); v_int numeric(18,2); v_close numeric(18,2);
  v_pri_each numeric(18,2); v_due date; i int;
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

-- 5) RLS
alter table public.loan_schedule_versions enable row level security;
drop policy if exists loan_sched_ver_sel on public.loan_schedule_versions;
create policy loan_sched_ver_sel on public.loan_schedule_versions for select to authenticated using (true);
alter table public.loan_installments enable row level security;
drop policy if exists loan_inst_sel on public.loan_installments;
create policy loan_inst_sel on public.loan_installments for select to authenticated using (true);

-- 6) register modules
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-schedule-versions', 'loan_schedule_versions', 'ตารางผ่อน (เวอร์ชัน)', 'version_no', 'physical', true, 520, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-schedule-versions');
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-installments', 'loan_installments', 'งวดผ่อนชำระ', 'installment_no', 'physical', true, 530, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-installments');

-- 7) field registry — versions
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('loan_contract_id','สัญญาเงินกู้','relation','uuid','core', true,true,true,false,true,false, true,2,20,'{}','{"allow_create": false, "target_table": "loan_contracts", "target_module_key": "loan-contracts", "target_label_field": "loan_name", "target_search_fields": ["loan_code","loan_name"]}'),
  ('version_no','เวอร์ชัน','number','integer','core', true,false,false,false,true,true, false,1,30,'{}','{}'),
  ('effective_date','วันเริ่มใช้','date','date','core', true,false,true,false,true,true, true,1,40,'{}','{}'),
  ('calculation_method','วิธีคิด','select','text','core', true,false,true,false,true,false, true,1,50,'{"options":["equal_installment","equal_principal","interest_only","custom"]}','{}'),
  ('installment_count','จำนวนงวด','number','integer','other', true,false,false,false,true,true, false,1,60,'{}','{}'),
  ('total_due','ยอดรวมทั้งตาราง','currency','numeric','other', true,false,false,false,true,true, false,1,70,'{}','{}'),
  ('status','สถานะ','select','text','status', true,false,true,false,true,false, true,1,80,'{"options":["draft","active","superseded"]}','{}'),
  ('source','ที่มา','select','text','other', false,false,true,false,true,false, true,1,90,'{"options":["system_calculated","bank_file","manual"]}','{}'),
  ('reason','เหตุผล','text','text','other', false,false,true,true,false,false, true,2,100,'{}','{}'),
  ('note','หมายเหตุ','textarea','text','content', false,false,true,false,false,false, true,2,110,'{}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'loan-schedule-versions'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 8) field registry — installments
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('loan_contract_id','สัญญาเงินกู้','relation','uuid','core', true,false,false,false,true,false, false,2,20,'{}','{"allow_create": false, "target_table": "loan_contracts", "target_module_key": "loan-contracts", "target_label_field": "loan_name", "target_search_fields": ["loan_code","loan_name"]}'),
  ('installment_no','งวดที่','number','integer','core', true,false,false,false,false,true, false,1,30,'{}','{}'),
  ('due_date','ครบกำหนด','date','date','core', true,false,false,false,true,true, false,1,40,'{}','{}'),
  ('opening_principal','ต้นงวด','currency','numeric','other', false,false,false,false,false,false, false,1,50,'{}','{}'),
  ('principal_due','เงินต้น','currency','numeric','other', true,false,false,false,false,true, false,1,60,'{}','{}'),
  ('interest_due','ดอกเบี้ย','currency','numeric','other', true,false,false,false,false,true, false,1,70,'{}','{}'),
  ('total_due','รวมงวด','currency','numeric','other', true,false,false,false,true,true, false,1,80,'{}','{}'),
  ('closing_principal','คงเหลือหลังงวด','currency','numeric','other', true,false,false,false,false,true, false,1,90,'{}','{}'),
  ('payment_status','สถานะจ่าย','select','text','status', true,false,false,false,true,false, false,1,100,'{"options":["unpaid","partial","paid","overdue"]}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'loan-installments'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 9) menu
insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'เงินกู้ & OD', 155, 30, '📅', 'ตารางผ่อน', '/loan-schedules', true, true, array['loan-od'], 'loan-schedule-versions', true
where not exists (select 1 from public.erp_menu_items where href = '/loan-schedules');
insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'เงินกู้ & OD', 155, 40, '🧾', 'งวดผ่อน (รายละเอียด)', '/loan-installments', true, true, array['loan-od'], 'loan-installments', true
where not exists (select 1 from public.erp_menu_items where href = '/loan-installments');

-- 10) permissions
insert into public.erp_permissions(key, label, category, sort_order)
select x.k, x.l, 'การเงิน (เงินกู้/OD)', x.o from (values
  ('loan_schedules.view','ดูตารางผ่อน',100),
  ('loan_schedules.create','สร้างตารางผ่อน',110),
  ('loan_schedules.edit','แก้ไขตารางผ่อน',120),
  ('loan_schedules.delete','ลบตารางผ่อน',130),
  ('loan_installments.view','ดูงวดผ่อน',140)
) as x(k,l,o)
where not exists (select 1 from public.erp_permissions p where p.key = x.k);

insert into public.erp_role_permissions(role_key, permission_key)
select x.r, x.p from (values
  ('manager','loan_schedules.view'), ('manager','loan_schedules.create'), ('manager','loan_schedules.edit'),
  ('staff','loan_schedules.view'), ('viewer','loan_schedules.view'),
  ('manager','loan_installments.view'), ('staff','loan_installments.view'), ('viewer','loan_installments.view')
) as x(r,p)
where not exists (select 1 from public.erp_role_permissions rp where rp.role_key = x.r and rp.permission_key = x.p);
