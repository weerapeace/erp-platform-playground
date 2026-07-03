-- ฟิลด์เสริมของร่างลงขายต่อแพลตฟอร์ม (แบรนด์/บาร์โค้ด/น้ำหนัก-ขนาด/ของขวัญ/ส่วนลด ฯลฯ)
-- เก็บรวมใน jsonb เดียว (ยืดหยุ่น ต่อฟิลด์ใหม่ได้โดยไม่ต้อง migration บ่อย)
alter table public.platform_listing_drafts add column if not exists extra jsonb not null default '{}'::jsonb;
