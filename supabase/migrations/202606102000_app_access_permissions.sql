-- เฟส 2 ระบบสิทธิ์: สิทธิ์ระดับ "เข้าถึง App" + ผูกกับ erp_app_groups + seed กันล็อกออก
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (app_access_permissions) 2026-06-11
-- (เว้น home = เปิดให้ทุกคน เป็นหน้า landing ปลอดภัย)
-- แท็บ App ใน components/playground-shell กรองด้วย can(app_groups.permission_key) อยู่แล้ว → ใส่ค่าแล้วซ่อน/โชว์ทันที
-- หน้าเว็บเพิ่ม guard กันเข้าตรง URL (AppAccessGuard)

insert into erp_permissions (key, label, category, description, is_dangerous, sort_order)
select v.key, v.label, 'เข้าถึง App (Apps)', v.descr, false, v.ord
from (values
  ('app.tasks',      'เข้าแอป: จัดการงาน',   'เห็นและเข้าใช้แอปจัดการงาน',     910),
  ('app.master',     'เข้าแอป: Master Data', 'เห็นและเข้าใช้แอป Master Data',   920),
  ('app.purchasing', 'เข้าแอป: จัดซื้อ',     'เห็นและเข้าใช้แอปจัดซื้อ',        930),
  ('app.inventory',  'เข้าแอป: คลังสินค้า',  'เห็นและเข้าใช้แอปคลังสินค้า',     940),
  ('app.production', 'เข้าแอป: ผลิต',        'เห็นและเข้าใช้แอปผลิต',           950),
  ('app.sales',      'เข้าแอป: ขาย',         'เห็นและเข้าใช้แอปขาย',            960),
  ('app.china_pay',  'เข้าแอป: โอนเงินจีน',  'เห็นและเข้าใช้แอปโอนเงินจีน',     970),
  ('app.payroll',    'เข้าแอป: Payroll (HR)','เห็นและเข้าใช้แอป Payroll/HR',    980),
  ('app.settings',   'เข้าแอป: ตั้งค่า',     'เห็นและเข้าใช้แอปตั้งค่า',        990)
) as v(key, label, descr, ord)
where not exists (select 1 from erp_permissions p where p.key = v.key);

update erp_app_groups set permission_key = 'app.tasks'      where key = 'tasks'      and permission_key is null;
update erp_app_groups set permission_key = 'app.master'     where key = 'master'     and permission_key is null;
update erp_app_groups set permission_key = 'app.purchasing' where key = 'purchasing' and permission_key is null;
update erp_app_groups set permission_key = 'app.inventory'  where key = 'inventory'  and permission_key is null;
update erp_app_groups set permission_key = 'app.production' where key = 'production' and permission_key is null;
update erp_app_groups set permission_key = 'app.sales'      where key = 'sales'      and permission_key is null;
update erp_app_groups set permission_key = 'app.china_pay'  where key = 'china-pay'  and permission_key is null;
update erp_app_groups set permission_key = 'app.payroll'    where key = 'payroll'    and permission_key is null;
update erp_app_groups set permission_key = 'app.settings'   where key = 'settings'   and permission_key is null;

-- seed: ทุก role ที่ active ได้สิทธิ์ app ครบ (ของเดิมไม่เปลี่ยน — เจ้าของค่อยตัดสิทธิ์ที่ Admin)
insert into erp_role_permissions (role_key, permission_key)
select r.key, p.key
from erp_roles r
cross join erp_permissions p
where r.active = true and p.category = 'เข้าถึง App (Apps)'
  and not exists (select 1 from erp_role_permissions rp where rp.role_key = r.key and rp.permission_key = p.key);
