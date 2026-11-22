-- เทมเพลตงาน: "โชว์ในหน้าสร้างงาน" ตั้งได้ต่อเทมเพลต (เจ้าของเลือก 2026-11-22)
--   all = ทุกที่ · brand = เฉพาะตอนเลือกแบรนด์ · nobrand = เฉพาะตอน "ไม่ระบุแบรนด์" · hidden = ซ่อนจากหน้าสร้างงาน (เทมเพลตยังอยู่ งานประจำยังใช้ได้)
--   แทน no_brand_only เดิม (ยังเก็บไว้ sync ค่า = nobrand ให้โค้ดเก่า)
alter table public.erp_creative_task_templates
  add column if not exists wizard_visibility text not null default 'all';
alter table public.erp_creative_task_templates drop constraint if exists erp_creative_task_templates_wizard_visibility_chk;
alter table public.erp_creative_task_templates add constraint erp_creative_task_templates_wizard_visibility_chk
  check (wizard_visibility in ('all', 'brand', 'nobrand', 'hidden'));
update public.erp_creative_task_templates set wizard_visibility = 'nobrand' where no_brand_only = true and wizard_visibility = 'all';
