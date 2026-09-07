-- ============================================================
-- บัตรเครดิต & วงเงินหมุนเวียน (debt_cards) — หนี้แบบเบา: ยอดค้างตามใบแจ้งยอด + วันครบกำหนด
-- ไม่มีตารางผ่อน/ใบเบิก — ทุกเดือนแก้ยอด/วันตามใบแจ้งยอดใหม่ · จ่ายแล้วกรอก paid_amount/paid_date
-- ใช้กับ: บัตรเครดิต (UOB / กรุงเทพ / กรุงศรี) · UOB Cash Plus · วงเงินหมุนเวียนอื่นที่ธนาคารแจ้งยอดรายเดือน
-- โผล่ที่: หน้า "หนี้ธนาคาร" ภาพรวม (/bank-debts) + กระดานเงินสด (การ์ด 🔒 วันครบกำหนด)
-- ============================================================
create table if not exists public.debt_cards (
  id uuid primary key default gen_random_uuid(),
  card_name text not null,
  lender_name text not null default '',
  card_kind text not null default 'credit_card',       -- credit_card | cash_plus | revolving
  card_no text not null default '',
  owner_type text not null default 'company',          -- company | person
  company_id uuid references public.companies(id),
  credit_limit numeric(18,2) not null default 0,
  interest_rate numeric(8,3),
  statement_date date,
  statement_balance numeric(18,2) not null default 0,
  minimum_due numeric(18,2) not null default 0,
  due_date date,
  paid_amount numeric(18,2) not null default 0,
  paid_date date,
  status text not null default 'unpaid',               -- unpaid | partial | paid
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_debt_cards_due on public.debt_cards(due_date) where is_active;

alter table public.debt_cards enable row level security;
drop policy if exists debt_cards_sel on public.debt_cards;
create policy debt_cards_sel on public.debt_cards for select to authenticated using (true);

-- updated_at + สถานะอัตโนมัติจากยอดที่จ่าย
create or replace function public.debt_cards_biu() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  if coalesce(new.paid_amount,0) <= 0 then new.status := 'unpaid';
  elsif new.paid_amount + 0.005 >= new.statement_balance then new.status := 'paid';
  else new.status := 'partial'; end if;
  return new;
end $$;
drop trigger if exists trg_debt_cards_biu on public.debt_cards;
create trigger trg_debt_cards_biu before insert or update on public.debt_cards
for each row execute function public.debt_cards_biu();

-- ทะเบียนโมดูล (MasterCRUD generic)
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, is_active, sort_order, group_label)
select 'debt-cards', 'debt_cards', 'บัตรเครดิต & วงเงินหมุนเวียน', 'หนี้แบบเบา — ยอดค้างตามใบแจ้งยอด + วันครบกำหนด (ไม่มีตารางผ่อน)', 'card_name', 'physical', true, 530, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'debt-cards');

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text, placeholder)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk, v.vis, v.req, true, v.srch, v.filt, true, true, v.span, v.ord, v.opts::jsonb, v.rel::jsonb, v.help, v.ph
from public.erp_modules m
cross join (values
  ('card_name',        'ชื่อบัตร / วงเงิน',       'text',     'text',    'core',  true,  true,  true,  false, 1, 10, '{}', '{}', 'เช่น UOB Cash Plus · บัตรกรุงศรี วีซ่า แพลทินัม', null),
  ('lender_name',      'ธนาคาร / ผู้ออกบัตร',     'text',     'text',    'core',  true,  true,  true,  true,  1, 20, '{"picker":"bank","picker_free_text":true}', '{}', 'เลือกธนาคารจากทะเบียน หรือพิมพ์ชื่อผู้ออกบัตร', null),
  ('card_kind',        'ชนิด',                    'select',   'text',    'core',  true,  true,  false, true,  1, 30, '{"options":["credit_card","cash_plus","revolving"],"labels":{"credit_card":"บัตรเครดิต","cash_plus":"บัตรกดเงินสด / Cash Plus","revolving":"วงเงินหมุนเวียนอื่น"}}', '{}', null, null),
  ('card_no',          'เลขบัตร (4 ตัวท้าย)',     'text',     'text',    'core',  true,  false, true,  false, 1, 40, '{}', '{}', 'ใส่แค่ 4 ตัวท้ายพอ เช่น 2123', 'XXXX 2123'),
  ('owner_type',       'เจ้าของหนี้เป็น',         'select',   'text',    'core',  true,  false, false, true,  1, 50, '{"options":["company","person"],"labels":{"company":"ของบริษัท","person":"หนี้ส่วนตัว"}}', '{}', 'หนี้ส่วนตัวก็เลือกบริษัทที่ใช้เงินได้', null),
  ('company_id',       'บริษัท',                  'relation', 'uuid',    'core',  true,  false, false, true,  1, 60, '{}', '{"allow_create":false,"target_table":"companies","target_module_key":"payroll-companies","target_label_field":"name","target_search_fields":["name","company_code","name_th"],"secondary_label_field":"company_code"}', 'บริษัทในกลุ่มที่ใช้เงินก้อนนี้', null),
  ('credit_limit',     'วงเงิน',                  'currency', 'numeric', 'money', true,  false, false, false, 1, 70, '{}', '{}', null, null),
  ('interest_rate',    'ดอกเบี้ยต่อปี (%)',       'number',   'numeric', 'money', false, false, false, false, 1, 80, '{}', '{}', null, null),
  ('statement_date',   'วันสรุปยอด',              'date',     'date',    'bill',  true,  false, false, true,  1, 90, '{}', '{}', 'วันที่บนใบแจ้งยอดล่าสุด', null),
  ('statement_balance','ยอดที่ต้องชำระ (ตามใบแจ้งยอด)', 'currency','numeric','bill', true, true, false, false, 1, 100, '{}', '{}', 'ยอดรวมที่ต้องชำระในรอบนี้ — ทุกเดือนแก้ตามใบแจ้งยอดใหม่', null),
  ('minimum_due',      'ยอดขั้นต่ำ',              'currency', 'numeric', 'bill',  true,  false, false, false, 1, 110, '{}', '{}', null, null),
  ('due_date',         'ครบกำหนดชำระ',            'date',     'date',    'bill',  true,  true,  false, true,  1, 120, '{}', '{}', 'ขึ้นกระดานเงินสดเป็นการ์ด 🔒 วันนี้', null),
  ('paid_amount',      'จ่ายแล้ว',                'currency', 'numeric', 'paid',  true,  false, false, false, 1, 130, '{}', '{}', 'จ่ายรอบนี้ไปเท่าไหร่ — ระบบตั้งสถานะให้เอง (ยังไม่จ่าย / บางส่วน / จ่ายแล้ว)', null),
  ('paid_date',        'วันที่จ่าย',              'date',     'date',    'paid',  true,  false, false, true,  1, 140, '{}', '{}', null, null),
  ('status',           'สถานะ',                   'select',   'text',    'status',true,  false, false, true,  1, 150, '{"options":["unpaid","partial","paid"],"labels":{"unpaid":"ยังไม่จ่าย","partial":"จ่ายบางส่วน","paid":"จ่ายแล้ว"}}', '{}', 'ระบบคิดให้จากยอดที่จ่าย', null),
  ('note',             'หมายเหตุ',                'textarea', 'text',    'other', false, false, true,  false, 2, 160, '{}', '{}', null, null)
) as v(fk,lbl,ui,dt,gk,vis,req,srch,filt,span,ord,opts,rel,help,ph)
where m.module_key = 'debt-cards'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- ทำให้ช่อง status อ่านอย่างเดียว (trigger คิดให้)
update public.erp_module_fields f set is_editable = false
  from public.erp_modules m where m.id = f.module_id and m.module_key = 'debt-cards' and f.column_name = 'status';

-- เมนู: บัตรเครดิต (หมวดเงินกู้ & OD) + หนี้ธนาคาร (ภาพรวม · หน้าแรกของแอป)
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, is_active, app_keys)
select 'เงินกู้ & OD', 155, 70, '💳', 'บัตรเครดิต & วงเงินหมุนเวียน', '/debt-cards', true, true, true, array['loan-od']
where not exists (select 1 from public.erp_menu_items where href = '/debt-cards');
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, is_active, app_keys, permission_key)
select 'ภาพรวม', 0, -10, '🏦', 'หนี้ธนาคาร', '/bank-debts', true, true, true, array['loan-od','cashflow'], 'loan_contracts.view'
where not exists (select 1 from public.erp_menu_items where href = '/bank-debts');

-- ข้อมูลตั้งต้นจากใบแจ้งยอดที่สแกน (07/09/2026)
insert into public.debt_cards (card_name, lender_name, card_kind, card_no, owner_type, company_id, credit_limit, interest_rate, statement_date, statement_balance, minimum_due, due_date, note)
select v.* from (values
  ('UOB Cash Plus (4 สัญญาผ่อน)', 'ธนาคารยูโอบี (UOB)', 'cash_plus', '4043 65XX XXXX 2123', 'person', 'ba51eda6-9315-4437-9713-b687f83c27b1'::uuid, 520000, null::numeric, '2026-05-12'::date, 34989.28, 34989.28, '2026-06-05'::date,
     'บัญชี 816-03100087956 · ผ่อน CPFCDC00007 (21/48) / 00008 (18/48) / 00009 (09/48) / CPFNDC00006 (23/48) · ⚠️ จดหมายเตือน 06/07/2026 ค้าง 22 วัน ยอด 34,835.39 · ลงจากใบแจ้งยอดสแกน'),
  ('UOB Mastercard Platinum', 'ธนาคารยูโอบี (UOB)', 'credit_card', '4033 75XX XXXX 4499', 'person', 'ba51eda6-9315-4437-9713-b687f83c27b1'::uuid, 99000, null, '2026-05-10', 54940.71, 10640.39, '2026-05-29',
     'บัญชี 810-03100087956 · บัตรเสริม 5432 15XX XXXX 4701 ยอดยกมา 5,561.58 CR · สแกนมาแค่หน้า 1/3 · ลงจากใบแจ้งยอดสแกน'),
  ('บัตรเครดิตกรุงเทพ Visa Gold 1 Travel', 'ธนาคารกรุงเทพ (Bangkok Bank)', 'credit_card', '4546 26XX XXXX 1115', 'person', 'ba51eda6-9315-4437-9713-b687f83c27b1'::uuid, 500000, 16, '2026-05-25', 52549.26, 8133.80, '2026-06-09',
     'บัตรที่ 2: 4730 14XX XXXX 5117 (Visa Platinum) ยอด −0.08 · ยอดยกมา 49,249.26 · ลงจากใบแจ้งยอดสแกน'),
  ('บัตรเครดิตกรุงศรี วีซ่า แพลทินัม', 'ธนาคารกรุงศรีอยุธยา (Krungsri)', 'credit_card', '4552 05XX XXXX 5697', 'person', 'ba51eda6-9315-4437-9713-b687f83c27b1'::uuid, 150000, null, '2026-04-30', 54912.38, 12202.72, '2026-05-15',
     '⚠️ ใบแจ้งยอดขึ้น "ชำระทันที" (รอบก่อนเรียกเก็บ 52,071.68 จ่าย 0) · วันครบกำหนดใส่ประมาณ 15/05 · บัตรเสริม ...2389 (APICHAI) · ผ่อน Toyota Metropolitan งวด 9/10 = 2,070.45 · ลงจากใบแจ้งยอดสแกน')
) as v(card_name, lender_name, card_kind, card_no, owner_type, company_id, credit_limit, interest_rate, statement_date, statement_balance, minimum_due, due_date, note)
where not exists (select 1 from public.debt_cards);
