-- Phase 1a: Loan Contracts (real DB) — additive only
-- โมดูล "สัญญาเงินกู้" ต่อฐานข้อมูลจริง ใช้ของกลาง MasterCRUDPage + /api/master-v2
-- เลขรันอัตโนมัติผ่าน trigger (erp_next_number 'loan') · ลงทะเบียน erp_modules + field registry + เมนู + สิทธิ์

-- 1) table
create table if not exists public.loan_contracts (
  id uuid primary key default gen_random_uuid(),
  loan_code text unique,
  loan_name text not null default '',
  lender_name text not null default '',
  loan_type text not null default 'term',
  contract_no text not null default '',
  start_date date,
  end_date date,
  currency text not null default 'THB',
  approved_limit numeric(18,2) not null default 0,
  contracted_principal numeric(18,2) not null default 0,
  interest_rate numeric(9,4) not null default 0,
  interest_rate_type text not null default 'floating',
  interest_rate_reference text not null default '',
  repayment_method text not null default 'equal_installment',
  payment_frequency text not null default 'monthly',
  responsible text not null default '',
  lifecycle_status text not null default 'draft',
  drawdown_status text not null default 'not_drawn',
  repayment_health text not null default 'current',
  accounting_status text not null default 'not_ready',
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) numbering rule + triggers (auto loan_code)
insert into public.erp_numbering_rules(key, label, pattern, reset_policy, current_value, active)
select 'loan', 'สัญญาเงินกู้ (Loan)', 'LOAN-{YYYY}-{0000}', 'yearly', 0, true
where not exists (select 1 from public.erp_numbering_rules where key = 'loan');

create or replace function public.loan_contracts_biu() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.loan_code is null or new.loan_code = '' then
    new.loan_code := public.erp_next_number('loan');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_loan_contracts_biu on public.loan_contracts;
create trigger trg_loan_contracts_biu before insert on public.loan_contracts
for each row execute function public.loan_contracts_biu();

create or replace function public.loan_contracts_bu() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_loan_contracts_bu on public.loan_contracts;
create trigger trg_loan_contracts_bu before update on public.loan_contracts
for each row execute function public.loan_contracts_bu();

-- 3) RLS (permissive read for authenticated; writes go via service-role in API)
alter table public.loan_contracts enable row level security;
drop policy if exists loan_contracts_sel on public.loan_contracts;
create policy loan_contracts_sel on public.loan_contracts for select to authenticated using (true);

-- 4) register module
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-contracts', 'loan_contracts', 'สัญญาเงินกู้', 'loan_name', 'physical', true, 500, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-contracts');

-- 5) field registry
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, v.req, v.edit, v.srch, v.filt, v.srt,
       v.form, v.span, v.ord, v.opts::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}'),
  ('loan_code','รหัสสัญญา','text','text','core', true,false,false,true,false,true, false,1,20,'{}'),
  ('loan_name','ชื่อสัญญา','text','text','core', true,true,true,true,false,true, true,2,30,'{}'),
  ('lender_name','ผู้ให้กู้','text','text','core', true,false,true,true,true,true, true,1,40,'{}'),
  ('loan_type','ประเภทเงินกู้','select','text','core', true,false,true,false,true,false, true,1,50,'{"options":["term","revolving","leasing","director","vehicle","machine","short_term"]}'),
  ('contract_no','เลขที่สัญญา (ธนาคาร)','text','text','core', false,false,true,true,false,false, true,1,60,'{}'),
  ('contracted_principal','เงินต้นตามสัญญา','currency','numeric','other', true,false,true,false,true,true, true,1,70,'{}'),
  ('approved_limit','วงเงินอนุมัติ','currency','numeric','other', false,false,true,false,true,true, true,1,80,'{}'),
  ('interest_rate','อัตราดอกเบี้ย (%)','number','numeric','other', true,false,true,false,true,true, true,1,90,'{}'),
  ('interest_rate_type','ชนิดอัตรา','select','text','other', false,false,true,false,true,false, true,1,100,'{"options":["fixed","floating"]}'),
  ('interest_rate_reference','อ้างอิงอัตรา','text','text','other', false,false,true,false,false,false, true,1,110,'{}'),
  ('currency','สกุลเงิน','text','text','other', false,false,true,false,true,false, true,1,120,'{}'),
  ('repayment_method','วิธีผ่อน','select','text','other', false,false,true,false,true,false, true,1,130,'{"options":["equal_installment","equal_principal","interest_only","custom"]}'),
  ('payment_frequency','ความถี่จ่าย','select','text','other', false,false,true,false,true,false, true,1,140,'{"options":["monthly","quarterly","yearly","custom"]}'),
  ('start_date','วันเริ่มสัญญา','date','date','other', true,false,true,false,true,true, true,1,150,'{}'),
  ('end_date','วันสิ้นสุด','date','date','other', false,false,true,false,true,true, true,1,160,'{}'),
  ('responsible','ผู้รับผิดชอบ','text','text','other', false,false,true,true,true,false, true,1,170,'{}'),
  ('lifecycle_status','สถานะสัญญา','select','text','status', true,false,true,false,true,false, true,1,180,'{"options":["draft","pending_approval","approved","active","closing_review","closed","cancelled","restructuring"]}'),
  ('drawdown_status','สถานะการเบิก','select','text','status', false,false,true,false,true,false, true,1,190,'{"options":["not_drawn","partially_drawn","fully_drawn"]}'),
  ('repayment_health','สุขภาพการชำระ','select','text','status', true,false,true,false,true,false, true,1,200,'{"options":["current","due","overdue","defaulted"]}'),
  ('accounting_status','สถานะบัญชี','select','text','status', false,false,true,false,true,false, true,1,210,'{"options":["not_ready","ready","exported","error"]}'),
  ('note','หมายเหตุ','textarea','text','content', false,false,true,false,false,false, true,2,220,'{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts)
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 6) app group + menu
insert into public.erp_app_groups(key, label, icon, sort_order, is_active, permission_key)
select 'loan-od', 'การเงิน (เงินกู้/OD)', '💵', 155, true, null
where not exists (select 1 from public.erp_app_groups where key = 'loan-od');

insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'เงินกู้ & OD', 155, 10, '📄', 'สัญญาเงินกู้', '/loan-contracts', true, true, array['loan-od'], 'loan-contracts', true
where not exists (select 1 from public.erp_menu_items where href = '/loan-contracts');

-- 7) register permission keys (FK target) then grant to common roles (admin bypasses erp_can)
insert into public.erp_permissions(key, label, category, sort_order)
select x.k, x.l, 'การเงิน (เงินกู้/OD)', x.o from (values
  ('loan_contracts.view','ดูสัญญาเงินกู้',10),
  ('loan_contracts.create','สร้างสัญญาเงินกู้',20),
  ('loan_contracts.edit','แก้ไขสัญญาเงินกู้',30),
  ('loan_contracts.delete','ลบสัญญาเงินกู้',40),
  ('loan_contracts.export','ส่งออกสัญญาเงินกู้',50)
) as x(k,l,o)
where not exists (select 1 from public.erp_permissions p where p.key = x.k);

insert into public.erp_role_permissions(role_key, permission_key)
select x.r, x.p from (values
  ('manager','loan_contracts.view'), ('manager','loan_contracts.create'), ('manager','loan_contracts.edit'),
  ('staff','loan_contracts.view'), ('viewer','loan_contracts.view')
) as x(r,p)
where not exists (select 1 from public.erp_role_permissions rp where rp.role_key = x.r and rp.permission_key = x.p);
