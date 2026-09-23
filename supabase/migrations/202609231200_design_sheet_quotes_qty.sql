-- รอบเสนอราคาของใบงานออกแบบ: เพิ่ม "จำนวน" (ราคาขั้นบันไดตามจำนวน เช่น 100 ชิ้น = 520, 500 ชิ้น = 460)
-- null = ไม่ระบุ (ของเดิมไม่กระทบ)
alter table public.design_sheet_quotes add column if not exists qty numeric check (qty is null or qty > 0);
comment on column public.design_sheet_quotes.qty is 'จำนวนที่ราคานี้ใช้ (ราคาขั้นบันไดตามจำนวน) — null = ไม่ระบุ';
