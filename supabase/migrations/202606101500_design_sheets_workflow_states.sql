-- Design Sheets — ย้ายรายการสถานะเข้าระบบ Workflow กลาง (แก้/เพิ่ม/ลบเองได้ที่ /admin/workflows)
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheets_workflow_states) 2026-06-10
insert into erp_workflow_definitions (entity_type, label, initial_state, active, notes)
select 'design_sheet', 'ใบงานออกแบบ (Design Sheets)', 'design', true, 'รายการสถานะของโมดูล Design Sheets — แก้ชื่อ/สี/เพิ่ม/ลบได้ หน้าจอ+Canvas+ใบพิมพ์อ่านจากที่นี่'
where not exists (select 1 from erp_workflow_definitions where entity_type = 'design_sheet');

insert into erp_workflow_states (entity_type, state_key, label, color, is_terminal, lock_edit, sort_order)
select 'design_sheet', v.k, v.l, v.c, v.t, false, v.o
from (values
  ('design',        'ออกแบบ',            'slate',   false, 10),
  ('sent_customer', 'ส่งลูกค้าดู',        'blue',    false, 20),
  ('revising',      'แก้ไขตาม comment',  'amber',   false, 30),
  ('costing',       'ตีราคา',             'purple',  false, 40),
  ('quoted',        'เสนอราคา',           'blue',    false, 50),
  ('approved',      'อนุมัติ',            'emerald', false, 60),
  ('sku_created',   'ตั้ง SKU แล้ว',      'purple',  true,  70),
  ('cancelled',     'ยกเลิก',             'red',     true,  80)
) as v(k, l, c, t, o)
where not exists (select 1 from erp_workflow_states where entity_type = 'design_sheet');
