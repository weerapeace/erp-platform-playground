-- ============================================================
-- Cashflow — ยกขึ้นเป็น "โมดูลใหญ่" ของตัวเอง (แท็บบนแถบด้านบนสุด)
-- ------------------------------------------------------------
-- เดิมหน้ากระแสเงินสด/รับชำระ/ตั้งเครดิต ซ่อนอยู่ในแอป "การเงิน (เงินกู้/OD)"
-- เจ้าของขอให้มีแท็บของตัวเองด้านบน เพราะเป็นงานที่เปิดดูบ่อยและคนละกลุ่มกับเรื่องหนี้
--
-- ไม่มีการแก้โค้ด — แถบโมดูลด้านบนอ่านจากทะเบียน erp_app_groups ทั้งหมด
-- หน้าเดิมยังอยู่ในแอป "การเงิน (เงินกู้/OD)" ด้วย (app_keys มีได้หลายค่า) จะได้ไม่หายไปจากที่เดิม
-- ============================================================

insert into public.erp_app_groups (key, label, icon, sort_order, permission_key, default_href, is_active)
select 'cashflow', 'กระแสเงินสด', '💧', 125, 'cashflow.view', '/cashflow', true
where not exists (select 1 from public.erp_app_groups where key = 'cashflow');

-- หน้าที่อยู่ในแอปนี้ (คงของเดิมไว้ แค่เพิ่ม key ใหม่เข้าไป)
update public.erp_menu_items
   set app_keys = array(select distinct unnest(app_keys || array['cashflow']))
 where href in ('/cashflow', '/cashflow/credit-terms', '/receipts')
   and not ('cashflow' = any(app_keys));
