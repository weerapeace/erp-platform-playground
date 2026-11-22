-- ผลเช็กความพร้อมสินค้าของงานล่าสุด (เก็บไว้ทำแถบบนการ์ดบอร์ดงาน · เจ้าของอนุญาต 2026-11-22)
-- ค่าที่คำนวณได้ ไม่ใช่ข้อมูลกรอกเอง · ว่าง = ยังไม่เคยเช็ก (การ์ดใช้ % ตามสถานะแทน)
alter table public.erp_creative_tasks
  add column if not exists readiness_done integer,
  add column if not exists readiness_total integer,
  add column if not exists readiness_at timestamptz;
comment on column public.erp_creative_tasks.readiness_done is 'ความพร้อมสินค้า: ผ่านกี่ข้อ (lib/task-readiness) — อัปเดตเองตอนเปิดงาน/คำนวณเบื้องหลัง';
comment on column public.erp_creative_tasks.readiness_total is 'ความพร้อมสินค้า: เช็กทั้งหมดกี่ข้อ';
comment on column public.erp_creative_tasks.readiness_at is 'เวลาที่เช็กความพร้อมล่าสุด';
