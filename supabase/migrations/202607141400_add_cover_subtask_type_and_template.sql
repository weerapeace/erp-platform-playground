-- เฟส 1: ชนิดงานย่อย "เปลี่ยนปก" (cover) + template งาน
-- ชนิดงาน: รับรูป · ต้องอนุมัติ · ปลายทาง=ปก (cover_image_r2_key) · ใช้กับ Parent SKU · ส่งรูป 1 รูป/สินค้า
insert into erp_subtask_types (key, label_th, label_en, icon, color, sort_order, is_active, is_builtin, accepts_text, accepts_image, accepts_multi_image, accepts_link, accepts_file, requires_approval, approve_target, has_copy_prompt, applies_to, default_required)
select 'cover', 'เปลี่ยนปก', 'Change cover', '🖼️', '#f59e0b', 55, true, true, false, true, false, false, false, true, 'cover', false, '{parent}'::text[], false
where not exists (select 1 from erp_subtask_types where key = 'cover');

update erp_subtask_types
set label_th = 'เปลี่ยนปก', label_en = 'Change cover', icon = '🖼️', accepts_image = true, accepts_multi_image = false,
    requires_approval = true, approve_target = 'cover', applies_to = '{parent}'::text[], has_copy_prompt = false, is_active = true, updated_at = now()
where key = 'cover';

-- template งาน "เปลี่ยนปก (Cover)" — 1 ขั้น = ชนิด cover
insert into erp_creative_task_templates (name, description, steps, is_active)
select 'เปลี่ยนปก (Cover)',
       'เปลี่ยนรูปปกของ Parent SKU (เลือกหลายตัวได้) — ส่งรูปปก 1 รูป/สินค้า → อนุมัติแล้วตั้งเป็นปกให้อัตโนมัติ',
       jsonb_build_array(jsonb_build_object(
         'type', 'cover',
         'title', 'เปลี่ยนปก',
         'required_before_next', false,
         'config', jsonb_build_object('approve_target', 'cover', 'accepts_image', true, 'accepts_link', false, 'accepts_text', false, 'requires_approval', true, 'applies_to', jsonb_build_array('parent'))
       )),
       true
where not exists (select 1 from erp_creative_task_templates where name = 'เปลี่ยนปก (Cover)');
