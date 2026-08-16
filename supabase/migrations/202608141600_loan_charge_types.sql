-- ============================================================
-- Loan & OD — รายการแยกยอดจ่าย "ตามแต่ละธนาคาร"
-- ------------------------------------------------------------
-- เจ้าของแจ้ง: "ตรงแยกยอดจ่าย เพิ่มรายการตามแต่ละธนาคารด้วย (บางธนาคารมีไม่เหมือนกัน)"
--
-- เดิมแยกได้แค่ 4 อย่างตายตัว (เงินต้น/ดอกเบี้ย/ดอกผิดนัด/ค่าธรรมเนียม)
-- แต่ละธนาคารมีรายการเก็บเงินไม่เหมือนกัน (ค่าอากรแสตมป์ ค่าเบี้ยประกัน ค่าติดตามทวงถาม ฯลฯ)
--
-- ท่าที่ใช้ (ตาม CLAUDE.md: เป็น config ไม่ใช่ hardcode):
--   1) ตารางกลาง loan_charge_types = "ประเภทรายการจ่าย" — เจ้าของเพิ่มเองได้จากเว็บ
--      ระบุได้ว่ารายการนี้ของธนาคารไหน (เว้นว่าง = ใช้ได้ทุกธนาคาร)
--      และให้ "จัดเข้ากลุ่มไหน" (เงินต้น/ดอกเบี้ย/ดอกผิดนัด/ค่าธรรมเนียม/อื่น ๆ)
--   2) loan_payment_lines = รายการที่แยกไว้จริงในใบจ่ายแต่ละใบ (เก็บประวัติว่าจ่ายอะไรบ้าง)
--   3) ยอดรวมต่อกลุ่มยังเก็บใน loan_payments เหมือนเดิม → ตัวตัดยอดเข้างวด (reallocate) ไม่ต้องแก้เลย
-- ============================================================

-- ============================================================
-- 1) ประเภทรายการจ่าย (master ตั้งค่าเองได้)
-- ============================================================
create table if not exists public.loan_charge_types (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null default '',
  -- จัดเข้ากลุ่มไหนตอนตัดยอด: principal/interest/penalty/fee = ตัดเข้างวดผ่อน · other = บันทึกไว้เฉย ๆ
  bucket text not null default 'fee',
  -- ชื่อผู้ให้กู้ที่ใช้รายการนี้ (เว้นว่าง = ใช้ได้ทุกธนาคาร) — ตรงกับ loan_contracts.lender_name
  lender_name text not null default '',
  note text not null default '',
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loan_charge_types drop constraint if exists loan_charge_types_bucket_chk;
alter table public.loan_charge_types add constraint loan_charge_types_bucket_chk
  check (bucket in ('principal','interest','penalty','fee','other'));

create index if not exists idx_loan_charge_types_lender on public.loan_charge_types(lender_name);

drop trigger if exists trg_loan_charge_types_touch on public.loan_charge_types;
create trigger trg_loan_charge_types_touch before update on public.loan_charge_types
for each row execute function public.loan_touch_updated_at();

comment on table public.loan_charge_types is 'ประเภทรายการจ่ายเงินกู้ (ตั้งค่าเองได้) — แต่ละธนาคารเก็บไม่เหมือนกัน';

-- ============================================================
-- 2) รายการที่แยกไว้ในใบจ่ายแต่ละใบ
-- ============================================================
create table if not exists public.loan_payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.loan_payments(id) on delete cascade,
  charge_type_id uuid references public.loan_charge_types(id) on delete set null,
  label text not null default '',
  bucket text not null default 'fee',
  amount numeric(18,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_loan_payment_lines_payment on public.loan_payment_lines(payment_id);

-- ยอดรวมของรายการกลุ่ม "อื่น ๆ" (ไม่ได้ตัดเข้างวดผ่อน แต่นับเป็นเงินที่จ่ายจริง)
alter table public.loan_payments
  add column if not exists other_amount numeric(18,2) not null default 0;

comment on column public.loan_payments.other_amount is 'รวมรายการกลุ่ม "อื่น ๆ" เช่น ค่าอากรแสตมป์ — จ่ายจริงแต่ไม่ได้ตัดเข้างวดผ่อน';

-- ============================================================
-- 3) บันทึกการจ่าย — รับรายการแยกเพิ่มเติม (p_lines)
--    p_lines = [{"charge_type_id":"…","label":"ค่าอากรแสตมป์","bucket":"other","amount":50}, …]
--    ยอดของ line จะถูกบวกเข้ากลุ่มของมันเอง แล้วตรวจว่ารวมทุกกลุ่ม = ยอดจ่ายรวม
-- ============================================================
drop function if exists public.loan_payment_record(uuid, date, numeric, text, text, numeric, numeric, numeric, numeric, text, text);

create or replace function public.loan_payment_record(
  p_contract_id uuid, p_payment_date date, p_amount numeric,
  p_paid_from text default '', p_reference text default '',
  p_principal numeric default 0, p_interest numeric default 0,
  p_penalty numeric default 0, p_fee numeric default 0,
  p_receipt_no text default '', p_receipt_image text default '',
  p_lines jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; r jsonb; i int := 0;
  v_pri numeric(18,2); v_int numeric(18,2); v_pen numeric(18,2); v_fee numeric(18,2); v_oth numeric(18,2) := 0;
  v_split numeric(18,2); v_amt numeric(18,2); v_bucket text;
begin
  if p_contract_id is null then raise exception 'กรุณาเลือกสัญญา'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'ยอดจ่ายต้องมากกว่า 0'; end if;

  v_pri := greatest(coalesce(p_principal,0),0);
  v_int := greatest(coalesce(p_interest,0),0);
  v_pen := greatest(coalesce(p_penalty,0),0);
  v_fee := greatest(coalesce(p_fee,0),0);

  -- บวกยอดของรายการเพิ่มเติมเข้ากลุ่มของมัน
  for r in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_amt := greatest(coalesce((r->>'amount')::numeric, 0), 0);
    if v_amt <= 0 then continue; end if;
    v_bucket := coalesce(nullif(r->>'bucket',''), 'fee');
    if v_bucket not in ('principal','interest','penalty','fee','other') then v_bucket := 'fee'; end if;
    if    v_bucket = 'principal' then v_pri := v_pri + v_amt;
    elsif v_bucket = 'interest'  then v_int := v_int + v_amt;
    elsif v_bucket = 'penalty'   then v_pen := v_pen + v_amt;
    elsif v_bucket = 'fee'       then v_fee := v_fee + v_amt;
    else                              v_oth := v_oth + v_amt;
    end if;
  end loop;

  v_split := v_pri + v_int + v_pen + v_fee + v_oth;
  if v_split > 0 and abs(v_split - p_amount) > 0.01 then
    raise exception 'ยอดที่แยก (%) ไม่เท่ากับยอดจ่ายรวม (%)', v_split, p_amount;
  end if;

  insert into public.loan_payments(
    loan_contract_id, payment_date, total_paid, paid_from, reference_no, status,
    principal_amount, interest_amount, penalty_amount, fee_amount, other_amount,
    receipt_no, receipt_image_key)
  values (p_contract_id, coalesce(p_payment_date, current_date), p_amount,
          coalesce(p_paid_from,''), coalesce(p_reference,''), 'verified',
          v_pri, v_int, v_pen, v_fee, v_oth,
          coalesce(p_receipt_no,''), coalesce(p_receipt_image,''))
  returning id into v_id;

  -- เก็บรายการที่แยกไว้ (ไว้ดูย้อนหลังว่าจ่ายค่าอะไรบ้าง)
  for r in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_amt := greatest(coalesce((r->>'amount')::numeric, 0), 0);
    if v_amt <= 0 then continue; end if;
    i := i + 1;
    v_bucket := coalesce(nullif(r->>'bucket',''), 'fee');
    if v_bucket not in ('principal','interest','penalty','fee','other') then v_bucket := 'fee'; end if;
    insert into public.loan_payment_lines(payment_id, charge_type_id, label, bucket, amount, sort_order)
    values (v_id, nullif(r->>'charge_type_id','')::uuid, coalesce(nullif(r->>'label',''), 'รายการอื่น'), v_bucket, v_amt, i);
  end loop;

  return v_id;
end $$;

-- ============================================================
-- 4) RLS + ลงทะเบียนโมดูล (ให้โผล่ในหน้า "โมดูลทั้งหมด" + มีหน้าตั้งค่า)
-- ============================================================
alter table public.loan_charge_types enable row level security;
drop policy if exists loan_charge_types_sel on public.loan_charge_types;
create policy loan_charge_types_sel on public.loan_charge_types for select to authenticated using (true);

alter table public.loan_payment_lines enable row level security;
drop policy if exists loan_payment_lines_sel on public.loan_payment_lines;
create policy loan_payment_lines_sel on public.loan_payment_lines for select to authenticated using (true);

insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-charge-types', 'loan_charge_types', 'ประเภทรายการจ่าย (เงินกู้)', 'name', 'physical', true, 540, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-charge-types');

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, v.req, true, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, '{}'::jsonb, v.help
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false,1,10,'{}',null),
  ('name','ชื่อรายการ','text','text','core', true,true,true,true,true,true,2,20,'{}','ชื่อที่จะโชว์ในป๊อปบันทึกการจ่าย เช่น ค่าอากรแสตมป์'),
  ('lender_name','ธนาคาร / ผู้ให้กู้','text','text','core', true,false,true,true,true,true,1,30,'{}','เว้นว่าง = ใช้ได้ทุกธนาคาร · ใส่ชื่อให้ตรงกับช่อง "ผู้ให้กู้" ในสัญญา'),
  ('bucket','จัดเข้ากลุ่ม','select','text','core', true,true,false,true,true,true,1,40,
   '{"options":["principal","interest","penalty","fee","other"],"labels":{"principal":"เงินต้น","interest":"ดอกเบี้ย","penalty":"ดอกเบี้ยผิดนัดชำระ","fee":"ค่าธรรมเนียม","other":"อื่น ๆ (ไม่ตัดเข้างวด)"}}',
   'ตอนตัดยอดจะเอาเงินก้อนนี้ไปตัดกลุ่มไหน · เลือก "อื่น ๆ" = บันทึกว่าจ่ายจริงแต่ไม่ตัดเข้างวดผ่อน'),
  ('code','รหัส','text','text','other', false,false,false,true,false,true,1,50,'{}',null),
  ('sort_order','ลำดับ','number','integer','other', false,false,false,false,true,true,1,60,'{}','เลขน้อยขึ้นก่อน'),
  ('note','หมายเหตุ','textarea','text','content', false,false,false,false,false,false,2,70,'{}',null),
  ('is_active','ใช้งาน','boolean','boolean','status', true,false,false,true,true,true,1,80,'{}',null)
) as v(fk,lbl,ui,dt,gk,vis,req,srch,filt,srt,form,span,ord,opts,help)
where m.module_key = 'loan-charge-types'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- เมนู: ชี้ไปหน้าจริง + อยู่กลุ่มเดียวกับเมนูเงินกู้อื่น ๆ
update public.erp_menu_items
set href = '/loan-charge-types', label = 'ประเภทรายการจ่าย', icon = '⚙️',
    section = 'เงินกู้ & OD', section_order = 155, sort_order = 60, app_keys = array['loan-od']
where href in ('/m/loan_charge_types', '/loan-charge-types');

-- ============================================================
-- 5) ตัวอย่างรายการที่ธนาคารไทยมักเก็บ (ใช้ได้ทุกธนาคาร — แก้/ลบ/เพิ่มเองได้)
-- ============================================================
insert into public.loan_charge_types(code, name, bucket, lender_name, sort_order, note)
select v.code, v.name, v.bucket, '', v.ord, v.note
from (values
  ('STAMP',    'ค่าอากรแสตมป์',            'other',   10, 'ค่าอากรแสตมป์ตามกฎหมาย'),
  ('INSURANCE','ค่าเบี้ยประกัน',            'other',   20, 'เบี้ยประกันอัคคีภัย/ประกันชีวิตคุ้มครองสินเชื่อ'),
  ('COLLECT',  'ค่าติดตามทวงถามหนี้',       'fee',     30, 'ค่าติดตามทวงถามกรณีจ่ายช้า'),
  ('APPRAISE', 'ค่าประเมินหลักประกัน',      'fee',     40, ''),
  ('TRANSFER', 'ค่าธรรมเนียมโอนเงิน',       'fee',     50, ''),
  ('PREPAY',   'ค่าปรับชำระก่อนกำหนด',      'penalty', 60, 'Prepayment fee')
) as v(code, name, bucket, ord, note)
where not exists (select 1 from public.loan_charge_types t where t.code = v.code);
