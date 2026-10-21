-- 🖼 คลังกรอบรูปที่สร้างเอง (ตัวสร้างกรอบ 3 แบบ: ประกอบเอง / อัปทรงตัดรูป / อัปกรอบวางทับ)
-- def = ชุดค่ากรอบ 1 อัน (ผ่าน normalizeFrameDef แล้ว · lib/website-frames) — ใช้กับรูปแล้ว = คัดลอกค่าไป (แก้/ลบในคลังไม่กระทบรูปที่ใช้ไปแล้ว)
-- shop_id = null → ใช้ได้ทุกร้าน · มีค่า → เฉพาะร้านนั้น
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (/api/website/frames · service role) → เปิด RLS ไม่ตั้ง policy
-- แบบเดียวกับ website_menu_templates · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.website_frames (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  def jsonb not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_frames_shop_idx on public.website_frames (shop_id, updated_at desc);

alter table public.website_frames enable row level security;

comment on table public.website_frames is 'คลังกรอบรูปที่สร้างเองของเว็บร้าน (สร้าง/แก้/ลบ ผ่าน /api/website/frames) — shop_id null = ทุกร้าน';
comment on column public.website_frames.def is 'ชุดค่ากรอบ (ทรง/ทรงที่อัป/เส้นขอบ/กรอบวางทับ) — ใช้แล้วได้สำเนา';
