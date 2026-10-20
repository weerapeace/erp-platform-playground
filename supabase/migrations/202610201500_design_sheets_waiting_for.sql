-- ⏳ ใบงานออกแบบ: "รออะไรอยู่" (พิมพ์เอง เช่น รอลูกค้าส่งโลโก้ / รอตัวอย่างผ้า)
-- เจ้าของขอ 2026-10-20: "เพิ่ม field สถานะรอ เป็นพิมพ์ได้ว่ารออะไรอยู่ และไปเปิดปิดใน hover ได้ด้วย"
-- ช่องข้อความว่าง (null = ไม่ได้รออะไร) · ไม่แตะข้อมูลเดิม · แก้ผ่าน PATCH /api/design-sheets/[id] (มี audit)
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheets_waiting_for) 2026-10-20
alter table public.design_sheets add column if not exists waiting_for text;
comment on column public.design_sheets.waiting_for is 'รออะไรอยู่ (พิมพ์เอง) — โชว์ในกล่อง hover ของ Design Dashboard';
