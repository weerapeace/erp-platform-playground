-- ============================================================
-- Cashflow เฟส 2 — อุดหลุมข้อมูลที่ทำให้ตัวเลขไม่แม่น
-- ------------------------------------------------------------
-- เฟส 1 ทำหน้ารวมเงินเข้า-ออกแล้ว แต่ตรวจข้อมูลจริงเจอ 3 หลุมใหญ่:
--   1. ไม่มีที่บันทึก "ลูกค้าจ่ายเงินมาแล้ว" → ใบขาย 64/64 ใบค้างรับเต็มจำนวนตลอดกาล
--   2. เครดิตแทบไม่มีใครตั้ง (ลูกค้า 1/125 · ร้านค้า 2/80) → ต้องเดาวันเงินเข้า/ออก
--   3. งวดผ่อนเงินกู้ไม่เคยถูกตัดจ่าย (loan_payment_allocations ว่าง 0 แถว
--      ทั้งที่มี loan_payments 38 รายการ รวม 2.4 ล้าน) → ยอดค้างเวอร์
--
-- เฟสนี้แก้ข้อ 1 ด้วยตารางใหม่ (ใบรับชำระ) · ข้อ 2-3 ทำเป็นเครื่องมือในหน้าเว็บ
-- (ข้อ 3 ใช้ฟังก์ชัน loan_contract_reallocate ที่มีอยู่แล้ว — แค่ไม่เคยมีใครสั่งรัน)
-- ============================================================

-- ------------------------------------------------------------
-- 1) ใบรับชำระจากลูกค้า
-- ------------------------------------------------------------
create table if not exists public.customer_receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text not null unique,
  receipt_date  date not null default current_date,
  customer_id   uuid references public.partners_v2(id),
  customer_name text,
  /** ยอดเงินที่เข้าบัญชีจริง (ไม่รวม wht ที่ลูกค้าหักไว้) */
  amount        numeric not null default 0,
  /** ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ — ถือว่าลูกค้า "จ่ายแล้ว" ในแง่ยอดหนี้ แต่เงินไม่เข้าบัญชี */
  wht_amount    numeric not null default 0,
  /** ค่าธรรมเนียมธนาคารที่ถูกหักจากยอดโอน */
  fee_amount    numeric not null default 0,
  method        text not null default 'transfer',   -- transfer | cash | cheque | card | other
  bank_account  text,
  reference_no  text,
  status        text not null default 'confirmed',  -- draft | confirmed | cancelled
  note          text,
  attachments   jsonb not null default '[]'::jsonb,
  company_id    uuid references public.companies(id),
  is_active     boolean not null default true,
  created_by    text,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.customer_receipts is 'ใบรับชำระจากลูกค้า — ตัดยอดค้างรับของใบขาย/ใบวางบิล และเป็นแหล่ง "เงินเข้าจริง" ของหน้ากระแสเงินสด';
comment on column public.customer_receipts.wht_amount is 'ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ — นับเป็นการชำระหนี้ แต่ไม่ใช่เงินเข้าบัญชี';

create index if not exists idx_cr_date     on public.customer_receipts(receipt_date desc);
create index if not exists idx_cr_customer on public.customer_receipts(customer_id);
create index if not exists idx_cr_status   on public.customer_receipts(status) where is_active;

create table if not exists public.customer_receipt_lines (
  id              uuid primary key default gen_random_uuid(),
  receipt_id      uuid not null references public.customer_receipts(id) on delete cascade,
  /** ตัดใบขายใบไหน (อย่างน้อยต้องมี so_id หรือ billing_note_id) */
  so_id           uuid,
  so_number       text,
  billing_note_id uuid,
  bill_number     text,
  amount          numeric not null default 0,
  note            text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_crl_receipt on public.customer_receipt_lines(receipt_id);
create index if not exists idx_crl_so      on public.customer_receipt_lines(so_id);
create index if not exists idx_crl_bn      on public.customer_receipt_lines(billing_note_id);

drop trigger if exists trg_customer_receipts_updated_at on public.customer_receipts;
create trigger trg_customer_receipts_updated_at
  before update on public.customer_receipts
  for each row execute function public.set_updated_at();

alter table public.customer_receipts      enable row level security;
alter table public.customer_receipt_lines enable row level security;
drop policy if exists customer_receipts_sel on public.customer_receipts;
create policy customer_receipts_sel on public.customer_receipts for select to authenticated using (true);
drop policy if exists customer_receipt_lines_sel on public.customer_receipt_lines;
create policy customer_receipt_lines_sel on public.customer_receipt_lines for select to authenticated using (true);

-- ------------------------------------------------------------
-- 2) เลขเอกสาร — ใช้ระบบเลขกลาง (ปรับรูปแบบได้ที่ /admin/numbering)
-- ------------------------------------------------------------
insert into public.erp_numbering_rules (key, label, pattern, reset_policy, current_value, active, notes)
values ('rc', 'ใบรับชำระ (Receipt)', 'RC{BYYYY}-{MM}-{000}', 'monthly', 0, true,
        'เลขใบรับชำระจากลูกค้า — ใช้ที่หน้า /receipts')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 3) สิทธิ์
-- ------------------------------------------------------------
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('receipts.view',   'ดูใบรับชำระ',      'so', 'เห็นรายการเงินที่ลูกค้าจ่ายเข้ามา',                false, 90),
  ('receipts.create', 'บันทึกรับชำระ',    'so', 'สร้างใบรับชำระ + ตัดยอดค้างรับของใบขาย/ใบวางบิล', false, 91),
  ('receipts.edit',   'แก้ใบรับชำระ',     'so', 'แก้ใบที่ยังไม่ยกเลิก',                            false, 92),
  ('receipts.cancel', 'ยกเลิกใบรับชำระ',  'so', 'ยกเลิกใบรับชำระ — ยอดค้างรับจะกลับคืน',           true,  93)
on conflict (key) do nothing;

-- คนที่ดู/สร้าง/แก้/ยกเลิกใบขายได้อยู่แล้ว ให้ทำกับใบรับชำระได้เหมือนกัน
insert into public.erp_role_permissions (role_key, permission_key)
  select rp.role_key, 'receipts.view' from public.erp_role_permissions rp where rp.permission_key = 'so.view'
on conflict do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
  select rp.role_key, 'receipts.create' from public.erp_role_permissions rp where rp.permission_key = 'so.create'
on conflict do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
  select rp.role_key, 'receipts.edit' from public.erp_role_permissions rp where rp.permission_key = 'so.edit'
on conflict do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
  select rp.role_key, 'receipts.cancel' from public.erp_role_permissions rp where rp.permission_key = 'so.cancel'
on conflict do nothing;

-- ------------------------------------------------------------
-- 4) เมนู
-- ------------------------------------------------------------
-- หมายเหตุ: ตอนรันกับ production จริงครั้งแรก ตั้ง is_active = false ไว้ก่อน
-- แล้วค่อยเปิดหลังโค้ด deploy ขึ้นเว็บ — กันคนกดเมนูแล้วเจอ 404
-- (เคยเกิดกับ Book Library มาแล้ว: เมนู+ตารางขึ้นก่อนโค้ด)
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, permission_key, app_keys, show_in_sidebar, show_in_launcher, is_active)
select 'งานขาย (Sales)', 35, 40, '💵', 'รับชำระเงิน', '/receipts', 'receipts.view', array['sales', 'loan-od'], true, true, true
where not exists (select 1 from public.erp_menu_items where href = '/receipts');

insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, permission_key, app_keys, show_in_sidebar, show_in_launcher, is_active)
select 'ภาพรวม', 0, 2, '🗓️', 'ตั้งเครดิตลูกค้า/ร้านค้า', '/cashflow/credit-terms', 'cashflow.view', array['loan-od'], true, false, true
where not exists (select 1 from public.erp_menu_items where href = '/cashflow/credit-terms');
