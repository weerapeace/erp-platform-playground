-- หน้า Partners ใหม่ + หน้าจัดการเครดิตเทอม (เจ้าของเลือกจาก widget 2026-11-22)
--   1) partners_v2.logo_url — โลโก้/รูปหน้าร้าน (ลิงก์รูป หรือรูปที่อัปขึ้นคลังผ่าน LogoPicker) · ว่าง = ใช้ตัวย่อเหมือนเดิม
--   2) app_settings.credit_term_templates — เทมเพลตเทอมที่ใช้บ่อย ใช้ร่วมทั้งบริษัท
--      รูปแบบ: [{ "term": "days:30", "label": "30 วัน" }] · term = รูปแบบของ lib/credit-term
-- เพิ่มช่องว่างเท่านั้น ไม่แตะข้อมูลเดิม
alter table public.partners_v2 add column if not exists logo_url text;
comment on column public.partners_v2.logo_url is 'โลโก้/รูปหน้าร้าน (LogoPicker) · ว่าง = ตัวย่อ';

alter table public.app_settings add column if not exists credit_term_templates jsonb not null default '[]'::jsonb;
comment on column public.app_settings.credit_term_templates is 'เทมเพลตเครดิตเทอมที่ใช้บ่อย [{term,label}] · หน้า /cashflow/credit-terms';
