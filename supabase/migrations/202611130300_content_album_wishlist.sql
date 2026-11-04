-- อัลบั้ม Contents: "รายการที่อยากได้" + Reference (เจ้าของอนุมัติแบบจาก widget 2026-11-04)
-- รายการที่อยากได้ = อัลบั้มที่ยังไม่มีไฟล์ (phase = 'wish') — ใช้ช่องเดิม: ชื่อ/แบรนด์/รุ่น/วันที่/คนถ่าย/แพลตฟอร์ม/รายละเอียด
-- ถ่ายแล้วกด "แปลงเป็นอัลบั้ม" = เปลี่ยน phase เป็น 'album' (id เดิม ไม่ก๊อปข้อมูล · Reference ติดไปด้วย)
-- สถานะของรายการคิดเอง: ยังไม่ระบุคนถ่าย = รอหาคนถ่าย · ระบุแล้ว = นัดถ่ายแล้ว (lib/content-album-status wishStage)

alter table public.content_albums add column if not exists phase text not null default 'album';
alter table public.content_albums drop constraint if exists content_albums_phase_check;
alter table public.content_albums add constraint content_albums_phase_check check (phase in ('wish', 'album'));
alter table public.content_albums add column if not exists content_types text[] not null default '{}';   -- ประเภท Content ที่อยากได้ (POST_TYPES: image/album/video/reel/story/live)
comment on column public.content_albums.phase is 'wish = รายการที่อยากได้ (ยังไม่ถ่าย) · album = อัลบั้มที่มีไฟล์จากการถ่าย';

-- Reference (1 แถว = 1 ชิ้น) — หลายคนช่วยกันเพิ่มได้ไม่ทับกัน · เปิดผ่าน API /api/content-albums/[id]/refs เท่านั้น
create table if not exists public.content_album_refs (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.content_albums(id) on delete cascade,
  kind text not null check (kind in ('image', 'link', 'text')),
  r2_key text,                      -- รูป (ย่อ ≤1600 · โฟลเดอร์ content-refs)
  url text,                         -- ลิงก์วิดีโอ/โพสต์ (TikTok/YouTube/Instagram/Pinterest/เว็บ)
  provider text,                    -- tiktok | youtube | instagram | pinterest | facebook | web
  title text,                       -- ชื่อจากพรีวิวลิงก์
  thumb_url text,                   -- รูปพรีวิวลิงก์ (og:image)
  body text,                        -- ข้อความ/โน้ต (kind = text)
  note text,                        -- "ชอบตรงไหน"
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  constraint content_album_refs_payload check (
    (kind = 'image' and r2_key is not null) or (kind = 'link' and url is not null) or (kind = 'text' and coalesce(btrim(body), '') <> '')
  )
);
create index if not exists content_album_refs_album_idx on public.content_album_refs (album_id, sort_order, created_at);
alter table public.content_album_refs enable row level security;
revoke all on table public.content_album_refs from anon, authenticated;
