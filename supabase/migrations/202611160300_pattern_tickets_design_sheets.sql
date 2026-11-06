-- ตั๋วงาน Pattern: แนบ Design sheet ได้หลายใบ (เก็บ id ของ design_sheets)
-- ใช้: การ์ด + ป๊อปดูอย่างเดียวในตั๋ว · ส่วน "ตั๋วงาน Pattern" ในป๊อป Design sheet (ค้นกลับด้วย index นี้)
-- เพิ่มคอลัมน์อย่างเดียว ข้อมูลเดิมไม่เปลี่ยน
alter table public.pattern_tickets add column if not exists design_sheet_ids uuid[] not null default '{}';
create index if not exists pattern_tickets_design_sheet_ids_idx on public.pattern_tickets using gin (design_sheet_ids);
