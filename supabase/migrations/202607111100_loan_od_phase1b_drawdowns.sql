-- Phase 1b: Loan Drawdowns + auto rollup on loan_contracts — additive only
-- เบิกเงินที่ status='confirmed' → trigger คิด total_drawn_amount/outstanding_principal/drawdown_status ในสัญญาอัตโนมัติ
-- net_received_amount = gross_amount - fee_amount (คิดโดย trigger)

-- 1) computed columns on parent (maintained by trigger; readonly in UI)
alter table public.loan_contracts add column if not exists total_drawn_amount    numeric(18,2) not null default 0;
alter table public.loan_contracts add column if not exists principal_paid_amount numeric(18,2) not null default 0;
alter table public.loan_contracts add column if not exists outstanding_principal  numeric(18,2) not null default 0;

-- 2) drawdowns table
create table if not exists public.loan_drawdowns (
  id uuid primary key default gen_random_uuid(),
  drawdown_no text unique,
  loan_contract_id uuid references public.loan_contracts(id) on delete cascade,
  drawdown_date date,
  gross_amount numeric(18,2) not null default 0,
  fee_amount numeric(18,2) not null default 0,
  net_received_amount numeric(18,2) not null default 0,
  receive_account text not null default '',
  reference_no text not null default '',
  status text not null default 'confirmed',
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loan_drawdowns_contract on public.loan_drawdowns(loan_contract_id);

-- 3) numbering rule + before-trigger (auto no + net_received + updated_at)
insert into public.erp_numbering_rules(key, label, pattern, reset_policy, current_value, active)
select 'ldr', 'การเบิกเงินกู้ (Drawdown)', 'LDR-{YYYY}-{0000}', 'yearly', 0, true
where not exists (select 1 from public.erp_numbering_rules where key = 'ldr');

create or replace function public.loan_drawdowns_biu() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.drawdown_no is null or new.drawdown_no = '' then
    new.drawdown_no := public.erp_next_number('ldr');
  end if;
  new.net_received_amount := coalesce(new.gross_amount,0) - coalesce(new.fee_amount,0);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_loan_drawdowns_biu on public.loan_drawdowns;
create trigger trg_loan_drawdowns_biu before insert or update on public.loan_drawdowns
for each row execute function public.loan_drawdowns_biu();

-- 4) recompute parent rollup from Confirmed drawdowns
create or replace function public.loan_contract_recompute(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_id is null then return; end if;
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
end $$;

create or replace function public.loan_drawdowns_rollup() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public.loan_contract_recompute(old.loan_contract_id);
    return old;
  end if;
  perform public.loan_contract_recompute(new.loan_contract_id);
  if tg_op = 'UPDATE' and old.loan_contract_id is distinct from new.loan_contract_id then
    perform public.loan_contract_recompute(old.loan_contract_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_loan_drawdowns_rollup on public.loan_drawdowns;
create trigger trg_loan_drawdowns_rollup after insert or update or delete on public.loan_drawdowns
for each row execute function public.loan_drawdowns_rollup();

-- 5) RLS
alter table public.loan_drawdowns enable row level security;
drop policy if exists loan_drawdowns_sel on public.loan_drawdowns;
create policy loan_drawdowns_sel on public.loan_drawdowns for select to authenticated using (true);

-- 6) register module
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-drawdowns', 'loan_drawdowns', 'การเบิกเงินกู้', 'drawdown_no', 'physical', true, 510, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-drawdowns');

-- 7) field registry — drawdowns
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, v.req, v.edit, v.srch, v.filt, v.srt,
       v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('drawdown_no','เลขที่เบิก','text','text','core', true,false,false,true,false,true, false,1,20,'{}','{}'),
  ('loan_contract_id','สัญญาเงินกู้','relation','uuid','core', true,true,true,false,true,false, true,2,30,'{}','{"allow_create": false, "target_table": "loan_contracts", "target_module_key": "loan-contracts", "target_label_field": "loan_name", "target_search_fields": ["loan_code","loan_name"]}'),
  ('drawdown_date','วันที่เบิก','date','date','core', true,false,true,false,true,true, true,1,40,'{}','{}'),
  ('gross_amount','ยอดเบิก (Gross)','currency','numeric','other', true,true,true,false,true,true, true,1,50,'{}','{}'),
  ('fee_amount','ค่าธรรมเนียม','currency','numeric','other', false,false,true,false,true,false, true,1,60,'{}','{}'),
  ('net_received_amount','ยอดรับสุทธิ','currency','numeric','other', true,false,false,false,true,true, false,1,70,'{}','{}'),
  ('receive_account','บัญชีรับเงิน','text','text','other', false,false,true,true,false,false, true,1,80,'{}','{}'),
  ('reference_no','อ้างอิง','text','text','other', false,false,true,true,false,false, true,1,90,'{}','{}'),
  ('status','สถานะ','select','text','status', true,false,true,false,true,false, true,1,100,'{"options":["draft","submitted","verified","confirmed","cancelled","reversed"]}','{}'),
  ('note','หมายเหตุ','textarea','text','content', false,false,true,false,false,false, true,2,110,'{}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'loan-drawdowns'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 8) field registry — new computed columns on loan-contracts (readonly, not in form)
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options)
select m.id, v.fk, v.fk, v.lbl, 'currency', 'numeric', 'other',
       v.vis, false, false, false, true, true,
       false, 1, v.ord, '{}'::jsonb
from public.erp_modules m
cross join (values
  ('total_drawn_amount','เบิกสะสม', true, 75),
  ('principal_paid_amount','ชำระเงินต้นสะสม', false, 76),
  ('outstanding_principal','เงินต้นคงเหลือ', true, 77)
) as v(fk,lbl,vis,ord)
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 9) menu
insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'เงินกู้ & OD', 155, 20, '💵', 'การเบิกเงิน', '/loan-drawdowns', true, true, array['loan-od'], 'loan-drawdowns', true
where not exists (select 1 from public.erp_menu_items where href = '/loan-drawdowns');

-- 10) permissions
insert into public.erp_permissions(key, label, category, sort_order)
select x.k, x.l, 'การเงิน (เงินกู้/OD)', x.o from (values
  ('loan_drawdowns.view','ดูการเบิกเงิน',60),
  ('loan_drawdowns.create','สร้างการเบิกเงิน',70),
  ('loan_drawdowns.edit','แก้ไขการเบิกเงิน',80),
  ('loan_drawdowns.delete','ลบการเบิกเงิน',90)
) as x(k,l,o)
where not exists (select 1 from public.erp_permissions p where p.key = x.k);

insert into public.erp_role_permissions(role_key, permission_key)
select x.r, x.p from (values
  ('manager','loan_drawdowns.view'), ('manager','loan_drawdowns.create'), ('manager','loan_drawdowns.edit'),
  ('staff','loan_drawdowns.view'), ('viewer','loan_drawdowns.view')
) as x(r,p)
where not exists (select 1 from public.erp_role_permissions rp where rp.role_key = x.r and rp.permission_key = x.p);

-- 11) backfill rollup for existing contracts
select public.loan_contract_recompute(id) from public.loan_contracts;
