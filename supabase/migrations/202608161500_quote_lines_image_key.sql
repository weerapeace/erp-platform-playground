-- แนบรูปต่อบรรทัดในใบเสนอราคา (คอลัมน์ "ภาพ" ในใบพิมพ์มีอยู่แล้ว แต่เดิมมีรูปเฉพาะบรรทัดที่ผูก SKU)
-- เพิ่มคอลัมน์ nullable + ให้ RPC สร้าง/แก้ บันทึกค่าไปด้วย
--   (erp_playground_quote_get ใช้ to_jsonb(l) → คืนคอลัมน์ใหม่ให้เองอัตโนมัติ ไม่ต้องแก้)
-- ⚠️ ตัวเต็มของ 2 ฟังก์ชันนี้ apply ผ่าน migration ชื่อ quote_lines_image_key แล้ว (คัดลอกของเดิม + เพิ่ม image_key)
alter table public.erp_playground_quote_lines add column if not exists image_key text;
comment on column public.erp_playground_quote_lines.image_key is 'รูปประกอบของบรรทัด (R2 key) — เลือกเองจากคลังไฟล์ ถ้าไม่ตั้งจะ fallback เป็นรูปของ SKU';
