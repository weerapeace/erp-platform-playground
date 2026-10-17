-- 📝 ป๊อป "แทรกรายละเอียด" — รูปแบบบรรทัดกลาง (คำนำหน้า "วัสดุ:" · คำเชื่อม "และ" · ชื่ออังกฤษในวงเล็บ)
-- เหตุผล: เจ้าของอยากตั้งรูปแบบเองครั้งเดียว ให้คำอธิบายทุกรุ่นหน้าตาเดียวกัน (ตั้งที่ปุ่ม ⚙️ ในป๊อป)
-- null = ใช้ค่าเริ่มต้นในโค้ด (lib/detail-snippets DEFAULT_INSERT_TEMPLATES) · ไม่กระทบของเดิม
alter table public.app_settings
  add column if not exists detail_insert_templates jsonb;
