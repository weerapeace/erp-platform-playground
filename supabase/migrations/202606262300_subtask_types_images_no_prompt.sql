-- งานรูปภาพ + งานรูปคำอธิบาย ไม่ต้องมีปุ่มคัดลอก prompt (เหลือเฉพาะงานเขียนคำอธิบาย)
update public.erp_subtask_types set has_copy_prompt = false where key in ('images','description_image');
