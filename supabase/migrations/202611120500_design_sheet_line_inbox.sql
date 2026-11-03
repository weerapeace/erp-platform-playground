-- กล่องงานออกแบบจากไลน์ (Design Dashboard ← กลุ่มไลน์ "ส่งงานออกแบบ" · slot design_intake)
-- คนส่งข้อความ+รูปในกลุ่ม → บอทเก็บเป็น "ร่าง" ที่นี่ → ทีมออกแบบกด "เปิดใบงาน" → ได้ design_sheets จริง
-- เปิดผ่าน API /api/design-sheets/line-inbox เท่านั้น (RLS ไม่มี policy + revoke anon/authenticated)

create table if not exists public.design_sheet_line_inbox (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'converted', 'rejected')),
  source text not null default 'line' check (source in ('line', 'manual')),
  text_body text,                                         -- ข้อความทั้งหมดที่ส่งมา (ต่อกันทีละบรรทัด)
  image_keys jsonb not null default '[]'::jsonb,          -- R2 keys (design-inbox/YYYY-MM/uuid.ext)
  image_hashes jsonb not null default '[]'::jsonb,        -- sha256 ของรูป — จับ "รูปเดิมส่งซ้ำ"
  line_message_ids jsonb not null default '[]'::jsonb,    -- กันไลน์ส่งซ้ำ (redelivery)
  line_group_id text,
  sender_line_user_id text,
  sender_name text,
  ai_name text,                                           -- AI เดา: ชื่องาน
  ai_brand_id uuid references public.brands(id) on delete set null,   -- AI เดา: แบรนด์ (เทียบกับรายชื่อแบรนด์ในระบบ)
  ai_deadline date,                                       -- AI เดา: กำหนดส่ง
  ai_is_job boolean,                                      -- AI ว่าเป็นงานไหม (ข้อความคุยเล่นล้วน = false → ตีตกเงียบ)
  ai_raw jsonb,
  ai_error text,
  ai_read_at timestamptz,
  sheet_id uuid references public.design_sheets(id) on delete set null,
  converted_at timestamptz,
  converted_by uuid,
  converted_by_name text,
  rejected_at timestamptz,
  rejected_by text,
  reject_reason text,
  last_message_at timestamptz not null default now(),     -- ข้อความล่าสุด — ภายใน 5 นาทีจากคนเดิม = รวมเป็นร่างเดียว
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_sheet_line_inbox_status_idx on public.design_sheet_line_inbox (status, created_at desc);
create index if not exists design_sheet_line_inbox_msg_idx on public.design_sheet_line_inbox using gin (line_message_ids);
create index if not exists design_sheet_line_inbox_open_idx on public.design_sheet_line_inbox (line_group_id, sender_line_user_id, last_message_at desc);

alter table public.design_sheet_line_inbox enable row level security;
revoke all on table public.design_sheet_line_inbox from anon, authenticated;

-- รับข้อความ/รูปจากไลน์ทีละชิ้นแบบไม่ชนกัน (ล็อกต่อ กลุ่ม+คนส่ง) — ไลน์ยิงหลายรูปพร้อมกันได้
--   ข้อความเดิมที่เคยรับแล้ว = duplicate (ไม่ทำอะไร)
--   มีร่างของคนเดิมที่ยังรอ (หรือที่ AI ตีตกเอง) และข้อความล่าสุดไม่เกิน p_window_seconds → ต่อท้ายร่างนั้น
--   ไม่มี → เปิดร่างใหม่
create or replace function public.design_line_inbox_ingest(
  p_group text, p_sender text, p_sender_name text, p_message_id text,
  p_text text, p_image_key text, p_image_hash text, p_window_seconds int default 300
) returns table (inbox_id uuid, is_new boolean, had_text boolean, prev_status text, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_had_text boolean; v_status text;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('design_line_inbox:' || coalesce(p_group, '') || ':' || coalesce(p_sender, '')));

  select i.id into v_id from design_sheet_line_inbox i
   where i.line_message_ids @> jsonb_build_array(p_message_id) limit 1;
  if v_id is not null then
    return query select v_id, false, true, null::text, true; return;
  end if;

  select i.id, coalesce(i.text_body, '') <> '', i.status into v_id, v_had_text, v_status
    from design_sheet_line_inbox i
   where i.source = 'line' and i.line_group_id = p_group and i.sender_line_user_id is not distinct from p_sender
     and (i.status = 'pending' or (i.status = 'rejected' and i.rejected_by = 'AI'))
     and i.last_message_at > now() - make_interval(secs => p_window_seconds)
   order by i.last_message_at desc limit 1;

  if v_id is null then
    insert into design_sheet_line_inbox (source, text_body, image_keys, image_hashes, line_message_ids,
      line_group_id, sender_line_user_id, sender_name, created_by)
    values ('line', v_text,
      case when p_image_key is null then '[]'::jsonb else jsonb_build_array(p_image_key) end,
      case when p_image_hash is null then '[]'::jsonb else jsonb_build_array(p_image_hash) end,
      jsonb_build_array(p_message_id), p_group, p_sender, p_sender_name, coalesce(p_sender_name, 'line'))
    returning id into v_id;
    return query select v_id, true, false, 'pending'::text, false; return;
  end if;

  update design_sheet_line_inbox set
    text_body = case when v_text is null then text_body
                     when coalesce(text_body, '') = '' then v_text
                     else text_body || E'\n' || v_text end,
    image_keys = case when p_image_key is null then image_keys else image_keys || jsonb_build_array(p_image_key) end,
    image_hashes = case when p_image_hash is null then image_hashes else image_hashes || jsonb_build_array(p_image_hash) end,
    line_message_ids = line_message_ids || jsonb_build_array(p_message_id),
    sender_name = coalesce(sender_name, p_sender_name),
    last_message_at = now(), updated_at = now()
  where id = v_id;
  return query select v_id, false, v_had_text, v_status, false;
end $$;

revoke all on function public.design_line_inbox_ingest(text, text, text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.design_line_inbox_ingest(text, text, text, text, text, text, text, int) to service_role;
