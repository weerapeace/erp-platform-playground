-- แยกราคา: price = ราคาจากตีราคา (อ้างอิง) · offered_price = ราคาที่เสนอจริง (ใช้อันนี้)
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheet_quotes_offered_price) 2026-06-11
alter table design_sheet_quotes add column if not exists offered_price numeric;
