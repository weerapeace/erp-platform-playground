-- ⏳ ใบงานออกแบบ: "รออะไรอยู่" จากช่องข้อความ → เช็กลิสต์ (เจ้าของขอ 2026-10-23: เพิ่มได้หลายข้อ ติ๊ก/แก้/ลบได้ + ค่าที่ใช้บ่อย + ติ๊กบนการ์ดได้)
-- ไม่สร้างตารางใหม่ — ใช้ของกลางที่มีอยู่:
--   • เช็กลิสต์ = erp_record_tasks (module_key 'design_sheet_waiting' · record_type 'design_sheet' · record_id = id ใบงาน)
--   • ค่าที่ใช้บ่อย = erp_lookups ชนิด 'design_sheet_waiting' (แก้/เรียงได้ในป๊อปตั้งค่าบนใบงาน หรือหน้า ค่ากลาง)
-- ข้อมูลเดิม: ช่อง design_sheets.waiting_for ที่มีข้อความ → ย้ายเป็นข้อแรกของเช็กลิสต์ (ไม่ลบช่องเดิม เก็บไว้เป็นสำรอง)
-- รันซ้ำได้ (ไม่เพิ่มซ้ำ)

insert into public.erp_lookup_types (lookup_type, label, icon, description, is_system, has_parent)
values ('design_sheet_waiting', 'รออะไรอยู่ (ใบงานออกแบบ)', '⏳', 'ปุ่มลัด "ค่าที่ใช้บ่อย" ในเช็กลิสต์รออะไรอยู่ของใบงานออกแบบ · ลำดับ = ลำดับปุ่ม', true, false)
on conflict (lookup_type) do nothing;

insert into public.erp_lookups (lookup_type, name, sort_order, is_active)
select 'design_sheet_waiting', v.name, v.sort_order, true
from (values ('ทำ Pattern', 10), ('รอหาผ้า', 20), ('รอลูกค้าส่งโลโก้', 30), ('รอตัวอย่าง', 40), ('รอตีราคา', 50)) as v(name, sort_order)
where not exists (select 1 from public.erp_lookups l where l.lookup_type = 'design_sheet_waiting' and l.name = v.name);

insert into public.erp_record_tasks (module_key, record_type, record_id, title, status, created_by)
select 'design_sheet_waiting', 'design_sheet', s.id::text, left(btrim(s.waiting_for), 300), 'open', 'ย้ายจากช่องเดิม'
from public.design_sheets s
where nullif(btrim(s.waiting_for), '') is not null
  and not exists (
    select 1 from public.erp_record_tasks t
    where t.module_key = 'design_sheet_waiting' and t.record_id = s.id::text and t.title = left(btrim(s.waiting_for), 300)
  );
