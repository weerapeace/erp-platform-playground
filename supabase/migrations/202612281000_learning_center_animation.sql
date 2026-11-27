-- 🎓 ศูนย์เรียนรู้ รอบ 2: ภาพเคลื่อนไหวสอนในแต่ละขั้นตอน
-- animation = null (ไม่มี) | {"type":"preset","key":"light-falloff"} (คลังสำเร็จรูป components/lesson-anim)
--           | {"type":"custom","html":"<svg...>…","height":260} (Claude เขียนเฉพาะเรื่อง · แสดงในกรอบ sandbox แตะระบบไม่ได้)
alter table public.erp_help_guide_steps add column if not exists animation jsonb;
comment on column public.erp_help_guide_steps.animation is 'ภาพเคลื่อนไหวสอน: null | {type:preset,key} | {type:custom,html,height}';
