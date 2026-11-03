-- งานออกแบบจากไลน์ — หลายรูปต่อใบงาน (2026-11-03 เจ้าของอนุมัติ 3 ข้อ)
--   1) บอทตอบ 1 ครั้งต่อชุดที่ส่งติดกัน + บอกจำนวนรูปให้ถูก → จำว่าตอบไปแล้วกี่รูป (replied_*)
--   2) ข้อความขึ้นต้น "งานใหม่" = เปิดร่างใหม่ทันที (ไม่รวมกับร่างเดิมใน 5 นาที) → p_force_new
--   3) ปุ่ม "รวมกับงาน…" ย้ายรูป/ข้อความไปร่างอื่น → สถานะ merged + merged_into (ร่างที่ถูกรวมหายจากกล่อง แต่ยังเก็บประวัติ)

alter table public.design_sheet_line_inbox drop constraint if exists design_sheet_line_inbox_status_check;
alter table public.design_sheet_line_inbox add constraint design_sheet_line_inbox_status_check
  check (status in ('pending', 'converted', 'rejected', 'merged'));

alter table public.design_sheet_line_inbox
  add column if not exists replied_at timestamptz,          -- บอทตอบในกลุ่มล่าสุดเมื่อไหร่ (null = ยังไม่เคยตอบ)
  add column if not exists replied_images int,              -- ตอนตอบล่าสุดมีกี่รูป → มีรูปเพิ่มทีหลังค่อยตอบอีกครั้ง
  add column if not exists replied_text boolean not null default false,   -- ตอนตอบล่าสุดมีข้อความแล้วหรือยัง
  add column if not exists merged_into uuid references public.design_sheet_line_inbox(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid,
  add column if not exists merged_by_name text;

-- เปลี่ยนรูปแบบฟังก์ชัน (เพิ่ม p_force_new) → ลบตัวเดิมก่อน กันมี 2 ตัวซ้อน
drop function if exists public.design_line_inbox_ingest(text, text, text, text, text, text, text, int);

-- รับข้อความ/รูปจากไลน์ทีละชิ้นแบบไม่ชนกัน (ล็อกต่อ กลุ่ม+คนส่ง)
--   ข้อความเดิมที่เคยรับแล้ว = duplicate · p_force_new (ขึ้นต้น "งานใหม่") = เปิดร่างใหม่เสมอ
--   มีร่างของคนเดิมที่ยังรอ (หรือที่ AI ตีตกเอง) และข้อความล่าสุดไม่เกิน p_window_seconds → ต่อท้ายร่างนั้น
create or replace function public.design_line_inbox_ingest(
  p_group text, p_sender text, p_sender_name text, p_message_id text,
  p_text text, p_image_key text, p_image_hash text, p_window_seconds int default 300, p_force_new boolean default false
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

  if not coalesce(p_force_new, false) then
    select i.id, coalesce(i.text_body, '') <> '', i.status into v_id, v_had_text, v_status
      from design_sheet_line_inbox i
     where i.source = 'line' and i.line_group_id = p_group and i.sender_line_user_id is not distinct from p_sender
       and (i.status = 'pending' or (i.status = 'rejected' and i.rejected_by = 'AI'))
       and i.last_message_at > now() - make_interval(secs => p_window_seconds)
     order by i.last_message_at desc limit 1;
  end if;

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

revoke all on function public.design_line_inbox_ingest(text, text, text, text, text, text, text, int, boolean) from public, anon, authenticated;
grant execute on function public.design_line_inbox_ingest(text, text, text, text, text, text, text, int, boolean) to service_role;

-- รวมร่าง p_source เข้า p_target (ทั้งคู่ต้องรอเปิดใบงาน) — ต่อข้อความ/รูป/เลขข้อความไลน์ท้ายร่างปลายทางในคำสั่งเดียว
-- (ไม่ทับรูปที่บอทเพิ่งต่อท้ายพร้อมกัน) แล้วปิดร่างต้นทางเป็น merged · คืน error เป็นภาษาคนถ้ารวมไม่ได้
create or replace function public.design_line_inbox_merge(
  p_source uuid, p_target uuid, p_actor_id uuid, p_actor_name text
) returns table (ok boolean, error text, images int, had_text boolean)
language plpgsql security definer set search_path = public as $$
declare
  s design_sheet_line_inbox%rowtype; t design_sheet_line_inbox%rowtype;
  v_text text;
begin
  if p_source = p_target then
    return query select false, 'เลือกงานอื่นที่ไม่ใช่งานนี้'::text, 0, false; return;
  end if;
  -- ล็อกทั้งสองแถวตามลำดับ id กันล็อกไขว้
  perform 1 from design_sheet_line_inbox where id in (p_source, p_target) order by id for update;
  select * into s from design_sheet_line_inbox where id = p_source;
  select * into t from design_sheet_line_inbox where id = p_target;
  if s.id is null or t.id is null then
    return query select false, 'ไม่พบงานในกล่องจากไลน์'::text, 0, false; return;
  end if;
  if s.status <> 'pending' then
    return query select false, 'งานนี้ไม่ได้รอเปิดใบงานแล้ว'::text, 0, false; return;
  end if;
  if t.status <> 'pending' then
    return query select false, 'งานปลายทางไม่ได้รอเปิดใบงานแล้ว — รีเฟรชแล้วเลือกใหม่'::text, 0, false; return;
  end if;
  v_text := nullif(btrim(coalesce(s.text_body, '')), '');

  update design_sheet_line_inbox set
    text_body = case when v_text is null then text_body
                     when coalesce(text_body, '') = '' then v_text
                     else text_body || E'\n' || v_text end,
    image_keys = image_keys || s.image_keys,
    image_hashes = image_hashes || s.image_hashes,
    line_message_ids = line_message_ids || s.line_message_ids,
    last_message_at = greatest(last_message_at, s.last_message_at),
    updated_at = now()
  where id = p_target;

  update design_sheet_line_inbox set
    status = 'merged', merged_into = p_target, merged_at = now(), merged_by = p_actor_id, merged_by_name = p_actor_name,
    updated_at = now()
  where id = p_source;

  return query select true, null::text, jsonb_array_length(s.image_keys), v_text is not null;
end $$;

revoke all on function public.design_line_inbox_merge(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.design_line_inbox_merge(uuid, uuid, uuid, text) to service_role;
