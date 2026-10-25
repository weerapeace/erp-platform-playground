-- กล่องพัก "คำสั่งซื้อจากไลน์" (2026-10-25)
-- ซื้อของจาก Shopee/Taobao แล้วแคปหน้าคำสั่งซื้อส่งเข้ากลุ่มไลน์ → AI อ่านรูป → พักไว้ที่นี่
-- → คนตรวจ/แก้ แล้วกดยืนยัน (ผูก PO เดิม / เปิด PO ใหม่ / เก็บไว้ก่อน) — ห้ามเอาผล AI ไปใช้โดยไม่มีคนยืนยัน
-- รูปมีชื่อ/ที่อยู่/เบอร์โทร → เปิด RLS ไม่มี policy = เข้าได้เฉพาะ server (service role) ผ่าน API ที่ตรวจสิทธิ์ po.view/po.edit

create table public.purchase_order_captures (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'line',             -- line | upload
  status text not null default 'processing',       -- collecting (รอรูปชุดเดียวกันครบ) | processing | pending (รอตรวจ) | confirmed | rejected
  platform text,                                   -- taobao | shopee | 1688 | lazada | tiktok | other
  shop_name text,
  order_no text,
  order_no_norm text,                              -- เลขคำสั่งซื้อแบบตัดช่องว่าง/ขีด ไว้เทียบซ้ำ
  order_date date,
  currency text,                                   -- RMB | THB
  items jsonb not null default '[]'::jsonb,        -- [{name, name_th, option, qty, unit_price, line_total, sku_id, sku_code, po_line_id}]
  shipping_fee numeric,
  discount numeric,
  total_paid numeric,
  tracking_no text,
  note text,
  image_keys jsonb not null default '[]'::jsonb,   -- R2 key ของรูปต้นฉบับ (หลายรูปได้)
  ai_confidence numeric,
  ai_unreadable jsonb not null default '[]'::jsonb,
  ai_is_order boolean,
  ai_notes text,
  ai_error text,
  ai_model text,
  ai_raw jsonb,
  ai_read_at timestamptz,
  dup_of uuid references public.purchase_order_captures(id) on delete set null,
  sender_line_user_id text,
  sender_name text,
  line_group_id text,
  line_message_ids jsonb not null default '[]'::jsonb,
  image_set_id text,
  image_set_index int,
  image_set_total int,
  po_id uuid references public.purchase_orders_v2(id) on delete set null,
  po_mode text,                                    -- link | new | none
  confirmed_by text,
  confirmed_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  reject_reason text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_order_captures_status_idx on public.purchase_order_captures (status, created_at desc);
create index purchase_order_captures_order_no_idx on public.purchase_order_captures (order_no_norm) where order_no_norm is not null;
create index purchase_order_captures_po_idx on public.purchase_order_captures (po_id) where po_id is not null;
create index purchase_order_captures_set_idx on public.purchase_order_captures (image_set_id) where image_set_id is not null;

alter table public.purchase_order_captures enable row level security;
revoke all on table public.purchase_order_captures from anon, authenticated;

-- เมนูในแอปจัดซื้อ (ต่อจาก "รายการใบสั่งซื้อ (PO)")
insert into public.erp_menu_items (label, href, icon, section, section_order, sort_order, permission_key, app_keys)
values ('คำสั่งซื้อจากไลน์', '/purchasing/line-orders', '💬', 'Operations', 30, 33, 'po.view', '{purchasing}')
on conflict (href) do nothing;
