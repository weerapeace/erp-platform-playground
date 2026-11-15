-- ห้องแชทรวม (Unified Chat Inbox) เฟส 1 — เจ้าของอนุมัติ 2026-11-15 ("อนุมัติ เริ่มเลย" หลังดูรายการไฟล์ + ตาราง 2 ตาราง)
--   แบบเดียวใช้ได้ทุกช่องทาง: line · lazada · shopee · tiktok · facebook · instagram (เฟสนี้ต่อแค่ LINE)
--   เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (เปิด RLS ไม่ตั้ง policy + ถอนสิทธิ์ anon/authenticated) — แชทมีเบอร์โทร/ที่อยู่ลูกค้า
--   ไม่มีฟังก์ชัน SECURITY DEFINER ใหม่ · ไม่แตะตารางเดิม · คู่มือ docs/chat-inbox.md

-- 1) ห้องแชท = ลูกค้า 1 คน × บัญชีร้าน 1 บัญชี
create table public.chat_conversations (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('line','lazada','shopee','tiktok','facebook','instagram')),
  brand_id         uuid references public.brands(id) on delete set null,
  account_ref      text not null,                 -- บัญชีที่รับ เช่น คีย์บอท LINE / shop id
  external_id      text not null,                 -- รหัสห้องฝั่งแพลตฟอร์ม (LINE = userId ของลูกค้า)
  customer_name    text,
  customer_avatar  text,                          -- URL รูปโปรไฟล์จากแพลตฟอร์ม
  assigned_to      uuid,                          -- ผู้ใช้ ERP ที่รับผิดชอบ (auth user id)
  assigned_name    text,
  status           text not null default 'open' check (status in ('open','done')),
  last_message_at  timestamptz,
  last_preview     text,
  last_direction   text check (last_direction in ('in','out')),
  waiting_since    timestamptz,                   -- ลูกค้ารอคำตอบตั้งแต่เมื่อไหร่ (null = ตอบแล้ว)
  unread_count     int not null default 0,
  reply_until      timestamptz,                   -- ตอบได้ถึงเมื่อไหร่ตามกติกาช่องทาง (null = ไม่จำกัด)
  reply_token      text,                          -- (LINE) โทเคนตอบฟรีล่าสุด — ไม่ส่งไปหน้าเว็บ
  reply_token_at   timestamptz,
  read_token       text,                          -- (LINE) markAsReadToken ล่าสุด — ไม่ส่งไปหน้าเว็บ
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (channel, account_ref, external_id)
);
create index chat_conversations_list_idx on public.chat_conversations (last_message_at desc nulls last);
create index chat_conversations_brand_idx on public.chat_conversations (brand_id, last_message_at desc nulls last);
create index chat_conversations_waiting_idx on public.chat_conversations (waiting_since) where waiting_since is not null;
alter table public.chat_conversations enable row level security;

-- 2) ข้อความ
create table public.chat_messages (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references public.chat_conversations(id) on delete cascade,
  direction            text not null check (direction in ('in','out')),
  sender_type          text not null default 'customer' check (sender_type in ('customer','staff','system')),
  text                 text,
  attachments          jsonb not null default '[]'::jsonb,   -- [{kind:'image',key:'chat/…'}] / [{kind:'product',…}] / [{kind:'sticker'|'file'|'video'|'location',…}]
  external_message_id  text,                                  -- รหัสข้อความฝั่งแพลตฟอร์ม (กันส่งซ้ำ)
  sent_by              uuid,
  sent_by_name         text,
  sent_at              timestamptz not null default now(),
  send_status          text not null default 'received' check (send_status in ('received','sending','sent','failed')),
  send_error           text,
  send_via             text,                                  -- reply (ฟรี) / push (นับโควตา) / api
  created_at           timestamptz not null default now()
);
create index chat_messages_conv_idx on public.chat_messages (conversation_id, sent_at desc);
-- ไม่ซ้ำในห้อง (NULL ซ้ำได้ตามปกติของ unique) — เป็น constraint เต็มเพื่อให้ upsert ignoreDuplicates ใช้ได้ (index แบบมีเงื่อนไขใช้กับ on conflict ของ PostgREST ไม่ได้)
alter table public.chat_messages add constraint chat_messages_ext_uniq unique (conversation_id, external_message_id);
alter table public.chat_messages enable row level security;

revoke all on public.chat_conversations, public.chat_messages from anon, authenticated;

-- 3) สิทธิ์ 4 ตัว (ค่าเริ่ม admin + manager · ตำแหน่งอื่นเจ้าของติ๊กเองที่หน้าสิทธิ์)
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
 ('chat.view',     'ดูห้องแชทลูกค้า',          'แชทลูกค้า (Chat)', 'เปิดหน้าแชทรวม เห็นข้อความลูกค้าทุกช่องทาง (มีเบอร์/ที่อยู่ลูกค้า)', false, 2440),
 ('chat.reply',    'ตอบแชทลูกค้า',             'แชทลูกค้า (Chat)', 'ส่งข้อความ/รูป/การ์ดสินค้าถึงลูกค้า (LINE ตอบช้ากว่า 1 นาทีจะนับโควตา OA)', false, 2441),
 ('chat.assign',   'มอบหมาย/ปิดห้องแชท',       'แชทลูกค้า (Chat)', 'เลือกคนรับผิดชอบห้อง กดจบห้อง', false, 2442),
 ('chat.settings', 'ตั้งค่าแชท',               'แชทลูกค้า (Chat)', 'เลือก OA ที่รับแชท + แบรนด์ · ข้อความสำเร็จรูป', true, 2443)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
 ('admin','chat.view'),   ('admin','chat.reply'),   ('admin','chat.assign'),   ('admin','chat.settings'),
 ('manager','chat.view'), ('manager','chat.reply'), ('manager','chat.assign'), ('manager','chat.settings')
on conflict do nothing;
