-- ============================================================
-- O3 (audit แอปจัดการงาน 2026-10-21): สารบัญ (index) ให้ตารางประวัติ audit_logs
-- ปัญหา: audit_logs ~70,000 แถวมีแค่ primary key → erp_playground_get_audit_logs (ฟีดความเคลื่อนไหว Design Dashboard,
--        ประวัติรายการ) ต้องไล่อ่านทั้งตาราง + นับทั้งหมด เฉลี่ย 0.8 วิ บางครั้ง 3 วิ
-- คิวรีที่ใช้: WHERE entity_type = ? [AND entity_id = ?] ORDER BY created_at DESC LIMIT n  (+ COUNT(*) เงื่อนไขเดียวกัน)
-- ผล: ไม่แก้ข้อมูล · เขียน audit ช้าลงนิดเดียว (สารบัญ 2 ตัว) · DDL ทำ API สะดุด ~10 วิ → รันช่วงคนใช้น้อย
-- ย้อนกลับ: drop index if exists idx_audit_logs_entity_type_created; drop index if exists idx_audit_logs_entity_id_created;
-- ============================================================
create index if not exists idx_audit_logs_entity_type_created on public.audit_logs (entity_type, created_at desc);
create index if not exists idx_audit_logs_entity_id_created on public.audit_logs (entity_id, created_at desc) where entity_id is not null;
