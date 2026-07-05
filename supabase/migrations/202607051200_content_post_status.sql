-- สถานะการโพสต์ต่อแพลตฟอร์มของคอนเทนต์ (เฟส 1 = โพสต์มือ)
-- รูปแบบ: { "<platform>": "posted" | "skip" } · ไม่มีคีย์ = ยังไม่โพสต์
-- ใช้คู่กับ posted_links (ลิงก์โพสต์ที่ลงแล้วต่อแพลตฟอร์ม) ที่มีอยู่เดิม
alter table erp_creative_content
  add column if not exists post_status jsonb not null default '{}'::jsonb;
