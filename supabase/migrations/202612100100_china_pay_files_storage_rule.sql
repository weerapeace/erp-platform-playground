-- กฎที่เก็บไฟล์: ไฟล์แอปโอนเงินจีน (สลิปโอน / รูปบิลจีน / บิล CTW) → Supabase ส่วนตัว (ล็อก)
-- เดิมอัปผ่าน /api/admin/upload → R2 (เปิดได้โดยไม่ login) + ลงคลังรูปกลาง · มีชื่อบัญชี/ยอดเงิน ต้องเปิดได้เฉพาะคนที่มีสิทธิ์
-- ไฟล์อยู่ bucket erp-files/china_pay/<YYYY-MM>/… · สิทธิ์อัป/ดู = lib/storage-policy STORAGE_CATEGORY_PERMISSIONS.china_pay
insert into public.erp_storage_rules (rule_key, label, label_en, description, file_types, provider, allowed_providers, lock_reason, max_bytes, sort_order, is_active)
select 'china_pay', 'ไฟล์โอนเงินจีน (สลิป / รูปบิล)', 'China payment files (slips / bills)',
       'สลิปโอนเงิน รูปบิลจีน และไฟล์บิล CTW ที่แนบในแอปโอนเงินจีน',
       array['jpg', 'jpeg', 'png', 'webp', 'pdf'], 'supabase', array['supabase'],
       'ข้อมูลการเงิน มีชื่อบัญชีและยอดโอน เปิดได้เฉพาะคนที่มีสิทธิ์', 20971520, 125, true
where not exists (select 1 from public.erp_storage_rules where rule_key = 'china_pay');
