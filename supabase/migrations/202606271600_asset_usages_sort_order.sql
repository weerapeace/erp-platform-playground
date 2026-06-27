-- เฟส 2 มุมมอง "ดูตามแบรนด์": ลำดับรูปต่อโฟลเดอร์ (per module + record_id)
-- null = ยังไม่จัดลำดับ → fallback เรียงตาม created_at. additive ปลอดภัย
alter table asset_usages add column if not exists sort_order integer;
comment on column asset_usages.sort_order is 'ลำดับรูปในโฟลเดอร์ (มุมมองดูตามแบรนด์) ต่อ (module, record_id); null=ตามวันที่อัป';
