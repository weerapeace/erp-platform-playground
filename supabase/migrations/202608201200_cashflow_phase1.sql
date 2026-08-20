-- ============================================================
-- Cashflow (กระแสเงินสด) — เฟส 1 "ดูอย่างเดียว"
-- ------------------------------------------------------------
-- เจ้าของขอ: อยากเห็นเงินเข้า-เงินออกทั้งบริษัทในหน้าเดียว
--   จาก 5 แหล่ง: หนี้(เงินกู้/OD) · คำสั่งขาย · จัดซื้อ · เงินเดือน · เงินจีน
--
-- เฟสนี้ "ไม่สร้างข้อมูลใหม่" — อ่านจากตารางต้นทางที่มีอยู่แล้วทั้งหมด
-- มีของใหม่แค่อย่างเดียว: ตารางเก็บ "ยอดเงินสดตั้งต้น" ที่ผู้ใช้กรอกเอง
-- (ระบบยังไม่ได้ต่อ API ธนาคาร จึงต้องบอกระบบว่าตอนนี้มีเงินอยู่เท่าไหร่)
-- ============================================================

create table if not exists public.cashflow_opening_balances (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id),
  label        text not null,                       -- ชื่อบัญชี เช่น "กสิกร 123-4-56789"
  as_of_date   date not null default current_date,  -- ยอดนี้เป็นของวันไหน
  amount       numeric not null default 0,          -- เงินคงเหลือ ณ วันนั้น (ติดลบได้ เช่นใช้ OD อยู่)
  note         text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   text,
  updated_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table  public.cashflow_opening_balances is 'ยอดเงินสด/เงินฝากตั้งต้นที่ผู้ใช้กรอกเอง — ใช้เป็นจุดเริ่มของเส้นเงินคงเหลือในหน้า /cashflow';
comment on column public.cashflow_opening_balances.as_of_date is 'ยอดนี้เป็นของวันไหน — เส้นเงินคงเหลือจะเริ่มนับจากวันนี้';

create index if not exists idx_cashflow_ob_active on public.cashflow_opening_balances(is_active, as_of_date desc);

-- updated_at อัตโนมัติ (ใช้ trigger กลางที่มีอยู่แล้ว)
drop trigger if exists trg_cashflow_ob_updated_at on public.cashflow_opening_balances;
create trigger trg_cashflow_ob_updated_at
  before update on public.cashflow_opening_balances
  for each row execute function public.set_updated_at();

-- RLS — อ่านได้เมื่อล็อกอิน (เขียนผ่าน API ที่ตรวจสิทธิ์ด้วย guardApi เท่านั้น) ตาม pattern เดียวกับ loan_contracts/od_facilities
alter table public.cashflow_opening_balances enable row level security;
drop policy if exists cashflow_ob_sel on public.cashflow_opening_balances;
create policy cashflow_ob_sel on public.cashflow_opening_balances for select to authenticated using (true);

-- ============================================================
-- สิทธิ์
-- ============================================================
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('cashflow.view',   'ดูกระแสเงินสด',        'การเงิน (เงินกู้/OD)', 'เห็นหน้ารวมเงินเข้า-เงินออกทั้งบริษัท (รวมยอดขาย ยอดซื้อ เงินเดือน หนี้ เงินจีน)', false, 5),
  ('cashflow.manage', 'ตั้งค่ายอดเงินตั้งต้น', 'การเงิน (เงินกู้/OD)', 'กรอก/แก้ยอดเงินคงเหลือในบัญชีที่ใช้เป็นจุดเริ่มของกราฟ',                        false, 6)
on conflict (key) do nothing;

-- ให้สิทธิ์กับ role ที่ "แก้สัญญาเงินกู้ได้" เท่านั้น (= ผู้จัดการขึ้นไป · admin เห็นทุกอย่างอยู่แล้ว)
-- ตั้งใจไม่ให้ staff โดยอัตโนมัติ เพราะหน้านี้รวมยอดเงินเดือนทั้งบริษัทไว้ด้วย
-- ถ้าอยากเปิดให้ใครเพิ่ม → /admin/role-board
insert into public.erp_role_permissions (role_key, permission_key)
  select distinct rp.role_key, t.perm
  from public.erp_role_permissions rp
  cross join (values ('cashflow.view'), ('cashflow.manage')) as t(perm)
  where rp.permission_key = 'loan_contracts.edit'
on conflict do nothing;

-- ============================================================
-- เมนู — อยู่ในแอป "การเงิน (เงินกู้/OD)" หมวดภาพรวม บนสุด
-- ============================================================
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, permission_key, app_keys, show_in_sidebar, show_in_launcher, is_active)
select 'ภาพรวม', 0, 1, '💧', 'กระแสเงินสด', '/cashflow', 'cashflow.view', array['loan-od'], true, true, true
where not exists (select 1 from public.erp_menu_items where href = '/cashflow');
