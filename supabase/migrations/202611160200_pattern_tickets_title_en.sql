-- ตั๋วงาน Pattern: ชื่องานภาษาอังกฤษ (แปลอัตโนมัติตอนบันทึก · โหมด English โชว์ช่องนี้ · ว่าง = ใช้ชื่อไทย)
-- เพิ่มคอลัมน์อย่างเดียว ข้อมูลเดิมไม่เปลี่ยน
alter table public.pattern_tickets add column if not exists title_en text not null default '';
