-- 🚚 ศูนย์ออเดอร์ · เจ้าของอนุมัติ 2026-11-10 ("Make both changes")
-- 1) ช่องทาง "โทร / หน้าร้าน" ไม่มีแถวใน erp_platforms → ให้ platform_id ว่างได้ (ไม่แก้ข้อมูลเดิม — ทุกใบเดิมมี platform_id)
--    ไม่เพิ่มแถว "phone" ใน erp_platforms เพราะตารางนั้นโชว์ในหลายหน้า (บัญชีแพลตฟอร์ม / ลงขาย / การตลาด)
alter table public.platform_orders alter column platform_id drop not null;
--    เลขออเดอร์ที่ไม่มีแพลตฟอร์มต้องไม่ซ้ำกันเอง (unique เดิม (platform_id, external_order_id) ไม่กัน NULL)
create unique index if not exists platform_orders_no_platform_ext_uniq
  on public.platform_orders (external_order_id) where platform_id is null;

-- 2) ตารางออเดอร์มีที่อยู่/เบอร์ลูกค้าแล้ว → ปิดการอ่าน/เขียนตรงด้วยกุญแจหน้าเว็บ (anon / authenticated)
--    ตรวจแล้ว: ทุกจุดอ่านผ่าน API ฝั่ง server ด้วย service role (12 ไฟล์) · ฟังก์ชันที่ใช้ตารางนี้เป็น SECURITY DEFINER · ไม่มี view/realtime ผูก
revoke all on public.platform_orders, public.platform_order_items, public.shipping_profiles from anon, authenticated;
