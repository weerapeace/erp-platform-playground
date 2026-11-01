-- กฎที่เก็บไฟล์กลาง (Storage Policy) — หมวดไฟล์ → ที่เก็บ (R2 / Supabase Storage / Google Drive)
-- เฟส 1: เก็บกฎ + แสดงผล (หน้า /master/storage-rules) · ยังไม่บังคับทางอัปไฟล์ — ทางอัปเดิมทำงานเหมือนเดิม
-- ล็อก = allowed_providers มีตัวเดียว (ฐานข้อมูลกันเปลี่ยนเองด้วย check provider ∈ allowed_providers)
-- คู่มือ: docs/storage-policy.md · โค้ด: lib/storage-policy.ts

create table public.erp_storage_rules (
  id                uuid primary key default gen_random_uuid(),
  rule_key          text not null unique,
  label             text not null,
  label_en          text,
  description       text,                                -- ใช้ที่ไหน (ภาษาคน)
  file_types        text[] not null default '{}',        -- นามสกุลที่หมวดนี้รับ (ว่าง = ทุกชนิด)
  provider          text not null,
  allowed_providers text[] not null,
  lock_reason       text,                                -- เหตุผลที่ล็อก/ข้อควรรู้
  max_bytes         bigint,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint erp_storage_rules_provider_valid check (provider in ('r2', 'supabase', 'drive')),
  constraint erp_storage_rules_allowed_valid check (cardinality(allowed_providers) >= 1 and allowed_providers <@ array['r2', 'supabase', 'drive']::text[]),
  constraint erp_storage_rules_provider_allowed check (provider = any (allowed_providers)),
  constraint erp_storage_rules_max_positive check (max_bytes is null or max_bytes > 0)
);

-- deny-all: อ่าน/เขียนผ่าน API ที่ตรวจสิทธิ์ (supabaseAdmin) เท่านั้น
alter table public.erp_storage_rules enable row level security;
revoke all on public.erp_storage_rules from anon, authenticated;

insert into public.erp_storage_rules (rule_key, label, label_en, description, file_types, provider, allowed_providers, lock_reason, max_bytes, sort_order) values
  ('product_images', 'รูปสินค้า (แกลเลอรี SKU / Parent)', 'Product images (SKU / Parent gallery)',
   'แกลเลอรีรูปในฟอร์มสินค้า · การ์ดสินค้า · เว็บร้านดึงไปโชว์', '{jpg,jpeg,png,webp,gif}',
   'r2', '{r2}', 'รูปต้องเปิดเร็วและเว็บร้านโชว์ได้ทันที', null, 10),
  ('storefront_media', 'รูปและวิดีโอเว็บร้าน', 'Storefront images & videos',
   'แบนเนอร์ รูปในหน้าเว็บ วิดีโอหน้าร้าน', '{jpg,jpeg,png,webp,gif,mp4,webm,mov}',
   'r2', '{r2}', 'คนดูเว็บร้านเยอะ — R2 ไม่คิดค่าดึงไฟล์', 209715200, 20),
  ('library_uploads', 'คลังไฟล์: ไฟล์ที่อัปเอง', 'File library: own uploads',
   'หน้าคลังไฟล์กลาง · ปุ่ม "เลือกจากคลัง" ในทุกฟอร์ม', '{}',
   'r2', '{r2}', 'คลังไฟล์แสดงรูปย่อจาก R2', 26214400, 30),
  ('design_previews', 'รูปตัวอย่าง Artwork / งานพิมพ์', 'Artwork / print previews',
   'รูปบนการ์ดในหมวด Artwork และงานพิมพ์ (ตัวไฟล์จริงอยู่ Drive)', '{png,jpg,jpeg,webp}',
   'r2', '{r2}', 'ต้องโชว์บนการ์ดได้เร็ว', null, 40),
  ('artwork_source', 'ไฟล์ต้นฉบับ Artwork (AI / PSD)', 'Artwork source files (AI / PSD)',
   'ช่องไฟล์ต้นฉบับในฟอร์ม Artwork · ทีมเปิดแก้จาก Drive', '{ai,psd,pdf,eps,svg}',
   'drive', '{drive,supabase}', null, null, 50),
  ('print_files', 'ไฟล์งานพิมพ์ (PDF / EPS / AI)', 'Print files (PDF / EPS / AI)',
   'ไฟล์สั่งพิมพ์ในหมวดงานพิมพ์ + หน้าจัดเรียง', '{pdf,eps,ai,ps}',
   'drive', '{drive}', 'กฎเจ้าของ 27 ต.ค. 2569: ไฟล์งานพิมพ์เก็บใน Google Drive เท่านั้น', null, 60),
  ('nesting_source_png', 'PNG ลายต้นฉบับ (หน้าจัดเรียง)', 'Source PNG artwork (nesting)',
   'คลังลายต้นฉบับที่ตัวช่วยจัดเรียงดึงลงเครื่อง', '{png}',
   'r2', '{r2,drive}', null, null, 70),
  ('task_attachments', 'ไฟล์แนบงาน (จัดการงาน)', 'Task attachments',
   'ไฟล์แนบในงาน · ถ้างานเปิดโฟลเดอร์ Drive ไว้ ระบบก๊อปขึ้น Drive ให้ด้วย', '{}',
   'r2', '{r2,drive}', null, null, 80),
  ('board_images', 'รูปบนกระดาน (แคมเปญ / เทรนด์ / บอร์ด)', 'Board images (campaign / trends / boards)',
   'รูปที่วางบนกระดานวาด', '{jpg,jpeg,png,webp,gif}',
   'r2', '{r2}', 'กระดานต้องโหลดรูปเร็ว', null, 90),
  ('record_files', 'ไฟล์แนบสินค้า (Parent SKU)', 'Product attachments (Parent SKU)',
   'ช่อง "ไฟล์แนบ" ในฟอร์ม Parent SKU · รับทุกชนิดไฟล์', '{}',
   'supabase', '{supabase,drive}', null, 52428800, 100),
  ('supplier_bills', 'บิลซัพพลายเออร์ / ใบรับของ', 'Supplier bills / receiving documents',
   'รูปหรือไฟล์บิลตอนรับของ และบิลในใบสำคัญจ่าย', '{jpg,jpeg,png,webp,pdf}',
   'supabase', '{supabase,r2}', 'เอกสารธุรกิจ ควรเปิดได้เฉพาะคนที่มีสิทธิ์', null, 110),
  ('finance_private', 'ใบแจ้งหนี้ค่าบริการ / สลิปโอน', 'Service invoices / transfer slips',
   'ใบแจ้งหนี้ในหน้าค่าบริการรายเดือน · สลิปที่ลูกค้าเว็บร้านแนบ', '{jpg,jpeg,png,webp,pdf}',
   'supabase', '{supabase}', 'ข้อมูลการเงิน เปิดได้เฉพาะคนที่มีสิทธิ์', null, 120),
  ('customer_print_uploads', 'รูปที่ลูกค้าอัปสั่งพิมพ์ (เว็บร้าน)', 'Customer print uploads (storefront)',
   'รูปที่ลูกค้าอัปตอนออกแบบสินค้าพิมพ์ลาย', '{jpg,jpeg,png,webp}',
   'supabase', '{supabase}', 'ไฟล์ส่วนตัวของลูกค้า', null, 130),
  ('customer_review_return', 'รูปรีวิว / คืนสินค้า (ลูกค้าเว็บร้าน)', 'Review / return photos (storefront)',
   'รูปที่ลูกค้าแนบตอนรีวิวหรือขอคืนสินค้า', '{jpg,jpeg,png,webp}',
   'r2', '{r2,supabase}', null, null, 140);

-- พื้นที่ที่ใช้ใน Supabase Storage แยกตาม bucket (การ์ดพื้นที่ในคลังไฟล์ + หน้ากฎที่เก็บไฟล์)
create or replace function public.erp_storage_bucket_usage()
returns table (bucket_id text, total_bytes bigint, total_objects bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id::text,
         coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint,
         count(*)::bigint
  from storage.objects o
  group by o.bucket_id
$$;

revoke all on function public.erp_storage_bucket_usage() from public, anon, authenticated;
grant execute on function public.erp_storage_bucket_usage() to service_role;
