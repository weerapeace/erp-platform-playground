-- 🔣 ไอคอนทั้งระบบ (หน้า /admin/icons) — โหมดแสดงผล (อีโมจิ/ไอคอนเส้น/ไอคอนเส้น+สี) + ไอคอนที่แอดมินเลือกแทน + ไอคอนของฉัน (อัปโหลดเอง)
-- เพิ่มคอลัมน์เดียวในตารางตั้งค่ากลาง (แถว id=1) แบบเดียวกับ family_nav_tabs · ว่าง = ค่าเริ่มต้น (อีโมจิแบบเดิม ไม่มีอะไรเปลี่ยน)
-- รูปแบบค่า: lib/icon-registry.ts (IconSettings) · ตรวจค่าก่อนเก็บที่ /api/admin/icon-settings
alter table public.app_settings add column if not exists icon_settings jsonb;
