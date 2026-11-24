-- 🧱 บล็อกพิมพ์ — คลังสัญลักษณ์ (เจ้าของเลือกใน widget 2026-11-24: ข้อเสนอ 2-4)
--   สัญลักษณ์ = เส้นเวกเตอร์ (parts jsonb [{d, fill}] หน่วย มม. มุมซ้ายบน 0,0 ขนาดเดิม ow×oh) + ชื่อ + หมวด + ขนาดที่ใช้บ่อย (w×h)
--   รูปตัวอย่าง/ไฟล์ SVG วาดจากเส้นตอนใช้ — ไม่เก็บไฟล์รูป · ตรวจด้วย cleanSymbolInput (lib/block-print-symbols.ts)
--   ลบ = เก็บไว้ก่อน (is_active=false) กู้คืนได้ · ลบถาวรได้เฉพาะที่อยู่ในถังขยะ · สิทธิ์ใช้ชุด block_print.view / .edit เดิม
-- RLS: เปิด ไม่มี policy = เข้าได้ผ่าน API (/api/block-print/symbols — guardApi + audit) เท่านั้น
create sequence if not exists public.block_print_symbols_seq;
create table if not exists public.block_print_symbols (
  id                uuid primary key default gen_random_uuid(),
  code              text not null default ('SYM-' || lpad(nextval('public.block_print_symbols_seq')::text, 4, '0')),
  name              text not null,
  category          text,
  parts             jsonb not null check (jsonb_typeof(parts) = 'array'),
  ow                numeric not null check (ow > 0),
  oh                numeric not null check (oh > 0),
  w                 numeric not null check (w > 0),
  h                 numeric not null check (h > 0),
  source_file_name  text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists block_print_symbols_code_uq on public.block_print_symbols (code);
create index if not exists block_print_symbols_active_idx on public.block_print_symbols (is_active, category, name);
comment on table public.block_print_symbols is 'บล็อกพิมพ์: คลังสัญลักษณ์เวกเตอร์ · lib/block-print-symbols.ts';
alter table public.block_print_symbols enable row level security;
