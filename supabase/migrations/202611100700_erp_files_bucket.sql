-- กฎที่เก็บไฟล์ เฟส 2: ที่เก็บส่วนตัวกลางใน Supabase Storage สำหรับหมวดที่กฎตั้งเป็น Supabase
-- ตัวอัปกลาง (POST /api/files/upload-target) วางไฟล์ที่ erp-files/<rule_key>/<ปี-เดือน>/<เวลา>-<สุ่ม>.<นามสกุล>
-- private: เปิดดูผ่าน POST /api/files/sign (ตรวจสิทธิ์ตามหมวด → ลิงก์ชั่วคราว) · อัปผ่านลิงก์อัปชั่วคราว (ไม่ต้องมี storage policy)
-- คู่มือ: docs/storage-policy.md

insert into storage.buckets (id, name, public, file_size_limit)
values ('erp-files', 'erp-files', false, 52428800)
on conflict (id) do nothing;

-- บิลซัพพลายเออร์: เพดาน 20 MB (รูปจากมือถือ / PDF) — เจ้าของแก้ได้ที่หน้า /master/storage-rules
update public.erp_storage_rules set max_bytes = 20971520, updated_at = now()
where rule_key = 'supplier_bills' and max_bytes is null;
