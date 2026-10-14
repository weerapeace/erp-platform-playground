-- ⭐ แม่แบบ Section ของตัวจัดหน้าเว็บ — บันทึก Section ที่ตั้งค่าไว้แล้ว (เนื้อหา + รูปลักษณ์ + ชิ้นย่อย) ไว้ใช้ซ้ำกับหน้าอื่น/ร้านอื่น
-- block = Section 1 ก้อน (ผ่าน normalizeBlocks แล้ว ไม่มี id — ตอนใช้ได้ id ใหม่ทุกครั้ง)
-- shop_id = ร้านที่บันทึก (ร้านอื่นเห็นและใช้ได้ด้วย — หน้าจอแยกกลุ่ม "ร้านนี้ / ร้านอื่น")
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (/api/website/section-templates · service role) → เปิด RLS ไม่ตั้ง policy
-- แบบเดียวกับ website_canvas_templates · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.website_section_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  section_type text not null,
  block jsonb not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_section_templates_shop_idx on public.website_section_templates (shop_id, updated_at desc);

alter table public.website_section_templates enable row level security;

comment on table public.website_section_templates is 'แม่แบบ Section ของเว็บร้าน (บันทึก/ใช้ซ้ำ/แก้ชื่อ/ลบ ผ่าน /api/website/section-templates)';
comment on column public.website_section_templates.block is 'Section 1 ก้อน (type + เนื้อหา + style + ชิ้นย่อย) ไม่มี id';
