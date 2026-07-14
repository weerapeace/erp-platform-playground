-- รูปที่เลือกต่อแพลตฟอร์มในคอนเทนต์ Creative — เลือกได้ที่การ์ดแคปชั่น (ไม่ต้องกดโพสต์ก่อน)
-- โครง: { "<platform>": ["<r2_key>", ...] } · ใช้โชว์บนการ์ดย่อยรายแพลตฟอร์มบนกระดานแคมเปญ + เป็น default ตอนโพสต์
alter table erp_creative_content add column if not exists platform_images jsonb not null default '{}'::jsonb;
comment on column erp_creative_content.platform_images is 'รูปที่เลือกต่อแพลตฟอร์ม (keyed by platform → array of r2 keys) — โชว์บนการ์ดย่อยรายแพลตฟอร์ม + เป็น default ตอนโพสต์';
