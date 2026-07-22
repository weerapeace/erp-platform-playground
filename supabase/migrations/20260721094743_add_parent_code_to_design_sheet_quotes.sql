-- ฟีเจอร์ "เลือกไซส์ตอนเสนอราคา" — เพิ่มคอลัมน์ไซส์/แท็บให้รอบเสนอราคา
alter table design_sheet_quotes add column if not exists parent_code text;
comment on column design_sheet_quotes.parent_code is 'ไซส์/แท็บ Parent ที่เสนอราคา (ตรงกับ design_sheet_cost_lines.parent_code) · "" = ทั่วไป · null = รอบเก่าไม่ระบุ';
