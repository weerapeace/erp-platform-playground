-- 📥 ดึงออเดอร์จากเมล: ให้ ERP ดึงจาก Gmail เอง (หลายกล่อง) — เจ้าของเลือก 2026-11-27
--   กล่อง IG International = ERP ดึงเอง (ผ่านการเชื่อม Gmail ของกลาง gmail_connections) · กล่อง Louis Montini = สคริปต์เดิม
-- เพิ่มแค่คอลัมน์ ไม่แตะข้อมูลเดิม:
--   platform_email_settings.pull_boxes = รายการกล่องที่ให้ ERP ดึง [{ email, label, enabled, added_at }]
--     (ผลรอบล่าสุดของแต่ละกล่องเก็บใน ui_config `email_pull:<email>` — แยกจากค่าตั้ง กันเขียนทับกัน)
--   platform_email_inbox.source = เมลมาทางไหน (null = สคริปต์ใน Gmail · อีเมลกล่อง = ERP ดึงเอง)
alter table public.platform_email_settings add column if not exists pull_boxes jsonb not null default '[]'::jsonb;
alter table public.platform_email_inbox add column if not exists source text;
