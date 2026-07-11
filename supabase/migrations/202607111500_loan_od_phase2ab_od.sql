-- Phase 2a+2b: OD Facilities + Statement Transactions + Daily Balance — additive only
-- วงเงิน OD + นำเข้า statement → od_recompute() คิดยอดใช้รายวัน + utilization + ดอกเบี้ยประมาณการ

-- 1) tables
create table if not exists public.od_facilities (
  id uuid primary key default gen_random_uuid(),
  od_code text unique,
  lender_name text not null default '',
  bank_account text not null default '',
  company text not null default '',
  limit_amount numeric(18,2) not null default 0,
  interest_rate numeric(9,4) not null default 0,
  interest_rate_reference text not null default '',
  day_count_basis text not null default 'actual/365',
  start_date date, review_date date, expiry_date date,
  responsible text not null default '',
  lifecycle_status text not null default 'active',
  current_used_amount numeric(18,2) not null default 0,
  available_limit numeric(18,2) not null default 0,
  utilization_percent numeric(9,2) not null default 0,
  highest_used_this_month numeric(18,2) not null default 0,
  estimated_interest_this_month numeric(18,2) not null default 0,
  continuous_usage_days int not null default 0,
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.od_transactions (
  id uuid primary key default gen_random_uuid(),
  od_facility_id uuid references public.od_facilities(id) on delete cascade,
  transaction_date date,
  description text not null default '',
  money_in numeric(18,2) not null default 0,
  money_out numeric(18,2) not null default 0,
  balance_after numeric(18,2) not null default 0,
  source_fingerprint text not null default '',
  import_batch_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_od_txn_facility on public.od_transactions(od_facility_id);
create unique index if not exists uq_od_txn_fingerprint on public.od_transactions(od_facility_id, source_fingerprint);

create table if not exists public.od_daily_balances (
  id uuid primary key default gen_random_uuid(),
  od_facility_id uuid references public.od_facilities(id) on delete cascade,
  balance_date date,
  closing_bank_balance numeric(18,2) not null default 0,
  od_used_amount numeric(18,2) not null default 0,
  available_limit numeric(18,2) not null default 0,
  annual_interest_rate numeric(9,4) not null default 0,
  estimated_interest numeric(18,2) not null default 0,
  source text not null default 'statement',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_od_daily_facility on public.od_daily_balances(od_facility_id);

-- 2) numbering + trigger
insert into public.erp_numbering_rules(key, label, pattern, reset_policy, current_value, active)
select 'od', 'วงเงิน OD', 'OD-{YYYY}-{0000}', 'yearly', 0, true
where not exists (select 1 from public.erp_numbering_rules where key = 'od');

create or replace function public.od_facilities_biu() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.od_code is null or new.od_code = '' then new.od_code := public.erp_next_number('od'); end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_od_facilities_biu on public.od_facilities;
create trigger trg_od_facilities_biu before insert or update on public.od_facilities
for each row execute function public.od_facilities_biu();

-- 3) recompute daily balances + facility computed fields
create or replace function public.od_recompute(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_limit numeric(18,2); v_rate numeric(9,4); v_latest date;
begin
  if p_id is null then return; end if;
  select limit_amount, interest_rate into v_limit, v_rate from public.od_facilities where id = p_id;
  delete from public.od_daily_balances where od_facility_id = p_id;
  insert into public.od_daily_balances
    (od_facility_id, balance_date, closing_bank_balance, od_used_amount, available_limit, annual_interest_rate, estimated_interest, source)
  select p_id, d.transaction_date, d.closing,
         case when d.closing < 0 then -d.closing else 0 end,
         v_limit - (case when d.closing < 0 then -d.closing else 0 end),
         v_rate,
         round(((case when d.closing < 0 then -d.closing else 0 end) * v_rate / 100.0 / 365.0)::numeric, 2),
         'statement'
  from (
    select distinct on (transaction_date) transaction_date, balance_after as closing
    from public.od_transactions where od_facility_id = p_id and is_active = true
    order by transaction_date, created_at desc, id desc
  ) d;
  select max(balance_date) into v_latest from public.od_daily_balances where od_facility_id = p_id;
  update public.od_facilities f set
    current_used_amount = coalesce((select od_used_amount from public.od_daily_balances where od_facility_id = p_id and balance_date = v_latest limit 1), 0),
    available_limit = v_limit - coalesce((select od_used_amount from public.od_daily_balances where od_facility_id = p_id and balance_date = v_latest limit 1), 0),
    utilization_percent = case when v_limit > 0 then round((coalesce((select od_used_amount from public.od_daily_balances where od_facility_id = p_id and balance_date = v_latest limit 1),0) / v_limit * 100)::numeric, 2) else 0 end,
    highest_used_this_month = coalesce((select max(od_used_amount) from public.od_daily_balances where od_facility_id = p_id and date_trunc('month', balance_date) = date_trunc('month', current_date)), 0),
    estimated_interest_this_month = coalesce((select sum(estimated_interest) from public.od_daily_balances where od_facility_id = p_id and date_trunc('month', balance_date) = date_trunc('month', current_date)), 0),
    continuous_usage_days = coalesce((select count(*) from public.od_daily_balances b where b.od_facility_id = p_id and b.od_used_amount > 0 and b.balance_date > coalesce((select max(b2.balance_date) from public.od_daily_balances b2 where b2.od_facility_id = p_id and b2.od_used_amount <= 0), date '1900-01-01')), 0)
  where f.id = p_id;
end $$;

-- 4) RLS
alter table public.od_facilities enable row level security;
drop policy if exists od_fac_sel on public.od_facilities;
create policy od_fac_sel on public.od_facilities for select to authenticated using (true);
alter table public.od_transactions enable row level security;
drop policy if exists od_txn_sel on public.od_transactions;
create policy od_txn_sel on public.od_transactions for select to authenticated using (true);
alter table public.od_daily_balances enable row level security;
drop policy if exists od_daily_sel on public.od_daily_balances;
create policy od_daily_sel on public.od_daily_balances for select to authenticated using (true);

-- 5) register modules
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'od-facilities', 'od_facilities', 'วงเงิน OD', 'od_code', 'physical', true, 600, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'od-facilities');
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'od-transactions', 'od_transactions', 'รายการเดินบัญชี OD', 'description', 'physical', true, 610, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'od-transactions');
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'od-daily-balances', 'od_daily_balances', 'ยอดใช้ OD รายวัน', 'balance_date', 'physical', true, 620, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'od-daily-balances');

-- 6) field registry — facilities
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk, v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}'),
  ('od_code','รหัส OD','text','text','core', true,false,false,true,false,true, false,1,20,'{}'),
  ('lender_name','ธนาคาร','text','text','core', true,false,true,true,true,true, true,1,30,'{}'),
  ('bank_account','เลขบัญชี','text','text','core', true,false,true,true,false,false, true,1,40,'{}'),
  ('limit_amount','วงเงิน','currency','numeric','other', true,true,true,false,true,true, true,1,50,'{}'),
  ('current_used_amount','ใช้ไปแล้ว','currency','numeric','other', true,false,false,false,true,true, false,1,60,'{}'),
  ('available_limit','เหลือวงเงิน','currency','numeric','other', true,false,false,false,true,true, false,1,70,'{}'),
  ('utilization_percent','ใช้วงเงิน (%)','number','numeric','other', true,false,false,false,true,true, false,1,80,'{}'),
  ('interest_rate','อัตราดอกเบี้ย (%)','number','numeric','other', false,false,true,false,true,false, true,1,90,'{}'),
  ('interest_rate_reference','อ้างอิงอัตรา','text','text','other', false,false,true,false,false,false, true,1,100,'{}'),
  ('start_date','วันเริ่ม','date','date','other', false,false,true,false,true,true, true,1,110,'{}'),
  ('review_date','วันทบทวน','date','date','other', false,false,true,false,true,true, true,1,120,'{}'),
  ('expiry_date','วันหมดอายุ','date','date','other', true,false,true,false,true,true, true,1,130,'{}'),
  ('responsible','ผู้รับผิดชอบ','text','text','other', false,false,true,true,true,false, true,1,140,'{}'),
  ('estimated_interest_this_month','ดอกเบี้ยประมาณเดือนนี้','currency','numeric','other', false,false,false,false,false,true, false,1,150,'{}'),
  ('lifecycle_status','สถานะ','select','text','status', true,false,true,false,true,false, true,1,160,'{"options":["draft","pending_approval","active","suspended","expired","closing_review","closed"]}'),
  ('note','หมายเหตุ','textarea','text','content', false,false,true,false,false,false, true,2,170,'{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts)
where m.module_key = 'od-facilities'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 7) field registry — transactions
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk, v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('od_facility_id','วงเงิน OD','relation','uuid','core', true,false,false,false,true,false, false,1,20,'{}','{"allow_create": false, "target_table": "od_facilities", "target_module_key": "od-facilities", "target_label_field": "od_code", "target_search_fields": ["od_code","lender_name"]}'),
  ('transaction_date','วันที่','date','date','core', true,false,false,false,true,true, false,1,30,'{}','{}'),
  ('description','รายละเอียด','text','text','core', true,false,false,true,false,false, false,2,40,'{}','{}'),
  ('money_in','เงินเข้า','currency','numeric','other', true,false,false,false,false,true, false,1,50,'{}','{}'),
  ('money_out','เงินออก','currency','numeric','other', true,false,false,false,false,true, false,1,60,'{}','{}'),
  ('balance_after','ยอดคงเหลือ','currency','numeric','other', true,false,false,false,false,true, false,1,70,'{}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'od-transactions'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 8) field registry — daily balances
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk, v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('od_facility_id','วงเงิน OD','relation','uuid','core', true,false,false,false,true,false, false,1,20,'{}','{"allow_create": false, "target_table": "od_facilities", "target_module_key": "od-facilities", "target_label_field": "od_code", "target_search_fields": ["od_code","lender_name"]}'),
  ('balance_date','วันที่','date','date','core', true,false,false,false,true,true, false,1,30,'{}','{}'),
  ('closing_bank_balance','ยอดปิดบัญชี','currency','numeric','other', true,false,false,false,false,true, false,1,40,'{}','{}'),
  ('od_used_amount','ยอดใช้ OD','currency','numeric','other', true,false,false,false,false,true, false,1,50,'{}','{}'),
  ('available_limit','เหลือวงเงิน','currency','numeric','other', true,false,false,false,false,true, false,1,60,'{}','{}'),
  ('estimated_interest','ดอกเบี้ยประมาณ','currency','numeric','other', true,false,false,false,false,true, false,1,70,'{}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'od-daily-balances'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 9) menu
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'วงเงิน OD', 160, 10, '🏦', 'วงเงิน OD', '/od-facilities', true, true, array['loan-od'], 'od-facilities', true
where not exists (select 1 from public.erp_menu_items where href = '/od-facilities');
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'วงเงิน OD', 160, 20, '📅', 'ยอดใช้รายวัน', '/od-daily-usage', true, true, array['loan-od'], 'od-daily-balances', true
where not exists (select 1 from public.erp_menu_items where href = '/od-daily-usage');
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'วงเงิน OD', 160, 30, '🧾', 'รายการเดินบัญชี', '/od-transactions', true, true, array['loan-od'], 'od-transactions', true
where not exists (select 1 from public.erp_menu_items where href = '/od-transactions');

-- 10) permissions
insert into public.erp_permissions(key, label, category, sort_order)
select x.k, x.l, 'การเงิน (เงินกู้/OD)', x.o from (values
  ('od_facilities.view','ดูวงเงิน OD',200),
  ('od_facilities.create','สร้างวงเงิน OD',210),
  ('od_facilities.edit','แก้ไขวงเงิน OD',220),
  ('od_facilities.delete','ลบวงเงิน OD',230),
  ('od_statements.import','นำเข้า Statement',240),
  ('od_transactions.view','ดูรายการเดินบัญชี OD',250),
  ('od_daily.view','ดูยอดใช้ OD รายวัน',260)
) as x(k,l,o)
where not exists (select 1 from public.erp_permissions p where p.key = x.k);

insert into public.erp_role_permissions(role_key, permission_key)
select x.r, x.p from (values
  ('manager','od_facilities.view'), ('manager','od_facilities.create'), ('manager','od_facilities.edit'), ('manager','od_statements.import'),
  ('manager','od_transactions.view'), ('manager','od_daily.view'),
  ('staff','od_facilities.view'), ('staff','od_transactions.view'), ('staff','od_daily.view'),
  ('viewer','od_facilities.view'), ('viewer','od_transactions.view'), ('viewer','od_daily.view')
) as x(r,p)
where not exists (select 1 from public.erp_role_permissions rp where rp.role_key = x.r and rp.permission_key = x.p);

-- 11) sample facility
insert into public.od_facilities (lender_name, bank_account, company, limit_amount, interest_rate, interest_rate_reference, start_date, review_date, expiry_date, responsible, lifecycle_status)
select 'ธนาคารกสิกรไทย', 'KBANK 123-4-56789-0 (เดินสะพัด)', 'บริษัท พิกซี่ดัสตี้ จำกัด', 2000000, 8.10, 'MOR + 0.75%', '2025-01-01', '2026-01-01', '2026-12-31', 'สมหญิง (การเงิน)', 'active'
where not exists (select 1 from public.od_facilities);
