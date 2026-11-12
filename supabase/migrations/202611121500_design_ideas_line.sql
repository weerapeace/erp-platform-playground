-- ไอเดียจากกลุ่มไลน์ "ส่งไอเดีย" (slot design_idea · เจ้าของขอ 2026-11-12)
-- ใครในกลุ่มก็ส่งรูป/ลิงก์/ข้อความได้ → พักในกล่อง "รอคัด" (status inbox) ของหน้าไอเดีย → ทีมกด เพิ่มเป็นไอเดีย (open) / รวมกับไอเดียที่มี (merged) / ไม่เอา (archived กู้คืนได้)
-- ของคนเดิมในกลุ่มเดิมภายใน p_window_seconds = ชุดเดียว (แบบเดียวกับ design_line_inbox_ingest ของกล่องงานจากไลน์)

alter table public.design_ideas drop constraint if exists design_ideas_status_check;
alter table public.design_ideas add constraint design_ideas_status_check
  check (status in ('inbox', 'open', 'paused', 'archived', 'promoting', 'promoted', 'merged'));

alter table public.design_ideas
  add column if not exists text_body        text null,                              -- ข้อความดิบจากไลน์ (ลิงก์/ข้อ ๆ แตกจากตรงนี้)
  add column if not exists line_group_id    text null,
  add column if not exists line_sender_id   text null,
  add column if not exists line_message_ids jsonb not null default '[]'::jsonb,      -- กันไลน์ส่งซ้ำ
  add column if not exists last_message_at  timestamptz null,
  add column if not exists replied_at       timestamptz null,
  add column if not exists replied_count    integer null,                           -- จำนวนรูป+ลิงก์ตอนตอบครั้งล่าสุด (ตอบใหม่เมื่อมีเพิ่ม)
  add column if not exists merged_into      uuid null references public.design_ideas(id) on delete set null,
  add column if not exists merged_at        timestamptz null,
  add column if not exists merged_by        text null;

create index if not exists design_ideas_line_batch_idx on public.design_ideas (line_group_id, line_sender_id, last_message_at desc) where status = 'inbox';

create or replace function public.design_idea_line_ingest(
  p_group text, p_sender text, p_sender_name text, p_message_id text, p_text text, p_image_key text,
  p_window_seconds integer default 300, p_force_new boolean default false
) returns table(idea_id uuid, is_new boolean, duplicate boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_name text := left('ไอเดียจาก ' || coalesce(nullif(btrim(coalesce(p_sender_name, '')), ''), 'ไลน์'), 200);
begin
  perform pg_advisory_xact_lock(hashtext('design_idea_line:' || coalesce(p_group, '') || ':' || coalesce(p_sender, '')));

  select d.id into v_id from design_ideas d where d.line_message_ids @> jsonb_build_array(p_message_id) limit 1;
  if v_id is not null then
    return query select v_id, false, true; return;
  end if;

  if not coalesce(p_force_new, false) then
    select d.id into v_id from design_ideas d
     where d.source = 'line' and d.status = 'inbox' and d.line_group_id = p_group and d.line_sender_id is not distinct from p_sender
       and d.last_message_at > now() - make_interval(secs => p_window_seconds)
     order by d.last_message_at desc limit 1;
  end if;

  if v_id is null then
    insert into design_ideas (name, status, source, text_body, image_keys, line_message_ids, line_group_id, line_sender_id,
      sender_name, created_by_name, last_message_at)
    values (v_name, 'inbox', 'line', v_text,
      case when p_image_key is null then '[]'::jsonb else jsonb_build_array(p_image_key) end,
      jsonb_build_array(p_message_id), p_group, p_sender, p_sender_name, coalesce(p_sender_name, 'line'), now())
    returning id into v_id;
    return query select v_id, true, false; return;
  end if;

  update design_ideas set
    text_body = case when v_text is null then text_body
                     when coalesce(text_body, '') = '' then v_text
                     else left(text_body || E'\n' || v_text, 8000) end,
    image_keys = case when p_image_key is null or jsonb_array_length(image_keys) >= 20 then image_keys
                      else image_keys || jsonb_build_array(p_image_key) end,
    line_message_ids = line_message_ids || jsonb_build_array(p_message_id),
    sender_name = coalesce(sender_name, p_sender_name),
    last_message_at = now(), updated_at = now()
  where id = v_id;
  return query select v_id, false, false;
end $$;

revoke all on function public.design_idea_line_ingest(text, text, text, text, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.design_idea_line_ingest(text, text, text, text, text, text, integer, boolean) to service_role;
