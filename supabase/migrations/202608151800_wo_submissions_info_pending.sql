-- "ส่งงานไว้ก่อน ยังไม่ลงวันที่/ค่าแรง" — ให้หน้างานส่งงานได้ทันทีแม้ยังไม่รู้ค่าแรง
-- แล้วมีรายงาน "รายการยังไม่ครบ" ให้ตามมาเติมทีหลัง
alter table public.wo_submissions
  add column if not exists info_pending boolean not null default false;

comment on column public.wo_submissions.info_pending is 'true = ยังไม่ได้ลงวันที่/ค่าแรงจริง (รอเติมทีหลัง) → โผล่ในรายงาน "ยังไม่ครบ"';

create index if not exists idx_wo_submissions_pending on public.wo_submissions (info_pending) where info_pending;
