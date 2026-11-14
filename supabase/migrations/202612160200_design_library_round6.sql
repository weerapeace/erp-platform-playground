-- 📚 Design Library รอบ 6 (2026-11-14)
-- 1) ตัวเลือกรายการใหม่ "prompt" (ค่าเปิด/ปิดตั้งต้นของ prompt ระบบ + แม่แบบ prompt ของทีม)
-- 2) รูปจาก GPT ติดดาวได้ (รูปที่ติดดาว = ใช้ในใบสั่งทำตัวอย่าง / ส่งใบงาน / ปกการ์ด · ไม่ติดดาว = รูปล่าสุด)
alter table public.design_library_choices drop constraint if exists design_library_choices_list_key_check;
alter table public.design_library_choices add constraint design_library_choices_list_key_check
  check (list_key = any (array['bag_type','category','hw_color','thread_color','pocket_type','rule','prompt']));

alter table public.design_library_renders add column if not exists is_starred boolean not null default false;
