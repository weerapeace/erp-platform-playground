-- ช่องส่ง LINE ของ "รายงานอัตโนมัติ" (lib/email-report/line.ts) — 4 พ.ย. 2569
-- 1) email_reports.line = ตั้งค่า LINE ต่อรายงาน {enabled, group_id, group_name, max_rows} (เหมือน discord/popup)
--    group_id = กลุ่ม LINE ที่บอทอยู่แล้ว (เลือกจาก /api/admin/email-reports/line) · 1 รายงาน = 1 ข้อความ (โควตาฟรี 300/เดือน ใช้ร่วมกันทั้งระบบ)
-- 2) erp_report_channels.line = สวิตช์ทั้งระบบ ปิด = ทุกรายงานหยุดส่ง LINE ทันที
-- ค่า default คงที่ → เพิ่มคอลัมน์ได้ทันที ไม่ล็อกตาราง · ไม่แตะข้อมูลเดิม
alter table public.email_reports add column if not exists line jsonb not null default '{}'::jsonb;
alter table public.erp_report_channels add column if not exists line boolean not null default true;
