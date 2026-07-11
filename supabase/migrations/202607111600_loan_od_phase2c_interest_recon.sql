-- Phase 2c: OD Interest Reconciliation — additive only
-- เทียบดอกเบี้ยประมาณการ(จาก daily balance) vs ที่ธนาคารหักจริง (owner กรอก) + เตือนเกินเกณฑ์
-- เกณฑ์: ต่างเกิน 100 บาท หรือ 1% = ต้องตรวจสอบ · ยอมรับส่วนต่างใหญ่ต้องใส่ "เหตุผล"

create table if not exists public.od_interest_reconciliations (
  id uuid primary key default gen_random_uuid(),
  od_facility_id uuid references public.od_facilities(id) on delete cascade,
  month text not null default '',
  estimated numeric(18,2) not null default 0,
  actual numeric(18,2),
  difference numeric(18,2),
  diff_pct numeric(9,2),
  status text not null default 'waiting',
  reason text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_od_recon_month on public.od_interest_reconciliations(od_facility_id, month);
create index if not exists idx_od_recon_facility on public.od_interest_reconciliations(od_facility_id);

-- trigger: คิด difference/diff_pct/status จาก (actual, estimated, reason)
create or replace function public.od_recon_biu() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  if new.actual is null then
    new.difference := null; new.diff_pct := null; new.status := 'waiting';
  else
    new.difference := new.actual - coalesce(new.estimated, 0);
    new.diff_pct := case when coalesce(new.estimated,0) <> 0 then round((new.difference / new.estimated * 100)::numeric, 2) else null end;
    if abs(new.difference) <= 100 or (new.diff_pct is not null and abs(new.diff_pct) <= 1) then
      new.status := 'accepted';                                   -- อยู่ในเกณฑ์
    elsif btrim(coalesce(new.reason, '')) <> '' then
      new.status := 'accepted';                                   -- เกินเกณฑ์ แต่มีเหตุผลยอมรับ
    else
      new.status := 'need_review';                                -- เกินเกณฑ์ ยังไม่มีเหตุผล
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_od_recon_biu on public.od_interest_reconciliations;
create trigger trg_od_recon_biu before insert or update on public.od_interest_reconciliations
for each row execute function public.od_recon_biu();

-- สร้าง/อัปเดตประมาณการรายเดือนจาก daily balances (คง actual/reason เดิม)
create or replace function public.od_recon_build(p_facility_id uuid default null) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.od_interest_reconciliations (od_facility_id, month, estimated)
  select b.od_facility_id, to_char(b.balance_date, 'YYYY-MM'), round(sum(b.estimated_interest)::numeric, 2)
  from public.od_daily_balances b
  where (p_facility_id is null or b.od_facility_id = p_facility_id) and b.is_active = true
  group by b.od_facility_id, to_char(b.balance_date, 'YYYY-MM')
  on conflict (od_facility_id, month) do update set estimated = excluded.estimated;
end $$;

-- RLS
alter table public.od_interest_reconciliations enable row level security;
drop policy if exists od_recon_sel on public.od_interest_reconciliations;
create policy od_recon_sel on public.od_interest_reconciliations for select to authenticated using (true);

-- module
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'od-interest-recon', 'od_interest_reconciliations', 'กระทบยอดดอกเบี้ย OD', 'month', 'physical', true, 630, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'od-interest-recon');

-- field registry (status = readonly เพราะเป็นค่าคำนวณ)
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk, v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('od_facility_id','วงเงิน OD','relation','uuid','core', true,false,false,false,true,false, false,1,20,'{}','{"allow_create": false, "target_table": "od_facilities", "target_module_key": "od-facilities", "target_label_field": "od_code", "target_search_fields": ["od_code","lender_name"]}'),
  ('month','เดือน','text','text','core', true,false,false,true,true,true, false,1,30,'{}','{}'),
  ('estimated','ประมาณการ','currency','numeric','other', true,false,false,false,false,true, false,1,40,'{}','{}'),
  ('actual','ธนาคารหักจริง','currency','numeric','other', true,false,true,false,false,true, true,1,50,'{}','{}'),
  ('difference','ส่วนต่าง','currency','numeric','other', true,false,false,false,false,true, false,1,60,'{}','{}'),
  ('diff_pct','ส่วนต่าง (%)','number','numeric','other', true,false,false,false,false,true, false,1,70,'{}','{}'),
  ('status','สถานะ','select','text','status', true,false,false,false,true,false, false,1,80,'{"options":["waiting","accepted","need_review"]}','{}'),
  ('reason','เหตุผล (เมื่อยอมรับส่วนต่าง)','text','text','other', false,false,true,true,false,false, true,2,90,'{}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'od-interest-recon'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- menu
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'วงเงิน OD', 160, 40, '📈', 'กระทบยอดดอกเบี้ย', '/od-interest-recon', true, true, array['loan-od'], 'od-interest-recon', true
where not exists (select 1 from public.erp_menu_items where href = '/od-interest-recon');

-- permissions
insert into public.erp_permissions(key, label, category, sort_order)
select x.k, x.l, 'การเงิน (เงินกู้/OD)', x.o from (values
  ('od_interest.view','ดูกระทบยอดดอกเบี้ย',270),
  ('od_interest.reconcile','กระทบยอด/ยอมรับส่วนต่าง',280)
) as x(k,l,o)
where not exists (select 1 from public.erp_permissions p where p.key = x.k);

insert into public.erp_role_permissions(role_key, permission_key)
select x.r, x.p from (values
  ('manager','od_interest.view'), ('manager','od_interest.reconcile'),
  ('staff','od_interest.view'), ('viewer','od_interest.view')
) as x(r,p)
where not exists (select 1 from public.erp_role_permissions rp where rp.role_key = x.r and rp.permission_key = x.p);
