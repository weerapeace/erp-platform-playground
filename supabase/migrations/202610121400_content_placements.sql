-- วางแผนคอนเทนต์: "ลงที่ไหน" แบบแบ่งประเภทการลง (เช่น แต่งร้าน · ในสินค้า · Story · โพสต์ฟีด) × ช่องทาง
-- เก็บเป็น "ประเภท:ช่องทาง" เช่น {"shop_decor:shopee","story:instagram"}
-- คอลัมน์ platforms เดิมยังเก็บ "ช่องทางรวม" ตามเดิม (ปฏิทิน/เป้า/แคปชั่น/โพสต์ ใช้ต่อได้ไม่ต้องแก้)
-- รายการประเภท (ชื่อ/ไอคอน/ช่องทางที่มี) ตั้งค่าใน ui_config(key='marketing_content_plan').placements
alter table public.erp_creative_content add column if not exists placements text[] not null default '{}';
