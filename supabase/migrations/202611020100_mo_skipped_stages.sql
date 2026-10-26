-- ข้ามขั้นตอนของใบสั่งผลิต (เฉพาะแอดมิน) — เก็บเป็น "ป้าย" ไม่แก้ข้อมูลอื่น · เอาคืน = ลบคีย์ออก
-- รูปแบบ: { "buy" | "prep" | "cut" | "dispatch" | "receive": { by, by_name, at, reason } }
-- กติกาว่าใครเคารพป้ายนี้ อยู่ที่ของกลาง lib/mo-skip.ts
alter table public.manufacturing_orders
  add column if not exists skipped_stages jsonb not null default '{}'::jsonb;

comment on column public.manufacturing_orders.skipped_stages is
  'ขั้นตอนที่แอดมินข้าม (ป้าย) — คีย์ buy/prep/cut/dispatch/receive → {by, by_name, at, reason} · ดู lib/mo-skip.ts';
