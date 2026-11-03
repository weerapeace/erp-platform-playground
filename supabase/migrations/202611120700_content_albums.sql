-- หน้า Contents ในคลังไฟล์ (แบบ ข · เจ้าของอนุมัติ 2026-11-03)
-- อัลบั้ม = กองรูป/วิดีโอจากการถ่าย 1 ครั้ง → แตกได้หลายโพสต์ในปฏิทินคอนเทนต์
-- ไฟล์ตัวจริงอยู่ Google Drive · ระบบเก็บแค่รูปย่อ/ภาพปกวิดีโอ (R2) + รหัสไฟล์ Drive
-- สถานะอัลบั้มไม่เก็บ — คิดสดจากโพสต์ที่ผูก (lib/content-album-status.ts)
-- เปิดผ่าน API /api/content-albums เท่านั้น (RLS ไม่มี policy + revoke anon/authenticated)

-- 1) ข้อมูลอัลบั้ม Contents — 1:1 กับอัลบั้มกลาง asset_collections · ไฟล์ในอัลบั้ม = asset_collection_map เดิม
create table if not exists public.content_albums (
  id uuid primary key references public.asset_collections(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  assignee_ids uuid[] not null default '{}',            -- ผู้รับผิดชอบ (หลายคนได้ เหมือน erp_creative_content)
  due_date date,                                        -- วันที่ต้องลง
  planned_platforms text[] not null default '{}',       -- แพลตฟอร์มที่ตั้งใจลง (ยังไม่มี + ยังไม่มีโพสต์ = "รอจัดการ")
  caption_draft text,                                   -- แคปชั่นร่าง (ส่งต่อเข้าโพสต์ตอนสร้าง)
  drive_folder_id text,                                 -- โฟลเดอร์ Drive ของอัลบั้ม (<แบรนด์>/Content/อัลบั้ม/<ชื่อ>)
  picked_asset_ids uuid[] not null default '{}',        -- "รูปที่เลือกใช้" (แยกจากรูปทั้งหมด)
  parent_sku_codes jsonb not null default '[]'::jsonb,  -- แท็กสินค้า
  closed_at timestamptz,                                -- ปิดอัลบั้มเอง (เลิกใช้/จบแล้ว) — ว่าง = ระบบคิดสถานะเอง
  trashed_at timestamptz,                               -- ถังขยะ (กู้คืนได้)
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_albums_brand_idx on public.content_albums (brand_id) where trashed_at is null;
create index if not exists content_albums_due_idx on public.content_albums (due_date) where trashed_at is null;
alter table public.content_albums enable row level security;
revoke all on table public.content_albums from anon, authenticated;

-- 2) ไฟล์ในคลังที่ตัวจริงอยู่ Drive (r2_key = รูปย่อ/ภาพปกวิดีโอ · ไม่มีภาพปก = 'drive:<id>')
alter table public.assets add column if not exists drive_file_id text;
alter table public.assets add column if not exists duration_sec numeric;          -- ความยาววิดีโอ (วินาที)
alter table public.assets add column if not exists drive_missing_at timestamptz;  -- ตัวตรวจเจอว่าหายจาก Drive
create index if not exists assets_drive_file_idx on public.assets (drive_file_id) where drive_file_id is not null;

-- 3) โพสต์ในปฏิทินรู้ว่ามาจากอัลบั้มไหน
alter table public.erp_creative_content add column if not exists album_id uuid references public.content_albums(id) on delete set null;
create index if not exists erp_creative_content_album_idx on public.erp_creative_content (album_id) where album_id is not null;
