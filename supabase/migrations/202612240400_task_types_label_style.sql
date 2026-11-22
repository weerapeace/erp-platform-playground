-- ป้ายประเภทงาน: ตั้งน้ำหนัก/ขนาดตัวอักษรได้ (เจ้าของขอ 2026-11-22 — "ตั้งค่าสีป้าย, font")
-- { "weight": 400|500|600|700, "size": "sm"|"md"|"lg" } · null = หน้าตาเดิม · สี/ไอคอนใช้คอลัมน์ color/icon เดิม
alter table public.erp_task_types add column if not exists label_style jsonb;
comment on column public.erp_task_types.label_style is 'สไตล์ป้ายประเภทงาน { weight, size } — null = ค่าเริ่มต้น';
