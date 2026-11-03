-- ลบของที่เหลือจากแบบ "รวมคนละลูกค้าในใบเดียว" (202611120100) — เจ้าของแจ้งว่าเข้าใจผิด เปลี่ยนเป็นสร้างหลายใบแยกตามลูกค้า (202611120200)
--   ก่อนลบ: ใบเดียวที่เคยรวม (20261102) แยกเป็น 2 ใบแล้ว และ mix_level ว่างทุกแถว · ประวัติเหตุผลเดิมยังอยู่ใน audit_logs
--   create/update ไม่เรียก apply_mix แล้ว (202611120200) · โค้ดไม่อ่านคอลัมน์นี้แล้ว (1ba62c66)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.erp_playground_billing_notes WHERE mix_level IS NOT NULL) THEN
    RAISE EXCEPTION 'ยังมีใบวางบิลที่รวมคนละลูกค้าอยู่ — แยกใบก่อนลบคอลัมน์';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.erp_playground_billing_note_apply_mix(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.erp_playground_billing_party_label(text, text, boolean);
ALTER TABLE public.erp_playground_billing_notes DROP CONSTRAINT IF EXISTS erp_playground_billing_notes_mix_level_chk;
ALTER TABLE public.erp_playground_billing_notes DROP COLUMN IF EXISTS mix_level, DROP COLUMN IF EXISTS mix_reason;
