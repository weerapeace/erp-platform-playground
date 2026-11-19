-- 🔊 ชุดเสียงสถานีแพ็ค (ใช้ร่วมทุกโต๊ะ · เจ้าของเลือก 2026-11-19 "ตั้งค่าเสียงได้ อัปโหลดได้")
-- 1 แถว = 1 เสียง (ok/done/error/warn/dup/cancelled/over) · ไม่มีแถว/ไม่มีไฟล์ = ใช้เสียงเดิมที่ระบบสร้างเอง
-- ไฟล์เสียงสั้นมาก (ตัดเหลือ ≤2 วิ ฝั่งเครื่อง แปลงเป็น WAV โมโน ≈ ≤90KB) เก็บเป็น data URL ในแถว — ไม่ต้องมีที่เก็บไฟล์แยก
-- prev_* = เสียงก่อนหน้า 1 ชั้น (ย้อนกลับได้แม้แจ้งเตือนหายไปแล้ว) · แก้ผ่าน /api/packing/sounds (packing.manage) + audit
create table if not exists public.packing_sounds (
  key              text primary key check (key in ('ok','done','error','warn','dup','cancelled','over')),
  volume           real not null default 1 check (volume >= 0 and volume <= 1.5),
  audio_data       text check (audio_data is null or length(audio_data) <= 400000),
  audio_name       text,
  duration_ms      integer,
  prev_audio_data  text check (prev_audio_data is null or length(prev_audio_data) <= 400000),
  prev_audio_name  text,
  prev_duration_ms integer,
  updated_by       uuid,
  updated_by_name  text,
  updated_at       timestamptz not null default now()
);

alter table public.packing_sounds enable row level security;
revoke all on public.packing_sounds from anon, authenticated;

comment on table public.packing_sounds is 'ชุดเสียงตอบรับสถานีแพ็ค ใช้ร่วมทุกโต๊ะ (แก้ผ่าน /api/packing/sounds เท่านั้น)';
