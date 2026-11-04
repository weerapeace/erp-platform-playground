-- คลัง Reference กลาง (เจ้าของอนุมัติแบบจาก widget 2026-11-04)
-- เก็บ Reference ดี ๆ ไว้ที่เดียว (รูป / ลิงก์วิดีโอ-โพสต์ / ข้อความ) → หยิบใส่รายการที่อยากได้ / อัลบั้มได้เลย ไม่ต้องหาหรืออัปใหม่
--   หยิบมาใช้ = ก๊อปแถวไปไว้ใน content_album_refs (ไฟล์รูปตัวเดิม ไม่อัปซ้ำ) + จำว่ามาจากชิ้นไหน (library_id)
--   → "ชอบตรงไหน" เขียนแยกต่อรายการได้ · ลบออกจากคลังทีหลัง รายการที่หยิบไปแล้วไม่หายตาม (library_id กลายเป็นว่าง)
-- เปิดผ่าน API /api/content-refs เท่านั้น (RLS ปิดหมด)

create table if not exists public.content_ref_library (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'link', 'text')),
  r2_key text,                      -- รูป (โฟลเดอร์ content-refs · ตัวเดียวกับที่รายการใช้)
  url text,                         -- ลิงก์วิดีโอ/โพสต์
  provider text,                    -- tiktok | youtube | instagram | pinterest | facebook | web
  title text,
  thumb_url text,
  body text,                        -- ข้อความ (kind = text)
  note text,                        -- คำอธิบาย / ชอบตรงไหน (ติดไปเป็นค่าเริ่มตอนหยิบไปใช้)
  tags text[] not null default '{}',
  brand_id uuid references public.brands(id) on delete set null,   -- ว่าง = ใช้ได้ทุกแบรนด์
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_ref_library_payload check (
    (kind = 'image' and r2_key is not null) or (kind = 'link' and url is not null) or (kind = 'text' and coalesce(btrim(body), '') <> '')
  )
);
create index if not exists content_ref_library_created_idx on public.content_ref_library (created_at desc);
create index if not exists content_ref_library_tags_idx on public.content_ref_library using gin (tags);
alter table public.content_ref_library enable row level security;
revoke all on table public.content_ref_library from anon, authenticated;
comment on table public.content_ref_library is 'คลัง Reference กลางของหน้า Contents — หยิบใส่รายการที่อยากได้/อัลบั้ม (ก๊อปแถวไป content_album_refs + library_id)';

-- Reference ในรายการ จำว่าหยิบมาจากคลังชิ้นไหน (นับ "ใช้กี่ครั้ง" + กันหยิบซ้ำ + ดาวเต็ม = อยู่ในคลังแล้ว)
alter table public.content_album_refs add column if not exists library_id uuid references public.content_ref_library(id) on delete set null;
create index if not exists content_album_refs_library_idx on public.content_album_refs (library_id) where library_id is not null;
