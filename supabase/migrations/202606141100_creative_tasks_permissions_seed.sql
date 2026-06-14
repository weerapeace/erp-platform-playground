-- Creative Task Manager — permission catalog + default role mapping
-- ปรับเพิ่ม-ลดได้ที่หน้า Setting (/tasks/settings) หรือหน้าจัดการสิทธิ์กลาง
-- admin ผ่านทุกสิทธิ์อยู่แล้วผ่าน erp_can override; แถว admin ใส่ไว้เพื่อความชัดเจนใน matrix

insert into erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('tasks.view',    'ดูงาน Creative',   'tasks', 'เห็นงาน/คิว/ตาราง/Kanban', false, 10),
  ('tasks.create',  'สร้างงาน',          'tasks', 'สร้างงาน creative ใหม่',     false, 20),
  ('tasks.edit',    'แก้/ส่งตรวจงาน',    'tasks', 'แก้ไข เปลี่ยนสถานะ ส่งตรวจ แนบไฟล์', false, 30),
  ('tasks.approve', 'อนุมัติงาน',        'tasks', 'อนุมัติ/ตีกลับ/ไม่ผ่าน (หัวหน้า)', false, 35),
  ('tasks.delete',  'ลบงาน',             'tasks', 'ลบงาน (อันตราย)',           true,  40)
on conflict (key) do nothing;

insert into erp_role_permissions (role_key, permission_key) values
  ('admin','tasks.view'),('manager','tasks.view'),('PR_manager','tasks.view'),('staff','tasks.view'),('viewer','tasks.view'),
  ('admin','tasks.create'),('manager','tasks.create'),('PR_manager','tasks.create'),('staff','tasks.create'),
  ('admin','tasks.edit'),('manager','tasks.edit'),('PR_manager','tasks.edit'),('staff','tasks.edit'),
  ('admin','tasks.approve'),('manager','tasks.approve'),
  ('admin','tasks.delete')
on conflict (role_key, permission_key) do nothing;
