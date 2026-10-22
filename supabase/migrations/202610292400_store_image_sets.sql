-- 🖼 ชุดรูปกลาง (2026-10-22) — เปลี่ยนรูปครั้งเดียว ทุกที่ที่ผูกไว้เปลี่ยนตาม (คอม + มือถือ) · lib/website-image-sets.ts
-- ช่องรูปที่ผูกเก็บค่า "imgset/<id>" · API สาธารณะแทนด้วยรูปปัจจุบันของชุดก่อนส่งให้เว็บร้าน
-- อ่าน/เขียนผ่าน API ERP ด้วย service role เท่านั้น → เปิด RLS ไม่ตั้ง policy
create table if not exists public.store_image_sets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null default '',
  -- ลิงก์ของชุด (ว่าง = ที่นั้นใช้ลิงก์ของตัวเอง) · คำอธิบายรูป
  link text not null default '',
  alt text not null default '',
  -- รูปหลักตอนนี้ {desk, mob, fx, fy, mfx, mfy} (จุดสำคัญ = % ของรูป)
  cur jsonb not null default '{}'::jsonb,
  -- รูปตั้งเวลา [{id, at, until, desk, mob, fx, fy, mfx, mfy}] · ประวัติรูปก่อนหน้า [{at, desk, mob, ...}] (ย้อนได้)
  queue jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_image_sets_shop_idx on public.store_image_sets (shop_id, name);
alter table public.store_image_sets enable row level security;
comment on table public.store_image_sets is 'ชุดรูปกลางของเว็บร้าน (ผูกช่องรูปด้วยค่า imgset/<id>) — ERP › เว็บไซต์ › 🖼 ชุดรูป';
