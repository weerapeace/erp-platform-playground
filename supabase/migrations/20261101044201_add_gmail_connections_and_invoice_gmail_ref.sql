-- การเชื่อม Gmail ต่อกล่องเมล (ระบบกลาง lib/gmail-api.ts) — เก็บ refresh token แบบเข้ารหัส AES-GCM (กุญแจอยู่ env ไม่อยู่ DB)
-- ใช้ครั้งแรกกับ App Subscription "ดึงบิลจากเมล" · เข้าผ่าน service_role (API) เท่านั้น
create table if not exists public.gmail_connections (
  email text primary key check (email = lower(email)),
  refresh_token_enc text not null,
  scope text not null default '',
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text not null default ''
);
alter table public.gmail_connections enable row level security;
revoke all on public.gmail_connections from anon, authenticated;

-- ใบเสร็จที่ดึงมาจากเมล → จำเลขเมล ไว้บอกว่า "แนบแล้ว" กันแนบซ้ำ (แนบเองตามปกติ = null)
alter table public.subscription_invoices add column if not exists gmail_message_id text;
create index if not exists subscription_invoices_gmail_message_id_idx
  on public.subscription_invoices (gmail_message_id) where gmail_message_id is not null;
