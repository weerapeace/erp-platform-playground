-- ชื่อชิ้นตัดในสูตร BOM (เจ้าของขอ 2026-11-13 "เพิ่มชื่อใน BOM ด้วย") — คอลัมน์ใหม่ ว่างได้ ไม่แตะข้อมูลเดิม
-- ใช้ที่: ตัวทำสูตร (line-editor) · ผังวางผ้าใบสั่งผลิต (app/api/mo/shared explode → ป้าย) · หน้าคิดผ้าก่อนซื้อ · ใบวิธีตัด
alter table public.bom_lines add column if not exists piece_name text;
comment on column public.bom_lines.piece_name is 'ชื่อชิ้นตัด (เช่น ตัวหน้า · สาย) — โชว์ในผังวางผ้า/ใบวิธีตัด/หน้าคิดผ้า (เจ้าของขอ 2026-11-13) · ว่าง = ใช้รหัสบล็อกตัด/ขนาดแทน';
