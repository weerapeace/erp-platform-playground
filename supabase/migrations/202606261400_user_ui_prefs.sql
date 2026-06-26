-- ค่าปรับแต่ง UI ต่อผู้ใช้ (per-user, key-value jsonb) — เช่น ธีมหน้าภาพรวมงาน
create table if not exists public.user_ui_prefs (
  user_id uuid not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_ui_prefs enable row level security;

-- เจ้าของแถวเท่านั้นที่อ่าน/เขียนของตัวเองได้
drop policy if exists user_ui_prefs_rw on public.user_ui_prefs;
create policy user_ui_prefs_rw on public.user_ui_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
