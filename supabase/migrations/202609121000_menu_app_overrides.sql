-- เมนูแถวเดียว (href unique) แต่แต่ละแอปอยากใช้ "ชื่อหมวด/ป้าย/ลำดับ" ของตัวเอง (เจ้าของขอ 2026-09-12: แอปการเงินจัดเป็น เงินเข้า/เงินออก)
-- → erp_menu_items.app_overrides = {"<app_key>": {"section": "...", "label": "...", "sort": n}} · เชลล์ (playground-shell) ใช้แทนค่าปกติเมื่อเปิดแอปนั้น
alter table public.erp_menu_items add column if not exists app_overrides jsonb not null default '{}'::jsonb;
comment on column public.erp_menu_items.app_overrides is 'ชื่อหมวด/ป้ายเฉพาะแอป {"loan-od":{"section":"เงินออก","label":"..."}} — ใช้เมื่อเมนูเดียวกันโผล่หลายแอปแต่ต้องการจัดหมวดต่างกัน';

update public.erp_menu_items set
  app_keys = case when 'loan-od' = any(app_keys) then app_keys else array_append(app_keys, 'loan-od') end,
  app_overrides = app_overrides || jsonb_build_object('loan-od', jsonb_build_object('section', v.sec, 'label', v.lbl, 'sort', v.srt)),
  updated_at = now()
from (values
  ('/sales/orders',        'เงินเข้า', 'ใบสั่งขาย',             10),
  ('/sales-orders',        'เงินเข้า', 'ใบขาย (บิล)',           20),
  ('/billing-notes',       'เงินเข้า', 'ใบวางบิล',              30),
  ('/receipts',            'เงินเข้า', 'รับชำระเงิน',           40),
  ('/purchasing/orders',   'เงินออก', 'สั่งซื้อ (ออก PO)',     10),
  ('/purchasing/po-list',  'เงินออก', 'รายการใบสั่งซื้อ (PO)', 20),
  ('/app/china-pay',       'เงินออก', 'โอนเงินจีน (มือถือ)',   30),
  ('/m/china-dashboard',   'เงินออก', 'Dashboard โอนเงินจีน',  40),
  ('/payroll/payments',    'เงินออก', 'เงินเดือน (รอบจ่าย)',   50)
) as v(href, sec, lbl, srt)
where erp_menu_items.href = v.href and erp_menu_items.is_active;

insert into public.erp_menu_sections (app_key, name, icon, sort_order)
select v.* from (values
  ('loan-od', 'ภาพรวม',     '🏦', 0),
  ('loan-od', 'เงินเข้า',   '📥', 5),
  ('loan-od', 'เงินออก',    '📤', 6),
  ('loan-od', 'เงินกู้ & OD', '💵', 155),
  ('loan-od', 'วงเงิน OD',  '💠', 160)
) as v(app_key, name, icon, sort_order)
where not exists (select 1 from public.erp_menu_sections s where s.app_key = v.app_key and s.name = v.name);
