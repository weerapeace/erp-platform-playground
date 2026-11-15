-- 📚 Design Library รอบ 8 (เจ้าของเลือก 2026-11-15)
-- วิธีทำโลโก้ใหม่ "โลโก้โลหะสำเร็จ" — เลือกตัวโลโก้จาก SKU (รหัส LOGO-xxx · ในระบบ 43 ตัว มีขนาดในชื่อ 16 ตัว → เติมขนาดให้เอง)
--   needs_material = ต้องเลือก SKU ตัวโลโก้ · no_artwork = ไม่ต้องอัปไฟล์โลโก้ (ใช้รูป SKU) · material_tags ว่าง = ไม่กรองแท็ก (โลโก้ยังไม่มีแท็ก)
--   material_chips = ปุ่มลัดค้น LOGO- · material_board = false (ไม่เปิดแท็บแผงผ้า) · แบบย่อย = วิธีติด
-- แก้ต่อได้ที่ ⚙️ ตัวเลือก → วิธีทำโลโก้ · ไม่มีการแก้โครงตาราง (ช่องใหม่ของสูตรอยู่ใน spec jsonb)
insert into public.design_library_choices (list_key, code, name, name_en, config, sort_order, is_active)
select 'logo_method', 'metal', 'โลโก้โลหะสำเร็จ', 'Metal plate',
  jsonb_build_object(
    'needs_material', true, 'no_artwork', true, 'material_tags', '[]'::jsonb, 'material_chips', 'โลโก้ทั้งหมด=LOGO-', 'material_board', false,
    'options', jsonb_build_array(
      jsonb_build_object('code', 'rivet', 'name', 'ติดหมุด', 'name_en', 'Riveted'),
      jsonb_build_object('code', 'glue', 'name', 'ติดกาว', 'name_en', 'Glued'),
      jsonb_build_object('code', 'sew', 'name', 'เย็บติด', 'name_en', 'Sewn-on'))),
  coalesce((select max(sort_order) from public.design_library_choices where list_key = 'logo_method'), 0) + 10, true
on conflict (list_key, code) do nothing;
